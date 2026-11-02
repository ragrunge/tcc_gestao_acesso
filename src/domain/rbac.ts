// Matriz RBAC (spec seção 5.2). É aplicada no servidor (API); a UI apenas oculta o que o papel não pode.
import type { Papel } from './types';

export type Acao =
  | 'unidade.ver' | 'unidade.editar'
  | 'pessoa.ver' | 'pessoa.cadastrar_externo' | 'pessoa.cadastrar_morador'
  | 'vinculo.ver' | 'vinculo.criar' | 'vinculo.decidir'
  | 'importacao.executar'
  | 'autorizacao.criar' | 'restricao.criar' | 'restricao.aprovar'
  | 'evento.registrar' | 'evento.retroativo' | 'evento.corrigir' | 'evento.ver'
  | 'encomenda.ver' | 'encomenda.operar'
  | 'ocorrencia.ver' | 'ocorrencia.operar'
  | 'relatorio.ver' | 'turno.ver'
  | 'auditoria.verificar' | 'auditoria.exportar' | 'auditoria.selar'
  | 'usuario.ver' | 'usuario.gerenciar' | 'usuario.gerenciar_sindico'
  | 'veiculo.cadastrar'
  | 'funcionario.gerenciar' | 'funcionario.ver' | 'pessoa.editar' | 'pessoa.desativar'
  | 'autorizacao.area_comum' | 'encomenda.autorizar_retirada'
  | 'documento.ver'
  | 'lgpd.exportar' | 'lgpd.anonimizar' | 'lgpd.retencao';

const SI: Papel = 'sindico', AD: Papel = 'administracao', PO: Papel = 'porteiro', AU: Papel = 'auditor';
// Administrador do sistema (0041): o técnico que cuida das contas, sem tela nem RPC de dado pessoal de morador (acesso indireto via conta: ver docs/arquitetura.md). Só usuario.*.
const AS: Papel = 'admin_sistema';

export const MATRIZ: Record<Acao, Papel[]> = {
  'unidade.ver': [SI, AD, PO, AU],
  'unidade.editar': [SI, AD],
  'pessoa.ver': [SI, AD, PO, AU],
  'pessoa.cadastrar_externo': [SI, AD, PO],
  'pessoa.cadastrar_morador': [SI, AD],
  'vinculo.ver': [SI, AD, AU],
  'vinculo.criar': [SI, AD], // RN-03: porteiro não cria vínculo
  'vinculo.decidir': [SI, AD], // RN-03
  'importacao.executar': [SI, AD],
  'autorizacao.criar': [SI, AD, PO],
  'restricao.criar': [SI, AD, PO],
  'restricao.aprovar': [SI], // RN-06: só o síndico
  'evento.registrar': [SI, AD, PO],
  'evento.retroativo': [SI, AD, PO],
  'evento.corrigir': [SI, AD],
  'evento.ver': [SI, AD, PO, AU],
  'encomenda.ver': [SI, AD, PO, AU],
  'encomenda.operar': [SI, AD, PO],
  'ocorrencia.ver': [SI, AD, PO, AU],
  'ocorrencia.operar': [SI, AD, PO],
  'relatorio.ver': [SI, AD, AU],
  'turno.ver': [SI, AD, PO],
  'auditoria.verificar': [SI, AD, AU],
  'auditoria.exportar': [SI, AD, AU],
  // Selo da cadeia sob demanda (spec §4.6): síndico e auditor (conselho). O selo diário é do agendador, sem usuário.
  'auditoria.selar': [SI, AU],
  // Usuários do sistema (0039, 0041): a administração vê a lista e os totais; criar, editar, desativar, reativar e
  // redefinir senha são do síndico e do administrador do sistema.
  'usuario.ver': [SI, AD, AS],
  'usuario.gerenciar': [SI, AS],
  // Alvo síndico ou admin_sistema, ou atribuir um desses papéis: só o síndico (o técnico não se promove nem se protege).
  'usuario.gerenciar_sindico': [SI],
  'veiculo.cadastrar': [SI, AD],
  'funcionario.gerenciar': [SI, AD], // RF-09
  // Listagem e ficha de funcionário (spec §14, decisão nº 29): síndico, administração e auditor; o porteiro NÃO.
  // A escala na entrada é consultada pela própria API (validação de `escala`) e, na tela, só a da pessoa sendo registrada.
  'funcionario.ver': [SI, AD, AU],
  'pessoa.editar': [SI, AD], // correção de cadastro (LGPD art. 18) e regularização (RN-09)
  // Desativar/reativar o cadastro (RF-02, spec §14 2026-10-22): não exclui; o porteiro NÃO (só pede à administração).
  'pessoa.desativar': [SI, AD],
  'autorizacao.area_comum': [SI, AD], // RF-36: área comum é autorizada pela administração
  'encomenda.autorizar_retirada': [SI, AD, PO], // RN-08, a pedido de morador com vínculo válido
  // Conteúdo de anexo de ocorrência (RF-27, RN-10, spec §6.2 /documentos/:id/conteudo): síndico e administração. O porteiro
  // anexa, mas não abre o arquivo depois; o auditor vê só os metadados.
  'documento.ver': [SI, AD],
  'lgpd.exportar': [SI, AD], // spec 9.3
  'lgpd.anonimizar': [SI],
  'lgpd.retencao': [SI], // RNF-09
};

export const pode = (papel: Papel | undefined, acao: Acao): boolean => !!papel && MATRIZ[acao].includes(papel);

// 2FA fica para a fase de segurança (pós-MVP).

export type Rota =
  | 'painel' | 'entrada' | 'saida' | 'pessoas' | 'encomendas' | 'ocorrencias'
  | 'unidades' | 'vinculos' | 'cadastro' | 'importar'
  | 'historico' | 'relatorios' | 'usuarios' | 'funcionarios' | 'privacidade';

/** Quais papéis acessam cada rota. */
export const ROTAS: Record<Rota, Papel[]> = {
  painel: [SI, AD, PO],
  entrada: [SI, AD, PO],
  saida: [SI, AD, PO], // mesma permissão de registrar entrada (evento.registrar)
  pessoas: [SI, AD, PO, AU],
  encomendas: [SI, AD, PO, AU],
  ocorrencias: [SI, AD, PO, AU],
  unidades: [SI, AD, PO, AU],
  vinculos: [SI, AD],
  cadastro: [SI, AD, AU],
  importar: [SI, AD],
  historico: [SI, AD, PO, AU],
  relatorios: [SI, AD, AU],
  usuarios: [SI, AD, AS], // usuario.ver; as ações da tela exigem usuario.gerenciar (SI, AS)
  funcionarios: [SI, AD, AU], // AU só lê (funcionario.ver); criar e editar exigem funcionario.gerenciar
  privacidade: [SI, AD], // lgpd.exportar (SI, AD); a aba Retenção exige lgpd.retencao (SI)
};

export const rotaInicial = (papel: Papel): Rota =>
  papel === 'auditor' ? 'historico' : papel === 'administracao' ? 'vinculos' : papel === 'admin_sistema' ? 'usuarios' : 'painel';
