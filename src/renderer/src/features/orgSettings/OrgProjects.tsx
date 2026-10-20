import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { ado, seg, type Project } from '@/lib/api'
import { useProjects, useScope } from '@/lib/context'
import { Badge, Button, Empty, ErrorBox, IconButton, Loading, PageHeader, Section, Table, TimeAgo } from '@/components/ui'
import { CreateProjectModal } from '@/features/home/CreateProjectModal'
import { ConfirmTyped, errMsg } from '../projectSettings/shared'

/** Projetos da organização: lista, criação (mesmo fluxo da Home) e exclusão com confirmação. */
export function OrgProjects() {
  const { org } = useScope()
  const projects = useProjects(org)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: (p: Project) => ado({ org, method: 'DELETE', path: `_apis/projects/${seg(p.id)}` }),
    onSuccess: () => {
      setToDelete(null)
      setError(null)
      qc.invalidateQueries({ queryKey: [org, 'projects'] })
    },
    onError: (e) => setError(errMsg(e))
  })

  return (
    <>
      <PageHeader
        title="Projetos"
        subtitle={projects.data ? `${projects.data.length} ${projects.data.length === 1 ? 'projeto' : 'projetos'}` : undefined}
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            Novo projeto
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        {projects.isLoading && <Loading />}
        {projects.isError && <ErrorBox error={projects.error} onRetry={() => projects.refetch()} />}
        {projects.data &&
          (projects.data.length === 0 ? (
            <Empty title="Nenhum projeto nesta organização" />
          ) : (
            <Section title="Projetos">
              <Table
                persistKey="orgSettings.projects"
                rows={projects.data}
                rowKey={(p) => p.id}
                columns={[
                  { key: 'name', header: 'Nome', render: (p) => <span className="font-semibold">{p.name}</span>, sortValue: (p) => p.name },
                  { key: 'desc', header: 'Descrição', render: (p) => <span className="block max-w-[360px] truncate text-muted">{p.description || '—'}</span> },
                  { key: 'vis', header: 'Visibilidade', render: (p) => <Badge>{p.visibility === 'public' ? 'Público' : 'Privado'}</Badge> },
                  { key: 'upd', header: 'Atualizado', render: (p) => <span className="text-muted"><TimeAgo date={p.lastUpdateTime} /></span>, sortValue: (p) => p.lastUpdateTime },
                  {
                    key: 'act',
                    header: '',
                    align: 'right',
                    width: 48,
                    render: (p) => (
                      <IconButton
                        title={`Excluir ${p.name}`}
                        onClick={() => {
                          setError(null)
                          setToDelete(p)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    )
                  }
                ]}
              />
            </Section>
          ))}
      </div>

      <CreateProjectModal org={org} open={creating} onClose={() => setCreating(false)} />
      {toDelete && (
        <ConfirmTyped
          open
          title="Excluir projeto"
          expected={toDelete.name}
          confirmLabel="Excluir projeto"
          busy={remove.isPending}
          error={error}
          onConfirm={() => remove.mutate(toDelete)}
          onClose={() => setToDelete(null)}
        >
          O projeto <b>{toDelete.name}</b>, com repositórios, quadros e pipelines, será excluído.
        </ConfirmTyped>
      )}
    </>
  )
}
