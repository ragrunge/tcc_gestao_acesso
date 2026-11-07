import { Field } from '@/componentes/Field'
import { PessoaCombobox } from '@/componentes/PessoaCombobox'
import { Avatar } from '@/componentes/UnitTag'
import { Alert } from '@/componentes/ui/alert'
import { motivoConflito } from './regras'
import { TipoVinculoCampo } from './TipoVinculoCampo'
import { UnidadeSeletor } from './UnidadeSeletor'
import type { NovoVinculoProps } from './NovoVinculo'
import type { NovoVinculoEstado } from './useNovoVinculo'

export function FormNovoVinculo({
  s,
  pessoaFixa,
  unidadeFixa,
  vinculosConhecidos,
  podeCadastrar,
}: Pick<NovoVinculoProps, 'pessoaFixa' | 'unidadeFixa' | 'vinculosConhecidos'> & {
  s: NovoVinculoEstado
  podeCadastrar: boolean
}) {
  const { erros, setErros, unidadeId, pessoa, tipo, ini, fim } = s
  return (
    <form
      id="f-novo-vinculo"
      onSubmit={s.continuar}
      noValidate
      className="flex flex-col gap-[14px]"
    >
      {pessoaFixa ? (
        <div className="flex items-center gap-[14px] rounded-lg border border-primary-borda bg-[#F0F8F9] px-[14px] py-[10px]">
          <Avatar nome={pessoaFixa.nome} tamanho={44} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[16px] font-semibold">{pessoaFixa.nome}</span>
            <span className="font-mono text-[14px] text-[#33424B]">
              {pessoaFixa.documentoMascarado}
            </span>
          </span>
        </div>
      ) : (
        <PessoaCombobox
          valor={s.pessoaBusca}
          autoFocus
          erro={erros.pessoa}
          onChange={(p) => {
            s.setPessoaBusca(p)
            setErros((x) => ({ ...x, pessoa: undefined, unidade: undefined }))
          }}
          onCadastrar={podeCadastrar ? s.setCadastrando : undefined}
          indisponivel={
            unidadeId
              ? (p) => motivoConflito(vinculosConhecidos, p.id, unidadeId, p.unidadesVinculadas)
              : undefined
          }
        />
      )}
      {!unidadeFixa && (
        <UnidadeSeletor
          valor={unidadeId}
          erro={erros.unidade}
          onChange={(id) => {
            s.setUnidadeId(id)
            setErros((x) => ({ ...x, unidade: undefined }))
          }}
          motivo={pessoa ? (u) => motivoConflito(vinculosConhecidos, pessoa.id, u.id) : undefined}
        />
      )}
      {unidadeFixa && erros.unidade && (
        <Alert variant="vermelho" role="alert">
          {erros.unidade}
        </Alert>
      )}
      <TipoVinculoCampo valor={tipo} onChange={s.setTipo} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Início da vigência" dica="Em branco = sem data de início.">
          <input
            type="date"
            className="input"
            value={ini}
            onChange={(e) => s.setIni(e.target.value)}
          />
        </Field>
        <Field
          label={tipo === 'inquilino' ? 'Fim da vigência (obrigatório)' : 'Fim da vigência'}
          erro={erros.fim}
          dica={tipo === 'inquilino' ? 'Obrigatório para inquilino.' : 'Em branco = indeterminada.'}
        >
          <input
            type="date"
            className={`input ${erros.fim ? 'border-perigo' : ''}`}
            value={fim}
            min={ini || undefined}
            aria-invalid={erros.fim ? true : undefined}
            onChange={(e) => {
              s.setFim(e.target.value)
              setErros((x) => ({ ...x, fim: undefined }))
            }}
          />
        </Field>
      </div>
      <Alert variant="neutro">
        O vínculo nasce <strong>pendente</strong> e só concede acesso depois da conferência do
        comprovante e da aprovação da administração ou do síndico, em Vínculos.
      </Alert>
    </form>
  )
}
