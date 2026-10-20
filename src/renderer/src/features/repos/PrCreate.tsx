// Criar pull request: origem/destino, título, descrição (preenchida a partir dos commits),
// revisores, work items, rascunho e prévia de arquivos alterados (diffs/commits).
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, UserPlus, X } from 'lucide-react'
import { Button, Code, Empty, ErrorBox, Field, Input, Loading, PageHeader, Section, Select, Textarea, ExternalButton, cx } from '@/components/ui'
import { ado, adoList, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { RepoGate, RepoSwitcher, useRefs, useReposBase } from './repoParts'
import { refName, repoKey, repoPath, shortRef, useRepoMutation, type GitChange, type GitCommit, type GitRepo } from './repoApi'

interface Hit {
  id: string
  providerDisplayName: string
}

export function PrCreateScreen() {
  return <RepoGate>{(repo) => <PrCreateView repo={repo} />}</RepoGate>
}

function PrCreateView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const navigate = useNavigate()
  const base = useReposBase()
  const [params] = useSearchParams()
  const heads = useRefs(org, project, repo.name, 'heads')
  const defaultTarget = shortRef(repo.defaultBranch ?? 'refs/heads/main')
  const [source, setSource] = useState(params.get('source') ?? '')
  const [target, setTarget] = useState(defaultTarget)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState(false)
  const [wi, setWi] = useState('')
  const [reviewers, setReviewers] = useState<Hit[]>([])
  const [requiredIds, setRequiredIds] = useState<string[]>([])
  const [who, setWho] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!source && heads.data) {
      const first = heads.data.find((r) => shortRef(r.name) !== target)
      if (first) setSource(shortRef(first.name))
    }
  }, [heads.data, source, target])

  const valid = !!source && !!target && source !== target
  const preview = useQuery({
    queryKey: repoKey(org, project, 'pr-preview', repo.name, source, target),
    enabled: valid,
    queryFn: async () => {
      const [diff, commits] = await Promise.all([
        ado<{ changes: GitChange[]; aheadCount: number; behindCount: number; changeCounts: Record<string, number> }>({
          org,
          path: `${repoPath(project, repo.name)}/diffs/commits`,
          query: { baseVersion: target, baseVersionType: 'branch', targetVersion: source, targetVersionType: 'branch', $top: 500 }
        }),
        adoList<GitCommit>({
          org,
          path: `${repoPath(project, repo.name)}/commits`,
          query: {
            'searchCriteria.itemVersion.version': source,
            'searchCriteria.itemVersion.versionType': 'branch',
            'searchCriteria.compareVersion.version': target,
            'searchCriteria.compareVersion.versionType': 'branch',
            $top: 100
          }
        })
      ])
      return { diff, commits }
    }
  })

  // Descrição preenchida a partir dos commits (só quando o campo ainda está vazio).
  useEffect(() => {
    if (!preview.data || description.trim()) return
    const lines = preview.data.commits.map((c) => `- ${c.comment.split('\n')[0]}`)
    if (lines.length) setDescription(lines.join('\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data])

  useEffect(() => {
    if (!title && preview.data?.commits[0]) setTitle(preview.data.commits[0].comment.split('\n')[0] ?? '')
  }, [preview.data, title])

  const search = useQuery({
    queryKey: repoKey(org, project, 'pr-who', who),
    enabled: who.length >= 2,
    queryFn: () =>
      adoList<{ id: string; providerDisplayName: string }>({ org, host: 'vssps', path: '_apis/identities', query: { searchFilter: 'General', filterValue: who, queryMembership: 'None' } })
  })

  const create = useRepoMutation(org, project, () =>
    ado<{ pullRequestId: number }>({
      org,
      method: 'POST',
      path: `${repoPath(project, repo.name)}/pullrequests`,
      body: {
        sourceRefName: refName(source),
        targetRefName: refName(target),
        title: title.trim(),
        description: description.trim(),
        isDraft: draft,
        reviewers: reviewers.map((r) => ({ id: r.id, isRequired: requiredIds.includes(r.id) })),
        workItemRefs: wi
          .split(/[\s,;]+/)
          .map((s) => s.replace(/^#/, '').trim())
          .filter(Boolean)
          .map((id) => ({ id }))
      }
    })
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Nova pull request"
        subtitle={repo.name}
        breadcrumb={
          <button className="hover:text-fg" onClick={() => navigate(`${base}/pullrequests/${seg(repo.name)}`)}>
            {repo.name} / Pull requests
          </button>
        }
        actions={
          <>
            <RepoSwitcher screen="pullrequests" repo={repo} />
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}/pullrequestcreate`)} />
          </>
        }
      />
      <div className="scroll grid min-h-0 flex-1 grid-cols-[1fr_360px] items-start gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Branches">
            <div className="flex flex-wrap items-end gap-3 p-3">
              {heads.isLoading && <Loading label="Carregando branches…" />}
              {heads.isError && <ErrorBox error={heads.error} onRetry={() => heads.refetch()} />}
              <Field label="Origem">
                <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-64 font-mono text-[12px]">
                  <option value="">Escolha…</option>
                  {heads.data?.map((r) => (
                    <option key={r.name} value={shortRef(r.name)}>
                      {shortRef(r.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              <ArrowRight className="mb-2 size-4 text-muted" />
              <Field label="Destino">
                <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-64 font-mono text-[12px]">
                  {heads.data?.map((r) => (
                    <option key={r.name} value={shortRef(r.name)}>
                      {shortRef(r.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              {source && source === target && <span className="text-[12px] text-fail-ink">Origem e destino precisam ser diferentes.</span>}
            </div>
          </Section>

          <Section title="Detalhes">
            <div className="flex flex-col gap-3 p-3">
              <Field label="Título">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descreva a mudança" />
              </Field>
              <Field label="Descrição" hint="Preenchida com os commits da origem que ainda não estão no destino.">
                <Textarea className="min-h-40 font-mono text-[12px]" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Field label="Work items" hint="IDs separados por vírgula (ex.: 4790, 4791).">
                <Input value={wi} onChange={(e) => setWi(e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="accent-[var(--color-accent)]" />
                Criar como rascunho
              </label>
            </div>
          </Section>

          <Section title="Revisores">
            <div className="flex flex-col gap-2 p-3">
              <div className="flex gap-2">
                <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Buscar pessoa (mín. 2 letras)" />
              </div>
              {search.isLoading && <Loading label="Buscando…" />}
              {search.data && search.data.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-sm border border-border">
                  {search.data.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
                      <span className="flex-1 truncate">{h.providerDisplayName}</span>
                      <Button
                        size="sm"
                        icon={<UserPlus className="size-3.5" />}
                        disabled={reviewers.some((r) => r.id === h.id)}
                        onClick={() => setReviewers((rs) => [...rs, h])}
                      >
                        Adicionar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {reviewers.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{r.providerDisplayName}</span>
                  <label className="flex items-center gap-1 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={requiredIds.includes(r.id)}
                      onChange={(e) => setRequiredIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))}
                      className="accent-[var(--color-accent)]"
                    />
                    obrigatório
                  </label>
                  <button type="button" className="text-muted hover:text-fg" onClick={() => setReviewers((rs) => rs.filter((x) => x.id !== r.id))} title="Remover">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Prévia">
            {!valid ? (
              <div className="p-3 text-muted">Escolha origem e destino diferentes para ver a prévia.</div>
            ) : preview.isLoading ? (
              <Loading label="Calculando prévia…" />
            ) : preview.isError ? (
              <ErrorBox error={preview.error} onRetry={() => preview.refetch()} />
            ) : preview.data ? (
              <div className="flex flex-col gap-2 p-3">
                <div className="narrow text-[12px] text-muted">
                  <span className="text-done-ink">+{preview.data.diff.aheadCount} à frente</span> ·{' '}
                  <span className="text-fail-ink">−{preview.data.diff.behindCount} atrás</span> · {preview.data.diff.changes.length} arquivos
                </div>
                <ul className="max-h-72 overflow-auto rounded-sm border border-border">
                  {preview.data.diff.changes.length === 0 && <Empty title="Nenhuma diferença" />}
                  {preview.data.diff.changes.map((c) => (
                    <li key={c.item.path} className="flex items-center gap-2 border-b border-border px-3 py-1 last:border-b-0">
                      <span className={cx('narrow w-4 text-[12px] font-bold', c.changeType.includes('add') ? 'text-done-ink' : c.changeType.includes('delete') ? 'text-fail-ink' : 'text-progress-ink')}>
                        {c.changeType.includes('add') ? 'A' : c.changeType.includes('delete') ? 'D' : 'M'}
                      </span>
                      <span className="truncate font-mono text-[12px]">{c.item.path}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[12px] text-muted">
                  Commits: {preview.data.commits.length} · <Code>{source}</Code> → <Code>{target}</Code>
                </div>
              </div>
            ) : null}
          </Section>
          {err && <div className="text-[12px] text-fail-ink">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => navigate(`${base}/pullrequests/${seg(repo.name)}`)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!valid || !title.trim()}
              onClick={() => {
                setErr(null)
                create.mutate(undefined, {
                  onSuccess: (data) => navigate(`${base}/pullrequest/${seg(repo.name)}/${data.pullRequestId}`),
                  onError: (e) => setErr(e instanceof Error ? e.message : String(e))
                })
              }}
            >
              Criar pull request
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
