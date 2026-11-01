// Adaptador dos anexos de ocorrência (F4) sobre a Edge `anexos`. O navegador nunca fala com o Storage: o bucket é privado
// e sem política para anon/authenticated (migração 0033); envio e leitura passam pela Edge, que decide no banco.
//   * anexar: o arquivo vai como bytes (octet-stream). Nome e tipo do File são ignorados (o servidor detecta o tipo pelos
//     primeiros bytes e gera o nome); o que a tela valida antes (tipo, 4 MiB) é só para avisar cedo.
//   * baixarAnexo: a Edge devolve o conteúdo decifrado como download (octet-stream); o nome e o tipo vêm dos cabeçalhos
//     Content-Disposition e X-Anexo-Tipo, aceitos só no formato que o servidor gera.
import { ehMimeAnexo } from '@domain/rules';
import type { Api, ArquivoBaixado, OcorrenciaView } from '../types';

/** Chamada à Edge que devolve o corpo e a resposta (cabeçalhos); erro já convertido em ApiError por quem cria. */
export type EdgeBruta = (nome: string, opcoes: { body?: Blob; headers?: Record<string, string> }) => Promise<{ data: unknown; response?: Response }>;

/** `attachment; filename="anexo-1a2b3c4d.pdf"` -> o nome (só o formato que o servidor gera; o resto vira "anexo"). */
export function nomeDoDownload(disposicao: string | null | undefined): string {
  const m = typeof disposicao === 'string' ? /filename="(anexo-[0-9a-f]{8}\.(?:jpg|png|pdf))"/.exec(disposicao) : null;
  return m?.[1] ?? 'anexo';
}

export function criarAnexos(edge: EdgeBruta, ocorrenciaDe: (o: OcorrenciaView) => OcorrenciaView): Pick<Api['ocorrencias'], 'anexar' | 'baixarAnexo'> {
  return {
    async anexar(id, arquivo) {
      const { data } = await edge(`anexos?acao=enviar&ocorrencia=${encodeURIComponent(id)}`, {
        body: arquivo, headers: { 'Content-Type': 'application/octet-stream' },
      });
      return ocorrenciaDe(data as OcorrenciaView);
    },
    async baixarAnexo(id, documentoId): Promise<ArquivoBaixado> {
      const { data, response } = await edge(`anexos?acao=baixar&ocorrencia=${encodeURIComponent(id)}&documento=${encodeURIComponent(documentoId)}`, {});
      const tipo = response?.headers.get('x-anexo-tipo') ?? '';
      const mime = ehMimeAnexo(tipo) ? tipo : 'application/octet-stream';
      const conteudo = data instanceof Blob ? new Blob([data], { type: mime }) : new Blob([], { type: mime });
      return { nome: nomeDoDownload(response?.headers.get('content-disposition')), mime, conteudo };
    },
  };
}
