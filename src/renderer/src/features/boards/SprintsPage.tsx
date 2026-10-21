// Sprints do time: taskboard (tarefas por estado, arrastar muda estado), backlog do sprint,
// capacidade (leitura e edição) e trabalho restante por pessoa.
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ado, seg, webUrl } from '@/lib/api'
import { useScope, useMe, isMe } from '@/lib/context'
import type { Zone } from '@/lib/zones'
import { Search } from 'lucide-react'
import { Button, Empty, ErrorBox, ExternalButton, IdCell, Input, Loading, MineToggle, PageHeader, Person, QueryView, Select, SidePanel, Table, Tabs, Toolbar, ZoneStripe, ZoneSquare, StateLabel, useResizableColumns } from '@/components/ui'
import {
  asIdentity,
  fetchWorkItems,
  idsOf,
  isBlocked,
  patchWorkItem,
  runWiql,
  sq,
  teamPath,
  typeIcon,
  useBacklogConfig,
  useCurrentTeam,
  useStateZones,
  useTeamIterations,
  wiKey,
  WI_FIELDS,
  type TeamIteration,
  type WorkItem,
  type WiState
} from './lib'
import { WorkItemForm } from './WorkItemForm'

type Tab = 'taskboard' | 'backlog' | 'capacidade' | 'restante'

interface Capacity {
  teamMembers: {
    teamMember: { id: string; displayName: string; uniqueName?: string }
    activities: { name: string; capacityPerDay: number }[]
    daysOff: { start: string; end: string }[]
  }[]
  totalCapacityPerDay?: number
  totalDaysOff?: number
}

/** Dias úteis (seg–sex) entre duas datas, inclusive. */
function workingDays(a?: string, b?: string) {
  if (!a || !b) return 0
  const d = new Date(a)
  const end = new Date(b)
  let n = 0
  for (; d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++
  return n
}

const SPRINT_GROUPS: { key: 'current' | 'future' | 'past'; label: string }[] = [
  { key: 'current', label: 'Atual' },
  { key: 'future', label: 'Futuras' },
  { key: 'past', label: 'Passadas' }
]

export function SprintsPage() {
  const { org, project } = useScope()
  const { teamName, teams, setTeam } = useCurrentTeam(org, project)
  const iterations = useTeamIterations(org, project, teamName)
  const [sprintId, setSprintId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('taskboard')
  const sprint: TeamIteration | undefined =
    iterations.data?.find((i) => i.id === sprintId) ?? iterations.data?.find((i) => i.attributes?.timeFrame === 'current') ?? iterations.data?.[0]

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col overflow-auto border-r border-border bg-surface">
        <div className="border-b border-border p-2">
          <Select value={teamName} onChange={(e) => setTeam(e.target.value)} className="w-full" aria-label="Time">
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        {iterations.isLoading && <Loading label="Carregando sprints…" />}
        {iterations.isError && <ErrorBox error={iterations.error} onRetry={() => iterations.refetch()} />}
        {SPRINT_GROUPS.map((g) => {
          const list = (iterations.data ?? []).filter((i) => i.attributes?.timeFrame === g.key)
          if (!list.length) return null
          return (
            <section key={g.key} className="py-1">
              <div className="colhead px-3 py-1">{g.label}</div>
              {list.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSprintId(i.id)}
                  className={`flex w-full flex-col items-start border-l-[3px] px-3 py-1.5 text-left hover:bg-surface-2 ${
                    sprint?.id === i.id ? 'border-rule-strong bg-surface-2 font-semibold' : 'border-transparent'
                  }`}
                >
                  <span className="truncate">{i.name}</span>
                  <span className="narrow text-[12px] text-muted">{range(i.attributes?.startDate, i.attributes?.finishDate)}</span>
                </button>
              ))}
            </section>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={sprint?.name ?? 'Sprints'}
          subtitle={sprint ? range(sprint.attributes?.startDate, sprint.attributes?.finishDate) : undefined}
          actions={<ExternalButton url={webUrl(org, `${seg(project)}/${seg(teamName)}/_sprints/taskboard/${seg(teamName)}/${seg(sprint?.name ?? '')}`)} />}
        >
          <Tabs
            tabs={[
              { key: 'taskboard', label: 'Taskboard' },
              { key: 'backlog', label: 'Backlog do sprint' },
              { key: 'capacidade', label: 'Capacidade' },
              { key: 'restante', label: 'Trabalho restante' }
            ]}
            value={tab}
            onChange={setTab}
          />
        </PageHeader>
        {!sprint ? (
          iterations.isSuccess && <Empty title="Nenhum sprint configurado para este time" />
        ) : (
          <SprintBody org={org} project={project} team={teamName} sprint={sprint} tab={tab} />
        )}
      </div>
    </div>
  )
}

const range = (a?: string, b?: string) => {
  if (!a || !b) return ''
  const f = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}

function SprintBody({ org, project, team, sprint, tab }: { org: string; project: string; team: string; sprint: TeamIteration; tab: Tab }) {
  const qc = useQueryClient()
  const me = useMe(org)
  const [openId, setOpenId] = useState<number | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.IterationPath] = '${sq(sprint.path)}' ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC`
  const items = useQuery({
    queryKey: [...wiKey(org, project), 'sprint-items', sprint.id],
    queryFn: async () => fetchWorkItems(org, project, idsOf(await runWiql(org, project, wiql, 200)), WI_FIELDS)
  })
  const all = items.data ?? []
  // Tipos do nível de tarefas vêm do time (com bugs "como tarefas", Bug entra junto com Task)
  const backlog = useBacklogConfig(org, project, team)
  const taskTypes = backlog.data?.taskTypes ?? ['Task']
  const requirementTypes = backlog.data?.requirementTypes ?? []
  const types = useMemo(() => [...new Set(all.map((w) => w.fields['System.WorkItemType']))], [all])
  const zones = useStateZones(org, project, [...types, ...taskTypes])
  // Colunas = união dos estados dos tipos de tarefa, na ordem do primeiro tipo
  const taskStates = [...new Map(taskTypes.flatMap((t) => zones.states(t)).map((s) => [s.name, s] as const)).values()]
  const isMineW = (w: WorkItem) => isMe(me.data, asIdentity(w.fields['System.AssignedTo']))
  const invalidate = () => qc.invalidateQueries({ queryKey: wiKey(org, project) })
  const zoneOf = (w: WorkItem): Zone => zones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])

  const setState = useMutation({
    mutationFn: ({ w, state }: { w: WorkItem; state: string }) => patchWorkItem(org, project, w.id, [{ op: 'add', path: '/fields/System.State', value: state }]),
    onSuccess: () => {
      setErr(null)
      invalidate()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <QueryView query={items} emptyTitle="Nenhum item neste sprint">
        {() =>
          tab === 'taskboard' ? (
            <Taskboard
              items={all}
              taskTypes={taskTypes}
              requirementTypes={requirementTypes}
              states={taskStates.filter((s) => s.category !== 'Removed')}
              zone={zoneOf}
              stateZone={(s) => zones.zone(taskTypes.find((t) => zones.states(t).some((x) => x.name === s)) ?? taskTypes[0], s)}
              mine={isMineW}
              onOpen={setOpenId}
              onMove={(w, s) => setState.mutate({ w, state: s })}
            />
          ) : tab === 'backlog' ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <Toolbar>
                <MineToggle active={mineOnly} onChange={setMineOnly} count={all.filter(isMineW).length} />
              </Toolbar>
              {all.length === 0 ? (
                <Empty title="Nenhum item neste sprint" />
              ) : (
                <Table
                  persistKey="boards.sprint.backlog"
                  rows={mineOnly ? all.filter(isMineW) : all}
                  rowKey={(w) => w.id}
                  onRowClick={(w) => setOpenId(w.id)}
                  selectedKey={openId}
                  zone={zoneOf}
                  mine={isMineW}
                  columns={[
                    { key: 'id', header: 'ID', width: 80, align: 'right', render: (w) => <IdCell>#{w.id}</IdCell> },
                    {
                      key: 'title',
                      header: 'Título',
                      render: (w) => (
                        <span className="flex items-center gap-2">
                          <span className="truncate">{w.fields['System.Title']}</span>
                          {isBlocked(w.fields) && <StateLabel zone="fail">Bloqueado</StateLabel>}
                        </span>
                      )
                    },
                    { key: 'type', header: 'Tipo', width: 130, render: (w) => <span className="block truncate whitespace-nowrap text-muted">{w.fields['System.WorkItemType']}</span> },
                    { key: 'state', header: 'Estado', width: 130, render: (w) => <StateLabel zone={zoneOf(w)}>{w.fields['System.State']}</StateLabel> },
                    { key: 'who', header: 'Atribuído a', width: 180, render: (w) => <Person identity={asIdentity(w.fields['System.AssignedTo'])} /> },
                    { key: 'rem', header: 'Restante', width: 90, align: 'right', render: (w) => <span className="narrow">{w.fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? ''}</span> }
                  ]}
                />
              )}
            </div>
          ) : tab === 'capacidade' ? (
            <Capacidade org={org} project={project} team={team} sprint={sprint} />
          ) : (
            <Restante org={org} project={project} team={team} sprint={sprint} items={all.filter((w) => taskTypes.includes(w.fields['System.WorkItemType']))} />
          )
        }
      </QueryView>
      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}
      <SidePanel open={openId !== null} onClose={() => setOpenId(null)} title={openId ? `#${openId}` : ''}>
        {openId !== null && <WorkItemForm org={org} project={project} id={openId} onOpen={setOpenId} onDeleted={() => setOpenId(null)} />}
      </SidePanel>
    </div>
  )
}

/**
 * Taskboard: uma linha por item de requisito do sprint (como no ADO), mais os pais de tarefas fora do sprint
 * e "Sem item pai"; colunas = estados dos tipos de tarefa do time (Task, e Bug quando bugs contam como tarefas).
 */
function Taskboard({
  items,
  taskTypes,
  requirementTypes,
  states,
  zone,
  stateZone,
  mine,
  onOpen,
  onMove
}: {
  items: WorkItem[]
  taskTypes: string[]
  requirementTypes: string[]
  states: WiState[]
  zone: (w: WorkItem) => Zone
  stateZone: (s: string) => Zone
  mine: (w: WorkItem) => boolean
  onOpen: (id: number) => void
  onMove: (w: WorkItem, state: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [text, setText] = useState('')
  const [person, setPerson] = useState('')
  const [type, setType] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [showDone, setShowDoneState] = useState(() => readShowDone())
  const setShowDone = (v: boolean) => {
    setShowDoneState(v)
    try {
      localStorage.setItem(SHOW_DONE_KEY, v ? '1' : '0')
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }

  const allTasks = items.filter((w) => taskTypes.includes(w.fields['System.WorkItemType']))
  const byId = new Map(items.map((w) => [w.id, w]))
  const parentOf = (t: WorkItem) => Number(t.fields['System.Parent']) || 0
  const isClosed = (w: WorkItem) => {
    const z = zone(w)
    return z === 'done' || z === 'idle'
  }
  const personOf = (w: WorkItem) => asIdentity(w.fields['System.AssignedTo'])?.displayName ?? ''
  const people = [...new Set(allTasks.map(personOf))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')))
  const term = text.trim().toLowerCase().replace(/^#/, '')
  const matchesText = (w?: WorkItem) => !!w && (String(w.id).includes(term) || String(w.fields['System.Title'] ?? '').toLowerCase().includes(term))

  // Filtros de card (pessoa, tipo, é meu); o texto vale para o card ou para o item pai da linha
  const cardFiltered = person !== '' || type !== '' || mineOnly
  const tasks = allTasks.filter(
    (t) =>
      (person === '' || personOf(t) === (person === NONE ? '' : person)) &&
      (type === '' || t.fields['System.WorkItemType'] === type) &&
      (!mineOnly || mine(t)) &&
      (term === '' || matchesText(t) || matchesText(byId.get(parentOf(t))))
  )

  const laneIds = [
    ...items.filter((w) => requirementTypes.includes(w.fields['System.WorkItemType'])).map((w) => w.id),
    ...allTasks.map(parentOf)
  ]
  const allLanes = [...new Set(laneIds)]
    // "Sem item pai" por último
    .sort((a, b) => (a === 0 ? 1 : 0) - (b === 0 ? 1 : 0))
    .map((pid) => {
      const p = pid ? byId.get(pid) : undefined
      const children = allTasks.filter((t) => parentOf(t) === pid)
      return {
        id: pid,
        title: pid ? p?.fields['System.Title'] ?? `Item #${pid}` : 'Sem item pai',
        wid: pid || null,
        parent: p,
        count: children.length,
        // Linha concluída: pai fechado (Done/Removed) e nenhum filho em aberto
        closed: !!p && isClosed(p) && children.every(isClosed)
      }
    })
  const visibleTask = (t: WorkItem, laneId: number) => showDone || laneId !== 0 || !isClosed(t)
  const lanes = allLanes.filter((l) => {
    if (!showDone && l.closed) return false
    const has = tasks.some((t) => parentOf(t) === l.id && visibleTask(t, l.id))
    // Com filtro de card, só linhas que têm cards que passam; com texto, também vale casar o próprio item pai
    if (cardFiltered) return has
    if (term !== '') return has || matchesText(l.parent)
    return l.id !== 0 || has
  })
  const shown = tasks.filter((t) => lanes.some((l) => l.id === parentOf(t)) && visibleTask(t, parentOf(t)))
  const hiddenClosed = showDone ? 0 : allLanes.filter((l) => l.closed).length
  const anyFilter = term !== '' || cardFiltered
  const onDragEnd = (e: DragEndEvent) => {
    const w = e.active.data.current?.item as WorkItem | undefined
    const drop = e.over?.data.current as { state?: string } | undefined
    if (!w || !drop?.state || w.fields['System.State'] === drop.state) return
    onMove(w, drop.state)
  }
  if (allLanes.length === 0)
    return <Empty title="Nenhum item neste sprint">Os itens do sprint ({taskTypes.join(', ')}) aparecem agrupados pelo item pai.</Empty>
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1.5 left-2 size-4 text-muted" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar por título ou #ID" className="w-52 pl-8" aria-label="Filtrar por título ou ID" />
        </div>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} className="w-44" aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {people.map((p) => (p === '' ? <option key={NONE} value={NONE}>Não atribuído</option> : <option key={p} value={p}>{p}</option>))}
        </Select>
        {taskTypes.length > 1 && (
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-36" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {taskTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        )}
        <MineToggle active={mineOnly} onChange={setMineOnly} count={allTasks.filter(mine).length} />
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setText(''); setPerson(''); setType(''); setMineOnly(false) }}>
            Limpar filtros
          </Button>
        )}
        <span className="flex-1" />
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Mostrar concluídos
          {hiddenClosed > 0 && <span className="narrow text-[12px]">({hiddenClosed} ocultos)</span>}
        </label>
      </Toolbar>
      {lanes.length === 0 ? (
        <Empty title={anyFilter ? 'Nenhum item com esses filtros' : 'Tudo concluído neste sprint'}>
          {anyFilter ? 'Ajuste ou limpe os filtros.' : 'Marque "Mostrar concluídos" para ver os itens fechados.'}
        </Empty>
      ) : (
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-w-max flex-col">
          <div className="sticky top-0 z-20 flex gap-3 border-b-2 border-rule-strong bg-bg pt-4 pb-1">
            <div className="w-[240px] shrink-0 colhead">Item</div>
            {states.map((s) => (
              <div key={s.name} className="flex w-[220px] shrink-0 items-center gap-2 colhead">
                <ZoneSquare zone={stateZone(s.name)} />
                <span>{s.name}</span>
                <span className="narrow text-[13px] font-bold text-fg">{shown.filter((t) => t.fields['System.State'] === s.name).length}</span>
              </div>
            ))}
          </div>
          {lanes.map((l) => (
            <div key={l.id} className="flex gap-3 border-b border-border py-2">
              <div className="flex w-[240px] shrink-0 gap-2 pr-2">
                {l.parent && <ZoneStripe zone={zone(l.parent)} mine={mine(l.parent)} />}
                {l.wid ? (
                  <button type="button" onClick={() => onOpen(l.wid!)} className="min-w-0 text-left">
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <LaneIcon type={l.parent?.fields['System.WorkItemType']} />
                      <span className="narrow font-semibold">#{l.wid}</span>
                      <span>· {l.count === 0 ? 'sem tarefas' : `${l.count} ${l.count === 1 ? 'item' : 'itens'}`}</span>
                    </span>
                    <div className="line-clamp-2 font-medium">{l.title}</div>
                    {l.parent && <AssigneeLine who={asIdentity(l.parent.fields['System.AssignedTo'])} />}
                  </button>
                ) : (
                  <span className="text-muted">{l.title}</span>
                )}
              </div>
              {states.map((s) => (
                <DropCell key={`${l.id}-${s.name}`} id={`tb-${l.id}-${s.name}`} state={s.name}>
                  {shown
                    .filter((t) => parentOf(t) === l.id && t.fields['System.State'] === s.name)
                    .map((t) => (
                      <TaskCard key={t.id} w={t} zone={zone(t)} mine={mine(t)} onOpen={onOpen} />
                    ))}
                </DropCell>
              ))}
            </div>
          ))}
        </div>
      </DndContext>
    </div>
      )}
    </div>
  )
}

const SHOW_DONE_KEY = 'devops-desktop:taskboard:showDone'
/** Valor do select de pessoa para "Não atribuído" (string vazia já é "todas"). */
const NONE = '__none__'
function readShowDone(): boolean {
  try {
    return localStorage.getItem(SHOW_DONE_KEY) === '1'
  } catch {
    return false
  }
}

/** Responsável (avatar + nome) ou "Não atribuído" tracejado; mesma altura nos cards e nos itens pai. */
function AssigneeLine({ who }: { who: ReturnType<typeof asIdentity> }) {
  return (
    <div className="mt-1 flex h-5 items-center">
      {who ? (
        <Person identity={who} size={18} />
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span className="inline-flex size-[18px] items-center justify-center rounded-full border border-dashed border-muted/60 text-[10px]" aria-hidden>
            —
          </span>
          Não atribuído
        </span>
      )}
    </div>
  )
}

function LaneIcon({ type }: { type?: string }) {
  if (!type) return null
  const ico = typeIcon(type)
  const Icon = ico.icon
  return <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} aria-label={type} />
}

function DropCell({ id, state, children }: { id: string; state: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { state } })
  return (
    <div ref={setNodeRef} className={`flex min-h-16 w-[220px] shrink-0 flex-col gap-2 rounded-sm p-1 transition-colors ${isOver ? 'bg-surface-2 outline-2 outline-dashed outline-focus' : ''}`}>
      {children}
    </div>
  )
}

function TaskCard({ w, zone, mine, onOpen }: { w: WorkItem; zone: Zone; mine: boolean; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${w.id}`, data: { item: w } })
  const f = w.fields
  const ico = typeIcon(f['System.WorkItemType'])
  const Icon = ico.icon
  const who = asIdentity(f['System.AssignedTo'])
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(w.id)}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.5 : 1 }}
      className="relative flex cursor-pointer overflow-hidden rounded-sm border border-border bg-surface hover:border-[#b9bfb8] active:cursor-grabbing"
    >
      <ZoneStripe zone={zone} mine={mine} />
      <div className="min-w-0 flex-1 p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
          <IdCell className="text-[12px]">#{w.id}</IdCell>
          <span className="flex-1" />
          {f['Microsoft.VSTS.Scheduling.RemainingWork'] !== undefined && (
            <span className="narrow text-[12px] font-semibold">{f['Microsoft.VSTS.Scheduling.RemainingWork']}h</span>
          )}
        </div>
        {/* Título sempre ocupa 2 linhas e a linha de responsável sempre existe: todos os cards ficam da mesma altura */}
        <div className="line-clamp-2 min-h-9 leading-[18px]">{f['System.Title']}</div>
        <AssigneeLine who={who} />
      </div>
    </div>
  )
}

/** Capacidade do time no sprint: leitura e edição da capacidade por dia. */
function Capacidade({ org, project, team, sprint }: { org: string; project: string; team: string; sprint: TeamIteration }) {
  const qc = useQueryClient()
  const path = `${teamPath(project, team)}/_apis/work/teamsettings/iterations/${sprint.id}/capacities`
  const q = useQuery({ queryKey: [...wiKey(org, project), 'capacity', sprint.id], queryFn: () => ado<Capacity>({ org, path }) })
  // Coluna de ações (w-20) é fixa e entra como extraPx; sem alça
  const rz = useResizableColumns('boards.sprint.capacidade', [{ key: 'pessoa' }, { key: 'capacidade' }, { key: 'folgas' }], 80)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (m: Capacity['teamMembers'][number]) => {
      const act = m.activities?.[0]
      const value = Number(draft[m.teamMember.id] ?? act?.capacityPerDay ?? 0)
      return ado({
        org,
        path: `${path}/${m.teamMember.id}`,
        method: 'PATCH',
        body: { activities: [{ name: act?.name ?? 'Development', capacityPerDay: value }], daysOff: m.daysOff ?? [] }
      })
    },
    onSuccess: () => {
      setErr(null)
      setDraft({})
      qc.invalidateQueries({ queryKey: [...wiKey(org, project), 'capacity', sprint.id] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })
  return (
    <QueryView query={q} emptyTitle="Sem membros com capacidade">
      {(d) => (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex gap-6 text-[13px]">
            <span>
              Capacidade total: <b className="narrow text-[15px]">{d.totalCapacityPerDay ?? 0}h/dia</b>
            </span>
            <span>
              Dias de folga: <b className="narrow text-[15px]">{d.totalDaysOff ?? 0}</b>
            </span>
          </div>
          {err && <div className="mb-2 text-[12px] text-fail-ink">{err}</div>}
          {d.teamMembers.length === 0 ? (
            <Empty title="Nenhum membro no time" />
          ) : (
            <table className={`w-full border-collapse text-sm ${rz.custom ? '[&_td]:overflow-hidden' : ''}`} style={rz.tableStyle}>
              <thead>
                <tr className="border-b-2 border-rule-strong colhead">
                  <th data-col="pessoa" style={{ width: rz.width('pessoa') }} className="relative h-8 overflow-visible px-3 text-left">
                    Pessoa
                    {rz.handle('pessoa')}
                  </th>
                  <th data-col="capacidade" style={{ width: rz.width('capacidade') }} className="relative h-8 overflow-visible px-3 text-right">
                    Capacidade por dia (h)
                    {rz.handle('capacidade')}
                  </th>
                  <th data-col="folgas" style={{ width: rz.width('folgas') }} className="relative h-8 overflow-visible px-3 text-right">
                    Folgas
                    {rz.handle('folgas')}
                  </th>
                  <th className="h-8" style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {d.teamMembers.map((m) => {
                  const current = m.activities?.[0]?.capacityPerDay ?? 0
                  const v = draft[m.teamMember.id] ?? String(current)
                  return (
                    <tr key={m.teamMember.id} className="h-9 border-b border-border">
                      <td className="px-3">
                        <Person identity={{ id: m.teamMember.id, displayName: m.teamMember.displayName, uniqueName: m.teamMember.uniqueName }} />
                      </td>
                      <td className="px-3 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={v}
                          onChange={(e) => setDraft((s) => ({ ...s, [m.teamMember.id]: e.target.value }))}
                          className="ml-auto w-24 text-right"
                          aria-label={`Capacidade de ${m.teamMember.displayName}`}
                        />
                      </td>
                      <td className="narrow px-3 text-right">{m.daysOff?.length ?? 0}</td>
                      <td className="px-3 text-right">
                        {draft[m.teamMember.id] !== undefined && Number(draft[m.teamMember.id]) !== current && (
                          <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate(m)}>
                            Salvar
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </QueryView>
  )
}

/** Trabalho restante por pessoa (tarefas) contra a capacidade do sprint, em barras. */
function Restante({ org, project, team, sprint, items }: { org: string; project: string; team: string; sprint: TeamIteration; items: WorkItem[] }) {
  const cap = useQuery({
    queryKey: [...wiKey(org, project), 'capacity', sprint.id],
    queryFn: () => ado<Capacity>({ org, path: `${teamPath(project, team)}/_apis/work/teamsettings/iterations/${sprint.id}/capacities` })
  })
  const days = workingDays(sprint.attributes?.startDate, sprint.attributes?.finishDate)
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; remaining: number; done: number; capacity: number }>()
    const key = (w: WorkItem) => asIdentity(w.fields['System.AssignedTo'])?.displayName ?? 'Não atribuído'
    for (const w of items) {
      const k = key(w)
      const r = m.get(k) ?? { name: k, remaining: 0, done: 0, capacity: 0 }
      r.remaining += Number(w.fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? 0)
      r.done += Number(w.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0)
      m.set(k, r)
    }
    for (const tm of cap.data?.teamMembers ?? []) {
      const k = tm.teamMember.displayName
      const r = m.get(k) ?? { name: k, remaining: 0, done: 0, capacity: 0 }
      r.capacity = (tm.activities?.[0]?.capacityPerDay ?? 0) * days
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.remaining - a.remaining)
  }, [items, cap.data, days])
  const max = Math.max(1, ...rows.map((r) => Math.max(r.remaining, r.capacity)))
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0)
  const totalCap = rows.reduce((s, r) => s + r.capacity, 0)
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex flex-wrap gap-6 text-[13px]">
        <span>
          Trabalho restante: <b className="narrow text-[15px]">{totalRemaining}h</b>
        </span>
        <span>
          Capacidade do sprint: <b className="narrow text-[15px]">{totalCap}h</b> ({days} dias úteis)
        </span>
        <span className="text-muted">Barra azul: restante · barra cinza: capacidade</span>
      </div>
      {cap.isError && <div className="mb-3 text-[12px] text-muted">Capacidade indisponível; mostrando só o trabalho restante.</div>}
      {rows.length === 0 ? (
        <Empty title="Sem tarefas neste sprint" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.name} className="grid grid-cols-[180px_minmax(0,1fr)_120px] items-center gap-3">
              <span className="truncate">{r.name}</span>
              <div className="flex flex-col gap-1">
                <div className="h-2 rounded-sm bg-surface-2">
                  <div className="h-2 rounded-sm bg-new-ink" style={{ width: `${(r.remaining / max) * 100}%` }} />
                </div>
                <div className="h-2 rounded-sm bg-surface-2">
                  <div className="h-2 rounded-sm bg-zone-idle" style={{ width: `${(r.capacity / max) * 100}%` }} />
                </div>
              </div>
              <span className="narrow text-right text-[12px]">
                {r.remaining}h / {r.capacity}h
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-muted">Soma de RemainingWork das tarefas do sprint por pessoa. Burndown diário não é calculado (exigiria histórico de cada item).</p>
    </div>
  )
}

