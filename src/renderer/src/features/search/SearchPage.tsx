import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FileCode2, Search as SearchIcon } from 'lucide-react'
import { ado, seg, type IdentityRef } from '@/lib/api'
import { useOrg, useProjects } from '@/lib/context'
import { Badge, Button, Code, Empty, ErrorBox, IdCell, Loading, PageHeader, Person, Section, StateLabel, Tabs, ZoneStripe, Input, cx } from '@/components/ui'
import { workItemZone } from '@/lib/zones'

type Kind = 'code' | 'workitem'
const PAGE = 50
const SEARCH_API = '7.1-preview.1'

const KIND_PATH: Record<Kind, string> = { code: 'codesearchresults', workitem: 'workitemsearchresults' }
/** Chave do filtro de projeto muda entre os serviços de busca. */
const PROJECT_FILTER: Record<Kind, string> = { code: 'Project', workitem: 'System.TeamProject' }

interface Facet {
  name: string
  id: string
  resultCount: number
}
type Facets = Record<string, Facet[]>

interface SearchResponse {
  count: number
  results: Record<string, unknown>[]
  facets?: Facets
}

interface CodeResult {
  fileName: string
  path: string
  matches?: { content?: { type: string }[] }
  project: { name: string }
  repository: { name: string; id: string }
}
interface WorkItemResult {
  project: { name: string }
  fields: Record<string, string>
  hits?: { highlights: string[] }[]
}

/** Trecho com destaques: o ADO envolve os termos em <highlighthit>. Nunca usa HTML bruto. */
function Highlight({ text }: { text: string }): ReactNode {
  const parts = text.split(/<\/?highlighthit>/)
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="rounded-[2px] bg-zone-progress/25 px-0.5 text-fg">{p}</mark> : <Fragment key={i}>{p}</Fragment>))
}

const searchBody = (text: string, skip: number, filters: Record<string, string[]>, top: number, facets: boolean) => ({
  searchText: text,
  $top: top,
  $skip: skip,
  filters,
  includeFacets: facets
})

/** Busca global: abas Código / Work items, facetas à esquerda e paginação. */
export function SearchPage() {
  const org = useOrg()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const text = params.get('text') ?? ''
  const project = params.get('project') ?? ''
  const kind = (params.get('type') as Kind) || 'code'
  const [draft, setDraft] = useState(text)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Record<string, string[]>>({})

  // Mudança de busca ou tipo zera página e facetas
  useEffect(() => {
    setDraft(text)
    setPage(0)
    setSelected({})
  }, [text, project, kind])

  const setKind = (k: Kind) => {
    const next = new URLSearchParams(params)
    next.set('type', k)
    setParams(next, { replace: true })
  }

  const baseFilters = (k: Kind): Record<string, string[]> => (project ? { [PROJECT_FILTER[k]]: [project] } : {})
  const filtersFor = (k: Kind) => {
    const f: Record<string, string[]> = { ...baseFilters(k) }
    if (k === kind) for (const [key, vals] of Object.entries(selected)) if (vals.length) f[key] = vals
    return f
  }

  const run = (k: Kind, skip: number, top: number, facets: boolean) =>
    ado<SearchResponse>({
      org,
      host: 'almsearch',
      method: 'POST',
      path: `${project ? seg(project) + '/' : ''}_apis/search/${KIND_PATH[k]}`,
      apiVersion: SEARCH_API,
      body: searchBody(text, skip, filtersFor(k), top, facets)
    })

  // Contagem das duas abas (uma chamada pequena cada)
  const counts = {
    code: useQuery({ queryKey: ['search', org, project, 'count', 'code', text], enabled: !!text, queryFn: () => run('code', 0, 1, false) }),
    workitem: useQuery({ queryKey: ['search', org, project, 'count', 'workitem', text], enabled: !!text, queryFn: () => run('workitem', 0, 1, false) })
  }

  const active = useQuery({
    queryKey: ['search', org, project, kind, text, page, selected],
    enabled: !!text,
    queryFn: () => run(kind, page * PAGE, PAGE, true)
  })

  const projects = useProjects(org)
  const wiId = /^#?(\d+)$/.exec(text.trim())?.[1]
  const total = active.data?.count ?? 0
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = draft.trim()
    if (!t) return
    const q = new URLSearchParams({ text: t, type: kind })
    if (project) q.set('project', project)
    navigate(`/${org}/_search?${q}`)
  }

  const toggleFacet = (key: string, value: string) => {
    setPage(0)
    setSelected((s) => {
      const cur = s[key] ?? []
      return { ...s, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] }
    })
  }

  const openResult = (k: Kind, r: Record<string, unknown>) => {
    if (k === 'code') {
      const c = r as unknown as CodeResult
      navigate(`/${org}/${seg(c.project.name)}/repos/files/${seg(c.repository.name)}${c.path.split('/').map(encodeURIComponent).join('/')}`)
    } else {
      const wi = r as unknown as WorkItemResult
      navigate(`/${org}/${seg(wi.project.name)}/boards/workitems/${wi.fields['system.id']}`)
    }
  }

  const tabCount = (k: Kind) => counts[k].data?.count
  const facets = active.data?.facets ?? {}

  return (
    <>
      <PageHeader title="Busca" subtitle={text ? `“${text}”${project ? ` em ${project}` : ''}` : undefined}>
        <form onSubmit={submit} className="flex min-w-0 flex-wrap items-center gap-2 pb-3">
          <div className="relative w-[520px] min-w-0 max-w-full">
            <SearchIcon className="absolute top-1.5 left-2 size-4 text-muted" />
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Buscar código e work items…" className="pl-8" aria-label="Termo da busca" />
          </div>
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            Buscar
          </Button>
          {project && (
            <Badge className="max-w-full truncate">
              Projeto: {project}{' '}
              <button type="button" className="ml-1 underline" onClick={() => {
                const q = new URLSearchParams({ text, type: kind })
                navigate(`/${org}/_search?${q}`)
              }}>
                remover
              </button>
            </Badge>
          )}
        </form>
        <Tabs<Kind>
          value={kind}
          onChange={setKind}
          tabs={[
            { key: 'code', label: 'Código', count: tabCount('code') },
            { key: 'workitem', label: 'Work items', count: tabCount('workitem') }
          ]}
        />
      </PageHeader>

      {!text ? (
        <Empty title="Digite um termo para buscar" icon={<SearchIcon className="size-6" />}>
          Busca em código e work items da organização. Use #1234 para abrir um work item direto.
        </Empty>
      ) : (
        <div className="grid min-w-0 gap-4 p-6 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            {kind === 'workitem' && wiId && (
              <Section title="Atalho">
                <div className="p-3">
                  <Button variant="primary" size="sm" onClick={() => navigate(`/${org}/${seg(project || (projects.data?.[0]?.name ?? ''))}/boards/workitems/${wiId}`)} disabled={!project && !projects.data?.length}>
                    Abrir work item #{wiId}
                  </Button>
                  {!project && <div className="mt-2 text-[12px] text-muted">Abre no primeiro projeto; escolha um projeto no topo para ser exato.</div>}
                </div>
              </Section>
            )}
            {active.isLoading && <Loading label="Buscando…" />}
            {active.isError && <ErrorBox error={active.error} onRetry={() => active.refetch()} />}
            {Object.entries(facets).map(([key, items]) => {
              if (key === PROJECT_FILTER[kind] && project) return null
              return (
                <Section key={key} title={facetTitle(key)}>
                  <ul className="flex flex-col py-1">
                    {items.slice(0, 12).map((f) => {
                      const on = (selected[key] ?? []).includes(f.id)
                      return (
                        <li key={f.id}>
                          <button
                            type="button"
                            onClick={() => toggleFacet(key, f.id)}
                            className={cx('flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-surface-2', on && 'font-semibold')}
                          >
                            <span className={cx('size-3 shrink-0 border', on ? 'border-rule-strong bg-rule-strong' : 'border-border')} />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            <span className="narrow text-muted">{f.resultCount}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )
            })}
          </aside>

          <div className="flex min-w-0 flex-col gap-3">
            {active.data && (
              <div className="flex min-w-0 items-center gap-3 text-sm text-muted">
                <span>
                  {total} {total === 1 ? 'resultado' : 'resultados'}
                </span>
                <div className="flex-1" />
                <Button size="sm" icon={<ChevronLeft className="size-3.5" />} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <span className="narrow">
                  {total ? page + 1 : 0} / {total ? lastPage + 1 : 0}
                </span>
                <Button size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                  Próxima <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
            {active.data && active.data.results.length === 0 && <Empty title="Nenhum resultado" />}
            {active.data && kind === 'code' && (
              <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
                {(active.data.results as unknown as CodeResult[]).map((r, i) => (
                  <li key={`${r.repository.id}-${r.path}-${i}`} className="min-w-0">
                    <button type="button" onClick={() => openResult('code', r as unknown as Record<string, unknown>)} className="flex w-full min-w-0 flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileCode2 className="size-4 shrink-0 text-muted" />
                        <span className="shrink-0 font-semibold">{r.fileName}</span>
                        <Code className="min-w-0 max-w-full truncate">{r.path}</Code>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-muted">
                        <span>{r.project.name}</span>·<span>{r.repository.name}</span>
                        {(r.matches?.content ?? []).length > 0 && <span>{countTypes(r.matches?.content ?? [])}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {active.data && kind === 'workitem' && (
              <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
                {(active.data.results as unknown as WorkItemResult[]).map((r, i) => {
                  const f = r.fields
                  const state = f['system.state'] ?? ''
                  const zone = workItemZone(undefined, state)
                  return (
                    <li key={`${f['system.id']}-${i}`} className="flex min-w-0">
                      <ZoneStripe zone={zone} />
                      <button type="button" onClick={() => openResult('workitem', r as unknown as Record<string, unknown>)} className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <IdCell>#{f['system.id']}</IdCell>
                          <span className="min-w-0 truncate font-semibold">{f['system.title']}</span>
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-3 text-[12px]">
                          <StateLabel zone={zone}>{state || '—'}</StateLabel>
                          <span className="text-muted">{f['system.workitemtype']}</span>
                          <span className="text-muted">{r.project.name}</span>
                          <span className="text-muted">
                            <Person identity={assignee(f['system.assignedto'])} size={16} />
                          </span>
                        </span>
                        {(r.hits ?? []).slice(0, 1).map((h, j) => (
                          <span key={j} className="line-clamp-2 text-sm text-muted">
                            <Highlight text={h.highlights[0] ?? ''} />
                          </span>
                        ))}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}


const FACET_TITLES: Record<string, string> = {
  Project: 'Projeto',
  Repository: 'Repositório',
  'System.TeamProject': 'Projeto',
  'System.WorkItemType': 'Tipo',
  'System.State': 'Estado',
  'System.AssignedTo': 'Responsável'
}
const facetTitle = (k: string) => FACET_TITLES[k] ?? k

function countTypes(m: { type: string }[]): string {
  const n = m.length
  const kinds = new Set(m.map((x) => x.type))
  return `${n} ${n === 1 ? 'ocorrência' : 'ocorrências'}${kinds.size ? ` (${[...kinds].join(', ')})` : ''}`
}

/** "Nome <email>" → identidade mínima para o avatar. */
function assignee(raw?: string): IdentityRef | null {
  if (!raw) return null
  const name = raw.replace(/\s*<.*$/, '').trim()
  return name ? { id: raw, displayName: name } : null
}
