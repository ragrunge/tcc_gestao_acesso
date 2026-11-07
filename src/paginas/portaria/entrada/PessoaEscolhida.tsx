import type { PessoaBusca } from '@/api'
import { Button } from '@/componentes/Button'
import { Avatar } from '@/componentes/UnitTag'
import { rotuloPessoa } from './constantes'

export function PessoaEscolhida({ pessoa, trocar }: { pessoa: PessoaBusca; trocar: () => void }) {
  return (
    <div className="flex items-center gap-[14px] rounded-lg border border-[#A9D2D8] bg-[#F0F8F9] px-[14px] py-3">
      <Avatar nome={pessoa.nome} tamanho={44} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold">{pessoa.nome}</span>
        <span className="text-[14px] text-[#33424B]">
          <span className="font-mono">{pessoa.documentoMascarado}</span> · {rotuloPessoa(pessoa)}
          {pessoa.empresa && (
            <>
              {' '}
              · {pessoa.empresa}
              {pessoa.servico ? ` (${pessoa.servico})` : ''}
            </>
          )}{' '}
          · último acesso: {pessoa.ultimoAcesso}
        </span>
      </div>
      <Button pequeno onClick={trocar}>
        Trocar
      </Button>
    </div>
  )
}
