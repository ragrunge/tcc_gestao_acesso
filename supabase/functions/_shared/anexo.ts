// Regras e cifra dos anexos de ocorrência (RF-27, RNF-03), sem nenhuma API do Deno: o mesmo arquivo roda na Edge e no
// Node (src/test/anexoCofre.test.ts confere a paridade com @portaria/domain/rules e a compatibilidade com o formato do
// legado, apps/api/src/documentos/cofre.ts em 6a45b50^).
//
// As regras são CÓPIA das de packages/domain/src/rules.ts (a Edge só enxerga supabase/functions): o teste de paridade
// falha se uma das duas mudar sozinha. No banco, os mesmos números estão em app.anexo_regras() (migração 0033).
//
// Envelope (igual ao cofre.ts): cada arquivo tem a própria DEK (32 bytes aleatórios); o conteúdo é cifrado com
// AES-256-GCM pela DEK, com AAD `portaria:documento:<id>`; a DEK é cifrada pela KEK com AAD `portaria:dek:<id>:v<versão>`
// e guardada como nonce(12) + cifra(32) + tag(16). O Storage guarda só cifra + tag do conteúdo; o nonce do conteúdo, a DEK
// cifrada, a versão da KEK e o SHA-256 do conteúdo em claro ficam no banco. A AAD amarra arquivo e DEK ao id: trocar o
// objeto ou a DEK de um registro por outro falha na autenticação do GCM em vez de entregar o anexo de outra ocorrência.

export const ANEXO_MAX_BYTES = 4 * 1024 * 1024;
export const ANEXO_MAX_POR_OCORRENCIA = 5;
export const ANEXO_TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' } as const;
export type MimeAnexo = keyof typeof ANEXO_TIPOS;

/** Tipo pelo CONTEÚDO (assinatura dos primeiros bytes), nunca pelo nome ou pelo Content-Type que o cliente declara. */
export function tipoAnexoPorConteudo(b: Uint8Array): MimeAnexo | null {
  const comeca = (...xs: number[]) => b.length >= xs.length && xs.every((x, i) => b[i] === x);
  if (comeca(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (comeca(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  return null;
}

/** Id vindo da requisição (case-insensitive; normalizado para minúsculas antes de usar). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Nome do objeto no bucket: `<uuid v4>.bin`, gerado na Edge (cofre.ts: NOME_ARQUIVO). Nada do nome do usuário. */
export const NOME_OBJETO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/;
/** Nome do download, como app.nome_anexo o gera: só esse formato vai para o Content-Disposition. */
export const NOME_DOWNLOAD = /^anexo-[0-9a-f]{8}\.(?:jpg|png|pdf)$/;

const NONCE = 12;
const DEK_CIFRADA = NONCE + 32 + 16;
export const aadConteudo = (id: string) => `portaria:documento:${id}`;
export const aadDek = (id: string, versao: number) => `portaria:dek:${id}:v${versao}`;

const utf8 = (s: string) => new TextEncoder().encode(s);
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function paraBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function gcm(modo: 'encrypt' | 'decrypt', chave: CryptoKey, nonce: Uint8Array, aad: string, dados: Uint8Array): Promise<Uint8Array> {
  const p = { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: utf8(aad) as BufferSource, tagLength: 128 };
  return new Uint8Array(modo === 'encrypt' ? await crypto.subtle.encrypt(p, chave, dados as BufferSource) : await crypto.subtle.decrypt(p, chave, dados as BufferSource));
}

const chaveAes = (bruta: Uint8Array, usos: KeyUsage[]) => crypto.subtle.importKey('raw', bruta as BufferSource, 'AES-GCM', false, usos);

/** KEK de 32 bytes como chave não exportável. Outro tamanho é erro de configuração (nunca "funciona com chave curta"). */
export async function importarKek(bruta: Uint8Array): Promise<CryptoKey> {
  if (bruta.length !== 32) throw new Error('KEK deve ter 32 bytes');
  return chaveAes(bruta, ['encrypt', 'decrypt']);
}

export interface AnexoCifrado {
  id: string;
  /** Conteúdo do objeto no Storage: cifra + tag do GCM (16 bytes a mais que o claro). */
  objeto: Uint8Array;
  dekCifrada: Uint8Array;
  nonce: Uint8Array;
  chaveVersao: number;
  sha256: string;
  tamanho: number;
}

export async function cifrarAnexo(kek: CryptoKey, chaveVersao: number, claro: Uint8Array, id: string = crypto.randomUUID()): Promise<AnexoCifrado> {
  const dek = aleatorio(32);
  try {
    const nonce = aleatorio(NONCE);
    const objeto = await gcm('encrypt', await chaveAes(dek, ['encrypt']), nonce, aadConteudo(id), claro);
    const nonceDek = aleatorio(NONCE);
    const envelope = await gcm('encrypt', kek, nonceDek, aadDek(id, chaveVersao), dek);
    const dekCifrada = new Uint8Array(DEK_CIFRADA);
    dekCifrada.set(nonceDek, 0);
    dekCifrada.set(envelope, NONCE);
    return { id, objeto, dekCifrada, nonce, chaveVersao, sha256: await sha256Hex(claro), tamanho: claro.length };
  } finally {
    dek.fill(0);
  }
}

export interface AnexoGuardado { id: string; chaveVersao: number; dekCifrada: Uint8Array; nonce: Uint8Array; sha256: string }

/**
 * Abre a DEK com a KEK, decifra o objeto e confere o SHA-256 gravado. Qualquer falha (objeto trocado, corrompido, DEK de
 * outro registro, versão errada) lança: nunca devolve conteúdo parcial.
 */
export async function decifrarAnexo(kek: CryptoKey, d: AnexoGuardado, objeto: Uint8Array): Promise<Uint8Array> {
  if (d.dekCifrada.length !== DEK_CIFRADA || d.nonce.length !== NONCE || objeto.length < 16) throw new Error('registro inconsistente');
  const dek = await gcm('decrypt', kek, d.dekCifrada.subarray(0, NONCE), aadDek(d.id, d.chaveVersao), d.dekCifrada.subarray(NONCE));
  try {
    const claro = await gcm('decrypt', await chaveAes(dek, ['decrypt']), d.nonce, aadConteudo(d.id), objeto);
    if ((await sha256Hex(claro)) !== d.sha256) throw new Error('sha256');
    return claro;
  } finally {
    dek.fill(0);
  }
}
