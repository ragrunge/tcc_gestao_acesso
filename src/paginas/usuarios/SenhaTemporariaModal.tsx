import { useState } from 'react'
import { Copy, MessageSquareText, TriangleAlert } from 'lucide-react'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { mensagemAcesso, validadeTexto } from './senhaTemporaria'
import { SenhaExibida } from './tipos'

export /**
 * Mostra a senha temporária UMA vez. Ao fechar, o estado da tela é zerado e a senha some da memória da UI
 * (não fica em contexto global, cache do React Query nem storage). A API também não a devolve de novo.
 */
function SenhaTemporariaModal({ senha, onClose }: { senha: SenhaExibida; onClose: () => void }) {
  const [copiado, setCopiado] = useState<'senha' | 'mensagem' | 'falhou' | null>(null)
  const expiraEm = senha.usuario.senhaTemporariaExpiraEm ?? null
  const mensagem = mensagemAcesso({
    login: senha.usuario.login,
    senhaTemporaria: senha.senhaTemporaria,
    expiraEm,
    origem: window.location.origin,
  })
  async function copiar(texto: string, qual: 'senha' | 'mensagem') {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
    } catch {
      setCopiado('falhou')
    }
  }
  return (
    <Modal
      titulo={
        senha.motivo === 'criado'
          ? `Usuário ${senha.usuario.nome} criado`
          : `Acesso de ${senha.usuario.nome} redefinido`
      }
      tamanho="p"
      tom="petroleo"
      tituloId="modal-senha-temporaria"
      semFechar
      onClose={onClose}
      rodape={
        <Button variante="primario" grande className="flex-1" data-autofocus onClick={onClose}>
          Já copiei, fechar
        </Button>
      }
    >
      <div className="flex gap-[10px] rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-[14px] py-3 text-[#7A2E0E]">
        <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
        <span>
          <strong>Copie agora.</strong> Esta senha temporária não será mostrada de novo. No primeiro
          acesso, {senha.usuario.nome} vai precisar trocá-la.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium">Login</span>
        <span className="font-mono text-[15px]">{senha.usuario.login}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="rot-senha-temp" className="text-[14px] font-medium">
          Senha temporária
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <output
            aria-labelledby="rot-senha-temp"
            className="min-w-0 flex-1 select-all break-all rounded-lg border border-[#B9C3CA] bg-[#F6F8F9] px-[14px] py-[10px] font-mono text-[18px] tracking-[0.04em]"
          >
            {senha.senhaTemporaria}
          </output>
          <Button onClick={() => void copiar(senha.senhaTemporaria, 'senha')}>
            <Copy className="mr-1.5 inline h-4 w-4" aria-hidden />
            {copiado === 'senha' ? 'Copiada' : 'Copiar senha'}
          </Button>
        </div>
        <span className="text-[13px] text-[#56616B]">
          Digite com os hífens, só letras minúsculas e números.
        </span>
        {expiraEm != null && (
          <span className="text-[14px] font-medium text-[#7A2E0E]">
            Válida até {validadeTexto(expiraEm)}. Depois disso, será preciso gerar outra.
          </span>
        )}
      </div>
      <Button onClick={() => void copiar(mensagem, 'mensagem')}>
        <MessageSquareText className="mr-1.5 inline h-4 w-4" aria-hidden />
        {copiado === 'mensagem'
          ? 'Mensagem copiada'
          : 'Copiar mensagem com login, senha e endereço'}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copiado === 'mensagem' ? 'Mensagem copiada.' : copiado === 'senha' ? 'Senha copiada.' : ''}
      </span>
      {copiado === 'falhou' && (
        <Alert tom="ambar" role="alert">
          Não foi possível copiar. Selecione a senha e copie manualmente.
        </Alert>
      )}
    </Modal>
  )
}
