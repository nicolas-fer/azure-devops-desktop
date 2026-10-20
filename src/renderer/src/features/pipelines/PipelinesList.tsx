// Lista de pipelines: abas Recentes/Todos (pastas), faixa de zona do último run, ações Executar/Editar YAML/Abrir.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, FolderOpen, GitBranch, Pencil, Play, Rocket, Search } from 'lucide-react'
import {
  Button,
  Code,
  Empty,
  ErrorBox,
  ExternalButton,
  IdCell,
  Input,
  Loading,
  MineToggle,
  PageHeader,
  Standings,
  StateLabel,
  Table,
  Tabs,
  Toolbar,
  TimeAgo,
  ZoneStripe,
  useResizableColumns,
  type Column,
  type Zone
} from '@/components/ui'
import { isMe, useMe, useScope } from '@/lib/context'
import { webUrl } from '@/lib/api'
import { useDefinitions } from './queries'
import { folderLabel, formatMs, pipelinesBase, runDurationMs, runStateLabel, runZone, shortRef } from './lib'
import { RunPipelineModal } from './RunPipelineModal'
import type { BuildDefinition } from './types'

type Tab = 'recent' | 'all'

const ZONE_ORDER: Zone[] = ['done', 'fail', 'progress', 'new', 'idle']
const ZONE_LABEL: Record<Zone, string> = { done: 'Sucesso', fail: 'Falhou', progress: 'Em execução', review: 'Em revisão', new: 'Na fila', idle: 'Cancelado' }

/** Ações secundárias aparecem no hover/foco da linha (continuam focáveis por teclado). */
const REVEAL = 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

/** Sem execução ainda, a faixa fica cinza (zona idle). */
const defZone = (d: BuildDefinition): Zone => (d.latestBuild ? runZone(d.latestBuild) : 'idle')

/** Último run foi disparado por mim (roxo "é meu"). */
const isMineDef = (me: ReturnType<typeof useMe>['data'], d: BuildDefinition) => isMe(me, d.latestBuild?.requestedFor)

/** Profundidade de uma pasta: "\\Portal\\Api" → 2. */
const pathDepth = (path?: string) => (path ?? '').split('\\').filter(Boolean).length

interface Folder {
  key: string
  name: string
  depth: number
  children: Folder[]
  defs: BuildDefinition[]
}

type Row = { kind: 'folder'; key: string; name: string; depth: number; count: number; collapsed: boolean } | { kind: 'def'; def: BuildDefinition }

function countDefs(f: Folder): number {
  return f.defs.length + f.children.reduce((n, c) => n + countDefs(c), 0)
}

export function PipelinesList() {
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const me = useMe(org)
  const defs = useDefinitions(org, project)
  const [tab, setTab] = useState<Tab>('recent')
  const [zone, setZone] = useState<Zone | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [execDef, setExecDef] = useState<BuildDefinition | null>(null)

  const all = defs.data ?? []
  const counts = useMemo(() => {
    const c: Partial<Record<Zone, number>> = {}
    for (const d of all) if (d.latestBuild) c[defZone(d)] = (c[defZone(d)] ?? 0) + 1
    return c
  }, [all])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(
      (d) => (!zone || (d.latestBuild && defZone(d) === zone)) && (!q || d.name.toLowerCase().includes(q)) && (!mineOnly || isMineDef(me.data, d))
    )
  }, [all, zone, search, mineOnly, me.data])

  const recent = useMemo(
    () =>
      filtered
        .filter((d) => d.latestBuild)
        .sort((a, b) => (b.latestBuild!.queueTime ?? '').localeCompare(a.latestBuild!.queueTime ?? ''))
        .slice(0, 15),
    [filtered]
  )

  const tree = useMemo(() => {
    const root: Folder = { key: '', name: '', depth: -1, children: [], defs: [] }
    const byKey = new Map<string, Folder>([['', root]])
    for (const d of filtered) {
      const parts = (d.path ?? '').split('\\').filter(Boolean)
      let parent = root
      let acc = ''
      for (const p of parts) {
        acc += '\\' + p
        let f = byKey.get(acc)
        if (!f) {
          f = { key: acc, name: p, depth: parent.depth + 1, children: [], defs: [] }
          byKey.set(acc, f)
          parent.children.push(f)
        }
        parent = f
      }
      parent.defs.push(d)
    }
    const sortFolder = (f: Folder) => {
      f.children.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      f.defs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      f.children.forEach(sortFolder)
    }
    sortFolder(root)
    return root
  }, [filtered])

  /** Linhas da árvore: pastas primeiro, depois os pipelines de cada pasta. */
  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (f: Folder) => {
      for (const c of f.children) {
        const isCollapsed = collapsed.has(c.key)
        out.push({ kind: 'folder', key: c.key, name: c.name, depth: c.depth, count: countDefs(c), collapsed: isCollapsed })
        if (!isCollapsed) walk(c)
      }
      for (const d of f.defs) out.push({ kind: 'def', def: d })
    }
    walk(tree)
    return out
  }, [tree, collapsed])

  const toggle = (k: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const open = (d: BuildDefinition) => navigate(`${base}/list/${d.id}`)
  const edit = (d: BuildDefinition) => navigate(`${base}/edit/${d.id}`)

  const columns: Column<BuildDefinition>[] = [
    {
      key: 'pos',
      header: 'ID',
      width: 72,
      align: 'right',
      render: (d) => <IdCell>#{d.id}</IdCell>
    },
    {
      key: 'name',
      header: 'Pipeline',
      render: (d) => (
        <div className="min-w-0 truncate" style={{ paddingLeft: tab === 'all' ? pathDepth(d.path) * 16 : 0 }}>
          <span className="font-medium">{d.name}</span>
          {tab === 'recent' && folderLabel(d.path) && <span className="text-[12px] text-muted"> · {folderLabel(d.path)}</span>}
        </div>
      )
    },
    {
      key: 'last',
      header: 'Último run',
      width: 260,
      render: (d) =>
        d.latestBuild ? (
          <div className="flex min-w-0 items-center gap-2">
            <IdCell>#{d.latestBuild.buildNumber}</IdCell>
            {d.latestBuild.sourceBranch && (
              <Code className="max-w-[200px] truncate">
                <GitBranch className="mr-1 inline size-3" />
                {shortRef(d.latestBuild.sourceBranch)}
              </Code>
            )}
          </div>
        ) : (
          <span className="text-muted">Nunca executado</span>
        )
    },
    {
      key: 'state',
      header: 'Status',
      width: 130,
      render: (d) => (d.latestBuild ? <StateLabel zone={runZone(d.latestBuild)}>{runStateLabel(d.latestBuild)}</StateLabel> : <span className="text-muted">—</span>)
    },
    {
      key: 'duration',
      header: 'Duração',
      width: 90,
      align: 'right',
      render: (d) => <span className="narrow font-medium">{d.latestBuild ? formatMs(runDurationMs(d.latestBuild)) : ''}</span>
    },
    {
      key: 'when',
      header: 'Quando',
      width: 120,
      render: (d) => (d.latestBuild ? <span className="text-[12px] whitespace-nowrap text-muted"><TimeAgo date={d.latestBuild.queueTime} /></span> : null)
    },
    {
      key: 'actions',
      header: '',
      width: 200,
      align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" icon={<Play className="size-3" />} onClick={() => setExecDef(d)}>
            Executar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil className="size-3" />}
            onClick={() => edit(d)}
            className={REVEAL}
            title="Editar YAML"
            aria-label="Editar YAML"
          />

          <Button size="sm" variant="ghost" onClick={() => open(d)} className={REVEAL}>
            Abrir
          </Button>
        </div>
      )
    }
  ]

  const noneFound = all.length === 0 ? 'Nenhum pipeline neste projeto' : 'Nenhum pipeline corresponde ao filtro'

  return (
    <>
      <PageHeader
        title="Pipelines"
        subtitle={defs.data ? `${all.length} ${all.length === 1 ? 'pipeline' : 'pipelines'}` : undefined}
        actions={<ExternalButton url={webUrl(org, `${encodeURIComponent(project)}/_build`)} />}
      >
        <Tabs
          tabs={[
            { key: 'recent', label: 'Recentes', count: recent.length },
            { key: 'all', label: 'Todos', count: all.length }
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>

      <Toolbar className="bg-bg">
        {defs.data && (
          <Standings
            items={ZONE_ORDER.filter((z) => counts[z]).map((z) => ({ key: z, label: ZONE_LABEL[z], zone: z, count: counts[z]! }))}
            value={zone}
            onSelect={setZone}
          />
        )}
        <div className="flex-1" />
        <MineToggle active={mineOnly} onChange={setMineOnly} label="Minhas execuções" />
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" />
          <Input placeholder="Filtrar pipelines" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7" />
        </div>
      </Toolbar>

      {defs.isLoading && <Loading label="Carregando pipelines…" />}
      {defs.isError && <ErrorBox error={defs.error} onRetry={() => defs.refetch()} />}
      {defs.data && all.length === 0 && <Empty title="Nenhum pipeline neste projeto" icon={<Rocket className="size-6" />} />}

      {defs.data && all.length > 0 && tab === 'recent' &&
        (recent.length === 0 ? (
          <Empty title={noneFound} />
        ) : (
          <Table
            persistKey="pipelines.list.recentes"
            rows={recent}
            columns={columns}
            rowKey={(d) => d.id}
            className="[&>table]:table-fixed"
            zone={defZone}
            mine={(d) => isMineDef(me.data, d)}
            rowClassName={() => 'group'}
            onRowClick={open}
          />
        ))}

      {defs.data && all.length > 0 && tab === 'all' &&
        (filtered.length === 0 ? (
          <Empty title={noneFound} />
        ) : (
          <TreeTable rows={rows} columns={columns} onToggle={toggle} onOpen={open} mine={(d) => isMineDef(me.data, d)} />
        ))}

      {execDef && (
        <RunPipelineModal
          open
          definitionId={execDef.id}
          definitionName={execDef.name}
          onClose={() => setExecDef(null)}
          onStarted={(id) => {
            setExecDef(null)
            navigate(`${base}/run/${id}`)
          }}
        />
      )}
    </>
  )
}

/** Aba Todos: pastas recolhíveis (sem faixa de zona) e pipelines (com faixa de zona). */
function TreeTable({
  rows,
  columns,
  onToggle,
  onOpen,
  mine
}: {
  rows: Row[]
  columns: Column<BuildDefinition>[]
  onToggle: (key: string) => void
  onOpen: (d: BuildDefinition) => void
  mine: (d: BuildDefinition) => boolean
}) {
  // Ações (sem alça) têm largura fixa e entram como extraPx, junto da faixa de zona
  const actions = columns.find((c) => c.key === 'actions')
  const resizable = columns.filter((c) => c.key !== 'actions')
  const rz = useResizableColumns('pipelines.list.todos', resizable, 6 + (typeof actions?.width === 'number' ? actions.width : 0))
  return (
    <div className="overflow-auto bg-surface">
      <table className={`w-full table-fixed border-collapse text-sm ${rz.custom ? '[&_td]:overflow-hidden' : ''}`} style={rz.tableStyle}>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b-2 border-rule-strong">
            <th className="w-1.5 p-0" style={rz.custom ? { width: 6 } : undefined} />
            {columns.map((c) =>
              c.key === 'actions' ? (
                <th key={c.key} style={{ width: c.width }} className={`colhead h-8 px-3 text-left font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.header}
                </th>
              ) : (
                <th
                  key={c.key}
                  data-col={c.key}
                  style={{ width: rz.width(c.key) }}
                  className={`colhead relative h-8 overflow-visible px-3 text-left font-semibold ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                  {rz.handle(c.key)}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.kind === 'folder' ? (
              <tr key={'f' + r.key} className="h-8 cursor-pointer border-b border-border bg-bg/60 hover:bg-surface-2" onClick={() => onToggle(r.key)}>
                <td className="w-1.5 p-0" />
                <td colSpan={columns.length} className="px-3" style={{ paddingLeft: 12 + r.depth * 16 }}>
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {r.collapsed ? <ChevronRight className="size-3.5 text-muted" /> : <ChevronDown className="size-3.5 text-muted" />}
                    <FolderOpen className="size-3.5 text-muted" />
                    {r.name}
                    <span className="narrow text-[12px] font-semibold text-muted">{r.count}</span>
                  </span>
                </td>
              </tr>
            ) : (
              <tr
                key={'d' + r.def.id}
                className="group h-8 cursor-pointer border-b border-border transition-colors duration-100 hover:bg-surface-2"
                onClick={() => onOpen(r.def)}
              >
                <td className="w-1.5 p-0">
                  <span className="flex h-8">
                    <ZoneStripe zone={defZone(r.def)} mine={mine(r.def)} />
                  </span>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1 align-middle ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render(r.def)}
                  </td>
                ))}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}
