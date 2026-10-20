// Rail direito da PR: políticas e checks, revisores (votar, adicionar, remover), work items,
// labels e opções de conclusão com as ações de estado (concluir, auto-complete, abandonar, rascunho).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCheck, Check, Clock, Circle, RotateCcw, UserPlus, UserMinus, X } from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Section, Select, Textarea, ZoneStripe } from '@/components/ui'
import { ado, adoList } from '@/lib/api'
import { isMe, useMe } from '@/lib/context'
import { voteLabel, voteZone, type Zone } from '@/lib/zones'
import { repoKey, shortRef, useRepoMutation, type GitPullRequest, type PrReviewer } from './repoApi'
import {
  MERGE_OPTIONS,
  VOTES,
  concludeBlockReason,
  patchPrReq,
  policyZone,
  prPath,
  putReviewerReq,
  statusZone,
  usePrPolicies,
  usePrStatuses,
  usePrWorkItems,
  wiZone
} from './prData'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function PrRail({ org, project, pr }: { org: string; project: string; pr: GitPullRequest }) {
  return (
    <aside className="scroll flex w-[360px] shrink-0 flex-col gap-4 overflow-auto p-4">
      <ChecksSection org={org} project={project} pr={pr} />
      <ReviewersSection org={org} project={project} pr={pr} />
      <WorkItemsSection org={org} project={project} pr={pr} />
      {pr.labels && pr.labels.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5 p-3">
            {pr.labels.filter((l) => l.active).map((l) => (
              <Badge key={l.id}>{l.name}</Badge>
            ))}
          </div>
        </Section>
      )}
      <div id="pr-completion">
        <CompletionSection org={org} project={project} pr={pr} />
      </div>
    </aside>
  )
}

function ChecksSection({ org, project, pr }: { org: string; project: string; pr: GitPullRequest }) {
  const policies = usePrPolicies(org, project, pr)
  const statuses = usePrStatuses(org, project, pr.repository.name, String(pr.pullRequestId))
  // Com a query de políticas em erro não há o que contar: mostra só o erro (sem "0/0" nem "Nenhuma política").
  if (policies.isError) {
    return (
      <Section title="Políticas e checks">
        <ErrorBox className="!mx-2 !my-2" error={policies.error} onRetry={() => policies.refetch()} />
      </Section>
    )
  }
  const items = [
    ...(policies.data ?? [])
      .filter((p) => p.status !== 'notApplicable' && p.configuration.isEnabled)
      .map((p) => ({ key: p.evaluationId, title: p.configuration.type.displayName, sub: policySub(p.status, p.configuration.isBlocking), zone: policyZone(p.status) })),
    ...(statuses.data ?? []).map((s) => ({
      key: `s${s.id}`,
      title: s.context?.name ?? 'Status',
      sub: s.description ?? s.state,
      zone: statusZone(s.state)
    }))
  ]
  const done = items.filter((i) => i.zone === 'done').length
  const hasData = !!policies.data && !!statuses.data
  return (
    <Section title="Políticas e checks" actions={hasData ? <span className="narrow font-bold">{done}/{items.length}</span> : undefined}>
      {(policies.isLoading || statuses.isLoading) && <Loading label="Carregando checks…" />}
      {statuses.isError && <ErrorBox className="!mx-2 !my-2" error={statuses.error} onRetry={() => statuses.refetch()} />}
      {hasData && items.length === 0 && (
        <div className="px-3 py-2 text-[12px] text-muted">Nenhuma política ou check para este PR.</div>
      )}
      {items.map((i) => (
        <div key={i.key} className="flex border-b border-border last:border-b-0">
          <ZoneStripe zone={i.zone} />
          <div className="min-w-0 px-3 py-1.5">
            <div className="truncate font-medium">{i.title}</div>
            <div className="truncate text-[12px] text-muted">{i.sub}</div>
          </div>
        </div>
      ))}
    </Section>
  )
}

function policySub(status: string, blocking: boolean) {
  const map: Record<string, string> = { approved: 'Aprovado', rejected: 'Rejeitado', running: 'Em execução', queued: 'Na fila', broken: 'Com erro' }
  return `${map[status] ?? status}${blocking ? ' · obrigatório' : ''}`
}

/** Voto do usuário atual na PR (PUT reviewers/{meu id}). Usado no rail e no botão Aprovar do cabeçalho. */
export function useVoteMutation(org: string, project: string, pr: GitPullRequest) {
  const me = useMe(org)
  const repo = pr.repository.name
  return useRepoMutation(org, project, (v: number) => {
    if (!me.data) throw new Error('Usuário não identificado.')
    return ado({ org, ...putReviewerReq(project, repo, pr.pullRequestId, me.data.id, { vote: v }) })
  })
}

function ReviewersSection({ org, project, pr }: { org: string; project: string; pr: GitPullRequest }) {
  const me = useMe(org)
  const [adding, setAdding] = useState(false)
  const repo = pr.repository.name
  const myReviewer = pr.reviewers.find((r) => isMe(me.data, r))
  const remove = useRepoMutation(org, project, (id: string) =>
    ado({ org, method: 'DELETE', path: `${prPath(project, repo, pr.pullRequestId)}/reviewers/${id}` })
  )
  const vote = useVoteMutation(org, project, pr)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Section
      title="Revisores"
      actions={
        <Button size="sm" variant="ghost" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>
          Adicionar
        </Button>
      }
    >
      {pr.reviewers.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">Sem revisores.</div>}
      {pr.reviewers.map((r) => (
        <ReviewerRow key={r.id} r={r} mine={isMe(me.data, r)} onRemove={() => remove.mutate(r.id, { onError: (e) => setErr(errMsg(e)) })} />
      ))}
      {myReviewer && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
          {VOTES.map((v) => (
            <Button
              key={v.value}
              size="sm"
              variant={myReviewer.vote === v.value ? 'primary' : 'default'}
              loading={vote.isPending && vote.variables === v.value}
              onClick={() => vote.mutate(v.value, { onError: (e) => setErr(errMsg(e)) })}
            >
              {v.label}
            </Button>
          ))}
        </div>
      )}
      {err && <div className="border-t border-border px-3 py-1.5 text-[12px] text-fail-ink">{err}</div>}
      <AddReviewerModal open={adding} onClose={() => setAdding(false)} org={org} project={project} pr={pr} />
    </Section>
  )
}

function ReviewerRow({ r, mine, onRemove }: { r: PrReviewer; mine: boolean; onRemove: () => void }) {
  const z: Zone = voteZone(r.vote)
  return (
    <div className="flex items-center border-b border-border last:border-b-0">
      <ZoneStripe zone={z} mine={mine} />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
        <span className="truncate font-medium">{r.displayName}</span>
        {r.isRequired && <Badge>obrigatório</Badge>}
      </div>
      <span className="flex items-center gap-1 px-3 text-[12px] text-muted whitespace-nowrap">
        {r.vote === 10 ? <Check className="size-3.5" /> : r.vote === 5 ? <CheckCheck className="size-3.5" /> : r.vote === -5 ? <Clock className="size-3.5" /> : r.vote === -10 ? <X className="size-3.5" /> : <Circle className="size-3.5" />}
        {voteLabel(r.vote)}
      </span>
      <button type="button" title="Remover revisor" className="px-2 text-muted hover:text-fg" onClick={onRemove}>
        <UserMinus className="size-3.5" />
      </button>
    </div>
  )
}

interface IdentityHit {
  id: string
  providerDisplayName: string
  properties?: { Account?: { $value?: string } }
}

/** Busca identidades no vssps e adiciona como revisor (obrigatório ou opcional). */
function AddReviewerModal({ open, onClose, org, project, pr }: { open: boolean; onClose: () => void; org: string; project: string; pr: GitPullRequest }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [required, setRequired] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const repo = pr.repository.name
  const hits = useQuery({
    queryKey: repoKey(org, project, 'identities', term),
    enabled: open && term.length >= 2,
    queryFn: () =>
      adoList<IdentityHit>({ org, host: 'vssps', path: '_apis/identities', query: { searchFilter: 'General', filterValue: term, queryMembership: 'None' } })
  })
  const add = useRepoMutation(org, project, (id: string) =>
    ado({ org, ...putReviewerReq(project, repo, pr.pullRequestId, id, { id, isRequired: required, vote: 0 }) })
  )
  return (
    <Modal open={open} onClose={onClose} title="Adicionar revisor" footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Pessoa">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setTerm(q.trim())} placeholder="Nome ou e-mail (Enter para buscar)" autoFocus />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-[var(--color-accent)]" />
          Revisor obrigatório
        </label>
        {hits.isLoading && <Loading label="Buscando…" />}
        {hits.isError && <ErrorBox error={hits.error} />}
        {hits.data && hits.data.length === 0 && <Empty title="Ninguém encontrado" />}
        <ul className="max-h-64 overflow-auto rounded-sm border border-border">
          {hits.data?.map((h) => (
            <li key={h.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
              <span className="flex-1 truncate">{h.providerDisplayName}</span>
              <Button
                size="sm"
                disabled={add.isPending}
                onClick={() => add.mutate(h.id, { onSuccess: onClose, onError: (e) => setErr(errMsg(e)) })}
              >
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      </div>
    </Modal>
  )
}

function WorkItemsSection({ org, project, pr }: { org: string; project: string; pr: GitPullRequest }) {
  const wis = usePrWorkItems(org, project, pr.repository.name, String(pr.pullRequestId))
  return (
    <Section title="Work items">
      {wis.isLoading && <Loading label="Carregando work items…" />}
      {wis.isError && <ErrorBox error={wis.error} onRetry={() => wis.refetch()} />}
      {wis.data && wis.data.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">Nenhum work item vinculado.</div>}
      {wis.data?.map((w) => (
        <div key={w.id} className="flex items-center border-b border-border last:border-b-0">
          <ZoneStripe zone={wiZone(w)} />
          <span className="narrow w-14 shrink-0 pr-2 text-right font-semibold">#{w.id}</span>
          <span className="min-w-0 flex-1 truncate px-2 py-1.5">{String(w.fields['System.Title'] ?? '')}</span>
        </div>
      ))}
    </Section>
  )
}

function CompletionSection({ org, project, pr }: { org: string; project: string; pr: GitPullRequest }) {
  const me = useMe(org)
  const repo = pr.repository.name
  const id = pr.pullRequestId
  const active = pr.status === 'active'
  const [strategy, setStrategy] = useState(pr.completionOptions?.mergeStrategy ?? 'squash')
  const [deleteBranch, setDeleteBranch] = useState(pr.completionOptions?.deleteSourceBranch ?? true)
  const [transition, setTransition] = useState(pr.completionOptions?.transitionWorkItems ?? true)
  const [message, setMessage] = useState(`Merge pull request ${id} de ${shortRef(pr.sourceRefName)} em ${shortRef(pr.targetRefName)}: ${pr.title}`)
  const [err, setErr] = useState<string | null>(null)
  const completion = { mergeStrategy: strategy, deleteSourceBranch: deleteBranch, transitionWorkItems: transition, mergeCommitMessage: message }
  const blocked = pr.mergeStatus === 'conflicts' || pr.mergeStatus === 'failure' || pr.isDraft
  const policies = usePrPolicies(org, project, pr)
  const concludeBlock = concludeBlockReason(pr, policies.data)

  const act = useRepoMutation(org, project, (body: Record<string, unknown>) => ado({ org, ...patchPrReq(project, repo, id, body) }))
  const run = (body: Record<string, unknown>) => {
    setErr(null)
    act.mutate(body, { onError: (e) => setErr(errMsg(e)) })
  }

  return (
    <Section title="Opções de conclusão">
      <div className="flex flex-col gap-2.5 p-3">
        <Field label="Mesclagem">
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={!active}>
            {MERGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} className="accent-[var(--color-accent)]" disabled={!active} />
          Excluir branch de origem
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={transition} onChange={(e) => setTransition(e.target.checked)} className="accent-[var(--color-accent)]" disabled={!active} />
          Concluir work items vinculados
        </label>
        <Field label="Mensagem do merge">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={!active} />
        </Field>
        {pr.mergeStatus === 'conflicts' && <div className="text-[12px] text-fail-ink">Há conflitos: resolva antes de concluir.</div>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-2">
          <Button
            variant="success"
            disabled={concludeBlock !== null}
            title={concludeBlock ?? undefined}
            loading={act.isPending}
            onClick={() => run({ status: 'completed', lastMergeSourceCommit: pr.lastMergeSourceCommit, completionOptions: completion })}
          >
            <Check className="size-3.5" /> Concluir
          </Button>
          <Button
            disabled={!active || blocked}
            onClick={() => run({ autoCompleteSetBy: { id: me.data?.id }, completionOptions: completion })}
          >
            Definir auto-complete
          </Button>
          {active && (
            <Button variant="danger" onClick={() => run({ status: 'abandoned' })}>
              <Ban className="size-3.5" /> Abandonar
            </Button>
          )}
          {!active && pr.status === 'abandoned' && (
            <Button icon={<RotateCcw className="size-3.5" />} onClick={() => run({ status: 'active' })}>
              Reativar
            </Button>
          )}
          {active && (
            <Button onClick={() => run({ isDraft: !pr.isDraft })}>{pr.isDraft ? 'Publicar rascunho' : 'Marcar como rascunho'}</Button>
          )}
        </div>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
        {pr.autoCompleteSetBy && <div className="text-[12px] text-muted">Auto-complete definido por {pr.autoCompleteSetBy.displayName}.</div>}
      </div>
    </Section>
  )
}
