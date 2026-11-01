// Cifra e regras dos anexos da Edge (supabase/functions/_shared/anexo.ts), rodadas no Node com o mesmo WebCrypto.
// 1. Paridade: as regras copiadas na Edge são as do domain (a Edge não enxerga packages/).
// 2. Ida e volta e cada adulteração (AAD/id trocado, DEK de outro registro, versão da KEK, KEK errada, byte alterado,
//    SHA divergente) falham, sem devolver conteúdo parcial.
// 3. Compatibilidade com o formato do legado (cofre.ts, node:crypto): o que um cifra, o outro abre.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as dominio from '@portaria/domain/rules';
import * as edge from '../../supabase/functions/_shared/anexo';

const kekBruta = () => new Uint8Array(randomBytes(32));
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, ...randomBytes(500)]);

describe('paridade das regras com @portaria/domain/rules', () => {
  it('limites e tipos aceitos são os mesmos', () => {
    expect(edge.ANEXO_MAX_BYTES).toBe(dominio.ANEXO_MAX_BYTES);
    expect(edge.ANEXO_MAX_POR_OCORRENCIA).toBe(dominio.ANEXO_MAX_POR_OCORRENCIA);
    expect(edge.ANEXO_TIPOS).toEqual(dominio.ANEXO_TIPOS);
  });

  it('tipo pelo conteúdo: mesmo veredito para assinaturas válidas, truncadas, falsificadas e vazias', () => {
    const casos: number[][] = [
      [], [0xff], [0xff, 0xd8], [0xff, 0xd8, 0xff], [0xff, 0xd8, 0xff, 0xe0], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0x25, 0x50, 0x44, 0x46], [0x25, 0x50, 0x44, 0x46, 0x2d],
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF
      [0x4d, 0x5a, 0x90, 0x00], // executável
      [...new TextEncoder().encode('<svg onload=alert(1)>')],
      [0x00, 0x25, 0x50, 0x44, 0x46, 0x2d], // assinatura deslocada
      [...new TextEncoder().encode('PK\u0003\u0004')], // zip/docx renomeado para .pdf
    ];
    for (let i = 0; i < 300; i++) casos.push([...randomBytes(1 + (i % 12))]);
    for (const c of casos) {
      const b = new Uint8Array(c);
      expect(edge.tipoAnexoPorConteudo(b), JSON.stringify(c)).toBe(dominio.tipoAnexoPorConteudo(b));
    }
  });
});

describe('envelope AES-256-GCM', () => {
  it('ida e volta; objeto = claro + 16 bytes de tag; DEK cifrada com 60 bytes; SHA-256 do claro', async () => {
    const kek = await edge.importarKek(kekBruta());
    const c = await edge.cifrarAnexo(kek, 1, pdf);
    expect(c.objeto.length).toBe(pdf.length + 16);
    expect(c.dekCifrada.length).toBe(60);
    expect(c.nonce.length).toBe(12);
    expect(c.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
    expect(`${c.id}.bin`).toMatch(edge.NOME_OBJETO);
    const claro = await edge.decifrarAnexo(kek, c, c.objeto);
    expect(Buffer.from(claro).equals(Buffer.from(pdf))).toBe(true);
  });

  it('cada adulteração falha: objeto de outro id (AAD), DEK de outro registro, versão, KEK errada, byte, SHA', async () => {
    const kek = await edge.importarKek(kekBruta());
    const a = await edge.cifrarAnexo(kek, 1, pdf);
    const b = await edge.cifrarAnexo(kek, 1, pdf); // mesmo conteúdo, outro id: o duplicado não colide
    expect(a.id).not.toBe(b.id);
    await expect(edge.decifrarAnexo(kek, a, b.objeto)).rejects.toThrow(); // objeto trocado entre registros (AAD do conteúdo)
    await expect(edge.decifrarAnexo(kek, { ...a, dekCifrada: b.dekCifrada, nonce: b.nonce }, b.objeto)).rejects.toThrow(); // DEK de outro id (AAD da DEK)
    await expect(edge.decifrarAnexo(kek, { ...a, chaveVersao: 2 }, a.objeto)).rejects.toThrow();
    await expect(edge.decifrarAnexo(await edge.importarKek(kekBruta()), a, a.objeto)).rejects.toThrow();
    const virado = a.objeto.slice();
    virado[10] ^= 1;
    await expect(edge.decifrarAnexo(kek, a, virado)).rejects.toThrow();
    await expect(edge.decifrarAnexo(kek, { ...a, sha256: '0'.repeat(64) }, a.objeto)).rejects.toThrow('sha256');
    await expect(edge.decifrarAnexo(kek, a, a.objeto.subarray(0, 10))).rejects.toThrow();
  });

  it('KEK sem 32 bytes é recusada', async () => {
    await expect(edge.importarKek(new Uint8Array(16))).rejects.toThrow();
    await expect(edge.importarKek(new Uint8Array(0))).rejects.toThrow();
  });

  it('base64 de ida e volta em arquivo de 4 MiB (sem estourar a pilha)', () => {
    const grande = new Uint8Array(randomBytes(edge.ANEXO_MAX_BYTES));
    expect(Buffer.from(edge.deBase64(edge.paraBase64(grande))).equals(Buffer.from(grande))).toBe(true);
    expect(edge.paraBase64(grande)).toBe(Buffer.from(grande).toString('base64'));
  });
});

describe('compatível com o formato do legado (cofre.ts, node:crypto)', () => {
  const cifrarLegado = (chave: Buffer, nonce: Buffer, aad: string, claro: Buffer) => {
    const c = createCipheriv('aes-256-gcm', chave, nonce, { authTagLength: 16 });
    c.setAAD(Buffer.from(aad, 'utf8'));
    return Buffer.concat([c.update(claro), c.final(), c.getAuthTag()]);
  };
  const decifrarLegado = (chave: Buffer, nonce: Buffer, aad: string, cifrado: Buffer) => {
    const d = createDecipheriv('aes-256-gcm', chave, nonce, { authTagLength: 16 });
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(cifrado.subarray(cifrado.length - 16));
    return Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
  };

  it('o legado cifra, a Edge abre', async () => {
    const kekB = Buffer.from(kekBruta());
    const id = crypto.randomUUID();
    const dek = randomBytes(32);
    const nonce = randomBytes(12);
    const objeto = cifrarLegado(dek, nonce, `portaria:documento:${id}`, Buffer.from(pdf));
    const nonceDek = randomBytes(12);
    const dekCifrada = Buffer.concat([nonceDek, cifrarLegado(kekB, nonceDek, `portaria:dek:${id}:v1`, dek)]);
    const claro = await edge.decifrarAnexo(await edge.importarKek(new Uint8Array(kekB)), {
      id, chaveVersao: 1, dekCifrada: new Uint8Array(dekCifrada), nonce: new Uint8Array(nonce), sha256: createHash('sha256').update(pdf).digest('hex'),
    }, new Uint8Array(objeto));
    expect(Buffer.from(claro).equals(Buffer.from(pdf))).toBe(true);
  });

  it('a Edge cifra, o legado abre', async () => {
    const kekB = Buffer.from(kekBruta());
    const c = await edge.cifrarAnexo(await edge.importarKek(new Uint8Array(kekB)), 3, pdf);
    const env = Buffer.from(c.dekCifrada);
    const dek = decifrarLegado(kekB, env.subarray(0, 12), `portaria:dek:${c.id}:v3`, env.subarray(12));
    const claro = decifrarLegado(dek, Buffer.from(c.nonce), `portaria:documento:${c.id}`, Buffer.from(c.objeto));
    expect(claro.equals(Buffer.from(pdf))).toBe(true);
  });
});
