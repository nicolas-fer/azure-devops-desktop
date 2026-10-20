import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ado, adoList, seg, type IdentityRef, type Team } from '@/lib/api'
import { useScope, useTeams } from '@/lib/context'
import { Badge, Button, Empty, ErrorBox, IconButton, Loading, PageHeader, Section, SidePanel, Table, Person, Code } from '@/components/ui'
import { ConfirmTyped, NamedModal, errMsg, useProjectDetail } from './shared'

interface TeamMember {
  identity: IdentityRef
  isTeamAdmin: boolean
}

type Dialog = { kind: 'create' } | { kind: 'edit'; team: Team } | { kind: 'delete'; team: Team } | null

export function Teams() {
  const { org, project } = useScope()
  const teams = useTeams(org, project)
  const detail = useProjectDetail(org, project)
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selected, setSelected] = useState<Team | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [org, project, 'teams'] })
    qc.invalidateQueries({ queryKey: ['ps', org, project] })
  }

  const save = useMutation({
    mutationFn: (v: { name: string; description: string; id?: string }) =>
      ado<Team>({
        org,
        method: v.id ? 'PATCH' : 'POST',
        path: v.id ? `_apis/projects/${seg(project)}/teams/${v.id}` : `_apis/projects/${seg(project)}/teams`,
        body: { name: v.name, description: v.description }
      }),
    onSuccess: () => {
      setDialog(null)
      setError(null)
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  const remove = useMutation({
    mutationFn: (t: Team) => ado({ org, method: 'DELETE', path: `_apis/projects/${seg(project)}/teams/${t.id}` }),
    onSuccess: () => {
      setDialog(null)
      setSelected(null)
      setError(null)
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  const defaultId = detail.data?.defaultTeam?.id
  const close = () => {
    setDialog(null)
    setError(null)
  }

  return (
    <>
      <PageHeader
        title="Times"
        subtitle={teams.data ? `${teams.data.length} ${teams.data.length === 1 ? 'time' : 'times'}` : undefined}
        breadcrumb={<span>Configurações do projeto · {project}</span>}
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ kind: 'create' })}>
            Novo time
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        {teams.isLoading && <Loading />}
        {teams.isError && <ErrorBox error={teams.error} onRetry={() => teams.refetch()} />}
        {teams.data &&
          (teams.data.length === 0 ? (
            <Empty title="Nenhum time neste projeto" />
          ) : (
            <Section title="Times do projeto">
              <Table
                persistKey="projectSettings.teams"
                rows={teams.data}
                rowKey={(t) => t.id}
                onRowClick={setSelected}
                selectedKey={selected?.id}
                columns={[
                  { key: 'name', header: 'Nome', render: (t) => <span className="font-semibold">{t.name}</span>, sortValue: (t) => t.name },
                  { key: 'desc', header: 'Descrição', render: (t) => <span className="text-muted">{t.description || '—'}</span> },
                  {
                    key: 'def',
                    header: 'Padrão',
                    render: (t) => (t.id === defaultId ? <Badge>Time padrão</Badge> : null)
                  },
                  {
                    key: 'act',
                    header: '',
                    align: 'right',
                    width: 96,
                    render: (t) => (
                      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <IconButton title={`Editar ${t.name}`} onClick={() => setDialog({ kind: 'edit', team: t })}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                        <IconButton title={`Excluir ${t.name}`} onClick={() => setDialog({ kind: 'delete', team: t })} disabled={t.id === defaultId}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </span>
                    )
                  }
                ]}
              />
            </Section>
          ))}
        <p className="text-[12px] text-muted">
          O time padrão do projeto não pode ser alterado por esta tela: a API pública não expõe essa escrita. Você pode mudá-lo no portal.
        </p>
      </div>

      <SidePanel open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} width={420}>
        {selected && <TeamMembers org={org} project={project} team={selected} />}
      </SidePanel>

      {dialog?.kind === 'create' && (
        <NamedModal
          open
          title="Novo time"
          withDescription
          submitLabel="Criar time"
          busy={save.isPending}
          error={error}
          onSubmit={(v) => save.mutate(v)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'edit' && (
        <NamedModal
          open
          title="Editar time"
          initialName={dialog.team.name}
          initialDescription={dialog.team.description ?? ''}
          withDescription
          submitLabel="Salvar"
          busy={save.isPending}
          error={error}
          onSubmit={(v) => save.mutate({ ...v, id: dialog.team.id })}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmTyped
          open
          title="Excluir time"
          expected={dialog.team.name}
          confirmLabel="Excluir time"
          busy={remove.isPending}
          error={error}
          onConfirm={() => remove.mutate(dialog.team)}
          onClose={close}
        >
          O time <b>{dialog.team.name}</b> será excluído. Os itens atribuídos a ele não são apagados.
        </ConfirmTyped>
      )}
    </>
  )
}

/** Membros do time (somente leitura: adicionar/remover membros fica fora do escopo desta tela). */
function TeamMembers({ org, project, team }: { org: string; project: string; team: Team }) {
  const members = useQuery({
    queryKey: ['ps', org, project, 'team-members', team.id],
    queryFn: () =>
      adoList<TeamMember>({
        org,
        path: `_apis/projects/${seg(project)}/teams/${team.id}/members`,
        query: { $top: 200 }
      })
  })
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-sm text-muted">{team.description || 'Sem descrição'}</div>
      <div className="colhead">Membros</div>
      {members.isLoading && <Loading label="Carregando membros…" />}
      {members.isError && <ErrorBox error={members.error} onRetry={() => members.refetch()} />}
      {members.data &&
        (members.data.length === 0 ? (
          <div className="text-sm text-muted">Este time não tem membros diretos.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {members.data.map((m) => (
              <li key={m.identity.id} className="flex items-center gap-2 px-3 py-2">
                <Person identity={m.identity} />
                <span className="flex-1" />
                {m.isTeamAdmin && <Badge>Admin do time</Badge>}
              </li>
            ))}
          </ul>
        ))}
      <div className="text-[12px] text-muted">
        ID do time: <Code>{team.id.slice(0, 8)}</Code>
      </div>
    </div>
  )
}
