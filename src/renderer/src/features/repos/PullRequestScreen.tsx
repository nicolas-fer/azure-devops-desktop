// Detalhe da pull request: cabeçalho (!ID, estado, branches), abas Visão geral / Arquivos /
// Atualizações / Commits, e o rail direito (PrRail). Segue o draft aprovado .superdesign/tmp/repos-pr.html.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, CheckCheck, Circle, Clock, Copy, GitCommitHorizontal, GitMerge, Lock, MessageSquare, MoreHorizontal, Pencil, ThumbsUp, UserPlus, X, type LucideIcon } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Code,
  Empty,
  ErrorBox,
  IdCell,
  Loading,
  Markdown,
  PageHeader,
  Section,
  StateLabel,
  Tabs,
  Textarea,
  TimeAgo,
  Input,
  cx,
  formatDate
} from '@/components/ui'
import { DiffViewer } from '@/components/CodeEditor'
import { adoList, seg, webUrl, openExternal, type IdentityRef } from '@/lib/api'
import { useScope, useMe, isMe } from '@/lib/context'
import { prZone } from '@/lib/zones'
import { useRepos, repoKey, shortHash, shortRef, useRepoMutation, type GitChange, type GitPullRequest, type PrComment, type PrIteration, type PrThread } from './repoApi'
import { useReposBase } from './repoParts'
import { PrRail, useVoteMutation } from './PrRail'
import { NewThreadForm, ThreadCard } from './PrThreads'
import { fileText } from './CommitsScreen'
import {
  VOTES,
  patchPrReq,
  prPath,
  concludeBlockReason,
  prStateZone,
  usePrChanges,
  usePrCommits,
  usePrIterations,
  usePrPolicies,
  usePrThreads,
  usePullRequest
} from './prData'
import { ado } from '@/lib/api'

type PrTab = 'visao' | 'arquivos' | 'atualizacoes' | 'commits'

const STATE_LABEL: Record<string, string> = { new: 'Rascunho', progress: 'Ativo', fail: 'Conflito', done: 'Concluído', idle: 'Abandonado' }

const isSystemThread = (t: PrThread) => t.comments.some((c) => c.commentType === 'system')
const isGeneralThread = (t: PrThread) => !t.threadContext && !isSystemThread(t)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function PullRequestScreen() {
  const { repo: repoParam, id = '' } = useParams()
  const { org, project } = useScope()
  const repos = useRepos(org, project)
  if (!repoParam) return <Empty title="Repositório não informado" />
  if (repos.isLoading) return <Loading />
  if (repos.isError) return <ErrorBox error={repos.error} onRetry={() => repos.refetch()} />
  const repo = repos.data?.find((r) => r.name === repoParam)
  if (!repo) return <Empty title="Repositório não encontrado" />
  return <PrView org={org} project={project} repo={repo.name} id={id} />
}

function PrView({ org, project, repo, id }: { org: string; project: string; repo: string; id: string }) {
  const navigate = useNavigate()
  const base = useReposBase()
  const [params, setParams] = useSearchParams()
  const pr = usePullRequest(org, project, repo, id)
  const tab = (params.get('tab') as PrTab) || 'visao'
  const setTab = (t: PrTab) => {
    const p = new URLSearchParams(params)
    p.set('tab', t)
    setParams(p)
  }
  const threads = usePrThreads(org, project, repo, id)
  const iterations = usePrIterations(org, project, repo, id)
  const commits = usePrCommits(org, project, repo, id)
  const changes = usePrChanges(org, project, repo, id, lastIterationId(iterations.data), null)

  if (pr.isLoading) return <Loading label="Carregando pull request…" />
  if (pr.isError) return <ErrorBox error={pr.error} onRetry={() => pr.refetch()} />
  if (!pr.data) return null
  const p = pr.data
  const zone = prZone(p.status, p.isDraft, p.mergeStatus)
  const url = webUrl(org, `${seg(project)}/_git/${seg(repo)}/pullrequest/${p.pullRequestId}`)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="entity"
        idPrefix={'!' + p.pullRequestId}
        title={p.title}
        breadcrumb={
          <button className="hover:text-fg" onClick={() => navigate(`${base}/pullrequests/${seg(repo)}`)}>
            {repo} / Pull requests
          </button>
        }
        actions={
          <>
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(url).catch(() => undefined)}>
              Copiar link
            </Button>
            <PrHeaderActions org={org} project={project} pr={p} url={url} />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 pb-2 text-[12px] text-muted">
          <StateLabel zone={zone}>{STATE_LABEL[zone]}</StateLabel>
          {p.isDraft && <Badge>rascunho</Badge>}
          <span className="inline-flex items-center gap-1.5">
            <Avatar identity={p.createdBy} size={20} />
            <span className="font-medium text-fg">{p.createdBy.displayName}</span>
            <span>quer mesclar</span>
          </span>
          <Code>{shortRef(p.sourceRefName)}</Code>
          <span>→</span>
          <Code>{shortRef(p.targetRefName)}</Code>
          <span>· <TimeAgo date={p.creationDate} /></span>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'visao', label: 'Visão geral' },
            { key: 'arquivos', label: 'Arquivos', count: changes.data?.changeEntries.length },
            { key: 'atualizacoes', label: 'Atualizações', count: iterations.data?.length },
            { key: 'commits', label: 'Commits', count: commits.data?.length }
          ]}
        />
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {tab === 'visao' && <OverviewTab org={org} project={project} pr={p} threads={threads} />}
          {tab === 'arquivos' && <FilesTab org={org} project={project} pr={p} iterations={iterations} threads={threads} />}
          {tab === 'atualizacoes' && <UpdatesTab iterations={iterations} onOpenFiles={(n) => {
            const q = new URLSearchParams(params)
            q.set('tab', 'arquivos')
            q.set('iter', String(n))
            q.delete('cmp')
            setParams(q)
          }} />}
          {tab === 'commits' && <CommitsTab commits={commits} />}
        </div>
        <PrRail org={org} project={project} pr={p} />
      </div>
    </div>
  )
}

function lastIterationId(list?: PrIteration[]) {
  return list && list.length ? list[list.length - 1]!.id : null
}

function OverviewTab({
  org,
  project,
  pr,
  threads
}: {
  org: string
  project: string
  pr: GitPullRequest
  threads: { data?: PrThread[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [newGeneral, setNewGeneral] = useState(false)
  const save = useRepoMutation(org, project, (body: Record<string, unknown>) => ado({ org, ...patchPrReq(project, pr.repository.name, pr.pullRequestId, body) }))

  const general = (threads.data ?? []).filter(isGeneralThread)
  const activity = (threads.data ?? []).filter(isSystemThread)
  return (
    <div className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <Section
        title="Descrição"
        actions={
          !editing && (
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => { setDesc(pr.description ?? ''); setEditing(true) }}>
              Editar
            </Button>
          )
        }
      >
        <div className="p-4">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea className="min-h-40" value={desc} onChange={(e) => setDesc(e.target.value)} />
              {err && <div className="text-[12px] text-fail-ink">{err}</div>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditing(false)}>Cancelar</Button>
                <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ description: desc }, { onSuccess: () => setEditing(false), onError: (e) => setErr(e instanceof Error ? e.message : String(e)) })}>
                  Salvar
                </Button>
              </div>
            </div>
          ) : pr.description ? (
            <Markdown>{pr.description}</Markdown>
          ) : (
            <span className="text-muted">Sem descrição.</span>
          )}
        </div>
      </Section>

      <Section
        title={`Comentários · ${general.length}`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setNewGeneral((v) => !v)}>
            {newGeneral ? 'Fechar' : 'Novo comentário'}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 p-3">
          {newGeneral && <NewThreadForm org={org} project={project} pr={pr} onDone={() => setNewGeneral(false)} />}
          {threads.isLoading && <Loading label="Carregando comentários…" />}
          {threads.isError && <ErrorBox error={threads.error} onRetry={() => threads.refetch()} />}
          {threads.data && general.length === 0 && !newGeneral && <div className="text-muted">Nenhum comentário.</div>}
          {general.map((t) => (
            <ThreadCard key={t.id} org={org} project={project} pr={pr} thread={t} />
          ))}
        </div>
      </Section>

      <Section title="Atividade">
        {activity.length === 0 && threads.data && <div className="px-3 py-2 text-muted">Sem atividade registrada.</div>}
        {activity.map((t) => {
          const c = t.comments[0]
          if (!c) return null
          const ev = describeActivity(t, pr)
          const Icon = ev.icon
          return (
            <div key={t.id} className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">{ev.text}</div>
              <span className="text-[12px] text-muted whitespace-nowrap"><TimeAgo date={c.publishedDate} /></span>
            </div>
          )
        })}
      </Section>
    </div>
  )
}

function FilesTab({
  org,
  project,
  pr,
  iterations,
  threads
}: {
  org: string
  project: string
  pr: GitPullRequest
  iterations: { data?: PrIteration[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  threads: { data?: PrThread[] }
}) {
  const [params, setParams] = useSearchParams()
  const [file, setFile] = useState<string | null>(null)
  const [side, setSide] = useState(true)
  const [line, setLine] = useState('')
  const [commenting, setCommenting] = useState(false)
  const list = iterations.data ?? []
  const iterParam = Number(params.get('iter'))
  const cmpParam = Number(params.get('cmp'))
  const iter = list.find((i) => i.id === iterParam) ?? list[list.length - 1]
  const cmp = list.find((i) => i.id === cmpParam && i.id !== iter?.id)
  const repo = pr.repository.name
  const id = String(pr.pullRequestId)
  const changes = usePrChanges(org, project, repo, id, iter?.id ?? null, cmp?.id ?? null)

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p)
  }

  const entries = useMemo(
    () => (changes.data?.changeEntries ?? []).slice().sort((a, b) => a.item.path.localeCompare(b.item.path, 'pt-BR')),
    [changes.data]
  )
  const selected = entries.find((e) => e.item.path === file) ?? entries[0]
  const fileThreads = (threads.data ?? []).filter((t) => t.threadContext?.filePath === selected?.item.path)

  if (iterations.isLoading) return <Loading label="Carregando iterações…" />
  if (iterations.isError) return <ErrorBox error={iterations.error} onRetry={() => iterations.refetch()} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Iteração
          <select className="h-7 rounded-sm border border-border bg-surface px-2 text-sm" value={iter?.id ?? ''} onChange={(e) => setParam('iter', e.target.value)}>
            {list.map((i) => (
              <option key={i.id} value={i.id}>
                #{i.id} · {i.description ?? 'Atualização'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Comparar com
          <select className="h-7 rounded-sm border border-border bg-surface px-2 text-sm" value={cmp?.id ?? ''} onChange={(e) => setParam('cmp', e.target.value || null)}>
            <option value="">Base do PR</option>
            {list.filter((i) => i.id !== iter?.id).map((i) => (
              <option key={i.id} value={i.id}>
                #{i.id}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setSide((s) => !s)}>
          {side ? 'Diff inline' : 'Lado a lado'}
        </Button>
      </div>
      {changes.isLoading ? (
        <Loading label="Carregando arquivos…" />
      ) : changes.isError ? (
        <ErrorBox error={changes.error} onRetry={() => changes.refetch()} />
      ) : entries.length === 0 ? (
        <Empty title="Nenhum arquivo alterado" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="scroll w-72 shrink-0 overflow-auto border-r border-border bg-surface">
            {entries.map((e) => (
              <li key={e.item.path}>
                <button
                  type="button"
                  onClick={() => setFile(e.item.path)}
                  className={cx('flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left hover:bg-surface-2', selected?.item.path === e.item.path && 'bg-surface-2 font-semibold')}
                >
                  <ChangeTag type={e.changeType} />
                  <span className="truncate font-mono text-[12px]">{e.item.path}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selected && (
              <FileDiffPr org={org} project={project} repo={repo} pr={pr} iter={iter} cmp={cmp} change={selected} sideBySide={side} />
            )}
            {selected && (
              <div className="scroll max-h-[45%] overflow-auto border-t border-border bg-surface p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="colhead flex-1">Comentários no arquivo</span>
                  {!commenting && (
                    <Button size="sm" onClick={() => setCommenting(true)}>
                      Comentar em linha
                    </Button>
                  )}
                </div>
                {commenting && (
                  <div className="mb-3 flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-[12px] text-muted">
                      Linha (lado novo)
                      <Input className="h-7 w-24" type="number" min={1} value={line} onChange={(e) => setLine(e.target.value)} />
                    </label>
                    <NewThreadForm
                      org={org}
                      project={project}
                      pr={pr}
                      filePath={selected.item.path}
                      line={Number(line) || undefined}
                      placeholder="Comentário nesta linha…"
                      onDone={() => setCommenting(false)}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {fileThreads.map((t) => (
                    <ThreadCard key={t.id} org={org} project={project} pr={pr} thread={t} />
                  ))}
                  {fileThreads.length === 0 && !commenting && <div className="text-[12px] text-muted">Nenhum comentário neste arquivo.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeTag({ type }: { type: string }) {
  const letter = type.includes('add') ? 'A' : type.includes('delete') ? 'D' : type.includes('rename') ? 'R' : 'M'
  const cls = letter === 'A' ? 'text-done-ink' : letter === 'D' ? 'text-fail-ink' : letter === 'R' ? 'text-new-ink' : 'text-progress-ink'
  return <span className={cx('narrow w-4 text-center text-[12px] font-bold', cls)}>{letter}</span>
}

/** Diff de um arquivo entre o alvo e a iteração (ou entre duas iterações). */
function FileDiffPr({
  org,
  project,
  repo,
  pr,
  iter,
  cmp,
  change,
  sideBySide
}: {
  org: string
  project: string
  repo: string
  pr: GitPullRequest
  iter?: PrIteration
  cmp?: PrIteration
  change: GitChange
  sideBySide: boolean
}) {
  const path = change.item.path
  const modCommit = iter?.sourceRefCommit?.commitId
  const origCommit = cmp ? cmp.sourceRefCommit?.commitId : (iter?.targetRefCommit ?? iter?.commonRefCommit)?.commitId
  const orig = useQuery({
    queryKey: repoKey(org, project, 'pr-diff-o', repo, pr.pullRequestId, origCommit ?? '', path),
    enabled: !!origCommit && change.changeType !== 'add',
    queryFn: () => fileText(org, project, repo, path, { type: 'commit', name: origCommit! })
  })
  const mod = useQuery({
    queryKey: repoKey(org, project, 'pr-diff-m', repo, pr.pullRequestId, modCommit ?? '', path),
    enabled: !!modCommit && change.changeType !== 'delete',
    queryFn: () => fileText(org, project, repo, path, { type: 'commit', name: modCommit! })
  })
  if (orig.isLoading || mod.isLoading) return <Loading label="Carregando diff…" />
  if (orig.isError) return <ErrorBox error={orig.error} />
  if (mod.isError) return <ErrorBox error={mod.error} />
  return (
    <div className="min-h-0 flex-1">
      <DiffViewer original={orig.data ?? ''} modified={mod.data ?? ''} path={path} sideBySide={sideBySide} />
    </div>
  )
}

function UpdatesTab({
  iterations,
  onOpenFiles
}: {
  iterations: { data?: PrIteration[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  onOpenFiles: (n: number) => void
}) {
  if (iterations.isLoading) return <Loading label="Carregando atualizações…" />
  if (iterations.isError) return <ErrorBox error={iterations.error} onRetry={() => iterations.refetch()} />
  const list = [...(iterations.data ?? [])].reverse()
  if (list.length === 0) return <Empty title="Sem atualizações" />
  return (
    <div className="scroll flex-1 overflow-auto p-4">
      <ul className="flex flex-col">
        {list.map((i) => (
          <li key={i.id} className="flex items-center gap-3 border-b border-border py-2">
            <IdCell className="w-14 text-right">#{i.id}</IdCell>
            <Avatar identity={i.author} size={22} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{i.description ?? 'Atualização'}</div>
              <div className="text-[12px] text-muted">
                {i.author.displayName} · {formatDate(i.updatedDate)}
                {i.sourceRefCommit && <> · <Code>{shortHash(i.sourceRefCommit.commitId)}</Code></>}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onOpenFiles(i.id)}>
              Ver arquivos
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CommitsTab({ commits }: { commits: { data?: { commitId: string; comment: string; author: { name: string; date: string } }[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown } }) {
  if (commits.isLoading) return <Loading label="Carregando commits…" />
  if (commits.isError) return <ErrorBox error={commits.error} onRetry={() => commits.refetch()} />
  const list = commits.data ?? []
  if (list.length === 0) return <Empty title="Nenhum commit neste PR" />
  return (
    <div className="scroll flex-1 overflow-auto p-4">
      <ul className="flex flex-col">
        {list.map((c) => (
          <li key={c.commitId} className="flex items-center gap-3 border-b border-border py-2">
            <GitCommitHorizontal className="size-4 text-muted" />
            <Code>{shortHash(c.commitId)}</Code>
            <span className="min-w-0 flex-1 truncate">{c.comment.split('\n')[0]}</span>
            <span className="text-[12px] text-muted">{c.author.name}</span>
            <span className="narrow whitespace-nowrap text-[12px] text-muted"><TimeAgo date={c.author.date} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ações do cabeçalho: Aprovar (menu de voto), Concluir (leva às opções do rail) e menu "…". */
function PrHeaderActions({ org, project, pr, url }: { org: string; project: string; pr: GitPullRequest; url: string }) {
  const me = useMe(org)
  const repo = pr.repository.name
  const active = pr.status === 'active'
  const policies = usePrPolicies(org, project, pr)
  const vote = useVoteMutation(org, project, pr)
  const act = useRepoMutation(org, project, (body: Record<string, unknown>) => ado({ org, ...patchPrReq(project, repo, pr.pullRequestId, body) }))
  const [err, setErr] = useState<string | null>(null)
  const myVote = pr.reviewers.find((r) => isMe(me.data, r))?.vote

  const run = (body: Record<string, unknown>) => {
    setErr(null)
    act.mutate(body, { onError: (e) => setErr(errMsg(e)) })
  }
  const castVote = (v: number) => {
    setErr(null)
    vote.mutate(v, { onError: (e) => setErr(errMsg(e)) })
  }

  const concludeBlock = concludeBlockReason(pr, policies.data)

  return (
    // Motivo do bloqueio abaixo dos botões, para não espremer o título
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
      <MenuDropdown
        label="Aprovar"
        icon={<ThumbsUp className="size-3.5" />}
        loading={vote.isPending}
        disabled={!active}
        title={active ? 'Votar nesta pull request' : 'Pull request não está ativa'}
        items={VOTES.map((v) => ({
          key: String(v.value),
          label: (
            <>
              <span className="inline-flex w-3.5 justify-center">{myVote === v.value && <Check className="size-3.5" />}</span>
              {v.label}
            </>
          ),
          onSelect: () => castVote(v.value)
        }))}
      />
      <Button
        variant="success"
        icon={<GitMerge className="size-3.5" />}
        disabled={concludeBlock !== null}
        title={concludeBlock ?? 'Ir para as opções de conclusão no painel'}
        onClick={() => document.getElementById('pr-completion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Concluir
      </Button>
      <MenuDropdown
        ariaLabel="Mais ações"
        title="Mais ações"
        icon={<MoreHorizontal className="size-4" />}
        className="px-2"
        items={[
          ...(active
            ? [
                { key: 'draft', label: pr.isDraft ? 'Publicar rascunho' : 'Marcar como rascunho', onSelect: () => run({ isDraft: !pr.isDraft }) },
                {
                  key: 'abandon',
                  label: 'Abandonar',
                  danger: true,
                  onSelect: () => {
                    if (window.confirm('Abandonar esta pull request?')) run({ status: 'abandoned' })
                  }
                }
              ]
            : []),
          ...(pr.status === 'abandoned' ? [{ key: 'reactivate', label: 'Reativar', onSelect: () => run({ status: 'active' }) }] : []),
          { key: 'open', label: 'Abrir no navegador', onSelect: () => openExternal(url) }
        ]}
      />
      {err && <div className="max-w-xs text-[12px] text-fail-ink">{err}</div>}
      </div>
        {concludeBlock && (
          <span className="inline-flex min-w-0 max-w-[480px] items-center gap-1 text-[12px] text-progress-ink" title={concludeBlock}>
            <Lock className="size-3.5 shrink-0" />
            <span className="truncate">{concludeBlock}</span>
          </span>
        )}
    </div>
  )
}

interface MenuItem {
  key: string
  label: ReactNode
  onSelect: () => void
  danger?: boolean
}

/** Botão que abre um menu suspenso de ações (fecha ao clicar fora). */
function MenuDropdown({
  label,
  icon,
  loading,
  disabled,
  title,
  ariaLabel,
  className,
  items
}: {
  label?: string
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  title?: string
  ariaLabel?: string
  className?: string
  items: MenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button
        icon={icon}
        loading={loading}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={className}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1 min-w-56 rounded-sm border border-border bg-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm whitespace-nowrap hover:bg-surface-2', it.danger && 'text-fail-ink')}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Atividade (threads de sistema)

function voteVerb(v: number): string | null {
  switch (v) {
    case 10:
      return 'aprovou'
    case 5:
      return 'aprovou com sugestões'
    case -5:
      return 'pediu ajustes ao autor'
    case -10:
      return 'rejeitou'
    case 0:
      return 'redefiniu o voto'
    default:
      return null
  }
}

function voteIcon(v: number): LucideIcon {
  switch (v) {
    case 10:
      return Check
    case 5:
      return CheckCheck
    case -5:
      return Clock
    case -10:
      return X
    default:
      return Circle
  }
}

const isNum = (v: unknown) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && isFinite(Number(v))

/** Primeiro valor de propriedade do thread cuja chave passa em keyPred (e o valor em valPred). */
function findProp(t: PrThread, keyPred: (k: string) => boolean, valPred?: (v: unknown) => boolean): unknown {
  for (const [k, p] of Object.entries(t.properties ?? {})) {
    const v = p?.$value
    if (keyPred(k) && (!valPred || valPred(v))) return v ?? undefined
  }
  return undefined
}

/** Nome da identidade: revisores da PR, identidades do thread ou o autor da PR. */
function identityName(t: PrThread, pr: GitPullRequest, id: unknown): string | null {
  if (typeof id !== 'string' || !id) return null
  return pr.reviewers.find((r) => r.id === id)?.displayName ?? t.identities?.[id]?.displayName ?? (pr.createdBy.id === id ? pr.createdBy.displayName : null)
}

/** Autor de sistema (ex. Microsoft.VisualStudio.Services.TFS) vira o ator real quando dá para resolver, senão "Sistema". */
function isServiceAuthor(a: IdentityRef): boolean {
  return /Microsoft\.VisualStudio|TFS/i.test(`${a.displayName ?? ''} ${a.uniqueName ?? ''}`)
}

function actorOf(c: PrComment, t: PrThread, pr: GitPullRequest, idValue?: unknown): string {
  const byProp = identityName(t, pr, idValue)
  if (byProp) return byProp
  return isServiceAuthor(c.author) ? 'Sistema' : c.author.displayName
}

const STATUS_VERB: Record<string, string> = {
  completed: 'concluiu',
  merged: 'concluiu',
  abandoned: 'abandonou',
  active: 'reativou',
  true: 'marcou como rascunho',
  false: 'publicou o rascunho'
}

/** Traduz um evento de sistema da PR para pt-BR, com ícone por tipo. Desconhecido: conteúdo original com prefixo neutro. */
function describeActivity(t: PrThread, pr: GitPullRequest): { icon: LucideIcon; text: ReactNode } {
  const c = t.comments[0]!

  const voteVal = findProp(t, (k) => /vote/i.test(k) && !/ident/i.test(k), isNum)
  if (voteVal !== undefined) {
    const v = Number(voteVal)
    const verb = voteVerb(v)
    if (verb) {
      // CodeReviewVotedByIdentity é quem votou; VotedByInitiatorIdentity pode ser quem votou em nome de outro
      const who = findProp(t, (k) => k === 'CodeReviewVotedByIdentity') ?? findProp(t, (k) => /vote/i.test(k) && /ident/i.test(k))
      return { icon: voteIcon(v), text: <><b>{actorOf(c, t, pr, who)}</b> {verb}</> }
    }
  }

  // ReviewersUpdate: AddedIdentity é o revisor adicionado; ByIdentity é quem adicionou
  const added = findProp(t, (k) => /reviewer/i.test(k) && /added/i.test(k) && /ident/i.test(k))
  if (added !== undefined) {
    const target = identityName(t, pr, added) ?? 'um revisor'
    const by = findProp(t, (k) => /reviewer/i.test(k) && /updatedby/i.test(k) && /ident/i.test(k))
    return { icon: UserPlus, text: <><b>{actorOf(c, t, pr, by)}</b> adicionou {target} como revisor</> }
  }

  const commits = findProp(t, (k) => /commit/i.test(k), isNum)
  if (commits !== undefined) {
    const n = Number(commits)
    return { icon: GitCommitHorizontal, text: <><b>{actorOf(c, t, pr)}</b> enviou {n} {n === 1 ? 'commit' : 'commits'}</> }
  }

  const refBy = findProp(t, (k) => /ref/i.test(k) && /ident/i.test(k))
  if (refBy !== undefined) {
    return { icon: GitCommitHorizontal, text: <><b>{actorOf(c, t, pr, refBy)}</b> atualizou a branch de origem</> }
  }

  const st = findProp(t, (k) => /status|complet|abandon|reactiv|merge|draft/i.test(k) && !/ident/i.test(k))
  const stVerb = st === undefined ? undefined : STATUS_VERB[String(st).toLowerCase()]
  if (stVerb) {
    return { icon: GitMerge, text: <><b>{actorOf(c, t, pr)}</b> {stVerb}</> }
  }

  return { icon: MessageSquare, text: <><span className="text-muted">Evento:</span> {c.content ?? '—'}</> }
}
