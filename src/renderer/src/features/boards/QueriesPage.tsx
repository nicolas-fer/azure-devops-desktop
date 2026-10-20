// Queries: árvore (Minhas queries / Queries compartilhadas), execução com resultado em tabela,
// editor WIQL e salvar / salvar como / renomear / excluir. Favoritos ficam no localStorage.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Folder, FileText, Play, Save, Star, Trash2, Pencil, Copy } from 'lucide-react'
import { ado, seg } from '@/lib/api'
import { useScope, useMe, isMe } from '@/lib/context'
import { CodeEditor } from '@/components/CodeEditor'
import { Button, Empty, ErrorBox, ExternalButton, IdCell, Input, Loading, Modal, PageHeader, Person, SidePanel, Standings, StateLabel, Table, Toolbar, formatDate } from '@/components/ui'
import { asIdentity, fetchWorkItems, idsOf, runWiql, typeIcon, useStateZones, wiKey, type WorkItem, type WiqlResult } from './lib'
import { WorkItemForm } from './WorkItemForm'

interface QNode {
  id: string
  name: string
  path: string
  isFolder?: boolean
  hasChildren?: boolean
  wiql?: string
  children?: QNode[]
}

const DEFAULT_WIQL = `SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.AssignedTo] = @Me
ORDER BY [System.ChangedDate] DESC`

const favKey = (org: string, project: string) => `devops-desktop:boards:favoritos:${org}/${project}`
function readFavs(k: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]')
  } catch {
    return []
  }
}
function writeFavs(k: string, v: string[]) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* armazenamento indisponível: favoritos só valem nesta sessão */
  }
}

export function QueriesPage() {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const me = useMe(org)
  const tree = useQuery({
    queryKey: [...wiKey(org, project), 'query-tree'],
    queryFn: async () => (await ado<{ value: QNode[] }>({ org, path: `${seg(project)}/_apis/wit/queries`, query: { $depth: 2, $expand: 'all' } })).value ?? []
  })
  const favStore = favKey(org, project)
  const [favs, setFavs] = useState<string[]>(() => readFavs(favStore))
  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
    setFavs(next)
    writeFavs(favStore, next)
  }

  const [selected, setSelected] = useState<QNode | null>(null)
  const [wiql, setWiql] = useState(DEFAULT_WIQL)
  const [savedWiql, setSavedWiql] = useState(DEFAULT_WIQL)
  const [ran, setRan] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'saveAs' | 'rename'>(null)
  const [dialogName, setDialogName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [colF, setColF] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const dirty = wiql !== savedWiql
  const select = (q: QNode) => {
    if (q.isFolder) return
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return
    setSelected(q)
    setWiql(q.wiql ?? '')
    setSavedWiql(q.wiql ?? '')
    setRan(null)
  }
  const newQuery = () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return
    setSelected(null)
    setWiql(DEFAULT_WIQL)
    setSavedWiql(DEFAULT_WIQL)
    setRan(null)
  }

  // Resultado da consulta em execução (só roda ao clicar em Executar)
  const results = useQuery({
    queryKey: [...wiKey(org, project), 'query-run', ran],
    enabled: ran !== null,
    queryFn: async () => {
      const r: WiqlResult = await runWiql(org, project, ran!, 200)
      const ids = idsOf(r)
      const cols = r.columns?.map((c) => c.referenceName) ?? []
      const fields = [...new Set(['System.Id', 'System.WorkItemType', 'System.State', 'System.AssignedTo', ...cols])]
      const items = await fetchWorkItems(org, project, ids, fields)
      return { items, cols: r.columns ?? [], flatTree: r.queryType !== 'flat' && !!r.workItemRelations && !r.workItems }
    }
  })
  const types = useMemo(() => [...new Set((results.data?.items ?? []).map((w) => w.fields['System.WorkItemType']))], [results.data])
  const zones = useStateZones(org, project, types)
  const isMineW = (w: WorkItem) => isMe(me.data, asIdentity(w.fields['System.AssignedTo']))

  const save = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/wit/queries/${selected!.id}`, method: 'PATCH', body: { wiql } }),
    onSuccess: () => {
      setSavedWiql(wiql)
      setErr(null)
      qc.invalidateQueries({ queryKey: [...wiKey(org, project), 'query-tree'] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })
  const saveAs = useMutation({
    mutationFn: (name: string) => {
      const folder = selected ? selected.path.split('/').slice(0, -1).join('/') || 'Shared Queries' : 'Shared Queries'
      return ado<QNode>({ org, path: `${seg(project)}/_apis/wit/queries/${encodeURIComponent(folder)}`, method: 'POST', body: { name, wiql, isFolder: false } })
    },
    onSuccess: (q) => {
      setDialog(null)
      setErr(null)
      setSelected(q)
      setSavedWiql(wiql)
      qc.invalidateQueries({ queryKey: [...wiKey(org, project), 'query-tree'] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })
  const rename = useMutation({
    mutationFn: (name: string) => ado({ org, path: `${seg(project)}/_apis/wit/queries/${selected!.id}`, method: 'PATCH', body: { name } }),
    onSuccess: () => {
      setDialog(null)
      setErr(null)
      qc.invalidateQueries({ queryKey: [...wiKey(org, project), 'query-tree'] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })
  const remove = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/wit/queries/${selected!.id}`, method: 'DELETE' }),
    onSuccess: () => {
      setSelected(null)
      setWiql(DEFAULT_WIQL)
      setSavedWiql(DEFAULT_WIQL)
      setRan(null)
      qc.invalidateQueries({ queryKey: [...wiKey(org, project), 'query-tree'] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
  })

  // Ao trocar de projeto, limpa a seleção
  useEffect(() => {
    setSelected(null)
    setRan(null)
    setFavs(readFavs(favStore))
  }, [favStore])

  const rows = (results.data?.items ?? []).filter((w) => (!mineOnly || isMineW(w)) && (!colF || w.fields['System.State'] === colF))
  const stateCounts = useMemo(() => {
    const m = new Map<string, { key: string; label: string; zone: ReturnType<typeof zones.zone>; count: number }>()
    for (const w of results.data?.items ?? []) {
      const s = String(w.fields['System.State'] ?? '—')
      const cur = m.get(s)
      if (cur) cur.count++
      else m.set(s, { key: s, label: s, zone: zones.zone(w.fields['System.WorkItemType'], s), count: 1 })
    }
    return [...m.values()]
  }, [results.data, zones])

  const favNodes = useMemo(() => {
    const out: QNode[] = []
    const walk = (n: QNode) => {
      if (!n.isFolder && favs.includes(n.id)) out.push(n)
      n.children?.forEach(walk)
    }
    tree.data?.forEach(walk)
    return out
  }, [tree.data, favs])

  const renderNode = (n: QNode, depth: number): ReactNode => {
    const isOpen = expanded.has(n.id)
    const active = selected?.id === n.id
    return (
      <div key={n.id}>
        <div className={`group flex h-7 items-center gap-1 pr-1 hover:bg-surface-2 ${active ? 'bg-surface-2 font-semibold' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {n.isFolder ? (
            <button
              type="button"
              aria-label={isOpen ? 'Recolher' : 'Expandir'}
              onClick={() => setExpanded((s) => (isOpen ? new Set([...s].filter((x) => x !== n.id)) : new Set([...s, n.id])))}
              className="text-muted"
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          {n.isFolder ? <Folder className="size-3.5 text-muted" /> : <FileText className="size-3.5 text-muted" />}
          <button type="button" onClick={() => (n.isFolder ? setExpanded((s) => new Set([...s, n.id])) : select(n))} className="min-w-0 flex-1 truncate text-left">
            {n.name}
          </button>
          {!n.isFolder && (
            <button type="button" aria-label={favs.includes(n.id) ? 'Remover dos favoritos' : 'Favoritar'} onClick={() => toggleFav(n.id)} className={favs.includes(n.id) ? 'text-progress-ink' : 'text-muted opacity-0 group-hover:opacity-100'}>
              <Star className="size-3.5" fill={favs.includes(n.id) ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
        {n.isFolder && isOpen && n.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  const columns = results.data?.cols ?? []
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col overflow-auto border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="colhead flex-1">Queries</span>
          <Button size="sm" onClick={newQuery}>
            Nova consulta
          </Button>
        </div>
        {tree.isLoading && <Loading label="Carregando queries…" />}
        {tree.isError && <ErrorBox error={tree.error} onRetry={() => tree.refetch()} />}
        {favNodes.length > 0 && (
          <section className="border-b border-border py-1">
            <div className="colhead px-3 py-1">Favoritos</div>
            {favNodes.map((n) => (
              <button key={n.id} type="button" onClick={() => select(n)} className="flex h-7 w-full items-center gap-2 truncate px-3 text-left hover:bg-surface-2">
                <Star className="size-3.5 text-progress-ink" fill="currentColor" />
                <span className="truncate">{n.name}</span>
              </button>
            ))}
          </section>
        )}
        <div className="py-1">{tree.data?.map((n) => renderNode(n, 0))}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={selected?.name ?? 'Nova consulta'}
          subtitle={dirty ? 'Alterações não salvas' : undefined}
          actions={
            <>
              <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={!wiql.trim()} onClick={() => setRan(wiql)}>
                Executar
              </Button>
              <Button size="sm" icon={<Save className="size-3.5" />} disabled={!selected || !dirty} loading={save.isPending} onClick={() => save.mutate()}>
                Salvar
              </Button>
              <Button size="sm" icon={<Copy className="size-3.5" />} disabled={!wiql.trim()} onClick={() => (setDialogName(selected ? `${selected.name} (cópia)` : ''), setDialog('saveAs'))}>
                Salvar como
              </Button>
              <Button size="sm" icon={<Pencil className="size-3.5" />} disabled={!selected} onClick={() => (setDialogName(selected?.name ?? ''), setDialog('rename'))}>
                Renomear
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={!selected} loading={remove.isPending} onClick={() => window.confirm(`Excluir a consulta "${selected?.name}"?`) && remove.mutate()}>
                Excluir
              </Button>
              <ExternalButton url={`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_queries`} />
            </>
          }
        />
        {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}
        <div className="h-56 shrink-0 border-b border-border">
          <CodeEditor value={wiql} onChange={setWiql} language="sql" height="100%" />
        </div>
        <Toolbar>
          {results.isFetching && <Loading label="Executando…" />}
          {results.data && (
            <>
              <Standings items={stateCounts} value={colF} onSelect={(k) => setColF(k)} />
              <span className="h-5 w-px bg-border" />
              <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)} className={`h-6 rounded-sm border px-2 text-[12px] font-semibold ${mineOnly ? 'border-mine-line bg-mine-bg text-mine-ink' : 'border-border text-muted'}`}>
                Atribuídos a mim
              </button>
              {results.data.flatTree && <span className="text-[12px] text-muted">Consulta de árvore: mostrando os itens da hierarquia.</span>}
            </>
          )}
        </Toolbar>
        <div className="min-h-0 flex-1 overflow-auto">
          {ran === null ? (
            <Empty title="Execute a consulta para ver os resultados" />
          ) : results.isError ? (
            <ErrorBox error={results.error} onRetry={() => results.refetch()} />
          ) : results.data && rows.length === 0 ? (
            <Empty title="Nenhum resultado" />
          ) : results.data ? (
            <Table
              persistKey="boards.queries"
              rows={rows}
              rowKey={(w) => w.id}
              onRowClick={(w) => setOpenId(w.id)}
              selectedKey={openId}
              zone={(w) => zones.zone(w.fields['System.WorkItemType'], w.fields['System.State'])}
              mine={isMineW}
              columns={[
                { key: 'id', header: 'ID', width: 80, align: 'right', render: (w) => <IdCell>#{w.id}</IdCell> },
                ...columns
                  .filter((c) => c.referenceName !== 'System.Id')
                  .map((c) => ({
                    key: c.referenceName,
                    header: c.name,
                    render: (w: WorkItem) => renderCell(w, c.referenceName, zones)
                  }))
              ]}
            />
          ) : null}
        </div>
      </div>

      <SidePanel open={openId !== null} onClose={() => setOpenId(null)} title={openId ? `#${openId}` : ''}>
        {openId !== null && <WorkItemForm org={org} project={project} id={openId} onOpen={setOpenId} onDeleted={() => setOpenId(null)} />}
      </SidePanel>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'rename' ? 'Renomear consulta' : 'Salvar consulta como'}
        width={420}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!dialogName.trim()} loading={saveAs.isPending || rename.isPending} onClick={() => (dialog === 'rename' ? rename.mutate(dialogName.trim()) : saveAs.mutate(dialogName.trim()))}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!dialogName.trim()) return
            if (dialog === 'rename') rename.mutate(dialogName.trim())
            else saveAs.mutate(dialogName.trim())
          }}
        >
          <Input autoFocus value={dialogName} onChange={(e) => setDialogName(e.target.value)} aria-label="Nome da consulta" />
        </form>
      </Modal>
    </div>
  )
}

/** Célula do resultado: identidade vira nome, datas são formatadas, estado ganha rótulo de zona. */
function renderCell(w: WorkItem, ref: string, zones: ReturnType<typeof useStateZones>) {
  const v = w.fields[ref]
  if (ref === 'System.State') return <StateLabel zone={zones.zone(w.fields['System.WorkItemType'], v)}>{v}</StateLabel>
  if (ref === 'System.Title') {
    const ico = typeIcon(w.fields['System.WorkItemType'])
    const Icon = ico.icon
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
        <span className="truncate">{v}</span>
      </span>
    )
  }
  if (ref === 'System.AssignedTo') return <Person identity={asIdentity(v)} />
  if (/Date$/.test(ref)) return <span className="text-muted">{formatDate(v)}</span>
  if (v && typeof v === 'object') return <span>{(v as { displayName?: string }).displayName ?? ''}</span>
  return <span className="truncate">{v === undefined || v === null ? '' : String(v)}</span>
}
