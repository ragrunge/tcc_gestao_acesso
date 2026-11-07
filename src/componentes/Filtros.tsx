// Barra de filtros única das listas: mesmo cartão, mesmos controles e "Limpar filtros" sempre no mesmo lugar.
// Desktop (md+): campos em linha, quebrando para a linha de baixo. Celular: só o campo principal (a busca) e o botão
// "Filtros (n)", que abre o resto. Os filtros que não são dado pessoal vão para a URL (useFiltrosUrl); nome, CPF,
// texto livre e placa ficam só no estado (LGPD: a URL vai para histórico, log de proxy e Referer).
export { CONTROLE } from './filtros/controle'
export { useFiltrosUrl, lerOpcao, naUrl } from './filtros/url'
export { ultimosDias, usePeriodoUrl } from './filtros/periodo'
export { BarraFiltros } from './filtros/BarraFiltros'
export { CampoFiltro, FiltroBusca, FiltroCheck, ContagemResultado } from './filtros/campos'
export { FiltroPeriodo } from './filtros/FiltroPeriodo'
export { useFiltroUnidade, FiltroUnidade } from './filtros/unidade'
