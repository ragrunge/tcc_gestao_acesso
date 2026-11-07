import { type PessoaBusca } from '@/api'
import type { Pessoa } from '@/domain/types'
import { Button } from '@/componentes/Button'

export const rodapeForm = (onClose: () => void, form: string, rotulo: string) => (
  <>
    <Button type="submit" form={form} variante="primario" grande className="flex-1">
      {rotulo}
    </Button>
    <Button grande onClick={onClose}>
      Cancelar
    </Button>
  </>
)

export /** Pessoa recém-cadastrada (ou o cadastro existente) no formato do seletor. */
const paraSeletor = (p: Pessoa): PessoaBusca => ({
  ...p,
  ultimoAcesso: '',
  unidadesVinculadas: [],
  unidadesVinculadasCodigos: [],
})
