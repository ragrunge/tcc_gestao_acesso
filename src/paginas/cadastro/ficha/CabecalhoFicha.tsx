import { Alert } from '@/componentes/Alert'
import { Badge } from '@/componentes/Badge'
import { Avatar } from '@/componentes/UnitTag'
import { ROTULO_CATEGORIA, type Pessoa } from '@/domain/types'
import { fmtDataHora } from '@/domain/time'

export function CabecalhoFicha({
  pessoa,
  desativada,
  anonimizada,
}: {
  pessoa: Pessoa
  desativada: boolean
  anonimizada: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-[14px]">
        <Avatar nome={pessoa.nome} tamanho={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold">{pessoa.nome}</p>
          <p className="text-[14px] text-[#33424B]">
            <span className="font-mono">{pessoa.documentoMascarado}</span>
            {pessoa.telefoneMascarado ? <> · {pessoa.telefoneMascarado}</> : null}
            {pessoa.empresa && (
              <>
                {' '}
                · {pessoa.empresa}
                {pessoa.servico ? ` (${pessoa.servico})` : ''}
              </>
            )}
          </p>
        </div>
        {desativada && <Badge tom="ambar">Desativado</Badge>}
        <Badge tom="neutro">{ROTULO_CATEGORIA[pessoa.categoria]}</Badge>
      </div>
      {desativada && !anonimizada && (
        <Alert tom="ambar" role="status">
          Cadastro desativado em {fmtDataHora(pessoa.desativadaEm!)}
          {pessoa.desativacaoMotivo ? <>: {pessoa.desativacaoMotivo}</> : null}. Não aparece nas
          buscas e não pode entrar; o histórico continua.
        </Alert>
      )}
      {anonimizada && (
        <Alert tom="neutro" role="status">
          Cadastro anonimizado em {fmtDataHora(pessoa.anonimizadaEm!)}. Os eventos de acesso
          continuam na trilha só pelo id, até o fim do prazo de retenção.
        </Alert>
      )}
    </>
  )
}
