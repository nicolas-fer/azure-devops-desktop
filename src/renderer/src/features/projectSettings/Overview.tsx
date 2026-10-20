import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import { ado, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, Button, Code, ErrorBox, ExternalButton, Field, Input, Loading, PageHeader, Section, Textarea } from '@/components/ui'
import { ConfirmTyped, errMsg, useProjectDetail } from './shared'
import type { ProjectDetail as Detail } from './shared'

export function Overview() {
  const { org, project } = useScope()
  const detail = useProjectDetail(org, project)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const del = useMutation({
    mutationFn: (id: string) => ado({ org, method: 'DELETE', path: `_apis/projects/${seg(id)}` }),
    onSuccess: () => {
      try {
        const last = JSON.parse(localStorage.getItem('devops-desktop:last') ?? '{}') as { project?: string }
        if (last.project && decodeURIComponent(last.project) === project) localStorage.removeItem('devops-desktop:last')
      } catch {
        // ignora
      }
      qc.invalidateQueries({ queryKey: [org, 'projects'] })
      navigate(`/${org}/_home`, { replace: true })
    },
    onError: (e) => setDeleteError(errMsg(e))
  })

  return (
    <>
      <PageHeader
        title="Visão geral"
        breadcrumb={<span>Configurações do projeto · {project}</span>}
        actions={<ExternalButton url={webUrl(org, `${seg(project)}/_settings/projects`)} />}
      />
      <div className="flex flex-col gap-6 p-6">
        {detail.isLoading && <Loading />}
        {detail.isError && <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />}
        {detail.data && (
          <>
            <Section title="Dados do projeto">
              <OverviewForm key={`${detail.data.id}-${detail.data.revision}`} p={detail.data} org={org} />
            </Section>

            <Section title="Configuração">
              <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 p-3 text-sm">
                <dt className="text-muted">Visibilidade</dt>
                <dd>
                  <Badge>{detail.data.visibility === 'public' ? 'Público' : 'Privado'}</Badge>
                </dd>
                <dt className="text-muted">Processo</dt>
                <dd>{detail.data.capabilities?.processTemplate?.templateName ?? '—'}</dd>
                <dt className="text-muted">Controle de versão</dt>
                <dd>{detail.data.capabilities?.versioncontrol?.sourceControlType ?? '—'}</dd>
                <dt className="text-muted">Time padrão</dt>
                <dd>{detail.data.defaultTeam?.name ?? '—'}</dd>
                <dt className="text-muted">ID do projeto</dt>
                <dd>
                  <Code>{detail.data.id}</Code>
                </dd>
                <dt className="text-muted">Serviços habilitados</dt>
                <dd className="text-muted">Não exposto pela API pública; ajuste no portal do Azure DevOps.</dd>
              </dl>
            </Section>

            <Section title="Zona de perigo">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex-1 text-sm">
                  <div className="font-semibold">Excluir projeto</div>
                  <div className="text-muted">Remove o projeto, seus repositórios, quadros e pipelines. Não pode ser desfeito.</div>
                </div>
                <Button
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => {
                    setDeleteError(null)
                    setConfirmDelete(true)
                  }}
                >
                  Excluir projeto
                </Button>
              </div>
            </Section>
          </>
        )}
      </div>

      {confirmDelete && detail.data && (
        <ConfirmTyped
          open
          title="Excluir projeto"
          expected={project}
          confirmLabel="Excluir projeto"
          busy={del.isPending}
          error={deleteError}
          onConfirm={() => del.mutate(detail.data!.id)}
          onClose={() => setConfirmDelete(false)}
        >
          Esta ação exclui <b>{project}</b> e todo o seu conteúdo.
        </ConfirmTyped>
      )}
    </>
  )
}

/** Nome e descrição editáveis (PATCH _apis/projects/{id}). Montado com key por revisão. */
function OverviewForm({ p, org }: { p: Detail; org: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(p.name)
  const [description, setDescription] = useState(p.description ?? '')
  const [saved, setSaved] = useState(false)
  const dirty = name.trim() !== p.name || description !== (p.description ?? '')

  const save = useMutation({
    mutationFn: () =>
      ado<Detail>({
        org,
        method: 'PATCH',
        path: `_apis/projects/${seg(p.id)}`,
        body: { name: name.trim(), description }
      }),
    onSuccess: (updated) => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: [org, 'projects'] })
      qc.invalidateQueries({ queryKey: ['ps', org] })
      qc.invalidateQueries({ queryKey: [org, 'project'] })
      if (updated.name !== p.name) navigate(`/${org}/${seg(updated.name)}/_settings/overview`, { replace: true })
    }
  })

  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && name.trim()) save.mutate()
      }}
    >
      <Field label="Nome">
        <Input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} maxLength={64} />
      </Field>
      <Field label="Descrição">
        <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false) }} rows={3} />
      </Field>
      {save.isError && <ErrorBox error={save.error} className="mx-0 my-0" />}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={!dirty || !name.trim()}>
          Salvar alterações
        </Button>
        {saved && !dirty && <span className="text-sm text-done-ink">Alterações salvas.</span>}
      </div>
    </form>
  )
}
