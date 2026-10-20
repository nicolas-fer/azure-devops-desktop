// Work items: visões via WIQL, linha de classificação por estado, filtros e tabela com faixa de zona.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { useMe, isMe, useScope } from '@/lib/context'
import { Button, Empty, ExternalButton, IdCell, Input, MineToggle, PageHeader, Person, QueryView, Select, SidePanel, Standings, StateLabel, Table, Tabs, Toolbar, TimeAgo } from '@/components/ui'
import { asIdentity, isBlocked, typeIcon, useStateZones, useWiqlItems, useWorkItemTypes, webItemUrl, WI_FIELDS, type WorkItem } from './lib'
import { WorkItemForm } from './WorkItemForm'
import { NewWorkItemModal } from './NewWorkItemModal'

type ViewKey = 'mine' | 'activity' | 'updated' | 'created'
const VIEWS: { key: ViewKey; label: string; where: string; order: string }[] = [
  { key: 'mine', label: 'Atribuídos a mim', where: '[System.AssignedTo] = @Me', order: '[System.ChangedDate] DESC' },
  { key: 'activity', label: 'Minha atividade', where: '[System.ChangedBy] = @Me', order: '[System.ChangedDate] DESC' },
  { key: 'updated', label: 'Recentemente atualizados', where: "[System.ChangedDate] >= @Today - 30", order: '[System.ChangedDate] DESC' },
  { key: 'created', label: 'Recentemente criados', where: "[System.CreatedDate] >= @Today - 30", order: '[System.CreatedDate] DESC' }
]

/** Work items: lista por visão, com filtros e painel de detalhe. */
export function WorkItemsPage() {
  const { org, project } = useScope()
  const me = useMe(org)
  const types = useWorkItemTypes(org, project)
  const [view, setView] = useState<ViewKey>('mine')
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [typeF, setTypeF] = useState('')
  const [stateF, setStateF] = useState<string | null>(null)
  const [areaF, setAreaF] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const v = VIEWS.find((x) => x.key === view)!
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND ${v.where} ORDER BY ${v.order}`
  const items = useWiqlItems(org, project, view, wiql, WI_FIELDS, 200)
  const data = items.data ?? []
  const stateZones = useStateZones(org, project, data.map((w) => w.fields['System.WorkItemType']))

  const areas = useMemo(() => [...new Set(data.map((w) => w.fields['System.AreaPath']).filter(Boolean))].sort(), [data])
  const isMine = (w: WorkItem) => isMe(me.data, asIdentity(w.fields['System.AssignedTo']))

  const shown = data.filter((w) => {
    const f = w.fields
    if (mineOnly && !isMine(w)) return false
    if (typeF && f['System.WorkItemType'] !== typeF) return false
    if (stateF && f['System.State'] !== stateF) return false
    if (areaF && f['System.AreaPath'] !== areaF) return false
    if (text.trim()) {
      const t = text.trim().toLowerCase()
      if (!String(f['System.Title'] ?? '').toLowerCase().includes(t) && String(w.id) !== t.replace('#', '')) return false
    }
    return true
  })

  // Linha de classificação: contagem por estado (nome) com a zona do tipo.
  const standings = useMemo(() => {
    const m = new Map<string, { key: string; label: string; zone: ReturnType<typeof stateZones.zone>; count: number }>()
    for (const w of data) {
      const s = String(w.fields['System.State'] ?? '—')
      const cur = m.get(s)
      if (cur) cur.count++
      else m.set(s, { key: s, label: s, zone: stateZones.zone(w.fields['System.WorkItemType'], s), count: 1 })
    }
    return [...m.values()]
  }, [data, stateZones])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Work items"
        subtitle={project}
        actions={
          <>
            <ExternalButton url={`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_workitems`} />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              Novo work item
            </Button>
          </>
        }
      >
        <Tabs tabs={VIEWS.map((x) => ({ key: x.key, label: x.label }))} value={view} onChange={(k) => setView(k)} />
      </PageHeader>

      <Toolbar>
        {items.isSuccess && standings.length > 0 && (
          <Standings
            items={standings}
            value={stateF}
            onSelect={(k) => setStateF(k)}
          />
        )}
        <span className="h-5 w-px bg-border" />
        <MineToggle active={mineOnly} onChange={setMineOnly} count={data.filter(isMine).length} />
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1.5 left-2 size-3.5 text-muted" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Título ou #ID" className="w-56 pl-7" aria-label="Filtrar por texto" />
        </div>
        <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="w-40" aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {(types.data ?? []).map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select value={areaF} onChange={(e) => setAreaF(e.target.value)} className="w-44" aria-label="Filtrar por área">
          <option value="">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        {stateF && (
          <Button size="sm" variant="ghost" onClick={() => setStateF(null)}>
            Limpar estado
          </Button>
        )}
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto">
        <QueryView query={items} emptyTitle="Nenhum work item nesta visão">
          {() =>
            shown.length === 0 ? (
              <Empty title="Nenhum work item com esses filtros" />
            ) : (
              <Table
                persistKey="boards.workitems"
                rows={shown}
                rowKey={(w) => w.id}
                selectedKey={openId}
                onRowClick={(w) => setOpenId(w.id)}
                zone={(w) => stateZones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])}
                mine={isMine}
                columns={[
                  {
                    key: 'id',
                    header: 'ID',
                    width: 80,
                    align: 'right',
                    sortValue: (w) => w.id,
                    render: (w) => <IdCell>#{w.id}</IdCell>
                  },
                  {
                    key: 'title',
                    header: 'Título',
                    sortValue: (w) => w.fields['System.Title'],
                    render: (w) => {
                      const ico = typeIcon(w.fields['System.WorkItemType'])
                      const Icon = ico.icon
                      return (
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
                          <span className="truncate">{w.fields['System.Title']}</span>
                          {isBlocked(w.fields) && <StateLabel zone="fail">Bloqueado</StateLabel>}
                        </span>
                      )
                    }
                  },
                  {
                    key: 'type',
                    header: 'Tipo',
                    width: 140,
                    sortValue: (w) => w.fields['System.WorkItemType'],
                    render: (w) => <span className="text-muted">{w.fields['System.WorkItemType']}</span>
                  },
                  {
                    key: 'state',
                    header: 'Estado',
                    width: 130,
                    sortValue: (w) => w.fields['System.State'],
                    render: (w) => (
                      <StateLabel zone={stateZones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])}>{w.fields['System.State']}</StateLabel>
                    )
                  },
                  {
                    key: 'assigned',
                    header: 'Atribuído a',
                    width: 190,
                    render: (w) => <Person identity={asIdentity(w.fields['System.AssignedTo'])} />
                  },
                  {
                    key: 'area',
                    header: 'Área',
                    width: 160,
                    render: (w) => <span className="truncate text-[12px] text-muted">{w.fields['System.AreaPath']}</span>
                  },
                  {
                    key: 'changed',
                    header: 'Alterado',
                    width: 120,
                    sortValue: (w) => w.fields['System.ChangedDate'],
                    render: (w) => (
                      <span className="text-[12px] text-muted">
                        <TimeAgo date={w.fields['System.ChangedDate']} />
                      </span>
                    )
                  }
                ]}
              />
            )
          }
        </QueryView>
      </div>

      <SidePanel
        open={openId !== null}
        onClose={() => setOpenId(null)}
        title={openId ? `#${openId}` : ''}
        actions={openId ? <ExternalButton url={webItemUrl(org, project, openId)} label="Abrir no navegador" /> : null}
      >
        {openId !== null && (
          <WorkItemForm org={org} project={project} id={openId} onOpen={(id) => setOpenId(id)} onDeleted={() => setOpenId(null)} />
        )}
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
      />
    </div>
  )
}

/** Rota workitems/:id: mesma tela do painel, em página inteira. */
export function WorkItemRoute() {
  const { org, project } = useScope()
  const { id } = useParams()
  const navigate = useNavigate()
  const num = Number(id)
  if (!num) return <Empty title="ID inválido" />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        <WorkItemForm org={org} project={project} id={num} onOpen={(n) => navigate(`../${n}`)} onDeleted={() => navigate('../workitems')} />
      </div>
    </div>
  )
}

