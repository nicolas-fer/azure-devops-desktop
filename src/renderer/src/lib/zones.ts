// Faixas de zona: o gesto assinatura do design system.
// Todo estado do Azure DevOps é mapeado para uma das zonas abaixo.

/** review = em revisão/teste (Code Review, Ready For Testing…), separado de progress (em andamento). */
export type Zone = 'done' | 'progress' | 'review' | 'fail' | 'new' | 'idle'

/** Cor de preenchimento da zona (faixa de 4px, quadradinho 8px). */
export const zoneBg: Record<Zone, string> = {
  done: 'bg-zone-done',
  progress: 'bg-zone-progress',
  review: 'bg-zone-review',
  fail: 'bg-zone-fail',
  new: 'bg-zone-new',
  idle: 'bg-zone-idle'
}

/** Cor de texto com contraste AA para rótulos de estado. */
export const zoneInk: Record<Zone, string> = {
  done: 'text-done-ink',
  progress: 'text-progress-ink',
  review: 'text-review-ink',
  fail: 'text-fail-ink',
  new: 'text-new-ink',
  idle: 'text-muted'
}

// Estados intermediários com nome próprio (processos customizados costumam ter vários na categoria InProgress)
const REVIEW_RE = /(review|revis|test|qa\b|homolog|valida|aprova|approv)/
const FAIL_RE = /(fail|falh|reprov|rejeit|reject|bloque|blocked|impediment)/

/** Categoria de estado de work item (stateCategory do processo) → zona. */
export function workItemZone(stateCategory?: string, state?: string): Zone {
  const s = (state ?? '').toLowerCase()
  switch (stateCategory) {
    case 'Proposed':
      return 'new'
    case 'Resolved':
      return 'review'
    case 'InProgress':
      if (FAIL_RE.test(s)) return 'fail'
      if (REVIEW_RE.test(s)) return 'review'
      return 'progress'
    case 'Completed':
      return 'done'
    case 'Removed':
      return 'idle'
  }
  // Sem categoria: heurística pelo nome do estado (processos Agile/Scrum/Basic/CMMI em pt e en)
  if (/^(new|novo|to do|a fazer|proposed|proposto)$/.test(s)) return 'new'
  if (/(done|closed|fechado|concluído|completed)/.test(s)) return 'done'
  if (/(removed|removido|cut|cancel)/.test(s)) return 'idle'
  if (/^resolved|resolvido/.test(s)) return 'review'
  if (FAIL_RE.test(s)) return 'fail'
  if (REVIEW_RE.test(s)) return 'review'
  return 'progress'
}

/** Resultado/status de build (pipeline run) → zona. */
export function buildZone(status?: string, result?: string): Zone {
  if (status && status !== 'completed') return status === 'notStarted' ? 'new' : status === 'cancelling' ? 'idle' : 'progress'
  switch (result) {
    case 'succeeded':
      return 'done'
    case 'partiallySucceeded':
      return 'progress'
    case 'failed':
      return 'fail'
    case 'canceled':
      return 'idle'
    default:
      return 'idle'
  }
}

/** Status de pull request → zona. */
export function prZone(status?: string, isDraft?: boolean, mergeStatus?: string): Zone {
  if (status === 'completed') return 'done'
  if (status === 'abandoned') return 'idle'
  if (mergeStatus === 'conflicts' || mergeStatus === 'failure' || mergeStatus === 'rejectedByPolicy') return 'fail'
  if (isDraft) return 'new'
  return 'progress'
}

/** Voto de revisor (10 aprovado, 5 com sugestões, 0 sem voto, -5 aguardando autor, -10 rejeitado) → zona. */
export function voteZone(vote: number): Zone {
  if (vote >= 5) return 'done'
  if (vote === -5) return 'progress'
  if (vote <= -10) return 'fail'
  return 'idle'
}

export const voteLabel = (vote: number) =>
  vote === 10 ? 'Aprovado' : vote === 5 ? 'Aprovado com sugestões' : vote === -5 ? 'Aguardando autor' : vote === -10 ? 'Rejeitado' : 'Sem voto'

/** Status de stage/job/task da timeline de um run, ou de release/environment. */
export function timelineZone(state?: string, result?: string | null): Zone {
  if (state === 'inProgress') return 'progress'
  if (state === 'pending') return 'new'
  return buildZone('completed', result ?? undefined) === 'idle' && result === 'skipped' ? 'idle' : buildZone('completed', result ?? undefined)
}
