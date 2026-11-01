// Barra de páginas das listas: Anterior, números (com reticências) e Próxima, sobre o Pagination do shadcn/ui.
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from './ui/pagination';
import { cn } from '../lib/utils';

/** Páginas a mostrar: primeira, última e a vizinhança da atual; `null` vira reticências. */
export function paginasVisiveis(atual: number, total: number, vizinhos = 1): (number | null)[] {
  if (total <= 5 + 2 * vizinhos) return Array.from({ length: total }, (_, i) => i + 1);
  const ini = Math.max(2, atual - vizinhos);
  const fim = Math.min(total - 1, atual + vizinhos);
  const meio = Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
  return [1, ...(ini > 2 ? [null] : []), ...meio, ...(fim < total - 1 ? [null] : []), total];
}

export function Paginacao({ pagina, totalPaginas, onIr, rotulo, ocupado, className }: {
  pagina: number; totalPaginas: number; onIr: (n: number) => void;
  /** Complemento do aria-label ("Paginação de pessoas"). */
  rotulo?: string;
  ocupado?: boolean;
  className?: string;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <Pagination aria-label={rotulo ? `Paginação de ${rotulo}` : 'Paginação'} aria-busy={ocupado || undefined}
      className={cn('flex-col items-center gap-2 sm:flex-row sm:justify-between', className)}>
      <p className="text-[14px] text-[#56616B]" aria-live="polite">Página {pagina} de {totalPaginas}</p>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious disabled={pagina <= 1} onClick={() => onIr(pagina - 1)} />
        </PaginationItem>
        {paginasVisiveis(pagina, totalPaginas).map((n, i) => (
          <PaginationItem key={n ?? `r${i}`}>
            {n === null ? <PaginationEllipsis /> : (
              <PaginationLink isActive={n === pagina} aria-label={n === pagina ? `Página ${n}, atual` : `Ir para a página ${n}`}
                onClick={() => { if (n !== pagina) onIr(n); }}>{n}</PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext disabled={pagina >= totalPaginas} onClick={() => onIr(pagina + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** Linha de totais no topo da tela: rótulo e número, sem virar painel. */
export function Totais({ itens, rotulo, className }: {
  itens: { rotulo: string; valor: number | undefined; destaque?: 'ambar' | 'vermelho' }[]; rotulo: string; className?: string;
}) {
  return (
    <dl aria-label={rotulo} className={cn('flex flex-wrap gap-2', className)}>
      {itens.map((t) => (
        <div key={t.rotulo} className={cn('flex min-h-[44px] flex-col justify-center rounded-lg border bg-white px-3 py-1.5',
          t.destaque === 'vermelho' && t.valor ? 'border-[#FDA29B] bg-[#FEF3F2]' : t.destaque === 'ambar' && t.valor ? 'border-[#FEC84B] bg-[#FFFAEB]' : 'border-[#DCE1E5]')}>
          <dt className="text-[12.5px] text-[#56616B]">{t.rotulo}</dt>
          <dd className="font-mono text-[18px] font-semibold leading-tight text-ink">{t.valor === undefined ? '…' : t.valor.toLocaleString('pt-BR')}</dd>
        </div>
      ))}
    </dl>
  );
}
