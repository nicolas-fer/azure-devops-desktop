// Editar YAML (rota edit/:definitionId): carrega o arquivo do repositório, prévia com a API e salva por commit (push).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Save, Undo2 } from 'lucide-react'
import { Button, Empty, ErrorBox, Input, Loading, PageHeader, Section, Select, Toolbar, Field } from '@/components/ui'
import { CodeEditor } from '@/components/CodeEditor'
import { ado, adoList, seg, type ListResponse } from '@/lib/api'
import { useScope } from '@/lib/context'
import { InlineNote } from './common'
import { errorText } from './errors'
import { ZERO_SHA, folderLabel, pipelinesBase, shortRef } from './lib'
import { useDefinition, useRepoFile, useRepoRefs } from './queries'
import type { GitRef } from './types'

export function EditYaml() {
  const { definitionId } = useParams()
  const id = Number(definitionId)
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const def = useDefinition(org, project, id)
  const repoId = def.data?.repository?.id
  const yamlFile = def.data?.process?.yamlFilename
  const heads = useRepoRefs(org, project, repoId, 'heads')

  const [branch, setBranch] = useState<string>('')
  const [newBranch, setNewBranch] = useState('')
  const [message, setMessage] = useState('Atualiza pipeline YAML pelo DevOps Desktop')
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!branch && def.data) setBranch(shortRef(def.data.repository?.defaultBranch) || 'main')
  }, [def.data, branch])

  const file = useRepoFile(org, project, repoId, branch || undefined, yamlFile)
  useEffect(() => {
    if (file.data !== undefined) {
      setText(file.data)
      setOriginal(file.data)
      setPreview(null)
    }
  }, [file.data])

  const dirty = text !== original

  const runPreview = useMutation({
    mutationFn: () =>
      ado<{ finalYaml?: string }>({
        org,
        path: `${seg(project)}/_apis/pipelines/${id}/preview`,
        method: 'POST',
        body: { previewRun: true, yamlOverride: text, resources: { repositories: { self: { refName: `refs/heads/${branch}` } } } },
        apiVersion: '7.1-preview.1'
      }),
    onSuccess: (r) => setPreview(r.finalYaml ?? '')
  })

  const save = useMutation({
    mutationFn: async () => {
      const repo = repoId!
      let target = branch
      if (newBranch.trim()) {
        const src = (heads.data ?? []).find((r) => r.name === `refs/heads/${branch}`)
        if (!src) throw new Error(`Branch de origem ${branch} não encontrada`)
        // Cria a branch nova apontando para o commit atual da origem.
        await ado({
          org,
          path: `${seg(project)}/_apis/git/repositories/${repo}/refs`,
          method: 'POST',
          body: [{ name: `refs/heads/${newBranch.trim()}`, oldObjectId: ZERO_SHA, newObjectId: src.objectId }]
        })
        target = newBranch.trim()
      }
      const found = await adoList<GitRef>({
        org,
        path: `${seg(project)}/_apis/git/repositories/${repo}/refs`,
        query: { filter: `heads/${target}` }
      })
      const ref = found.find((r) => r.name === `refs/heads/${target}`)
      if (!ref) throw new Error(`Branch ${target} não encontrada`)
      await ado({
        org,
        path: `${seg(project)}/_apis/git/repositories/${repo}/pushes`,
        method: 'POST',
        body: {
          refUpdates: [{ name: `refs/heads/${target}`, oldObjectId: ref.objectId }],
          commits: [
            {
              comment: message.trim() || 'Atualiza pipeline YAML',
              changes: [{ changeType: 'edit', item: { path: `/${yamlFile}` }, newContent: { content: text, contentType: 'rawtext' } }]
            }
          ]
        }
      })
      return target
    },
    onSuccess: (target) => {
      setNote({ kind: 'ok', text: `Commit feito na branch ${target}.` })
      setNewBranch('')
      if (target !== branch) setBranch(target)
      setOriginal(text)
      qc.invalidateQueries({ queryKey: [org, project, 'pipelines', 'file'] })
      qc.invalidateQueries({ queryKey: [org, project, 'pipelines', 'refs'] })
    },
    onError: (e) => setNote({ kind: 'err', text: errorText(e) })
  })

  if (def.isLoading) return <Loading label="Carregando pipeline…" />
  if (def.isError) return <ErrorBox error={def.error} onRetry={() => def.refetch()} />
  if (def.data && !yamlFile) {
    return (
      <>
        <PageHeader title="Editar YAML" breadcrumb={<Link to={base}>Pipelines</Link>} />
        <Empty title="Este pipeline é clássico e não tem arquivo YAML">
          Edite-o pelo portal do Azure DevOps, ou crie um pipeline YAML para usar esta tela.
        </Empty>
      </>
    )
  }

  const branchOptions = (heads.data ?? []).map((r: GitRef) => shortRef(r.name))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Editar YAML"
        subtitle={yamlFile}
        breadcrumb={
          <>
            <Link className="hover:text-fg" to={base}>Pipelines</Link>
            {folderLabel(def.data?.path) && (
              <>
                <span>/</span>
                <span>{folderLabel(def.data?.path)}</span>
              </>
            )}
            <span>/</span>
            <Link className="hover:text-fg" to={`${base}/list/${id}`}>{def.data?.name}</Link>
          </>
        }
        actions={
          <>
            <Button icon={<Eye className="size-3.5" />} loading={runPreview.isPending} disabled={!file.data && !text} onClick={() => runPreview.mutate()}>
              Prévia
            </Button>
            <Button variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={!dirty} onClick={() => setText(original)}>
              Descartar
            </Button>
            <Button variant="primary" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={!dirty || !repoId} onClick={() => save.mutate()}>
              Salvar (commit)
            </Button>
          </>
        }
      />

      <Toolbar className="bg-bg">
        <Field label="Branch">
          <Select className="w-48" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={heads.isLoading}>
            {!branchOptions.includes(branch) && branch && <option value={branch}>{branch}</option>}
            {branchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nova branch (opcional)">
          <Input className="w-56" placeholder="feature/ajuste-yaml" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
        </Field>
        <Field label="Mensagem do commit">
          <Input className="w-96" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {dirty && <span className="text-[12px] font-semibold text-progress-ink">Alterações não salvas</span>}
      </Toolbar>

      {note && (
        <div className="px-6 pt-3">
          <InlineNote kind={note.kind}>{note.text}</InlineNote>
        </div>
      )}
      {runPreview.isError && (
        <div className="px-6 pt-3">
          <ErrorBox error={runPreview.error} />
        </div>
      )}

      <div className="flex min-h-[480px] flex-1 gap-0">
        <div className="min-w-0 flex-1 border-r border-border">
          {file.isLoading && <Loading label={`Carregando ${yamlFile}…`} />}
          {file.isError && (
            <div className="p-6">
              <ErrorBox error={`Não foi possível ler ${yamlFile} na branch ${branch}: ${errorText(file.error)}`} onRetry={() => file.refetch()} />
            </div>
          )}
          {file.data !== undefined && (
            <div className="h-full min-h-[480px]">
              <CodeEditor value={text} onChange={setText} language="yaml" height="100%" />
            </div>
          )}
        </div>
        {preview !== null && (
          <aside className="flex w-[420px] shrink-0 flex-col bg-surface">
            <Section title="YAML final (prévia)" className="m-3 flex-1 border-0" actions={<Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Fechar</Button>}>
              <div className="h-[calc(100%-32px)] min-h-[440px]">
                <CodeEditor value={preview} readOnly language="yaml" height="100%" />
              </div>
            </Section>
          </aside>
        )}
      </div>
    </div>
  )
}
