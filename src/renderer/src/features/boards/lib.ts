// Núcleo compartilhado de Boards: REST 7.1, WIQL, tipos/estados, árvores de classificação, times e helpers.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Bug, BookOpen, SquareCheck, Crown, Trophy, CircleAlert, Circle, type LucideIcon } from 'lucide-react'
import { ado, adoList, seg, webUrl, type IdentityRef, type Team } from '@/lib/api'
import { useTeams } from '@/lib/context'
import { workItemZone, type Zone } from '@/lib/zones'

export type Fields = Record<string, any>
export interface WiRelation {
  rel: string
  url: string
  attributes?: Record<string, any>
}
export interface WorkItem {
  id: number
  rev: number
  url: string
  fields: Fields
  relations?: WiRelation[]
}
export interface WiqlResult {
  queryType?: string
  columns?: { referenceName: string; name: string }[]
  workItems?: { id: number }[]
  workItemRelations?: { rel?: string | null; source: { id: number } | null; target: { id: number } | null }[]
}

/** Campos pedidos em lote (presentes nos processos Agile, Scrum, Basic e CMMI). */
export const WI_FIELDS = [
  'System.Id',
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.Reason',
  'System.AssignedTo',
  'System.Tags',
  'System.ChangedDate',
  'System.CreatedDate',
  'System.ChangedBy',
  'System.CreatedBy',
  'System.AreaPath',
  'System.IterationPath',
  'System.Parent',
  'System.CommentCount',
  'System.Description',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Common.StackRank',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.Common.Activity',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
  'Microsoft.VSTS.Scheduling.CompletedWork',
  'Microsoft.VSTS.CMMI.Blocked',
  'Microsoft.VSTS.TCM.ReproSteps'
]

/** Tipos que não aparecem em listas/criação de work item. */
export const HIDDEN_TYPES = [
  'Test Plan',
  'Test Suite',
  'Test Case',
  'Shared Steps',
  'Shared Parameter',
  'Code Review Request',
  'Code Review Response',
  'Feedback Request',
  'Feedback Response'
]

/** Chave-base de todas as consultas de work item: invalidar [org, project, 'wi'] atualiza tudo. */
export const wiKey = (org: string, project: string) => [org, project, 'wi'] as const

/** Escapa aspas simples de WIQL. */
export const sq = (s: string) => s.replace(/'/g, "''")

export const teamPath = (project: string, team: string) => `${seg(project)}/${seg(team)}`

export const webItemUrl = (org: string, project: string, id: number | string) => webUrl(org, `${seg(project)}/_workitems/edit/${id}`)

export const TYPE_ICON: Record<string, { icon: LucideIcon; color: string }> = {
  Bug: { icon: Bug, color: '#D93A3A' },
  Task: { icon: SquareCheck, color: '#E3A008' },
  'User Story': { icon: BookOpen, color: '#2F6FDE' },
  Epic: { icon: Crown, color: '#8A5A2B' },
  Feature: { icon: Trophy, color: '#2D6E8A' },
  Issue: { icon: CircleAlert, color: '#9A6C00' }
}
/** Ícone pelo tipo; tipos customizados (ex.: "Bug Story", "QA Story") caem no mais próximo pelo nome. */
export function typeIcon(type?: string): { icon: LucideIcon; color: string } {
  const exact = TYPE_ICON[type ?? '']
  if (exact) return exact
  const t = (type ?? '').toLowerCase()
  if (t.includes('story')) return TYPE_ICON['User Story']!
  if (t.includes('bug')) return TYPE_ICON.Bug!
  if (t.includes('task') || t.includes('tarefa')) return TYPE_ICON.Task!
  if (t.includes('feature')) return TYPE_ICON.Feature!
  if (t.includes('epic') || t.includes('épico')) return TYPE_ICON.Epic!
  return { icon: Circle, color: '#5D6B6B' }
}

/** Converte o campo de identidade (objeto ou string "Nome <email>") em IdentityRef. */
export function asIdentity(v: unknown): IdentityRef | null {
  if (!v) return null
  if (typeof v === 'string') {
    const m = v.match(/^(.*?)\s*<(.+)>$/)
    return { id: '', displayName: m ? m[1]! : v, uniqueName: m ? m[2]! : v }
  }
  const o = v as IdentityRef
  return { id: o.id, displayName: o.displayName, uniqueName: o.uniqueName, imageUrl: o.imageUrl }
}

export const isBlocked = (f: Fields) => String(f['Microsoft.VSTS.CMMI.Blocked'] ?? '').toLowerCase() === 'yes' || /(^|;\s*)blocked(\s*;|$)/i.test(String(f['System.Tags'] ?? ''))

// ---------------------------------------------------------------- Tipos e estados

export interface WiType {
  name: string
  color?: string
}
export function useWorkItemTypes(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'wi-types'],
    enabled: !!org && !!project,
    staleTime: Infinity,
    queryFn: async () => (await adoList<WiType>({ org, path: `${seg(project)}/_apis/wit/workitemtypes` })).filter((t) => !HIDDEN_TYPES.includes(t.name))
  })
}

export interface WiState {
  name: string
  category: string
  color?: string
}
const statesOpts = (org: string, project: string, type: string) => ({
  queryKey: [org, project, 'wi-states', type] as const,
  enabled: !!org && !!project && !!type,
  staleTime: Infinity,
  queryFn: () => adoList<WiState>({ org, path: `${seg(project)}/_apis/wit/workitemtypes/${seg(type)}/states` })
})

/**
 * Zona de cada estado (por tipo) a partir da stateCategory do processo.
 * Carrega e cacheia os estados dos tipos informados.
 */
export function useStateZones(org: string, project: string, types: (string | undefined)[]) {
  const list = [...new Set(types.filter((t): t is string => !!t))]
  const res = useQueries({ queries: list.map((t) => statesOpts(org, project, t)) })
  const states: Record<string, WiState[]> = {}
  list.forEach((t, i) => {
    if (res[i]?.data) states[t] = res[i]!.data as WiState[]
  })
  const cat: Record<string, Record<string, string>> = {}
  for (const t of list) cat[t] = Object.fromEntries((states[t] ?? []).map((s) => [s.name, s.category]))
  return {
    zone: (type?: string, state?: string): Zone => workItemZone(type && state ? cat[type]?.[state] : undefined, state),
    states: (type: string): WiState[] => states[type] ?? [],
    loading: res.some((r) => r.isLoading)
  }
}

// ---------------------------------------------------------------- Classificação (áreas / iterações)

export interface NodeOption {
  path: string
  label: string
  depth: number
  attributes?: { startDate?: string; finishDate?: string }
}
function flattenNode(node: any, path: string, depth: number, out: NodeOption[]) {
  out.push({ path, label: node.name, depth, attributes: node.attributes })
  for (const c of node.children ?? []) flattenNode(c, `${path}\\${c.name}`, depth + 1, out)
}
export function useClassification(org: string, project: string, kind: 'Areas' | 'Iterations') {
  return useQuery({
    queryKey: [org, project, 'wi-nodes', kind],
    enabled: !!org && !!project,
    staleTime: 60_000,
    queryFn: async () => {
      const root = await ado<any>({ org, path: `${seg(project)}/_apis/wit/classificationnodes/${kind}`, query: { $depth: 10 } })
      const out: NodeOption[] = []
      flattenNode(root, project, 0, out)
      return out
    }
  })
}

// ---------------------------------------------------------------- Times

/** Time atual: ?team= na URL, senão o time "<projeto> Team", senão o primeiro. */
export function useCurrentTeam(org: string, project: string) {
  const teams = useTeams(org, project)
  const [sp, setSp] = useSearchParams()
  const param = sp.get('team')
  const list = teams.data ?? []
  const team: Team | undefined = list.find((t) => t.name === param) ?? list.find((t) => t.name === `${project} Team`) ?? list[0]
  const setTeam = (name: string) => {
    const next = new URLSearchParams(sp)
    next.set('team', name)
    setSp(next, { replace: true })
  }
  return { teams, team, teamName: team?.name ?? '', setTeam }
}

export interface TeamIteration {
  id: string
  name: string
  path: string
  attributes?: { startDate?: string; finishDate?: string; timeFrame?: 'past' | 'current' | 'future' }
}
export function useTeamIterations(org: string, project: string, team: string, timeframe?: 'past' | 'current' | 'future') {
  return useQuery({
    queryKey: [org, project, 'wi-team-iterations', team, timeframe ?? 'all'],
    enabled: !!org && !!project && !!team,
    queryFn: () => adoList<TeamIteration>({ org, path: `${teamPath(project, team)}/_apis/work/teamsettings/iterations`, query: { $timeframe: timeframe } })
  })
}

export interface TeamAreas {
  defaultValue: string
  values: { value: string; includeChildren: boolean }[]
}
export function useTeamAreas(org: string, project: string, team: string) {
  return useQuery({
    queryKey: [org, project, 'wi-team-areas', team],
    enabled: !!org && !!project && !!team,
    queryFn: () => ado<TeamAreas>({ org, path: `${teamPath(project, team)}/_apis/work/teamsettings/teamfieldvalues` })
  })
}
/** Cláusula WIQL que restringe às áreas do time. */
export const areaClause = (areas?: TeamAreas) =>
  areas?.values?.length
    ? '(' + areas.values.map((v) => (v.includeChildren ? `[System.AreaPath] UNDER '${sq(v.value)}'` : `[System.AreaPath] = '${sq(v.value)}'`)).join(' OR ') + ')'
    : null

export interface BacklogLevel {
  id: string
  name: string
  rank: number
  type: string
  workItemTypes: { name: string; color?: string }[]
}
export function useBacklogLevels(org: string, project: string, team: string) {
  return useQuery({
    queryKey: [org, project, 'wi-backlog-levels', team],
    enabled: !!org && !!project && !!team,
    queryFn: async () => (await adoList<BacklogLevel>({ org, path: `${teamPath(project, team)}/_apis/work/backlogs` })).sort((a, b) => b.rank - a.rank)
  })
}

/** Tipos de work item por nível de backlog do time (considera bugsBehavior: com "asTasks", Bug entra nas tarefas). */
export interface BacklogConfig {
  taskTypes: string[]
  requirementTypes: string[]
}
export function useBacklogConfig(org: string, project: string, team: string) {
  return useQuery({
    queryKey: [org, project, 'wi-backlog-config', team],
    enabled: !!org && !!project && !!team,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<BacklogConfig> => {
      const c = await ado<{
        taskBacklog?: { workItemTypes?: { name: string }[] }
        requirementBacklog?: { workItemTypes?: { name: string }[] }
      }>({ org, path: `${teamPath(project, team)}/_apis/work/backlogconfiguration` })
      const names = (l?: { workItemTypes?: { name: string }[] }) => (l?.workItemTypes ?? []).map((t) => t.name)
      const taskTypes = names(c.taskBacklog)
      return { taskTypes: taskTypes.length ? taskTypes : ['Task'], requirementTypes: names(c.requirementBacklog) }
    }
  })
}

// ---------------------------------------------------------------- WIQL e lotes

export async function runWiql(org: string, project: string, query: string, top = 200): Promise<WiqlResult> {
  return ado<WiqlResult>({ org, path: `${seg(project)}/_apis/wit/wiql`, method: 'POST', body: { query }, query: { $top: top } })
}

/** IDs de um resultado WIQL (flat ou árvore/one-hop). */
export function idsOf(r: WiqlResult): number[] {
  if (r.workItems) return r.workItems.map((w) => w.id)
  const set = new Set<number>()
  for (const l of r.workItemRelations ?? []) {
    if (l.source) set.add(l.source.id)
    if (l.target) set.add(l.target.id)
  }
  return [...set]
}

/** Busca work items em lotes de 200 (limite do ADO), preservando a ordem de ids. */
export async function fetchWorkItems(org: string, project: string, ids: number[], fields: string[] = WI_FIELDS): Promise<WorkItem[]> {
  const byId = new Map<number, WorkItem>()
  for (let i = 0; i < ids.length; i += 200) {
    const r = await ado<{ value: WorkItem[] }>({
      org,
      path: `${seg(project)}/_apis/wit/workitemsbatch`,
      method: 'POST',
      body: { ids: ids.slice(i, i + 200), fields }
    })
    for (const w of r.value ?? []) byId.set(w.id, w)
  }
  return ids.map((id) => byId.get(id)).filter((w): w is WorkItem => !!w)
}

/** Executa um WIQL e devolve os work items na ordem da consulta. */
export function useWiqlItems(org: string, project: string, name: string, query: string | null, fields: string[] = WI_FIELDS, top = 200) {
  return useQuery({
    queryKey: [...wiKey(org, project), 'wiql', name, query, fields.join(','), top],
    enabled: !!org && !!project && !!query,
    queryFn: async () => {
      const r = await runWiql(org, project, query!, top)
      return fetchWorkItems(org, project, idsOf(r), fields)
    }
  })
}

// ---------------------------------------------------------------- Escrita (JSON Patch)

/** Monta ops JSON Patch só para os campos que mudaram (prev → next). */
export function fieldOps(next: Fields, prev: Fields = {}): any[] {
  const ops: any[] = []
  for (const [k, v] of Object.entries(next)) {
    if (JSON.stringify(v ?? null) === JSON.stringify(prev[k] ?? null)) continue
    const empty = v === null || v === undefined || v === ''
    if (empty) {
      if (prev[k] !== undefined && prev[k] !== null && prev[k] !== '') ops.push({ op: 'remove', path: `/fields/${k}` })
    } else {
      ops.push({ op: 'add', path: `/fields/${k}`, value: v })
    }
  }
  return ops
}

export const patchWorkItem = (org: string, project: string, id: number, ops: any[]) =>
  ado<WorkItem>({
    org,
    path: `${seg(project)}/_apis/wit/workitems/${id}`,
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    body: ops
  })

/** Erro de conflito de revisão (outra pessoa salvou antes). */
export const isConflict = (e: unknown) => {
  const s = (e as { status?: number })?.status
  return s === 409 || s === 412
}

/** Formata horas: 4h, 2.5h. */
export const hours = (n?: number | null) => (n === undefined || n === null || n === 0 ? '—' : `${Number(n.toFixed(1))}h`)

export const shortDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')
