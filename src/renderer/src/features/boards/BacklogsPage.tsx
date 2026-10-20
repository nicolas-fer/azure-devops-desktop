// Backlogs do time: árvore pai→filho, reordenação por arrastar (workitemsorder) e mover para iteração.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { ado } from '@/lib/api'
import { useScope, useMe, isMe } from '@/lib/context'
import { Button, Empty, ErrorBox, ExternalButton, IdCell, Loading, Person, PageHeader, Select, SidePanel, StateLabel, TimeAgo, Toolbar, ZoneStripe, MineToggle } from '@/components/ui'
import {
  asIdentity,
  fetchWorkItems,
  fieldOps,
  isBlocked,
  patchWorkItem,
  teamPath,
  typeIcon,
  useBacklogLevels,
  useCurrentTeam,
  useStateZones,
  useTeamIterations,
  wiKey,
  WI_FIELDS,
  type WorkItem
} from './lib'
import { WorkItemForm } from './WorkItemForm'
import { NewWorkItemModal } from './NewWorkItemModal'

const GRID = 'grid grid-cols-[4px_72px_minmax(0,1fr)_120px_130px_170px_56px_170px] items-center'

interface Node {
  item: WorkItem
  depth: number
  parent: number | null
}

export function BacklogsPage() {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const me = useMe(org)
  const { teamName, teams, setTeam } = useCurrentTeam(org, project)
  const levels = useBacklogLevels(org, project, teamName)
  const [levelName, setLevelName] = useState<string | null>(null)
  const level = levels.data?.find((l) => l.name === levelName) ?? levels.data?.[0]
  const types = useMemo(() => level?.workItemTypes.map((t) => t.name) ?? [], [level])
  const zones = useStateZones(org, project, types)
  const iterations = useTeamIterations(org, project, teamName)
  const [mineOnly, setMineOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ids = useQuery({
    queryKey: [...wiKey(org, project), 'backlog-ids', teamName, level?.id],
    enabled: !!level && !!teamName,
    queryFn: async () => {
      const r = await ado<{ workItems?: { target: { id: number } }[] }>({ org, path: `${teamPath(project, teamName)}/_apis/work/backlogs/${level!.id}/workItems` })
      return (r.workItems ?? []).map((w) => w.target.id)
    }
  })
  const items = useQuery({
    queryKey: [...wiKey(org, project), 'backlog-items', teamName, level?.id, ids.data?.join(',')],
    enabled: !!ids.data,
    queryFn: () => fetchWorkItems(org, project, ids.data ?? [], WI_FIELDS)
  })

  const nodes: Node[] = useMemo(() => {
    const list = items.data ?? []
    const byId = new Set(list.map((w) => w.id))
    const kids = new Map<number, WorkItem[]>()
    const roots: WorkItem[] = []
    for (const w of list) {
      const p = Number(w.fields['System.Parent'])
      if (p && byId.has(p)) {
        kids.set(p, [...(kids.get(p) ?? []), w])
      } else roots.push(w)
    }
    const out: Node[] = []
    const walk = (w: WorkItem, depth: number, parent: number | null) => {
      out.push({ item: w, depth, parent })
      if (collapsed.has(w.id)) return
      for (const k of kids.get(w.id) ?? []) walk(k, depth + 1, w.id)
    }
    roots.forEach((r) => walk(r, 0, null))
    return out
  }, [items.data, collapsed])

  const visible = nodes.filter((n) => !mineOnly || isMe(me.data, asIdentity(n.item.fields['System.AssignedTo'])))
  const rootFirst = nodes.find((n) => n.depth === 0)?.item.id

  const reorder = useMutation({
    mutationFn: (body: { workItemIds: number[]; parentId?: number; previousId?: number; nextId?: number }) =>
      ado({ org, path: `${teamPath(project, teamName)}/_apis/work/workitemsorder`, method: 'PATCH', body }),
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: wiKey(org, project) })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })
  const moveIteration = useMutation({
    mutationFn: ({ w, path }: { w: WorkItem; path: string }) => patchWorkItem(org, project, w.id, fieldOps({ 'System.IterationPath': path }, w.fields)),
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: wiKey(org, project) })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const drag = e.active.data.current?.item as WorkItem | undefined
    const over = e.over?.data.current?.node as Node | undefined
    if (!drag || !over || drag.id === over.item.id) return
    // Solta antes do item de destino, no mesmo nível (pai) dele.
    const idx = visible.findIndex((n) => n.item.id === over.item.id)
    const sibling = visible.slice(0, idx).reverse().find((n) => n.depth === over.depth && n.parent === over.parent && n.item.id !== drag.id)
    reorder.mutate({
      workItemIds: [drag.id],
      ...(over.parent ? { parentId: over.parent } : {}),
      ...(sibling ? { previousId: sibling.item.id } : {}),
      nextId: over.item.id
    })
  }

  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const loading = levels.isLoading || ids.isLoading || items.isLoading
  const failed = levels.error ?? ids.error ?? items.error

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Backlogs"
        subtitle={teamName}
        actions={
          <>
            <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!level} onClick={() => setCreating(true)}>
              Novo item no topo
            </Button>
            <ExternalButton url={`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_backlogs`} />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Select value={teamName} onChange={(e) => setTeam(e.target.value)} className="h-7 w-auto min-w-44 font-semibold" aria-label="Time">
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={level?.name ?? ''} onChange={(e) => setLevelName(e.target.value)} className="h-7 w-auto min-w-40" aria-label="Nível de backlog">
            {(levels.data ?? []).map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      </PageHeader>
      <Toolbar>
        <MineToggle active={mineOnly} onChange={setMineOnly} />
        <span className="text-[12px] text-muted">Arraste um item sobre outro para reordenar. Os filhos ficam indentados sob o pai.</span>
      </Toolbar>
      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <Loading label="Carregando backlog…" />
        ) : failed ? (
          <ErrorBox error={failed} onRetry={() => (levels.refetch(), ids.refetch(), items.refetch())} />
        ) : !level ? (
          <Empty title="Nenhum nível de backlog" />
        ) : visible.length === 0 ? (
          <Empty title="Backlog vazio">Crie um item no topo ou ajuste o filtro.</Empty>
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className={`${GRID} sticky top-0 z-[1] h-8 border-b-2 border-rule-strong bg-surface colhead`}>
              <span />
              <span className="px-3 text-right">ID</span>
              <span className="px-3">Título</span>
              <span className="px-3">Estado</span>
              <span className="px-3">Tipo</span>
              <span className="px-3">Iteração</span>
              <span className="px-3 text-right">Pts</span>
              <span className="px-3">Atribuído a</span>
            </div>
            {visible.map((n) => (
              <BacklogRow
                key={n.item.id}
                node={n}
                zone={zones.zone(n.item.fields['System.WorkItemType'], n.item.fields['System.State'])}
                mine={isMe(me.data, asIdentity(n.item.fields['System.AssignedTo']))}
                hasKids={nodes.some((k) => k.parent === n.item.id)}
                collapsed={collapsed.has(n.item.id)}
                onToggle={() => toggle(n.item.id)}
                onOpen={setOpenId}
                iterations={iterations.data ?? []}
                onMoveIteration={(w, path) => moveIteration.mutate({ w, path })}
              />
            ))}
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
        defaultType={level?.workItemTypes[0]?.name}
        onCreated={(id) => {
          setCreating(false)
          // Coloca o item novo no topo do backlog do time.
          if (rootFirst) reorder.mutate({ workItemIds: [id], nextId: rootFirst })
          setOpenId(id)
        }}
      />
    </div>
  )
}

function BacklogRow({
  node,
  zone,
  mine,
  hasKids,
  collapsed,
  onToggle,
  onOpen,
  iterations,
  onMoveIteration
}: {
  node: Node
  zone: ReturnType<ReturnType<typeof useStateZones>['zone']>
  mine: boolean
  hasKids: boolean
  collapsed: boolean
  onToggle: () => void
  onOpen: (id: number) => void
  iterations: { id: string; name: string; path: string }[]
  onMoveIteration: (w: WorkItem, path: string) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: `bl-${node.item.id}`, data: { item: node.item } })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `bl-drop-${node.item.id}`, data: { node } })
  const w = node.item
  const f = w.fields
  const ico = typeIcon(f['System.WorkItemType'])
  const Icon = ico.icon
  const who = asIdentity(f['System.AssignedTo'])
  const sp = f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? f['Microsoft.VSTS.Scheduling.Effort']
  const iterName = String(f['System.IterationPath'] ?? '').split('\\').pop()
  const setRef = (el: HTMLDivElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }
  return (
    <div
      ref={setRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.5 : 1 }}
      className={`${GRID} h-8 border-b border-border transition-colors duration-100 hover:bg-surface-2 ${isOver ? 'bg-surface-2 shadow-[inset_0_2px_0_var(--color-focus)]' : ''}`}
    >
      <span className="flex h-8 self-stretch">
        <ZoneStripe zone={zone} mine={mine} />
      </span>
      <IdCell className="px-3 text-right text-[13px]">#{w.id}</IdCell>
      <div className="flex min-w-0 items-center gap-1.5 px-3" style={{ paddingLeft: 12 + node.depth * 20 }}>
        {hasKids ? (
          <button type="button" aria-label={collapsed ? 'Expandir' : 'Recolher'} onClick={onToggle} className="text-muted hover:text-fg">
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <span
          {...listeners}
          {...attributes}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 active:cursor-grabbing"
          title="Arraste para reordenar"
        >
          <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
          <button type="button" onClick={(e) => (e.stopPropagation(), onOpen(w.id))} className="truncate text-left hover:underline">
            {f['System.Title']}
          </button>
          {isBlocked(f) && <StateLabel zone="fail">Bloqueado</StateLabel>}
        </span>
      </div>
      <div className="px-3">
        <StateLabel zone={zone}>{f['System.State']}</StateLabel>
      </div>
      <span className="truncate px-3 text-[12px] text-muted">{f['System.WorkItemType']}</span>
      <div className="px-3">
        <Select
          value={String(f['System.IterationPath'] ?? '')}
          onChange={(e) => e.target.value !== f['System.IterationPath'] && onMoveIteration(w, e.target.value)}
          className="h-6 text-[12px]"
          aria-label={`Mover #${w.id} para iteração`}
          title={iterName ?? ''}
        >
          {iterations.length === 0 && <option value={String(f['System.IterationPath'] ?? '')}>{iterName}</option>}
          {iterations.map((i) => (
            <option key={i.id} value={i.path}>
              {i.name}
            </option>
          ))}
        </Select>
      </div>
      <span className="narrow px-3 text-right font-semibold">{sp ?? ''}</span>
      <div className="flex min-w-0 items-center gap-2 px-3">
        {who ? <Person identity={who} /> : <span className="text-muted">Não atribuído</span>}
        <span className="flex-1" />
        <span className="hidden text-[12px] text-muted lg:inline">
          <TimeAgo date={f['System.ChangedDate']} />
        </span>
      </div>
    </div>
  )
}

