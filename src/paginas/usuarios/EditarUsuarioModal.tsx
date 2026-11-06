import { useState, type FormEvent } from 'react'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { ROTULO_PAPEL, type Papel, type UsuarioSistema } from '@/domain/types'
import { mudancas, validarNovoUsuario } from './regras'
import { ErrosNovo } from './NovoUsuarioModal'
import { errosDoServidor } from './NovoUsuarioModal'

export /** Nome, login e papel. Só o que mudou vai ao servidor; o próprio papel fica travado (AUTO_PAPEL no banco). */
function EditarUsuarioModal({
  usuario,
  proprio,
  papeis,
  onClose,
  onSalvar,
}: {
  usuario: UsuarioSistema
  proprio: boolean
  papeis: Papel[]
  onClose: () => void
  onSalvar: (i: ReturnType<typeof mudancas>) => Promise<void>
}) {
  const [f, setF] = useState<{ nome: string; login: string; papel: Papel }>({
    nome: usuario.nome,
    login: usuario.login,
    papel: usuario.papel,
  })
  const [erros, setErros] = useState<ErrosNovo>({})
  const [salvando, setSalvando] = useState(false)
  const opcoes = papeis.includes(usuario.papel) ? papeis : [usuario.papel, ...papeis]
  const mudouPapel = f.papel !== usuario.papel
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    const m = mudancas(usuario, f)
    const v = validarNovoUsuario(f)
    const locais = {
      nome: m.nome !== undefined ? v.nome : undefined,
      login: m.login !== undefined ? v.login : undefined,
    }
    setErros(locais)
    if (locais.nome || locais.login) return
    setSalvando(true)
    try {
      await onSalvar(m)
    } catch (err) {
      setErros(errosDoServidor(err))
      setSalvando(false)
    }
  }
  return (
    <Modal
      titulo={`Editar ${usuario.nome}`}
      onClose={onClose}
      rodape={
        <>
          <Button
            type="submit"
            form="f-editar"
            variante="primario"
            grande
            className="flex-1"
            carregando={salvando}
          >
            Salvar
          </Button>
          <Button grande onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id="f-editar" onSubmit={salvar} noValidate className="flex flex-col gap-[14px]">
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
          dica="Letras minúsculas, números, ponto, hífen ou sublinhado. A senha não muda."
        >
          <input
            className="input font-mono"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={f.login}
            aria-invalid={erros.login ? true : undefined}
            onChange={(e) => setF({ ...f, login: e.target.value })}
          />
        </Field>
        <Field
          label="Papel"
          dica={proprio ? 'Ninguém muda o próprio papel: peça a outro síndico.' : undefined}
        >
          <select
            className="input"
            value={f.papel}
            disabled={proprio}
            onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}
          >
            {opcoes.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </Field>
        {mudouPapel && (
          <Alert tom="ambar">
            Ao mudar o papel, as sessões abertas de {usuario.nome} são encerradas e a nova permissão
            vale no próximo login.
          </Alert>
        )}
        {erros.geral && (
          <Alert tom="vermelho" role="alert">
            {erros.geral}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
