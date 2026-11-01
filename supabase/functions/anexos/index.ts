// Anexos de ocorrência (F4; RF-27, RNF-03, RN-10). Única porta do bucket privado `anexos`: o front nunca fala com o
// Storage (nenhuma política para anon/authenticated, migração 0033); só esta Edge, com service_role, depois que o BANCO
// decidiu (srv.anexo_*: sessão, RBAC, regra do porteiro, encerrada, limite de 5, trilha).
//
//   POST /anexos?acao=enviar&ocorrencia=<id>                      corpo = bytes do arquivo (o Content-Type do cliente é ignorado)
//   POST /anexos?acao=baixar&ocorrencia=<id>&documento=<id>      resposta = bytes em claro, como download
//
// Envio (ordem do legado, ocorrencias.module.ts anexar() + cofre.ts):
//   srv.anexo_preparar (sem trava: nada sobe para quem não pode) -> tamanho (1 byte a 4 MiB, lido com teto, sem
//   bufferizar além disso) -> tipo pelos primeiros bytes -> cifra (DEK própria, KEK do secret) -> upload `<id>.bin`
//   sem sobrescrever -> srv.anexo_registrar (regras de novo, com a ocorrência travada) -> se falhar, apaga o objeto.
// Leitura: srv.anexo_para_leitura (documento.ver, par ocorrência+documento, trilha documento.ler) -> baixa -> decifra e
//   confere o SHA-256 -> responde attachment, octet-stream, nosniff, CSP sandbox, no-store.
//
// Por que stream pela função e não URL assinada: o objeto no Storage é cifrado com a DEK do registro; uma URL assinada
// entregaria só o cifrado, e decifrar no navegador exigiria mandar a DEK para ele. A URL assinada também é um token ao
// portador (vaza em histórico/log) e a leitura dela não passaria pela trilha.
//
// KEK: secret da Edge `PORTARIA_KEK_V<n>` (32 bytes em base64), fora do banco. `PORTARIA_KEK_VERSAO` (padrão 1) é a versão
// usada para cifrar; a leitura usa a versão gravada no registro. Rotação = criar a V<n+1>, apontar a VERSAO para ela e
// manter as antigas enquanto houver documento delas (sem recifrar: a tabela é append-only). Nada aqui loga chave,
// conteúdo, nome de arquivo ou token.
import { cabecalhosCors, ErroHttp, ipDoCliente, json, servir } from '../_shared/http.ts';
import { rpc, servico, sessaoDoUsuario } from '../_shared/supabase.ts';
import {
  ANEXO_MAX_BYTES, cifrarAnexo, deBase64, decifrarAnexo, importarKek, NOME_DOWNLOAD, NOME_OBJETO, paraBase64, tipoAnexoPorConteudo, UUID,
} from '../_shared/anexo.ts';

const BUCKET = 'anexos';

interface Leitura { id: string; caminho: string; dekCifrada: string; nonce: string; chaveVersao: number; sha256: string; mime: string; nome: string }

function idDaQuery(url: URL, campo: string): string {
  const v = url.searchParams.get(campo) ?? '';
  if (!UUID.test(v)) throw new ErroHttp(422, 'VALIDACAO', `Campo ${campo}: valor inválido.`, [{ field: campo }]);
  return v.toLowerCase();
}

/** KEK de uma versão, do secret. Ausente, fora de base64 ou sem 32 bytes = indisponível (falha fechada). */
function kekBruta(versao: number): Uint8Array | null {
  if (!Number.isInteger(versao) || versao < 1 || versao > 32767) return null;
  const v = Deno.env.get(`PORTARIA_KEK_V${versao}`)?.trim();
  if (!v) return null;
  try {
    const b = deBase64(v);
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

async function kek(versao: number): Promise<CryptoKey> {
  const bruta = kekBruta(versao);
  if (!bruta) throw new ErroHttp(500, 'CHAVE_INDISPONIVEL', 'A chave dos anexos não está disponível no servidor.');
  try { return await importarKek(bruta); } finally { bruta.fill(0); }
}

const grandeDemais = () => new ErroHttp(413, 'ARQUIVO_GRANDE_DEMAIS', `O anexo passa de ${ANEXO_MAX_BYTES / 1024 / 1024} MB.`);

/** Corpo binário com teto: para de ler (e cancela) no primeiro byte acima do limite. */
async function lerArquivo(req: Request): Promise<Uint8Array> {
  const declarado = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declarado) && declarado > ANEXO_MAX_BYTES) throw grandeDemais();
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > ANEXO_MAX_BYTES) {
      await leitor.cancel().catch(() => {});
      throw grandeDemais();
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { tudo.set(p, i); i += p.length; }
  return tudo;
}

servir(async (req) => {
  const url = new URL(req.url);
  const acao = url.searchParams.get('acao');
  if (acao !== 'enviar' && acao !== 'baixar') throw new ErroHttp(422, 'VALIDACAO', 'Ação inválida.', [{ field: 'acao' }]);
  const ocorrencia = idDaQuery(url, 'ocorrencia');
  const documento = acao === 'baixar' ? idDaQuery(url, 'documento') : null;
  const eu = await sessaoDoUsuario(req);
  const ip = ipDoCliente(req);
  const srv = servico();

  if (acao === 'enviar') {
    await rpc(srv, 'anexo_preparar', { p_sessao_id: eu.sessao.id, p_ocorrencia: ocorrencia });
    const versao = Number(Deno.env.get('PORTARIA_KEK_VERSAO') ?? '1');
    const chave = await kek(versao); // antes de ler o corpo: sem chave, nada é aceito
    const claro = await lerArquivo(req);
    if (claro.length === 0) throw new ErroHttp(422, 'ARQUIVO_VAZIO', 'O arquivo está vazio.');
    const mime = tipoAnexoPorConteudo(claro);
    if (!mime) throw new ErroHttp(415, 'TIPO_NAO_PERMITIDO', 'Tipo de arquivo não permitido: envie foto (JPEG ou PNG) ou PDF.');
    const c = await cifrarAnexo(chave, versao, claro);
    const objeto = `${c.id}.bin`;
    const { error } = await srv.storage.from(BUCKET).upload(objeto, c.objeto, { contentType: 'application/octet-stream', upsert: false });
    if (error) {
      console.error('anexo.envio_falhou', { status: (error as { statusCode?: string }).statusCode ?? null });
      throw new ErroHttp(503, 'ARMAZENAMENTO_INDISPONIVEL', 'O armazenamento de anexos não respondeu. Tente novamente em instantes.');
    }
    try {
      const view = await rpc<unknown>(srv, 'anexo_registrar', {
        p_sessao_id: eu.sessao.id, p_ocorrencia: ocorrencia, p_documento: c.id, p_dek_cifrada: paraBase64(c.dekCifrada),
        p_nonce: paraBase64(c.nonce), p_chave_versao: c.chaveVersao, p_sha256: c.sha256, p_mime: mime, p_tamanho: c.tamanho, p_ip: ip,
      });
      return json(req, 201, view);
    } catch (e) {
      // Recusado na checagem travada (limite, encerrada no meio) ou erro: o objeto sem registro sai (ilegível sem a DEK).
      const { error: erroApagar } = await srv.storage.from(BUCKET).remove([objeto]);
      if (erroApagar) console.error('anexo.descarte_falhou', { documento: c.id });
      throw e;
    }
  }

  const l = await rpc<Leitura>(srv, 'anexo_para_leitura', { p_sessao_id: eu.sessao.id, p_ocorrencia: ocorrencia, p_documento: documento, p_ip: ip });
  // O caminho vem do banco, mas é conferido contra o formato e o id antes de virar caminho (path traversal fechado nos dois lados).
  if (!l || l.id !== documento || l.caminho !== `${documento}.bin` || !NOME_OBJETO.test(l.caminho) || !NOME_DOWNLOAD.test(l.nome)) {
    throw new ErroHttp(500, 'DOCUMENTO_INVALIDO', 'Registro de documento inconsistente.');
  }
  const chave = await kek(l.chaveVersao);
  const { data, error } = await srv.storage.from(BUCKET).download(l.caminho);
  if (error || !data) {
    console.error('anexo.arquivo_ausente', { documento });
    throw new ErroHttp(500, 'DOCUMENTO_INDISPONIVEL', 'O arquivo deste anexo não foi encontrado no servidor.');
  }
  let claro: Uint8Array;
  try {
    claro = await decifrarAnexo(chave, { id: l.id, chaveVersao: l.chaveVersao, dekCifrada: deBase64(l.dekCifrada), nonce: deBase64(l.nonce), sha256: l.sha256 },
      new Uint8Array(await data.arrayBuffer()));
  } catch {
    console.error('anexo.integridade', { documento });
    throw new ErroHttp(500, 'DOCUMENTO_CORROMPIDO', 'O anexo não passou na verificação de integridade.');
  }
  return new Response(claro as BodyInit, {
    status: 200,
    headers: {
      ...cabecalhosCors(req),
      // Nunca inline: octet-stream + attachment + nosniff + sandbox (um PDF aberto na origem da função rodaria nela).
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(claro.length),
      'Content-Disposition': `attachment; filename="${l.nome}"`,
      'X-Anexo-Tipo': l.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'no-store',
    },
  });
});
