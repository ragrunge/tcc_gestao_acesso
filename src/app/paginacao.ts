// Paginação numerada no servidor (React Query v5). A página fica na URL (`?pagina=N`, só a partir da 2); a chave da
// consulta leva os filtros e a página; trocar filtro volta à página 1 já na mesma renderização (sem buscar a página N do
// filtro novo); página fora do intervalo (link velho, lista que encolheu) é corrigida depois que o total chega. A página
// anterior continua na tela durante a troca (placeholderData). Nas trilhas, o `ateSeq` da página 1 segura as seguintes
// contra registro novo; voltar à página 1 o renova.
import { useCallback, useEffect, useRef } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Pagina } from '../api';
import { useFiltrosUrl } from '../components/Filtros';

export const POR_PAGINA = 50;
/** Teto do deslocamento no servidor (0037): além disso, só com filtro. */
export const MAX_DESLOCAMENTO = 100_000;

/** `?pagina=` válido (inteiro de 1 em diante); o resto é a página 1. */
export function lerPagina(v: string | null): number {
  if (v === null || !/^[1-9]\d{0,5}$/.test(v)) return 1;
  return Number(v);
}

export function totalDePaginas(total: number | null | undefined, porPagina: number): number {
  if (!total || total <= 0) return 1;
  return Math.min(Math.ceil(total / porPagina), Math.floor(MAX_DESLOCAMENTO / porPagina) + 1);
}

export interface PosicaoBusca { limite: number; deslocamento: number; ateSeq?: number }

export interface OpcoesPaginacao<P> {
  /** Prefixo + filtros (serializáveis). Mudou, volta à página 1. */
  chave: readonly unknown[];
  buscar: (pos: PosicaoBusca) => Promise<P>;
  porPagina?: number;
  /** Trilha só de inclusão: repassa o `ateSeq` da página 1. */
  trilha?: boolean;
  habilitado?: boolean;
  /** Nome do search param (padrão `pagina`). */
  param?: string;
}

export function usePaginacao<T, P extends Pagina<T> = Pagina<T>>(o: OpcoesPaginacao<P>) {
  const { params, gravar } = useFiltrosUrl();
  const nome = o.param ?? 'pagina';
  const porPagina = o.porPagina ?? POR_PAGINA;
  const bruta = params.get(nome);
  const daUrl = lerPagina(bruta);
  const filtro = JSON.stringify(o.chave);
  const filtroVisto = useRef(filtro);
  const pagina = filtroVisto.current === filtro ? daUrl : 1;
  const ancora = useRef<{ filtro: string; ateSeq: number } | null>(null);

  useEffect(() => {
    if (filtroVisto.current === filtro) return;
    filtroVisto.current = filtro;
    ancora.current = null;
    if (bruta !== null) gravar({ [nome]: undefined });
  }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const consulta = useQuery({
    queryKey: [...o.chave, 'pagina', pagina, porPagina],
    queryFn: async () => {
      const ateSeq = o.trilha && pagina > 1 && ancora.current?.filtro === filtro ? ancora.current.ateSeq : undefined;
      const r = await o.buscar({ limite: porPagina, deslocamento: (pagina - 1) * porPagina, ...(ateSeq !== undefined ? { ateSeq } : {}) });
      if (o.trilha && r.ateSeq !== undefined && (pagina === 1 || ancora.current?.filtro !== filtro)) ancora.current = { filtro, ateSeq: r.ateSeq };
      return r;
    },
    placeholderData: keepPreviousData,
    enabled: o.habilitado ?? true,
    staleTime: 0,
  });

  // O total que vale é o do filtro atual: o placeholder (página anterior) pode ser de outro filtro. Na troca de página
  // do mesmo filtro, fica o último total conhecido (sem ele a barra de páginas sumiria até a resposta chegar).
  const ultimoTotal = useRef<{ filtro: string; total: number } | null>(null);
  const fresco = consulta.isPlaceholderData ? null : consulta.data?.total ?? null;
  if (fresco !== null) ultimoTotal.current = { filtro, total: fresco };
  const total = fresco ?? (ultimoTotal.current?.filtro === filtro ? ultimoTotal.current.total : null);
  const totalPaginas = totalDePaginas(total, porPagina);

  const irPara = useCallback((n: number) => {
    const alvo = Math.max(1, Math.min(Math.trunc(n) || 1, totalPaginas));
    gravar({ [nome]: alvo === 1 ? undefined : String(alvo) });
  }, [gravar, nome, totalPaginas]);

  useEffect(() => {
    if (bruta !== null && String(daUrl) !== bruta) { gravar({ [nome]: undefined }); return; }
    if (total !== null && pagina > totalPaginas) gravar({ [nome]: totalPaginas === 1 ? undefined : String(totalPaginas) });
  }, [bruta, daUrl, total, pagina, totalPaginas, gravar, nome]);

  return {
    consulta,
    itens: consulta.data?.itens ?? ([] as T[]),
    dados: consulta.data,
    pagina,
    totalPaginas,
    total,
    porPagina,
    irPara,
    /** Trocando de página ou de filtro: a lista na tela ainda é a anterior. */
    trocando: consulta.isPlaceholderData,
  };
}
