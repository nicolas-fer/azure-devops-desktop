// Dados e operações de pull request: leitura (PR, threads, iterações, mudanças, políticas, statuses,
// work items) e escritas (PATCH da PR, votos, revisores, threads e comentários).
import { useQuery } from '@tanstack/react-query'
import { ado, adoList, seg, type AdoRequestInit } from '@/lib/api'
import { prZone, voteZone, workItemZone, type Zone } from '@/lib/zones'
import {
  repoKey,
  repoPath,
  type GitChange,
  type GitCommit,
  type GitPullRequest,
  type GitStatus,
  type PrIteration,
  type PrPolicyEvaluation,
  type PrThread,
  type PrWorkItemRef,
  type WorkItemMini
} from './repoApi'

export type ThreadStatusKey = 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending'

export const THREAD_STATUS: { key: ThreadStatusKey; label: string; code: number }[] = [
  { key: 'active', label: 'Ativo', code: 1 },
  { key: 'fixed', label: 'Resolvido', code: 2 },
  { key: 'wontFix', label: "Won't fix", code: 3 },
  { key: 'closed', label: 'Closed', code: 4 },
  { key: 'byDesign', label: 'Por design', code: 5 },
  { key: 'pending', label: 'Pendente', code: 6 }
]

const STATUS_NAMES: ThreadStatusKey[] = ['active', 'active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending']

/** Status da thread como chave (a API devolve número ou texto dependendo da versão). */
export function threadStatusKey(s?: string | number | null): ThreadStatusKey {
  if (typeof s === 'number') return STATUS_NAMES[s] ?? 'active'
  const found = THREAD_STATUS.find((t) => t.key === s?.toLowerCase())
  return found?.key ?? 'active'
}

export const threadStatusLabel = (s?: string | number | null) => THREAD_STATUS.find((t) => t.key === threadStatusKey(s))!.label

/** Zona de uma thread: ativa = em andamento, resolvida = concluída, won't fix = cinza. */
export function threadZone(s?: string | number | null): Zone {
  const k = threadStatusKey(s)
  if (k === 'active' || k === 'pending') return 'progress'
  if (k === 'wontFix') return 'idle'
  return 'done'
}

export const policyZone = (status?: string): Zone => {
  switch (status) {
    case 'approved':
      return 'done'
    case 'rejected':
    case 'broken':
      return 'fail'
    case 'running':
    case 'queued':
      return 'progress'
    default:
      return 'idle'
  }
}

export const statusZone = (state?: string): Zone => {
  if (state === 'succeeded') return 'done'
  if (state === 'failure' || state === 'error') return 'fail'
  if (state === 'pending') return 'progress'
  return 'idle'
}

export const prPath = (project: string, repo: string, id: number | string) => `${repoPath(project, repo)}/pullrequests/${id}`

/** Opções de conclusão como valores da API (mergeStrategy). */
export const MERGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'squash', label: 'Squash commit' },
  { value: 'noFastForward', label: 'Merge (sem fast-forward)' },
  { value: 'rebase', label: 'Rebase e fast-forward' },
  { value: 'rebaseMerge', label: 'Rebase e merge' }
]

export const VOTES = [
  { value: 10, label: 'Aprovar', icon: 'check' },
  { value: 5, label: 'Aprovar com sugestões', icon: 'check-check' },
  { value: -5, label: 'Aguardar autor', icon: 'clock' },
  { value: -10, label: 'Rejeitar', icon: 'x' },
  { value: 0, label: 'Redefinir voto', icon: 'rotate-ccw' }
] as const

export function usePullRequest(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: () => ado<GitPullRequest>({ org, path: prPath(project, repo, id) })
  })
}

export function usePrThreads(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-threads', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: () => adoList<PrThread>({ org, path: `${prPath(project, repo, id)}/threads` }).then((l) => l.filter((t) => !t.isDeleted))
  })
}

export function usePrIterations(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-iterations', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: () => adoList<PrIteration>({ org, path: `${prPath(project, repo, id)}/iterations` })
  })
}

/** Mudanças de uma iteração; com compareTo, compara duas iterações. */
export function usePrChanges(org: string, project: string, repo: string, id: string, iteration: number | null, compareTo?: number | null) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-changes', repo, id, iteration, compareTo ?? null),
    enabled: !!iteration,
    queryFn: () =>
      ado<{ changeEntries: GitChange[] }>({
        org,
        path: `${prPath(project, repo, id)}/iterations/${iteration}/changes`,
        query: { $top: 2000, $compareTo: compareTo ?? undefined }
      })
  })
}

export function usePrCommits(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-commits', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: () => adoList<GitCommit>({ org, path: `${prPath(project, repo, id)}/commits`, query: { $top: 500 } })
  })
}

export function usePrStatuses(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-statuses', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: () => adoList<GitStatus>({ org, path: `${prPath(project, repo, id)}/statuses` })
  })
}

/** Avaliações de política do PR (artifactId de CodeReview). */
export function usePrPolicies(org: string, project: string, pr: GitPullRequest | undefined) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-policies', pr?.pullRequestId ?? 0),
    enabled: !!pr,
    queryFn: () =>
      adoList<PrPolicyEvaluation>({
        org,
        path: `${seg(project)}/_apis/policy/evaluations`,
        query: { artifactId: `vstfs:///CodeReview/CodeReviewId/${pr!.repository.project.id}/${pr!.codeReviewId ?? pr!.pullRequestId}` },
        // Policy evaluations só existe em preview
        apiVersion: '7.1-preview.1'
      })
  })
}

/**
 * Motivo principal que impede a conclusão da PR (null = pode concluir). Espelha o que o ADO bloqueia:
 * PR não ativa, rascunho, conflito/falha de merge, revisor obrigatório sem voto de aprovação (< 5),
 * política bloqueante ainda não aprovada e falta de commit de merge.
 */
export function concludeBlockReason(pr: GitPullRequest, policies: PrPolicyEvaluation[] = []): string | null {
  if (pr.status !== 'active') return 'Esta pull request não está ativa.'
  if (pr.isDraft) return 'Publique o rascunho antes de concluir.'
  if (pr.mergeStatus === 'conflicts') return 'Há conflitos com a branch de destino: resolva antes de concluir.'
  if (pr.mergeStatus === 'failure') return 'O Azure DevOps não conseguiu calcular o merge.'
  const required = pr.reviewers.find((r) => r.isRequired && r.vote < 5)
  if (required) {
    return required.vote <= -10
      ? `Voto de rejeição de ${required.displayName} (obrigatório)`
      : `Aguardando voto de ${required.displayName} (obrigatório)`
  }
  const blockers = policies.filter(
    (x) => x.configuration.isEnabled && x.configuration.isBlocking && x.status !== 'approved' && x.status !== 'notApplicable'
  )
  if (blockers.length > 0) {
    const first = blockers[0]!.configuration.type.displayName
    return `Política obrigatória pendente: ${first}${blockers.length > 1 ? ` (+${blockers.length - 1})` : ''}.`
  }
  if (!pr.lastMergeSourceCommit) return 'Sem commit de merge disponível.'
  return null
}

/** Work items vinculados ao PR, com título e estado. */
export function usePrWorkItems(org: string, project: string, repo: string, id: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'pr-workitems', repo, id),
    enabled: !!org && !!project && !!repo && !!id,
    queryFn: async () => {
      const refs = await adoList<PrWorkItemRef>({ org, path: `${prPath(project, repo, id)}/workitems` })
      const ids = refs.map((r) => Number(r.id)).filter((n) => !isNaN(n))
      if (ids.length === 0) return [] as WorkItemMini[]
      const d = await ado<{ value: WorkItemMini[] }>({
        org,
        path: '_apis/wit/workitems',
        query: { ids: ids.join(','), fields: 'System.Title,System.State,System.WorkItemType' }
      })
      return d.value ?? []
    }
  })
}

export const wiZone = (w: WorkItemMini): Zone => workItemZone(undefined, String(w.fields['System.State'] ?? ''))
export const prStateZone = (p: GitPullRequest): Zone => prZone(p.status, p.isDraft, p.mergeStatus)
export const reviewerZone = (vote: number): Zone => voteZone(vote)

/** Escrita: PATCH no PR (status, isDraft, título, completionOptions, autoCompleteSetBy). */
export function patchPrReq(project: string, repo: string, id: number, body: Record<string, unknown>): AdoRequestInit {
  return { path: prPath(project, repo, id), method: 'PATCH', body }
}

/** Escrita: voto ou adição de revisor (PUT reviewers/{id}). */
export function putReviewerReq(project: string, repo: string, id: number, reviewerId: string, body: Record<string, unknown>): AdoRequestInit {
  return { path: `${prPath(project, repo, id)}/reviewers/${reviewerId}`, method: 'PUT', body }
}
