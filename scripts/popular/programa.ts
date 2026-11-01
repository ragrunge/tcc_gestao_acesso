// Camada de linha de comando do carregador. `--dry-run`: gera e valida o conjunto, sem ler credencial nem .env e sem
// nenhuma chamada de rede. Sem a opção: valida, confere o alvo (POPULAR_CONFIRMAR), entra como o síndico e carrega.
import { carregar, type Relatorio } from './carregador.ts';
import { conectar as conectarReal, ErroCarga } from './cliente.ts';
import { ErroConfiguracao, intervaloMs, obterCredenciais, resolverAlvo } from './configuracao.ts';
import { gerarConjunto, SEMENTE_PADRAO, type Contagens } from './gerador.ts';
import { validarConjunto } from './validar.ts';

export interface Contexto {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  escrever(texto: string): void;
  lerArquivo(caminho: string): string | null;
  caminhoCredenciais: string;
  conectar?: typeof conectarReal;
}

function resumo(k: Contagens): string {
  return [
    `Unidades: ${k.unidades} (${k.unidadesOcupadas} ocupadas, ${k.unidadesAlugadas} alugadas, ${k.unidadesVazias} vazias)`,
    `Moradores: ${k.moradores} (${k.adultos} adultos pela planilha, ${k.menores} menores pelo cadastro; ${k.porTipo.proprietario} proprietários, ${k.porTipo.inquilino} inquilinos, ${k.porTipo.dependente} dependentes)`,
    `Vínculos ao fim: ${k.vinculosAprovadosFinal} aprovados, ${k.vinculosLegadoFinal} legados à espera de regularização (prazo de 90 dias)`,
    `Veículos: ${k.veiculos} · Funcionários: ${k.funcionarios} · Visitantes: ${k.visitantes} · Prestadores: ${k.prestadores}`,
    `Autorizações prévias: ${k.autorizacoes} · Restrições: ${k.restricoes}`,
    `Eventos de acesso: ${k.eventos.total} (${k.eventos.entradas} entradas, ${k.eventos.saidas} saídas, ${k.eventos.negados} negado, ${k.eventos.recusas} recusa)`,
    `Encomendas: ${k.encomendas.recebidas} recebidas, ${k.encomendas.entregues} entregues · Ocorrências: ${k.ocorrencias} (${k.mudancasDeStatus} mudanças de status)`,
  ].join('\n');
}

const formatarRelatorio = (r: Relatorio) => Object.entries(r)
  .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? `${v.criados} criados, ${v.existentes} já existiam` : v}`).join('\n');

export async function executar(ctx: Contexto): Promise<number> {
  const dry = ctx.argv.includes('--dry-run');
  const conjunto = gerarConjunto(SEMENTE_PADRAO);
  const { problemas, contagens } = validarConjunto(conjunto);
  ctx.escrever(`Conjunto fictício (semente ${conjunto.semente}):\n${resumo(contagens)}\n`);
  if (problemas.length) {
    ctx.escrever(`Conjunto inválido (${problemas.length} problemas):\n${problemas.slice(0, 50).map((p) => `  - ${p}`).join('\n')}\n`);
    return 1;
  }
  ctx.escrever('Validação: CPFs, placas, unidades, papéis, vínculos, autorizações, restrições e eventos conferidos, sem problemas.\n');
  if (dry) {
    ctx.escrever('--dry-run: nenhuma chamada de rede foi feita.\n');
    return 0;
  }

  let api: Awaited<ReturnType<typeof conectarReal>>['api'] | undefined;
  try {
    const alvo = resolverAlvo(ctx.env);
    const intervalo = intervaloMs(ctx.env);
    const cred = obterCredenciais(ctx.env, ctx.lerArquivo, ctx.caminhoCredenciais);
    ctx.escrever(`Alvo: ${alvo.host}${alvo.local ? ' (local)' : ' (HOSPEDADO: a trilha é permanente)'} · ritmo: 1 chamada a cada ${intervalo} ms\n`);
    const c = await (ctx.conectar ?? conectarReal)(alvo, cred, intervalo);
    api = c.api;
    ctx.escrever(`Entrou como ${c.usuario.login} (síndico).\n`);
    const relatorio = await carregar(conjunto, api, { info: (m) => ctx.escrever(`${m}\n`) });
    ctx.escrever(`Carga concluída:\n${formatarRelatorio(relatorio)}\n`);
    return 0;
  } catch (e) {
    if (e instanceof ErroConfiguracao) { ctx.escrever(`Recusado: ${e.message}\n`); return 2; }
    if (e instanceof ErroCarga) {
      ctx.escrever(`Parou (${e.codigo}): ${e.message}\nRode de novo para continuar: o que já foi gravado é conferido e não se repete.\n`);
      return 1;
    }
    ctx.escrever(`Parou: erro inesperado (${(e as Error)?.name ?? typeof e}). Rode de novo para continuar.\n`);
    return 1;
  } finally {
    await api?.encerrar();
  }
}
