// Quadro kanban do time: colunas como linha de classificação, WIP, swimlanes e arraste (@dnd-kit).
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Search } from 'lucide-react'
import { ado, adoList, seg, webUrl } from '@/lib/api'
import { useScope, useMe, isMe } from '@/lib/context'
import { workItemZone, type Zone } from '@/lib/zones'
import {
  Badge,
  Button,
  Empty,
  ExternalButton,
  IdCell,
  Input,
  MineToggle,
  PageHeader,
  Person,
  QueryView,
  Select,
  SidePanel,
  Standings,
  StateLabel,
  Tabs,
  Toolbar,
  ZoneStripe,
  ZoneSquare,
  ErrorBox,
  Loading
} from '@/components/ui'
import {
  areaClause,
  asIdentity,
  isBlocked,
  patchWorkItem,
  sq,
  teamPath,
  typeIcon,
  useBacklogLevels,
  useCurrentTeam,
  useStateZones,
  useTeamAreas,
  useTeamIterations,
  useWiqlItems,
  wiKey,
  WI_FIELDS,
  type WorkItem
} from './lib'
import { WorkItemForm } from './WorkItemForm'
import { NewWorkItemModal } from './NewWorkItemModal'

interface BoardCol {
  id: string
  name: string
  itemLimit?: number
  columnType?: string
  isSplit?: boolean
  stateMappings?: Record<string, string>
}
interface BoardRow {
  id: string
  name: string | null
}
interface BoardDetail {
  id: string
  name: string
  columns: BoardCol[]
  rows: BoardRow[]
  fields?: { columnField?: { referenceName: string }; rowField?: { referenceName: string }; doneField?: { referenceName: string } }
}

export function BoardPage() {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const me = useMe(org)
  const { team, teamName, teams, setTeam } = useCurrentTeam(org, project)
  const levels = useBacklogLevels(org, project, teamName)
  const [levelName, setLevelName] = useState<string | null>(null)
  const level = levels.data?.find((l) => l.name === levelName) ?? levels.data?.find((l) => l.type === 'requirement') ?? levels.data?.[0]

  const boards = useQuery({
    queryKey: [org, project, 'wi-boards', teamName],
    enabled: !!teamName,
    queryFn: () => adoList<{ id: string; name: string }>({ org, path: `${teamPath(project, teamName)}/_apis/work/boards` })
  })
  const board = boards.data?.find((b) => b.name === level?.name)
  const detail = useQuery({
    queryKey: [org, project, 'wi-board', teamName, board?.id],
    enabled: !!board,
    queryFn: () => ado<BoardDetail>({ org, path: `${teamPath(project, teamName)}/_apis/work/boards/${board!.id}` })
  })
  const areas = useTeamAreas(org, project, teamName)
  const iterations = useTeamIterations(org, project, teamName, 'current')
  const curIter = iterations.data?.[0]

  const [sprintOnly, setSprintOnly] = useState(false)
  const [text, setText] = useState('')
  const [typeF, setTypeF] = useState('')
  const [tagF, setTagF] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [colF, setColF] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const types = useMemo(() => level?.workItemTypes.map((t) => t.name) ?? [], [level])
  const zones = useStateZones(org, project, types)
  const cf = detail.data?.fields?.columnField?.referenceName
  const rf = detail.data?.fields?.rowField?.referenceName
  const df = detail.data?.fields?.doneField?.referenceName
  const cols = detail.data?.columns ?? []
  const rows = detail.data?.rows ?? []
  const hasLanes = rows.length > 1
  const defaultRow = rows.find((r) => !r.name) ?? rows[0]

  const fields = useMemo(() => [...new Set([...WI_FIELDS, cf, rf, df].filter((x): x is string => !!x))], [cf, rf, df])
  const areaWhere = areaClause(areas.data)
  const wiql =
    detail.isSuccess && level && areaWhere && types.length
      ? `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN (${types.map((t) => `'${sq(t)}'`).join(', ')}) AND ${areaWhere}` +
        (sprintOnly && curIter ? ` AND [System.IterationPath] UNDER '${sq(curIter.path)}'` : '') +
        ' ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC'
      : null
  const items = useWiqlItems(org, project, `board:${level?.name}:${teamName}:${sprintOnly}`, wiql, fields, 200)
  const all = items.data ?? []

  const colOf = (w: WorkItem): BoardCol | undefined => {
    const v = cf ? w.fields[cf] : undefined
    const byName = v ? cols.find((c) => c.name === v) : undefined
    if (byName) return byName
    const t = w.fields['System.WorkItemType']
    const s = w.fields['System.State']
    return cols.find((c) => c.stateMappings?.[t] === s) ?? cols[0]
  }
  const laneOf = (w: WorkItem): BoardRow | undefined => (hasLanes && rf ? rows.find((r) => !!r.name && r.name === w.fields[rf]) : undefined) ?? defaultRow
  const colZone = (c: BoardCol): Zone => {
    const t = types.find((x) => c.stateMappings?.[x])
    return t ? zones.zone(t, c.stateMappings![t]) : workItemZone(undefined, c.name)
  }
  const isCompact = (c: BoardCol, i: number) => c.columnType === 'outgoing' && i === cols.length - 1
  const isMineW = (w: WorkItem) => isMe(me.data, asIdentity(w.fields['System.AssignedTo']))

  const shown = all.filter((w) => {
    const f = w.fields
    if (mineOnly && !isMineW(w)) return false
    if (typeF && f['System.WorkItemType'] !== typeF) return false
    if (tagF && !String(f['System.Tags'] ?? '').toLowerCase().includes(tagF.toLowerCase())) return false
    if (text.trim()) {
      const t = text.trim().toLowerCase()
      if (!String(f['System.Title'] ?? '').toLowerCase().includes(t) && String(w.id) !== t.replace('#', '')) return false
    }
    return true
  })
  const countOf = (c: BoardCol) => all.filter((w) => colOf(w)?.name === c.name).length
  const standings = cols.map((c) => ({ key: c.name, label: c.name, zone: colZone(c), count: countOf(c) }))

  const move = useMutation({
    mutationFn: ({ w, col }: { w: WorkItem; col: BoardCol }) => {
      const ops: { op: string; path: string; value: string }[] = []
      if (cf) ops.push({ op: 'add', path: `/fields/${cf}`, value: col.name })
      const st = col.stateMappings?.[w.fields['System.WorkItemType']]
      if (st && st !== w.fields['System.State']) ops.push({ op: 'add', path: '/fields/System.State', value: st })
      if (!ops.length) return Promise.resolve(null)
      return patchWorkItem(org, project, w.id, ops)
    },
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: wiKey(org, project) })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const w = e.active.data.current?.item as WorkItem | undefined
    const col = e.over?.data.current?.col as BoardCol | undefined
    if (!w || !col || colOf(w)?.name === col.name) return
    move.mutate({ w, col })
  }

  const visibleCols = cols.filter((c) => !colF || c.name === colF)
  const boardUrl = board ? webUrl(org, `${seg(project)}/${seg(teamName)}/_boards/board/t/${seg(teamName)}/${seg(board.name)}`) : null

  const renderColumn = (c: BoardCol, i: number, lane: BoardRow | undefined) => {
    const laneItems = shown.filter((w) => colOf(w)?.name === c.name && (!hasLanes || laneOf(w)?.id === lane?.id))
    const count = hasLanes ? laneItems.length : countOf(c)
    const zone = colZone(c)
    const over = c.itemLimit && c.itemLimit > 0 ? (countOf(c) > c.itemLimit ? 'over' : countOf(c) === c.itemLimit ? 'full' : 'ok') : 'none'
    const compact = isCompact(c, i)
    return (
      <DropColumn key={`${c.id}-${lane?.id ?? 'all'}`} id={`col-${c.id}-${lane?.id ?? 'all'}`} col={c}>
        <div className="flex h-8 shrink-0 items-center gap-2 border-b-2 border-rule-strong">
          <ZoneSquare zone={zone} />
          <span className="narrow truncate text-[13px] font-bold tracking-[0.04em] uppercase">{c.name}</span>
          <span className="narrow text-[15px] font-bold">{count}</span>
          {!!c.itemLimit && c.itemLimit > 0 && !hasLanes && (
            <span
              className={`narrow rounded-sm px-1 text-[12px] font-semibold ${
                over === 'over' ? 'bg-zone-fail/15 text-fail-ink' : over === 'full' ? 'bg-zone-progress/20 text-progress-ink' : 'text-muted'
              }`}
              title={`Limite de WIP: ${c.itemLimit}`}
            >
              WIP {countOf(c)}/{c.itemLimit}
            </span>
          )}
          <span className="flex-1" />
        </div>
        <div className={`mt-2 flex min-h-16 flex-col gap-2 ${compact ? 'gap-0' : ''}`}>
          {laneItems.map((w) =>
            compact ? (
              <CompactRow key={w.id} w={w} zone={zones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])} mine={isMineW(w)} onOpen={setOpenId} />
            ) : (
              <BoardCard
                key={w.id}
                w={w}
                zone={zones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])}
                mine={isMineW(w)}
                onOpen={setOpenId}
              />
            )
          )}
          {laneItems.length === 0 && <div className="py-3 text-center text-[12px] text-muted">Vazio</div>}
        </div>
      </DropColumn>
    )
  }

  const header = (
    <PageHeader
      title="Quadro"
      subtitle={
        <span className="flex flex-wrap items-center gap-3">
          <Select value={teamName} onChange={(e) => setTeam(e.target.value)} className="h-7 w-auto min-w-44 font-semibold" aria-label="Time">
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
          {curIter && (
            <button
              type="button"
              aria-pressed={sprintOnly}
              title="Mostrar só o sprint atual"
              onClick={() => setSprintOnly((v) => !v)}
              className={`colhead rounded-sm px-1 whitespace-nowrap hover:text-fg ${sprintOnly ? 'text-fg underline decoration-2 underline-offset-4' : ''}`}
            >
              {curIter.name} · {fmtRange(curIter.attributes?.startDate, curIter.attributes?.finishDate)}
            </button>
          )}
        </span>
      }
      actions={
        <>
          {boardUrl && <ExternalButton url={boardUrl} label="Configurar quadro" />}
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)} disabled={!level}>
            Novo item
          </Button>
        </>
      }
    >
      {(levels.data?.length ?? 0) > 0 && (
        <Tabs
          tabs={(levels.data ?? []).map((l) => ({ key: l.name, label: l.name }))}
          value={level?.name ?? ''}
          onChange={(k) => setLevelName(k)}
        />
      )}
    </PageHeader>
  )

  if (!teamName && teams.isSuccess) return <div className="flex min-h-0 flex-1 flex-col">{header}<Empty title="Nenhum time neste projeto" /></div>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <Toolbar>
        <QueryView query={items}>
          {() => <Standings items={standings} value={colF} onSelect={(k) => setColF(k)} />}
        </QueryView>
        {colF && (
          <Button size="sm" variant="ghost" onClick={() => setColF(null)}>
            Mostrar todas as colunas
          </Button>
        )}
        <span className="h-5 w-px bg-border" />
        <MineToggle active={mineOnly} onChange={setMineOnly} count={all.filter(isMineW).length} />
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1.5 left-2 size-3.5 text-muted" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar por palavra-chave" className="w-48 pl-7" aria-label="Filtrar por palavra-chave" />
        </div>
        <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="w-40" aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input value={tagF} onChange={(e) => setTagF(e.target.value)} placeholder="Tag" className="w-24" aria-label="Filtrar por tag" />
      </Toolbar>
      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!level || boards.isLoading || detail.isLoading || areas.isLoading ? (
          <Loading label="Carregando quadro…" />
        ) : boards.isError || detail.isError || areas.isError || items.isError ? (
          <ErrorBox error={boards.error ?? detail.error ?? areas.error ?? items.error} onRetry={() => (boards.refetch(), detail.refetch(), areas.refetch(), items.refetch())} />
        ) : !board ? (
          <Empty title="Este nível não tem quadro">Escolha outro nível de backlog.</Empty>
        ) : !areaWhere ? (
          <Empty title="Time sem áreas configuradas" />
        ) : items.isLoading ? (
          <Loading label="Carregando itens…" />
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            {hasLanes ? (
              rows.map((lane) => {
                const laneCount = all.filter((w) => laneOf(w)?.id === lane.id).length
                if (laneCount === 0 && !lane.name) return null
                return (
                  <section key={lane.id} className="mb-6">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="narrow text-[13px] font-bold uppercase">{lane.name ?? 'Padrão'}</span>
                      <span className="narrow text-muted">{laneCount}</span>
                    </div>
                    <div className="flex items-start gap-4">{visibleCols.map((c, i) => renderColumn(c, cols.indexOf(c), lane))}</div>
                  </section>
                )
              })
            ) : (
              <div className="flex items-start gap-4">{visibleCols.map((c) => renderColumn(c, cols.indexOf(c), undefined))}</div>
            )}
          </DndContext>
        )}
      </div>

      <SidePanel open={openId !== null} onClose={() => setOpenId(null)} title={openId ? `#${openId}` : ''}>
        {openId !== null && <WorkItemForm org={org} project={project} id={openId} onOpen={setOpenId} onDeleted={() => setOpenId(null)} />}
      </SidePanel>

      <NewWorkItemModal
        org={org}
        project={project}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          setOpenId(id)
        }}
        areaPath={areas.data?.defaultValue}
        iterationPath={sprintOnly ? curIter?.path : undefined}
        defaultType={level?.workItemTypes[0]?.name}
      />
    </div>
  )
}

function fmtRange(a?: string, b?: string) {
  if (!a || !b) return ''
  const f = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}

function DropColumn({ id, col, children }: { id: string; col: BoardCol; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { col } })
  return (
    <div ref={setNodeRef} className={`flex w-[280px] shrink-0 flex-col rounded-sm transition-colors duration-150 ${isOver ? 'bg-surface-2 outline-2 outline-dashed outline-focus' : ''}`}>
      {children}
    </div>
  )
}

function BoardCard({ w, zone, mine, onOpen }: { w: WorkItem; zone: Zone; mine: boolean; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `wi-${w.id}`, data: { item: w } })
  const f = w.fields
  const ico = typeIcon(f['System.WorkItemType'])
  const Icon = ico.icon
  const tags = String(f['System.Tags'] ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
  const sp = f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? f['Microsoft.VSTS.Scheduling.Effort']
  const who = asIdentity(f['System.AssignedTo'])
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(w.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(w.id)}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.5 : 1 }}
      className="relative flex cursor-pointer overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-[#b9bfb8] active:cursor-grabbing"
    >
      <ZoneStripe zone={zone} mine={mine} />
      <div className="min-w-0 flex-1 p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
          <IdCell className="text-[13px]">#{w.id}</IdCell>
          <span className="flex-1" />
          {isBlocked(f) && <StateLabel zone="fail">Bloqueado</StateLabel>}
        </div>
        <div className="mb-2 line-clamp-2 leading-[18px] font-medium">{f['System.Title']}</div>
        <div className="flex flex-wrap items-center gap-1">
          {tags.slice(0, 2).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          <span className="flex-1" />
          {f['System.CommentCount'] > 0 && <span className="narrow text-[12px] text-muted">{f['System.CommentCount']} comentários</span>}
          {sp !== undefined && sp !== null && (
            <span className="narrow min-w-5 rounded-sm border border-border px-1 text-center text-[12px] leading-[16px] font-semibold">{sp}</span>
          )}
          {who ? (
            <Person identity={who} size={20} />
          ) : (
            <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-[#b9bfb8] text-[10px] text-muted" title="Não atribuído">
              —
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function CompactRow({ w, zone, mine, onOpen }: { w: WorkItem; zone: Zone; mine: boolean; onOpen: (id: number) => void }) {
  return (
    <button type="button" onClick={() => onOpen(w.id)} className="flex h-8 items-center gap-2 border-b border-border text-left text-muted hover:bg-surface-2">
      <ZoneStripe zone={zone} mine={mine} />
      <span className="narrow w-12 shrink-0 text-right font-semibold">#{w.id}</span>
      <span className="truncate pr-2 text-[12px]">{w.fields['System.Title']}</span>
    </button>
  )
}
