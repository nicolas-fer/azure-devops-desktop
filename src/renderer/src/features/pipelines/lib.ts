// Helpers puros da feature Pipelines: zonas, rótulos em pt-BR, parsing leve de YAML e utilidades.
import { buildZone, timelineZone, zoneBg, type Zone } from '@/lib/zones'
import { seg, webUrl } from '@/lib/api'
import type { Build, TimelineRecord } from './types'

/** Base das rotas da feature para o projeto atual. */
export const pipelinesBase = (org: string, project: string) => `/${org}/${seg(project)}/pipelines`

export const isRunning = (b: { status?: string } | null | undefined) =>
  !!b && (b.status === 'inProgress' || b.status === 'notStarted' || b.status === 'cancelling' || b.status === 'postponed')

/** Zona do run: usa o mapa de builds de zones.ts. */
export const runZone = (b: { status?: string; result?: string }): Zone => buildZone(b.status, b.result)

/** Rótulo de estado do run (classificação Sucesso/Falhou/Em execução/Cancelado). */
export function runStateLabel(b: { status?: string; result?: string }): string {
  if (b.status === 'inProgress') return 'Em execução'
  if (b.status === 'notStarted') return 'Na fila'
  if (b.status === 'cancelling') return 'Cancelando'
  if (b.status === 'postponed') return 'Adiado'
  switch (b.result) {
    case 'succeeded':
      return 'Sucesso'
    case 'partiallySucceeded':
      return 'Parcial'
    case 'failed':
      return 'Falhou'
    case 'canceled':
      return 'Cancelado'
    default:
      return 'Concluído'
  }
}

/** Zona de um registro da timeline (stage/job/task). "Com avisos" conta como em andamento. */
export function recordZone(r: Pick<TimelineRecord, 'state' | 'result'>): Zone {
  if (r.state === 'inProgress') return 'progress'
  if (r.state === 'pending') return 'new'
  switch (r.result) {
    case 'succeeded':
      return 'done'
    case 'succeededWithIssues':
    case 'partiallySucceeded':
      return 'progress'
    case 'failed':
      return 'fail'
    case 'canceled':
    case 'abandoned':
    case 'skipped':
      return 'idle'
    default:
      return timelineZone(r.state, r.result)
  }
}

export function recordStateLabel(r: Pick<TimelineRecord, 'state' | 'result'>): string {
  if (r.state === 'inProgress') return 'Em execução'
  if (r.state === 'pending') return 'Pendente'
  switch (r.result) {
    case 'succeeded':
      return 'Sucesso'
    case 'succeededWithIssues':
      return 'Com avisos'
    case 'partiallySucceeded':
      return 'Parcial'
    case 'failed':
      return 'Falhou'
    case 'canceled':
      return 'Cancelado'
    case 'abandoned':
      return 'Abandonado'
    case 'skipped':
      return 'Ignorado'
    default:
      return 'Concluído'
  }
}

/** Zona de um environment a partir do último registro de implantação. */
export function envRecordZone(r?: { result?: string | null; finishTime?: string | null } | null): Zone | null {
  if (!r) return null
  if (r.result) return buildZone('completed', r.result)
  return r.finishTime ? 'done' : 'progress'
}

/** Zona de uma release a partir do status de um environment de release. */
export function releaseEnvZone(status?: string): Zone {
  switch (status) {
    case 'succeeded':
      return 'done'
    case 'rejected':
    case 'partiallySucceeded':
      return 'fail'
    case 'inProgress':
    case 'queued':
    case 'scheduled':
      return 'progress'
    case 'canceled':
      return 'idle'
    default:
      return 'new'
  }
}

export const releaseEnvLabel = (status?: string) =>
  ({
    succeeded: 'Sucesso',
    rejected: 'Rejeitado',
    partiallySucceeded: 'Parcial',
    inProgress: 'Em implantação',
    queued: 'Na fila',
    scheduled: 'Agendado',
    canceled: 'Cancelado',
    notStarted: 'Não iniciado'
  })[status ?? ''] ?? 'Indefinido'

/** Zona geral de uma release: pior estado entre os environments. */
export function releaseZone(envs: { status: string }[] | undefined, releaseStatus?: string): Zone {
  if (releaseStatus === 'abandoned') return 'idle'
  const zs = (envs ?? []).map((e) => releaseEnvZone(e.status))
  if (zs.includes('fail')) return 'fail'
  if (zs.includes('progress')) return 'progress'
  if (zs.length && zs.every((z) => z === 'done')) return 'done'
  return zs.includes('new') ? 'new' : 'idle'
}

/** "refs/heads/main" → "main". */
export const shortRef = (ref?: string | null) => (ref ? ref.replace(/^refs\/(heads|tags)\//, '') : '')

/** Primeira linha da mensagem do commit (ci.message do triggerInfo). */
export const commitMessage = (b: Build) => (b.triggerInfo?.['ci.message'] ?? '').split('\n')[0]

export const sha7 = (sha?: string | null) => (sha ? sha.slice(0, 7) : '')

export function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Duração em ms de um run (ou null). */
export function runDurationMs(b: { startTime?: string | null; queueTime?: string | null; finishTime?: string | null }): number | null {
  const start = b.startTime ?? b.queueTime
  if (!start || !b.finishTime) return null
  const ms = new Date(b.finishTime).getTime() - new Date(start).getTime()
  return ms >= 0 && !isNaN(ms) ? ms : null
}

/** Formata milissegundos como o formatDuration de ui.tsx ("4m 31s"). */
export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Link "Abrir no navegador" de um run. */
export const buildWebUrl = (org: string, project: string, id: number) =>
  webUrl(org, `${encodeURIComponent(project)}/_build/results?buildId=${id}`)

/** Link web de um pipeline (definição). */
export const definitionWebUrl = (org: string, project: string, id: number) =>
  webUrl(org, `${encodeURIComponent(project)}/_build?definitionId=${id}`)

export const ZERO_SHA = '0000000000000000000000000000000000000000'

/** Hash de commit de 40 caracteres (válido para refs/pushes). */
export const isSha = (s?: string | null) => !!s && /^[0-9a-f]{40}$/i.test(s)

/** Pasta do pipeline como caminho de exibição: "\\Portal\\Api" → "Portal / Api"; raiz → "". */
export const folderLabel = (path?: string) =>
  (path ?? '')
    .split('\\')
    .filter(Boolean)
    .join(' / ')

// ---------------------------------------------------------------- YAML (leitura leve)

export interface YamlParam {
  name: string
  displayName?: string
  type: string
  default?: string
  values?: string[]
}

/**
 * Extrai parameters e nomes de stages de um azure-pipelines.yml sem parser completo.
 * Cobre o formato comum (parameters: - name/type/default/values; stages: - stage: Nome).
 */
export function parseYamlMeta(text: string): { parameters: YamlParam[]; stages: string[] } {
  const lines = text.split(/\r?\n/)
  const parameters: YamlParam[] = []
  let inParams = false
  let cur: YamlParam | null = null
  let inValues = false
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (/^parameters:\s*(\[\])?\s*$/.test(line)) {
      inParams = !/\[\]/.test(line)
      continue
    }
    if (inParams && /^\S/.test(line) && !/^\s*#/.test(line)) {
      inParams = false
      cur = null
    }
    if (!inParams) continue
    const item = line.match(/^\s*-\s*name:\s*['"]?([^'"#]+?)['"]?\s*$/)
    if (item) {
      cur = { name: item[1]!, type: 'string' }
      parameters.push(cur)
      inValues = false
      continue
    }
    if (!cur) continue
    const kv = line.match(/^\s+(displayName|type|default):\s*(.*)$/)
    if (kv && !/^\s{0,2}-/.test(line)) {
      const val = kv[2]!.replace(/^['"]|['"]$/g, '').trim()
      if (kv[1] === 'displayName') cur.displayName = val
      if (kv[1] === 'type') cur.type = val || 'string'
      if (kv[1] === 'default') cur.default = val
      inValues = false
      continue
    }
    if (/^\s+values:\s*$/.test(line)) {
      cur.values = []
      inValues = true
      continue
    }
    const v = line.match(/^\s+-\s*['"]?([^'"]+?)['"]?\s*$/)
    if (inValues && v && cur.values) cur.values.push(v[1]!)
  }
  const stages = [...text.matchAll(/^\s*-\s*stage:\s*['"]?([\w.-]+)/gm)].map((m) => m[1]!)
  return { parameters, stages: [...new Set(stages)] }
}

/** Classe de fundo da zona (faixa, barra, quadradinho). */
export const zoneBgFor = (z: Zone) => zoneBg[z]
