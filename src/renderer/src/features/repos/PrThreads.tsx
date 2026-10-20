// Threads de comentário de PR: cartão com status, respostas, edição do próprio comentário,
// trecho de código do contexto e formulário para nova thread (geral ou em linha).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Loading, Markdown, Select, StateLabel, Textarea, TimeAgo, cx } from '@/components/ui'
import { ado } from '@/lib/api'
import { isMe, useMe } from '@/lib/context'
import { repoKey, repoPath, useRepoMutation, type PrThread, type GitPullRequest } from './repoApi'
import { prPath, THREAD_STATUS, threadStatusKey, threadZone } from './prData'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Cartão de thread: status editável, comentários, responder e editar o próprio comentário. */
export function ThreadCard({
  org,
  project,
  pr,
  thread,
  showSnippet = true
}: {
  org: string
  project: string
  pr: GitPullRequest
  thread: PrThread
  showSnippet?: boolean
}) {
  const me = useMe(org)
  const repo = pr.repository.name
  const id = String(pr.pullRequestId)
  const [reply, setReply] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const key = threadStatusKey(thread.status)
  const ctx = thread.threadContext

  const write = useRepoMutation(org, project, (fn: () => Promise<unknown>) => fn())

  const setStatus = (code: number) =>
    write.mutate(() => ado({ org, method: 'PATCH', path: `${prPath(project, repo, id)}/threads/${thread.id}`, body: { status: code } }), {
      onError: (e) => setErr(errMsg(e))
    })

  const sendReply = () =>
    write.mutate(
      () =>
        ado({
          org,
          method: 'POST',
          path: `${prPath(project, repo, id)}/threads/${thread.id}/comments`,
          body: { content: reply.trim(), parentCommentId: thread.comments[0]?.id ?? 0, commentType: 'text' }
        }),
      { onSuccess: () => setReply(''), onError: (e) => setErr(errMsg(e)) }
    )

  const saveEdit = (commentId: number) =>
    write.mutate(
      () =>
        ado({
          org,
          method: 'PATCH',
          path: `${prPath(project, repo, id)}/threads/${thread.id}/comments/${commentId}`,
          body: { content: editText.trim() }
        }),
      { onSuccess: () => setEditId(null), onError: (e) => setErr(errMsg(e)) }
    )

  const comments = thread.comments.filter((c) => !c.isDeleted)
  const line = ctx?.rightFileStart?.line ?? ctx?.leftFileStart?.line

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
        <StateLabel zone={threadZone(thread.status)}>{threadStatusLabel(key)}</StateLabel>
        {ctx && (
          <span className="min-w-0 truncate font-mono text-[12px]">
            {ctx.filePath}
            {line ? <span className="narrow text-muted"> · linha {line}</span> : null}
          </span>
        )}
        <div className="flex-1" />
        <Select aria-label="Status da thread" className="h-6 w-36 text-[12px]" value={key} onChange={(e) => setStatus(THREAD_STATUS.find((t) => t.key === e.target.value)!.code)}>
          {THREAD_STATUS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      {showSnippet && ctx && line && pr.lastMergeSourceCommit && (
        <ThreadSnippet org={org} project={project} repo={repo} path={ctx.filePath} line={line} commitId={pr.lastMergeSourceCommit.commitId} />
      )}
      <div className="flex flex-col">
        {comments.map((c) => {
          const mineComment = isMe(me.data, c.author)
          return (
            <div key={c.id} className="flex gap-2.5 border-b border-border px-3 py-2 last:border-b-0">
              <Avatar identity={c.author} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.author.displayName}</span>
                  <span className="text-[12px] text-muted"><TimeAgo date={c.publishedDate} /></span>
                  <div className="flex-1" />
                  {mineComment && editId !== c.id && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditId(c.id); setEditText(c.content ?? '') }}>
                      Editar
                    </Button>
                  )}
                </div>
                {editId === c.id ? (
                  <div className="mt-1 flex flex-col gap-2">
                    <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setEditId(null)}>Cancelar</Button>
                      <Button size="sm" variant="primary" loading={write.isPending} onClick={() => saveEdit(c.id)}>Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <Markdown>{c.content ?? ''}</Markdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-start gap-2 border-t border-border px-3 py-2">
        <Textarea
          className="min-h-9 flex-1"
          placeholder="Responder…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <Button size="sm" variant="primary" disabled={!reply.trim()} loading={write.isPending} onClick={sendReply}>
          Responder
        </Button>
      </div>
      {err && <div className="border-t border-border px-3 py-1.5 text-[12px] text-fail-ink">{err}</div>}
    </div>
  )
}

const threadStatusLabel = (k: ReturnType<typeof threadStatusKey>) => THREAD_STATUS.find((t) => t.key === k)!.label

/** Trecho do arquivo no commit de origem, com as linhas em volta do comentário. */
export function ThreadSnippet({
  org,
  project,
  repo,
  path,
  line,
  commitId
}: {
  org: string
  project: string
  repo: string
  path: string
  line: number
  commitId: string
}) {
  const q = useQuery({
    queryKey: repoKey(org, project, 'snippet', repo, commitId, path),
    queryFn: async () => {
      const d = await ado<{ content?: string }>({
        org,
        path: `${repoPath(project, repo)}/items`,
        query: { path, includeContent: true, 'versionDescriptor.version': commitId, 'versionDescriptor.versionType': 'commit' }
      })
      return (d.content ?? '').split('\n')
    },
    staleTime: Infinity
  })
  if (q.isLoading) return <Loading label="Carregando trecho…" />
  if (q.isError) return <div className="px-3 py-1.5 text-[12px] text-muted">Trecho indisponível.</div>
  const lines = q.data ?? []
  const from = Math.max(1, line - 2)
  const to = Math.min(lines.length, line + 2)
  return (
    <div className="mono border-b border-border bg-[#FBFCFA] dark:bg-surface-2">
      {lines.slice(from - 1, to).map((text, i) => {
        const n = from + i
        return (
          <div key={n} className={cx('grid grid-cols-[44px_1fr] leading-5', n === line && 'bg-zone-progress/20')}>
            <span className="pr-2 text-right text-muted">{n}</span>
            <span className="whitespace-pre pr-3">{text}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Nova thread: geral (sem contexto) ou em linha de um arquivo (threadContext). */
export function NewThreadForm({
  org,
  project,
  pr,
  filePath,
  line,
  placeholder = 'Escreva um comentário…',
  onDone
}: {
  org: string
  project: string
  pr: GitPullRequest
  filePath?: string
  line?: number
  placeholder?: string
  onDone?: () => void
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const repo = pr.repository.name
  const create = useRepoMutation(org, project, () =>
    ado({
      org,
      method: 'POST',
      path: `${prPath(project, repo, pr.pullRequestId)}/threads`,
      body: {
        comments: [{ parentCommentId: 0, content: text.trim(), commentType: 'text' }],
        status: 1,
        threadContext: filePath && line ? { filePath, rightFileStart: { line, offset: 1 }, rightFileEnd: { line, offset: 1 } } : undefined
      }
    })
  )
  return (
    <div className="flex flex-col gap-2">
      <Textarea placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button size="sm" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          loading={create.isPending}
          disabled={!text.trim()}
          onClick={() =>
            create.mutate(undefined, {
              onSuccess: () => {
                setText('')
                onDone?.()
              },
              onError: (e) => setErr(errMsg(e))
            })
          }
        >
          Comentar
        </Button>
      </div>
    </div>
  )
}
