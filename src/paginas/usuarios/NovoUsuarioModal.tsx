import { useState, type FormEvent } from 'react'
import { ApiError, type NovoUsuarioInput } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { RadioGroup, RadioGroupItem } from '@/componentes/ui/radio-group'
import { Label } from '@/componentes/ui/label'
import { ROTULO_PAPEL, type Papel } from '@/domain/types'
import { mensagemErro } from '@/app/useAsync'
import { validarNovoUsuario } from './regras'

export type ErrosNovo = { nome?: string; login?: string; geral?: string }

export /** Erro do servidor no campo certo (VALIDACAO com `field`, login repetido); o resto vai para o alerta do formulário. */
function errosDoServidor(e: unknown): ErrosNovo {
  if (e instanceof ApiError) {
    if (e.code === 'LOGIN_EXISTENTE') return { login: e.message }
    const campo = Array.isArray(e.detalhes)
      ? (e.detalhes[0] as { field?: unknown } | undefined)?.field
      : undefined
    if (e.code === 'VALIDACAO' && (campo === 'nome' || campo === 'login'))
      return { [campo]: e.message }
  }
  return { geral: mensagemErro(e) }
}

export function NovoUsuarioModal({
  papeis,
  onClose,
  onSalvar,
}: {
  papeis: Papel[]
  onClose: () => void
  onSalvar: (f: NovoUsuarioInput) => Promise<void>
}) {
  const [f, setF] = useState<{ nome: string; login: string; papel: Papel }>({
    nome: '',
    login: '',
    papel: 'porteiro',
  })
  const [erros, setErros] = useState<ErrosNovo>({})
  const [salvando, setSalvando] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    const locais = validarNovoUsuario(f)
    setErros(locais)
    if (locais.nome || locais.login) return
    setSalvando(true)
    try {
      await onSalvar({ nome: f.nome.trim(), login: f.login.trim().toLowerCase(), papel: f.papel })
    } catch (err) {
      setErros(errosDoServidor(err))
      setSalvando(false)
    }
  }
  return (
    <Modal
      titulo="Novo usuário"
      onClose={onClose}
      rodape={
        <>
          <Button
            type="submit"
            form="f-user"
            variante="primario"
            grande
            className="flex-1"
            carregando={salvando}
          >
            Criar usuário
          </Button>
          <Button grande onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id="f-user" onSubmit={salvar} noValidate className="flex flex-col gap-[14px]">
        <Field label="Nome completo" erro={erros.nome}>
          <input
            data-autofocus
            className="input"
            autoComplete="off"
            value={f.nome}
            aria-invalid={erros.nome ? true : undefined}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
          />
        </Field>
        <Field
          label="Login"
          erro={erros.login}
          dica="Letras minúsculas, números, ponto, hífen ou sublinhado (ex.: nome.sobrenome)."
        >
          <input
            className="input font-mono"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={f.login}
            aria-invalid={erros.login ? true : undefined}
            onChange={(e) => setF({ ...f, login: e.target.value })}
            placeholder="nome.sobrenome"
          />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend id="rot-perfil" className="mb-1.5 text-[14px] font-medium">
            Papel
          </legend>
          <RadioGroup
            value={f.papel}
            onValueChange={(v) => setF({ ...f, papel: v as Papel })}
            aria-labelledby="rot-perfil"
            className="grid-cols-2 sm:grid-cols-4"
          >
            {papeis.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 rounded-lg border border-[#B9C3CA] bg-white px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-claro"
              >
                <RadioGroupItem id={`papel-${p}`} value={p} />
                <Label htmlFor={`papel-${p}`} className="cursor-pointer">
                  {ROTULO_PAPEL[p]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="rounded-lg bg-[#E3F0F2] px-3 py-[10px] text-[14px] text-[#0B4450]">
          A senha temporária aparece uma única vez, logo depois de criar.
        </div>
        {erros.geral && (
          <Alert tom="vermelho" role="alert">
            {erros.geral}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
