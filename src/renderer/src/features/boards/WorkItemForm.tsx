// Formulário de work item: usado na rota workitems/:id e no SidePanel de qualquer lista/quadro.
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Paperclip, Pencil, Plus, Save, Send, Trash2, X, History as HistoryIcon } from 'lucide-react'
import { ado, adoList, seg, webUrl, AdoError, saveBase64 } from '@/lib/api'
import { Button, Field, Html, IconButton, Input, QueryView, Select, Tabs, Textarea, TimeAgo, Person, ExternalButton, Empty, Code, Badge, StateLabel, formatDate, Loading } from '@/components/ui'
import {
  asIdentity,
  fetchWorkItems,
  fieldOps,
  isBlocked,
  isConflict,
  patchWorkItem,
  typeIcon,
  useClassification,
  useStateZones,
  webItemUrl,
  wiKey,
  type Fields,
  type WiRelation,
  type WorkItem
} from './lib'

const TABS = [
  { key: 'detalhes', label: 'Detalhes' },
  { key: 'discussao', label: 'Discussão' },
  { key: 'historico', label: 'Histórico' },
  { key: 'links', label: 'Links' },
  { key: 'anexos', label: 'Anexos' }
] as const
type TabKey = (typeof TABS)[number]['key']

const PRIORITY = [1, 2, 3, 4]
const LINK_LABEL: Record<string, string> = {
  'System.LinkTypes.Hierarchy-Reverse': 'Pai',
  'System.LinkTypes.Hierarchy-Forward': 'Filho',
  'System.LinkTypes.Related': 'Relacionado'
}
const LINK_REL_FOR: Record<string, string> = {
  Pai: 'System.LinkTypes.Hierarchy-Reverse',
  Filho: 'System.LinkTypes.Hierarchy-Forward',
  Relacionado: 'System.LinkTypes.Related'
}
const HISTORY_LABEL: Record<string, string> = {
  'System.State': 'Estado',
  'System.AssignedTo': 'Atribuído a',
  'System.Title': 'Título',
  'System.IterationPath': 'Iteração',
  'System.AreaPath': 'Área',
  'System.Tags': 'Tags',
  'Microsoft.VSTS.Scheduling.RemainingWork': 'Trabalho restante',
  'Microsoft.VSTS.Scheduling.StoryPoints': 'Story points',
  'System.Reason': 'Motivo',
  'System.Description': 'Descrição'
}

const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  return isConflict(e) || /revis|TF401/i.test(m) ? 'Este item foi alterado por outra pessoa. Recarregue antes de salvar.' : m
}

/** Busca o item completo (com relações) e monta o editor. */
export function WorkItemForm({
  org,
  project,
  id,
  onOpen,
  onDeleted
}: {
  org: string
  project: string
  id: number
  onOpen?: (id: number) => void
  onDeleted?: () => void
}) {
  const q = useQuery({
    queryKey: [...wiKey(org, project), 'item', id],
    enabled: !!id,
    queryFn: () => ado<WorkItem>({ org, path: `${seg(project)}/_apis/wit/workitems/${id}`, query: { $expand: 'relations' } })
  })
  return (
    <QueryView query={q} emptyTitle="Work item não encontrado">
      {(wi) => <Editor key={wi.rev} org={org} project={project} wi={wi} onOpen={onOpen} onDeleted={onDeleted} />}
    </QueryView>
  )
}

function Editor({
  org,
  project,
  wi,
  onOpen,
  onDeleted
}: {
  org: string
  project: string
  wi: WorkItem
  onOpen?: (id: number) => void
  onDeleted?: () => void
}) {
  const qc = useQueryClient()
  const f = wi.fields
  const type: string = f['System.WorkItemType']
  const ico = typeIcon(type)
  const Icon = ico.icon
  const zones = useStateZones(org, project, [type])
  const stateList = zones.states(type)
  const areas = useClassification(org, project, 'Areas')
  const iters = useClassification(org, project, 'Iterations')
  const [tab, setTab] = useState<TabKey>('detalhes')
  const [draft, setDraft] = useState<Fields>({})
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const val = (k: string) => (k in draft ? draft[k] : f[k])
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }))
  const dirty = Object.keys(draft).length > 0
  const invalidate = () => qc.invalidateQueries({ queryKey: wiKey(org, project) })
  const isPlanning = type === 'User Story' || type === 'Feature' || type === 'Epic' || type === 'Bug' || type === 'Issue'
  const hasDescription = 'Microsoft.VSTS.Common.AcceptanceCriteria' in f || 'Microsoft.VSTS.TCM.ReproSteps' in f

  const save = useMutation({
    mutationFn: async () => {
      const ops = fieldOps(draft, f)
      if (!ops.length) return null
      // test de revisão: falha se alguém salvou depois de carregarmos o item
      return patchWorkItem(org, project, wi.id, [{ op: 'test', path: '/rev', value: wi.rev }, ...ops])
    },
    onSuccess: () => {
      setDraft({})
      setErr(null)
      invalidate()
    },
    onError: (e) => setErr(errMsg(e))
  })

  const remove = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/wit/workitems/${wi.id}`, method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      onDeleted?.()
    },
    onError: (e) => setErr(errMsg(e))
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (dirty && !save.isPending) save.mutate()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(webItemUrl(org, project, wi.id))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr('Não foi possível copiar o link.')
    }
  }

  const stateOptions = stateList.map((s) => s.name)
  const currentState: string = val('System.State') ?? ''
  if (currentState && !stateOptions.includes(currentState)) stateOptions.unshift(currentState)

  return (
    <form onSubmit={submit} onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && (e.preventDefault(), dirty && save.mutate())} className="flex min-h-full flex-col">
      {/* Cabeçalho */}
      <div className="border-b border-border bg-surface px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0" style={{ color: ico.color }} />
          <span className="narrow shrink-0 text-base font-semibold text-muted">#{wi.id}</span>
          <input
            value={val('System.Title') ?? ''}
            onChange={(e) => set('System.Title', e.target.value)}
            aria-label="Título"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xl font-semibold outline-none focus:underline"
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          {isBlocked(f) && <StateLabel zone="fail">Bloqueado</StateLabel>}
          <span className="flex-1" />
          <span>{type}</span>
          <span aria-hidden>·</span>
          <span>
            Alterado <TimeAgo date={f['System.ChangedDate']} />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" type="submit" disabled={!dirty} loading={save.isPending} icon={<Save className="size-3.5" />}>
            Salvar
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => (setDraft({}), setErr(null))} icon={<X className="size-3.5" />}>
              Descartar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={copyLink} icon={<Copy className="size-3.5" />}>
            {copied ? 'Link copiado' : 'Copiar link'}
          </Button>
          <ExternalButton url={webItemUrl(org, project, wi.id)} />
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="text-fail-ink"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm(`Mover o work item #${wi.id} para a lixeira?`)) remove.mutate()
            }}
            icon={<Trash2 className="size-3.5" />}
          >
            Excluir
          </Button>
        </div>
        {dirty && <div className="mt-2 text-[12px] text-progress-ink">Alterações não salvas. Ctrl+S salva.</div>}
        {err && <div className="mt-2 rounded-sm border border-zone-fail/40 px-3 py-2 text-[12px] text-fail-ink">{err}</div>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px] gap-0">
        <div className="min-w-0 border-r border-border">
          <div className="px-5 pt-1">
            <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />
          </div>
          <div className="px-5 py-4">
            {tab === 'detalhes' && (
              <div className="flex flex-col gap-5">
                <RichField label="Descrição" value={val('System.Description')} onChange={(v) => set('System.Description', v)} />
                {'Microsoft.VSTS.Common.AcceptanceCriteria' in f && (
                  <RichField label="Critérios de aceite" value={val('Microsoft.VSTS.Common.AcceptanceCriteria')} onChange={(v) => set('Microsoft.VSTS.Common.AcceptanceCriteria', v)} />
                )}
                {'Microsoft.VSTS.TCM.ReproSteps' in f && (
                  <RichField label="Passos para reproduzir" value={val('Microsoft.VSTS.TCM.ReproSteps')} onChange={(v) => set('Microsoft.VSTS.TCM.ReproSteps', v)} />
                )}
                {!hasDescription && !f['System.Description'] && <span className="text-muted">Sem descrição.</span>}
              </div>
            )}
            {tab === 'discussao' && <Discussion org={org} project={project} id={wi.id} />}
            {tab === 'historico' && <History org={org} project={project} id={wi.id} />}
            {tab === 'links' && <Links org={org} project={project} wi={wi} onOpen={onOpen} onChanged={invalidate} />}
            {tab === 'anexos' && <Attachments org={org} project={project} wi={wi} onChanged={invalidate} />}
          </div>
        </div>

        <aside className="flex flex-col gap-4 bg-bg/40 p-4">
          <Field label="Estado">
            <Select value={currentState} onChange={(e) => set('System.State', e.target.value)}>
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo">
            <Input value={val('System.Reason') ?? ''} onChange={(e) => set('System.Reason', e.target.value)} />
          </Field>
          <AssignedField org={org} value={asIdentity(val('System.AssignedTo'))} onPick={(v) => set('System.AssignedTo', v)} />
          <Field label="Área">
            <Select value={val('System.AreaPath') ?? ''} onChange={(e) => set('System.AreaPath', e.target.value)}>
              {(areas.data ?? []).map((n) => (
                <option key={n.path} value={n.path}>
                  {'— '.repeat(n.depth)}
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Iteração">
            <Select value={val('System.IterationPath') ?? ''} onChange={(e) => set('System.IterationPath', e.target.value)}>
              {(iters.data ?? []).map((n) => (
                <option key={n.path} value={n.path}>
                  {'— '.repeat(n.depth)}
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={String(val('Microsoft.VSTS.Common.Priority') ?? '')} onChange={(e) => set('Microsoft.VSTS.Common.Priority', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {PRIORITY.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          {(isPlanning || 'Microsoft.VSTS.Scheduling.StoryPoints' in f) && (
            <NumberField label="Story points" value={val('Microsoft.VSTS.Scheduling.StoryPoints')} onChange={(v) => set('Microsoft.VSTS.Scheduling.StoryPoints', v)} />
          )}
          {'Microsoft.VSTS.Scheduling.Effort' in f && (
            <NumberField label="Esforço" value={val('Microsoft.VSTS.Scheduling.Effort')} onChange={(v) => set('Microsoft.VSTS.Scheduling.Effort', v)} />
          )}
          {('Microsoft.VSTS.Scheduling.OriginalEstimate' in f || type === 'Task') && (
            <NumberField label="Estimativa original (h)" value={val('Microsoft.VSTS.Scheduling.OriginalEstimate')} onChange={(v) => set('Microsoft.VSTS.Scheduling.OriginalEstimate', v)} />
          )}
          {('Microsoft.VSTS.Scheduling.RemainingWork' in f || type === 'Task') && (
            <NumberField label="Trabalho restante (h)" value={val('Microsoft.VSTS.Scheduling.RemainingWork')} onChange={(v) => set('Microsoft.VSTS.Scheduling.RemainingWork', v)} />
          )}
          {('Microsoft.VSTS.Scheduling.CompletedWork' in f || type === 'Task') && (
            <NumberField label="Trabalho concluído (h)" value={val('Microsoft.VSTS.Scheduling.CompletedWork')} onChange={(v) => set('Microsoft.VSTS.Scheduling.CompletedWork', v)} />
          )}
          <TagsField value={val('System.Tags') ?? ''} onChange={(v) => set('System.Tags', v)} />
          <div className="flex flex-col gap-1 text-[12px] text-muted">
            <span>
              Criado em {formatDate(f['System.CreatedDate'])} por {f['System.CreatedBy']?.displayName ?? '—'}
            </span>
            <span>
              Alterado por {f['System.ChangedBy']?.displayName ?? '—'}
            </span>
          </div>
        </aside>
      </div>
    </form>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step="0.5"
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Field>
  )
}

/** Campo HTML: mostra renderizado, edita como HTML simples. */
function RichField({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <span className="colhead flex-1">{label}</span>
        <IconButton title={editing ? 'Concluir edição' : `Editar ${label.toLowerCase()}`} onClick={() => setEditing((e) => !e)}>
          {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
        </IconButton>
      </div>
      {editing ? (
        <Textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-40 font-mono text-[12.5px]"
          aria-label={label}
          placeholder="HTML simples, ex.: <p>Texto</p>"
        />
      ) : value ? (
        <div className="rounded-sm border border-border bg-surface px-3 py-2">
          <Html html={value} />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-left text-muted hover:text-fg">
          Adicionar {label.toLowerCase()}…
        </button>
      )}
    </section>
  )
}

function TagsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState('')
  const tags = value
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
  const add = () => {
    const t = text.trim()
    if (!t) return
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t].join('; '))
    setText('')
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="colhead">Tags</span>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-1.5 text-[11px]">
            {t}
            <button type="button" aria-label={`Remover tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t).join('; '))} className="text-muted hover:text-fg">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={text}
          placeholder="Nova tag e Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <IconButton title="Adicionar tag" onClick={add}>
          <Plus className="size-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

/** Busca de identidade no vssps (General). Escolher grava o uniqueName. */
function AssignedField({ org, value, onPick }: { org: string; value: { displayName: string; uniqueName?: string } | null; onPick: (v: string | null) => void }) {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])
  const found = useQuery({
    queryKey: [org, 'wi-identities', term],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: () => adoList<{ id: string; providerDisplayName: string; properties?: { Account?: { $value: string } } }>({ org, host: 'vssps', path: '_apis/identities', query: { searchFilter: 'General', filterValue: term } })
  })
  return (
    <div className="flex flex-col gap-1">
      <span className="colhead">Atribuído a</span>
      <div className="text-sm">{value ? <Person identity={{ id: '', displayName: value.displayName, uniqueName: value.uniqueName }} /> : <span className="text-muted">Não atribuído</span>}</div>
      <Input value={text} placeholder="Buscar pessoa…" onChange={(e) => setText(e.target.value)} aria-label="Buscar pessoa" />
      {term.length >= 2 && found.isLoading && <Loading label="Buscando…" />}
      {found.isError && <div className="text-[12px] text-fail-ink">Busca indisponível.</div>}
      {term.length >= 2 && found.data && (
        <div className="flex max-h-40 flex-col overflow-auto rounded-sm border border-border bg-surface">
          {found.data.length === 0 && <div className="px-2 py-1 text-[12px] text-muted">Ninguém encontrado</div>}
          {found.data.map((i) => {
            const un = i.properties?.Account?.$value ?? i.providerDisplayName
            return (
              <button
                key={i.id}
                type="button"
                className="px-2 py-1 text-left text-[12.5px] hover:bg-surface-2"
                onClick={() => {
                  onPick(un)
                  setText('')
                  setTerm('')
                }}
              >
                {i.providerDisplayName}
              </button>
            )
          })}
        </div>
      )}
      {value && (
        <button type="button" className="self-start text-[12px] text-muted hover:text-fg" onClick={() => onPick(null)}>
          Remover atribuição
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Discussão

interface Comment {
  id: number
  text: string
  createdBy?: { displayName: string }
  createdDate?: string
  modifiedDate?: string
}

function Discussion({ org, project, id }: { org: string; project: string; id: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const base = `${seg(project)}/_apis/wit/workItems/${id}/comments`
  const key = [...wiKey(org, project), 'comments', id]
  const q = useQuery({
    queryKey: key,
    queryFn: () => ado<{ comments: Comment[] }>({ org, path: base, apiVersion: '7.1-preview.4' })
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const add = useMutation({
    mutationFn: () => ado({ org, path: base, method: 'POST', apiVersion: '7.1-preview.4', body: { text: draft } }),
    onSuccess: () => {
      setDraft('')
      refresh()
    },
    onError: (e) => setErr(errMsg(e))
  })
  const edit = useMutation({
    mutationFn: (c: { id: number; text: string }) => ado({ org, path: `${base}/${c.id}`, method: 'PATCH', apiVersion: '7.1-preview.4', body: { text: c.text } }),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (e) => setErr(errMsg(e))
  })
  const del = useMutation({
    mutationFn: (cid: number) => ado({ org, path: `${base}/${cid}`, method: 'DELETE', apiVersion: '7.1-preview.4' }),
    onSuccess: refresh,
    onError: (e) => setErr(errMsg(e))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          placeholder="Escreva um comentário (HTML simples). Ctrl+Enter envia."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && draft.trim()) add.mutate()
          }}
          aria-label="Novo comentário"
        />
        <div className="flex justify-end">
          <Button variant="primary" size="sm" disabled={!draft.trim()} loading={add.isPending} onClick={() => add.mutate()} icon={<Send className="size-3.5" />}>
            Comentar
          </Button>
        </div>
      </div>
      {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      <QueryView query={q} emptyTitle="Nenhum comentário ainda">
        {(d) =>
          d.comments.length === 0 ? (
            <Empty title="Nenhum comentário ainda" />
          ) : (
            <ul className="flex flex-col gap-3">
              {[...d.comments].reverse().map((c) => (
                <li key={c.id} className="border-l-2 border-rule-strong pl-3">
                  <div className="mb-1 flex items-center gap-2 text-[12px] text-muted">
                    <span className="font-semibold text-fg">{c.createdBy?.displayName ?? '—'}</span>
                    <TimeAgo date={c.createdDate} />
                    <span className="flex-1" />
                    <IconButton title="Editar comentário" onClick={() => setEditing({ id: c.id, text: c.text })}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      title="Excluir comentário"
                      onClick={() => {
                        if (window.confirm('Excluir este comentário?')) del.mutate(c.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                  {editing?.id === c.id ? (
                    <div className="flex flex-col gap-2">
                      <Textarea value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} aria-label="Editar comentário" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" variant="primary" loading={edit.isPending} onClick={() => edit.mutate(editing)}>
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Html html={c.text} />
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  )
}

// ---------------------------------------------------------------- Histórico

interface Update {
  id: number
  revisedBy?: { displayName: string }
  revisedDate?: string
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>
  relations?: { added?: unknown[]; removed?: unknown[] }
}
const show = (v: unknown) => (v && typeof v === 'object' ? ((v as { displayName?: string }).displayName ?? JSON.stringify(v)) : v === undefined || v === null || v === '' ? '—' : String(v))

function History({ org, project, id }: { org: string; project: string; id: number }) {
  const q = useQuery({
    queryKey: [...wiKey(org, project), 'updates', id],
    queryFn: () => ado<{ value: Update[] }>({ org, path: `${seg(project)}/_apis/wit/workItems/${id}/updates` })
  })
  return (
    <QueryView query={q} emptyTitle="Sem histórico">
      {(d) => (
        <ol className="flex flex-col gap-3">
          {[...d.value].reverse().map((u) => {
            const changes = Object.entries(u.fields ?? {}).filter(([k]) => k !== 'System.Rev' && k !== 'System.ChangedDate' && k !== 'System.ChangedBy' && k !== 'System.Watermark')
            return (
              <li key={u.id} className="rounded-sm border border-border bg-surface px-3 py-2">
                <div className="mb-1 flex items-center gap-2 text-[12px] text-muted">
                  <HistoryIcon className="size-3.5" />
                  <span className="font-semibold text-fg">{u.revisedBy?.displayName ?? '—'}</span>
                  <span>{formatDate(u.revisedDate)}</span>
                </div>
                {changes.length === 0 && <div className="text-[12px] text-muted">{u.relations ? 'Links alterados' : 'Alteração sem campos visíveis'}</div>}
                <ul className="flex flex-col gap-0.5 text-[12.5px]">
                  {changes.map(([k, c]) => (
                    <li key={k}>
                      <span className="text-muted">{HISTORY_LABEL[k] ?? k.split('.').pop()}:</span>{' '}
                      {c.oldValue !== undefined && <span className="text-muted line-through">{show(c.oldValue)}</span>}{' '}
                      <span>{show(c.newValue)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </QueryView>
  )
}

// ---------------------------------------------------------------- Links

function Links({ org, project, wi, onOpen, onChanged }: { org: string; project: string; wi: WorkItem; onOpen?: (id: number) => void; onChanged: () => void }) {
  const [type, setType] = useState<'Pai' | 'Filho' | 'Relacionado'>('Relacionado')
  const [target, setTarget] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const rels = (wi.relations ?? []).map((r, index) => ({ r, index })).filter(({ r }) => r.rel !== 'AttachedFile')
  const add = useMutation({
    mutationFn: () =>
      patchWorkItem(org, project, wi.id, [
        {
          op: 'add',
          path: '/relations/-',
          value: { rel: LINK_REL_FOR[type], url: `https://dev.azure.com/${org}/_apis/wit/workItems/${target}`, attributes: { comment: '' } }
        }
      ]),
    onSuccess: () => {
      setTarget('')
      setErr(null)
      onChanged()
    },
    onError: (e) => setErr(errMsg(e))
  })
  const remove = useMutation({
    mutationFn: (index: number) => patchWorkItem(org, project, wi.id, [{ op: 'remove', path: `/relations/${index}` }]),
    onSuccess: () => {
      setErr(null)
      onChanged()
    },
    onError: (e) => setErr(errMsg(e))
  })

  const label = (r: WiRelation) => LINK_LABEL[r.rel] ?? (r.attributes?.name as string | undefined) ?? r.rel.split('.').pop() ?? r.rel
  const idFromUrl = (u: string) => {
    const m = u.match(/workItems\/(\d+)/i)
    return m ? Number(m[1]) : null
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Tipo de link">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-36">
            <option value="Pai">Pai</option>
            <option value="Filho">Filho</option>
            <option value="Relacionado">Relacionado</option>
          </Select>
        </Field>
        <Field label="ID do work item">
          <Input value={target} inputMode="numeric" placeholder="ex.: 4821" onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} className="w-32" />
        </Field>
        <Button variant="primary" size="sm" disabled={!target} loading={add.isPending} onClick={() => add.mutate()} icon={<Plus className="size-3.5" />}>
          Adicionar link
        </Button>
      </div>
      {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      {rels.length === 0 ? (
        <Empty title="Nenhum link">Pais, filhos, PRs, commits e branches aparecem aqui.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {rels.map(({ r, index }) => {
            const wid = r.rel.startsWith('System.LinkTypes.Hierarchy') || r.rel === 'System.LinkTypes.Related' ? idFromUrl(r.url) : null
            return (
              <li key={`${index}-${r.url}`} className="flex items-center gap-2 py-2">
                <Badge>{label(r)}</Badge>
                {wid ? (
                  <button type="button" onClick={() => onOpen?.(wid)} className="narrow font-semibold text-new-ink hover:underline">
                    #{wid}
                  </button>
                ) : (
                  <Code className="max-w-[320px] truncate">{(r.attributes?.name as string | undefined) ?? r.url}</Code>
                )}
                <span className="flex-1" />
                {!wid && r.url.startsWith('http') && <ExternalButton url={r.url} label="Abrir" />}
                <IconButton title="Remover link" onClick={() => remove.mutate(index)}>
                  <X className="size-3.5" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Anexos

function Attachments({ org, project, wi, onChanged }: { org: string; project: string; wi: WorkItem; onChanged: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const files = (wi.relations ?? []).filter((r) => r.rel === 'AttachedFile')
  const download = async (r: WiRelation) => {
    try {
      const b64 = await ado<string>({ org, path: r.url, responseType: 'base64', apiVersion: null })
      saveBase64(b64, String(r.attributes?.name ?? 'anexo'))
    } catch (e) {
      setErr(e instanceof AdoError ? e.message : String(e))
    }
  }
  const upload = async (file: File) => {
    setBusy(true)
    setErr(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const b64 = btoa(bin)
      const up = await ado<{ url: string }>({
        org,
        path: `${seg(project)}/_apis/wit/attachments`,
        method: 'POST',
        query: { fileName: file.name, uploadType: 'simple' },
        body: b64,
        bodyEncoding: 'base64',
        contentType: 'application/octet-stream'
      })
      await patchWorkItem(org, project, wi.id, [{ op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: up.url, attributes: { comment: '' } } }])
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center gap-2 self-start">
        <Button size="sm" loading={busy} icon={<Plus className="size-3.5" />} onClick={() => undefined} type="button">
          Adicionar anexo
        </Button>
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void upload(f)
          }}
        />
      </label>
      {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      {files.length === 0 ? (
        <Empty title="Nenhum anexo" icon={<Paperclip className="size-6" />} />
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {files.map((r) => (
            <li key={r.url} className="flex items-center gap-2 py-2">
              <Paperclip className="size-3.5 text-muted" />
              <span className="min-w-0 flex-1 truncate">{String(r.attributes?.name ?? r.url)}</span>
              {r.attributes?.resourceSize !== undefined && <span className="narrow text-muted">{Math.round(Number(r.attributes.resourceSize) / 1024)} KB</span>}
              <IconButton title="Baixar anexo" onClick={() => download(r)}>
                <Download className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-muted">Envio de novos anexos ainda não disponível (depende de corpo binário no main process).</p>
    </div>
  )
}

