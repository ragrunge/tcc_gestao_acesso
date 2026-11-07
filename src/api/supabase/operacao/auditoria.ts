import type { Api, Pagina } from '@/api/types'
import { montarExportacaoJsonl } from '@/domain/exportacao'
import {
  type Ancora,
  type EventoExportado,
  type ResultadoIntegridade,
  hashGenese,
  verificarCadeia,
} from '@/domain/hashChain'
import type { RegistroAlteracao } from '@/domain/types'
import {
  type Rpc,
  filtroEventos,
  naoMigrado,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from '../portaria'

/** Lote da verificação (o banco entrega no máximo 2000 eventos por chamada). */
const LOTE_CADEIA = 2000

/**
 * Evento do banco (já no formato canônico) com as chaves na ordem de paraExportacao do legado, para o JSONL sair igual.
 * Conferência de tipo mínima: o resto (formato, veículo num v1) é o verificador que recusa.
 */
export function exportadoDe(x: unknown): EventoExportado {
  const e = x as Record<string, unknown> | null
  if (
    !e ||
    typeof e.seq !== 'number' ||
    typeof e.v !== 'number' ||
    typeof e.hash !== 'string' ||
    typeof e.hash_anterior !== 'string'
  )
    throw respostaInvalida()
  const t = (k: string) => (e[k] === undefined ? null : (e[k] as string | null))
  return {
    v: e.v,
    seq: e.seq,
    id: t('id'),
    tipo: t('tipo'),
    categoria_pessoa: t('categoria_pessoa'),
    pessoa_id: t('pessoa_id'),
    unidade_destino_id: t('unidade_destino_id'),
    area_comum_id: t('area_comum_id'),
    ponto_acesso_id: t('ponto_acesso_id'),
    autorizado_por_tipo: t('autorizado_por_tipo'),
    autorizado_por_pessoa_id: t('autorizado_por_pessoa_id'),
    autorizacao_previa_id: t('autorizacao_previa_id'),
    justificativa: t('justificativa'),
    restricao_id: t('restricao_id'),
    operador_id: t('operador_id'),
    operador_papel: t('operador_papel'),
    ocorrido_em: t('ocorrido_em'),
    registrado_em: t('registrado_em'),
    retroativo: e.retroativo === true,
    formulario_contingencia: t('formulario_contingencia'),
    refere_evento_id: t('refere_evento_id'),
    corrige_evento_id: t('corrige_evento_id'),
    correcao_valores: (e.correcao_valores ?? null) as Record<string, string | null> | null,
    empresa: t('empresa'),
    servico: t('servico'),
    observacao: t('observacao'),
    ...('veiculo_placa' in e || 'veiculo_modelo' in e || 'veiculo_cor' in e
      ? {
          veiculo_placa: t('veiculo_placa'),
          veiculo_modelo: t('veiculo_modelo'),
          veiculo_cor: t('veiculo_cor'),
        }
      : {}),
    hash_anterior: e.hash_anterior,
    hash: e.hash,
  }
}

/** Horário de São Paulo (UTC-3 fixo, como o domain) para o manifesto e o nome do arquivo. */
const isoSP = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00')
const carimboSP = (ms: number) =>
  new Date(ms - 3 * 3600_000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')

interface LoteCadeia {
  cabeca: { ultimoSeq: number; ultimoHash: string } | null
  ancora: Ancora | null
  ateSeq: number
  eventos: unknown[]
  selos: { ultimoSeq: number; ultimoHash: string }[]
}

export function criarAuditoria(rpc: Rpc): Pick<Api, 'auditoria'> {
  const alteracoesPagina = async (
    f: Parameters<Api['auditoria']['alteracoesPagina']>[0] = {},
  ): Promise<Pagina<RegistroAlteracao>> =>
    paginaDe<RegistroAlteracao>(
      await rpc('auditoria_alteracoes', {
        p: semIndefinidos({
          ...posicao(f),
          de: f.de !== undefined ? Math.trunc(f.de) : undefined,
          ate: f.ate !== undefined ? Math.trunc(f.ate) : undefined,
          usuarioId: f.usuarioId,
          acao: f.acao,
          entidade: f.entidade,
        }),
      }),
    )
  const lote = async (p: Record<string, unknown>): Promise<LoteCadeia> => {
    const r = await rpc<LoteCadeia>('auditoria_cadeia', { p: { limite: LOTE_CADEIA, ...p } })
    if (!r || !Array.isArray(r.eventos) || !Array.isArray(r.selos) || typeof r.ateSeq !== 'number')
      throw respostaInvalida()
    return r
  }

  return {
    auditoria: {
      alteracoesPagina,
      async alteracoes(f = {}) {
        return todas(
          (cursor) => alteracoesPagina({ ...f, limite: 100, cursor }),
          'A trilha tem mais páginas do que esta tela consegue mostrar. Use filtros.',
        )
      },
      /**
       * RF-37: recalcula a cadeia NO NAVEGADOR, em lotes, a partir da gênese (ou do selo no seq de corte, depois de um
       * descarte por retenção). Confere cada selo do trecho e, no fim, a cabeça da cadeia (pega remoção no FIM).
       */
      async verificarIntegridade(): Promise<ResultadoIntegridade> {
        let r = await lote({})
        let ancora: Ancora = r.ancora ?? { seq: 0, hash: await hashGenese() }
        const cabeca = r.cabeca
        let verificados = 0
        for (;;) {
          const evs = r.eventos.map(exportadoDe)
          if (!evs.length) break
          const v = await verificarCadeia(evs, ancora)
          if (!v.valido) return { ...v, verificados: verificados + v.verificados }
          for (const s of r.selos) {
            const e = evs.find((x) => x.seq === s.ultimoSeq)
            if (!e || e.hash !== s.ultimoHash) {
              return {
                valido: false,
                verificados: verificados + v.verificados,
                ultimoSeq: v.ultimoSeq,
                ultimoHash: v.ultimoHash,
                primeiroSeqInvalido: s.ultimoSeq,
                primeiroEventoIdInvalido: e?.id ?? undefined,
                motivo: 'selo_divergente',
              }
            }
          }
          verificados += v.verificados
          ancora = { seq: v.ultimoSeq, hash: v.ultimoHash }
          if (evs.length < LOTE_CADEIA) break
          r = await lote({ aposSeq: ancora.seq, ateSeq: r.ateSeq })
        }
        if (cabeca && (cabeca.ultimoSeq !== ancora.seq || cabeca.ultimoHash !== ancora.hash)) {
          return {
            valido: false,
            verificados,
            ultimoSeq: ancora.seq,
            ultimoHash: ancora.hash,
            primeiroSeqInvalido: ancora.seq + 1,
            motivo: 'lacuna_de_seq',
          }
        }
        return { valido: true, verificados, ultimoSeq: ancora.seq, ultimoHash: ancora.hash }
      },
      /** RF-32: o banco devolve os eventos dos filtros (e grava auditoria.exportar); o JSONL é montado aqui. */
      async exportar(f = {}) {
        const filtros = filtroEventos(f)
        const r = await rpc<{
          eventos: unknown[]
          exibicao: Record<
            string,
            {
              pessoa: string | null
              unidade: string | null
              areaComum: string | null
              operador: string | null
            }
          >
          geradoPor: string
          isolado: boolean
        }>('auditoria_exportar', { p: filtros })
        if (
          !r ||
          !Array.isArray(r.eventos) ||
          typeof r.exibicao !== 'object' ||
          typeof r.geradoPor !== 'string'
        )
          throw respostaInvalida()
        const agora = Date.now()
        return montarExportacaoJsonl({
          eventos: r.eventos.map(exportadoDe),
          isolado: r.isolado === true,
          // No manifesto, os filtros de texto que podem identificar alguém saem só como marcação (como na trilha).
          filtros: {
            ...filtros,
            ...(filtros.pessoa ? { pessoa: '(nome)' } : {}),
            ...(filtros.placa ? { placa: '(placa)' } : {}),
          },
          exibicao: (e) =>
            r.exibicao[e.id ?? ''] ?? {
              pessoa: null,
              unidade: null,
              areaComum: null,
              operador: null,
            },
          geradoPor: r.geradoPor,
          condominio: null,
          geradoEm: isoSP(agora),
          carimbo: carimboSP(agora),
          observacao:
            'Arquivo de hashes para verificação, montado no navegador a partir do banco. Não há assinatura digital nem âncora externa neste arquivo.',
        })
      },
      selos: naoMigrado('auditoria.selos'),
      selar: naoMigrado('auditoria.selar'),
      conferirAncora: naoMigrado('auditoria.conferirAncora'),
    },
  }
}
