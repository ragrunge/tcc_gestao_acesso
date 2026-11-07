// Adaptador da operação (F3) sobre as RPCs api.* das migrações 0026–0032: encomendas, ocorrências (anexos: anexos.ts, F4),
// funcionários, relatórios, auditoria do histórico e importação. O banco devolve o formato do domínio (instantes em
// epoch ms); aqui ficam as conversões que o cliente HTTP antigo fazia e o que o desenho põe no navegador:
//   * o CSV do relatório é montado com csvRelatorio (@domain/relatorio), a fonte única do formato;
//   * a verificação da cadeia roda aqui, com verificarCadeia (@domain/hashChain), sobre os lotes que o banco
//     entrega no formato canônico: o verificador (TS) é independente do gerador (o trigger SQL);
//   * a exportação verificável (JSONL, manifesto v3) é montada com montarExportacaoJsonl (@domain/exportacao);
//   * as linhas da planilha (com CPF em claro) ficam só na memória desta aba entre analisar e confirmar, como no
//     cliente HTTP antigo: o banco guarda só a impressão HMAC delas.
// Texto livre que pode identificar alguém (nome, placa, linhas da planilha) vai sempre no CORPO do POST da RPC.
import type { Api } from '@/api/types'
import type { Rpc } from '../portaria'
import { criarAuditoria } from './auditoria'
import { criarEncomendas } from './encomendas'
import { criarFuncionarios } from './funcionarios'
import { criarImportacao } from './importacao'
import { criarOcorrencias } from './ocorrencias'
import { criarRelatorios } from './relatorios'

export { exportadoDe } from './auditoria'
export { filtroRelatorio, ocorrenciaDe } from './conversores'

type Operacao = Pick<
  Api,
  'encomendas' | 'ocorrencias' | 'funcionarios' | 'relatorios' | 'auditoria' | 'importacao'
>

/** `anexos`: envio e leitura pela Edge (anexos.ts); entram no namespace de ocorrências. */
export function criarOperacao(
  rpc: Rpc,
  anexos: Pick<Api['ocorrencias'], 'anexar' | 'baixarAnexo'>,
): Operacao {
  return {
    ...criarEncomendas(rpc),
    ...criarOcorrencias(rpc, anexos),
    ...criarFuncionarios(rpc),
    ...criarRelatorios(rpc),
    ...criarAuditoria(rpc),
    ...criarImportacao(rpc),
  }
}
