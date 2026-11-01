// Pagination do shadcn/ui (new-york), com o visual do Button do app (classesBotao) e textos em português.
// Diferença do original: PaginationLink é <button>, não <a>. A página vive no search param da rota (troca sem recarregar),
// e um <a> sem href sai da ordem de tabulação.
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { classesBotao } from './button';

function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav role="navigation" aria-label="Paginação" data-slot="pagination" className={cn('mx-auto flex w-full justify-center', className)} {...props} />;
}

function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="pagination-content" className={cn('flex flex-row flex-wrap items-center gap-1', className)} {...props} />;
}

function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = { isActive?: boolean } & ComponentProps<'button'>;

function PaginationLink({ className, isActive, type, ...props }: PaginationLinkProps) {
  return (
    <button type={type ?? 'button'} aria-current={isActive ? 'page' : undefined} data-slot="pagination-link" data-active={isActive}
      className={cn(classesBotao(isActive ? 'outline' : 'ghost', 'sm'), 'min-w-[44px] px-2 lg:min-w-[40px]', className)} {...props} />
  );
}

function PaginationPrevious({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Ir para a página anterior" className={cn('gap-1 px-2.5', className)} {...props}>
      <ChevronLeft className="h-4 w-4" aria-hidden />
      <span className="hidden sm:block">Anterior</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Ir para a próxima página" className={cn('gap-1 px-2.5', className)} {...props}>
      <span className="hidden sm:block">Próxima</span>
      <ChevronRight className="h-4 w-4" aria-hidden />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span aria-hidden data-slot="pagination-ellipsis" className={cn('flex h-[44px] w-9 items-center justify-center lg:h-[40px]', className)} {...props}>
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">Mais páginas</span>
    </span>
  );
}

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious };
