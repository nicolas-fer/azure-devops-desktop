import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ado, adoList, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, Button, Code, Empty, ErrorBox, IconButton, Loading, PageHeader, Section, StateLabel, Table, Tabs, type Zone } from '@/components/ui'
import { ConfirmTyped, NamedModal, errMsg } from './shared'

interface GitRepo {
  id: string
  name: string
  defaultBranch?: string
  size?: number
  isDisabled?: boolean
  isInMaintenance?: boolean
  remoteUrl?: string
}

interface PolicyConfig {
  id: number
  isEnabled: boolean
  isBlocking: boolean
  isDeleted?: boolean
  type: { id: string; displayName?: string }
  settings?: { scope?: { repositoryId?: string | null; refName?: string | null; matchKind?: string }[]; displayName?: string }
}

interface PolicyType {
  id: string
  displayName: string
}

type Tab = 'repos' | 'policies'
type Dialog = { kind: 'create' } | { kind: 'rename'; repo: GitRepo } | { kind: 'delete'; repo: GitRepo } | null

const branchName = (ref?: string | null) => (ref ? ref.replace(/^refs\/heads\//, '') : '')

export function formatBytes(n?: number): string {
  if (n === undefined || n === null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

/** Repositórios do projeto (criar, renomear, excluir) e políticas de branch (leitura). */
export function Repos() {
  const { org, project } = useScope()
  const [tab, setTab] = useState<Tab>('repos')
  return (
    <>
      <PageHeader title="Repositórios" breadcrumb={<span>Configurações do projeto · {project}</span>}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'repos', label: 'Repositórios' },
            { key: 'policies', label: 'Políticas de branch' }
          ]}
        />
      </PageHeader>
      {tab === 'repos' ? <RepoList org={org} project={project} /> : <PolicyList org={org} project={project} />}
    </>
  )
}

function RepoList({ org, project }: { org: string; project: string }) {
  const qc = useQueryClient()
  const repos = useQuery({
    queryKey: ['ps', org, project, 'repos'],
    queryFn: () => adoList<GitRepo>({ org, path: `${seg(project)}/_apis/git/repositories` })
  })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ps', org, project, 'repos'] })
    qc.invalidateQueries({ queryKey: [org, project, 'repos'] })
  }
  const close = () => {
    setDialog(null)
    setError(null)
  }

  const save = useMutation({
    mutationFn: (v: { name: string; description: string; repo?: GitRepo }) =>
      ado<GitRepo>({
        org,
        method: v.repo ? 'PATCH' : 'POST',
        path: v.repo ? `${seg(project)}/_apis/git/repositories/${seg(v.repo.id)}` : `${seg(project)}/_apis/git/repositories`,
        body: { name: v.name }
      }),
    onSuccess: () => {
      close()
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  const remove = useMutation({
    mutationFn: (r: GitRepo) => ado({ org, method: 'DELETE', path: `${seg(project)}/_apis/git/repositories/${seg(r.id)}` }),
    onSuccess: () => {
      close()
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  const zoneOf = (r: GitRepo): Zone => (r.isDisabled ? 'idle' : r.isInMaintenance ? 'progress' : 'done')

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{repos.data ? `${repos.data.length} ${repos.data.length === 1 ? 'repositório' : 'repositórios'}` : ''}</span>
        <div className="flex-1" />
        <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ kind: 'create' })}>
          Novo repositório
        </Button>
      </div>
      {repos.isLoading && <Loading />}
      {repos.isError && <ErrorBox error={repos.error} onRetry={() => repos.refetch()} />}
      {repos.data &&
        (repos.data.length === 0 ? (
          <Empty title="Nenhum repositório neste projeto" />
        ) : (
          <Section title="Repositórios Git">
            <Table
              persistKey="projectSettings.repos"
              rows={repos.data}
              rowKey={(r) => r.id}
              zone={zoneOf}
              columns={[
                { key: 'name', header: 'Nome', render: (r) => <span className="font-semibold">{r.name}</span>, sortValue: (r) => r.name },
                { key: 'branch', header: 'Branch padrão', render: (r) => (r.defaultBranch ? <Code>{branchName(r.defaultBranch)}</Code> : <span className="text-muted">—</span>) },
                { key: 'size', header: 'Tamanho', align: 'right', render: (r) => <span className="narrow">{formatBytes(r.size)}</span>, sortValue: (r) => r.size ?? 0 },
                {
                  key: 'state',
                  header: 'Estado',
                  render: (r) =>
                    r.isDisabled ? <StateLabel zone="idle">Desativado</StateLabel> : r.isInMaintenance ? <StateLabel zone="progress">Em manutenção</StateLabel> : <StateLabel zone="done">Ativo</StateLabel>
                },
                {
                  key: 'act',
                  header: '',
                  align: 'right',
                  width: 88,
                  render: (r) => (
                    <span className="flex justify-end gap-1">
                      <IconButton title={`Renomear ${r.name}`} onClick={() => setDialog({ kind: 'rename', repo: r })}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton title={`Excluir ${r.name}`} onClick={() => setDialog({ kind: 'delete', repo: r })}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </span>
                  )
                }
              ]}
            />
          </Section>
        ))}

      {dialog?.kind === 'create' && (
        <NamedModal open title="Novo repositório" submitLabel="Criar" busy={save.isPending} error={error} onSubmit={(v) => save.mutate(v)} onClose={close} />
      )}
      {dialog?.kind === 'rename' && (
        <NamedModal
          open
          title="Renomear repositório"
          initialName={dialog.repo.name}
          submitLabel="Renomear"
          busy={save.isPending}
          error={error}
          onSubmit={(v) => save.mutate({ ...v, repo: dialog.repo })}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmTyped
          open
          title="Excluir repositório"
          expected={dialog.repo.name}
          confirmLabel="Excluir repositório"
          busy={remove.isPending}
          error={error}
          onConfirm={() => remove.mutate(dialog.repo)}
          onClose={close}
        >
          O repositório <b>{dialog.repo.name}</b>, com todo o histórico, será excluído.
        </ConfirmTyped>
      )}
    </div>
  )
}

function PolicyList({ org, project }: { org: string; project: string }) {
  const policies = useQuery({
    queryKey: ['ps', org, project, 'policies'],
    queryFn: () => adoList<PolicyConfig>({ org, path: `${seg(project)}/_apis/policy/configurations` })
  })
  const types = useQuery({
    queryKey: ['ps', org, project, 'policy-types'],
    queryFn: () => adoList<PolicyType>({ org, path: `${seg(project)}/_apis/policy/types` }),
    staleTime: Infinity
  })
  const repos = useQuery({
    queryKey: ['ps', org, project, 'repos'],
    queryFn: () => adoList<GitRepo>({ org, path: `${seg(project)}/_apis/git/repositories` })
  })

  const typeName = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t.displayName])), [types.data])
  const repoName = useMemo(() => new Map((repos.data ?? []).map((r) => [r.id, r.name])), [repos.data])
  const rows = useMemo(() => (policies.data ?? []).filter((p) => !p.isDeleted), [policies.data])

  if (policies.isLoading) return <Loading />
  if (policies.isError) return <div className="p-6"><ErrorBox error={policies.error} onRetry={() => policies.refetch()} /></div>
  if (rows.length === 0) return <div className="p-6"><Empty title="Nenhuma política configurada neste projeto" /></div>

  return (
    <div className="flex flex-col gap-4 p-6">
      <Section title="Políticas configuradas">
        <Table
          persistKey="projectSettings.repos.policies"
          rows={rows}
          rowKey={(p) => p.id}
          zone={(p) => (p.isEnabled ? 'done' : 'idle')}
          columns={[
            {
              key: 'type',
              header: 'Tipo',
              render: (p) => <span className="font-semibold">{typeName.get(p.type.id) ?? p.type.displayName ?? p.type.id}</span>,
              sortValue: (p) => typeName.get(p.type.id) ?? ''
            },
            {
              key: 'repo',
              header: 'Repositório',
              render: (p) => {
                const ids = (p.settings?.scope ?? []).map((s) => s.repositoryId).filter((x): x is string => !!x)
                if (!ids.length) return <span className="text-muted">Todos</span>
                return <span>{ids.map((id) => repoName.get(id) ?? id.slice(0, 8)).join(', ')}</span>
              }
            },
            {
              key: 'branch',
              header: 'Branch alvo',
              render: (p) => {
                const scopes = p.settings?.scope ?? []
                if (!scopes.length) return <span className="text-muted">—</span>
                return (
                  <span className="flex flex-wrap gap-1">
                    {scopes.map((s, i) => (
                      <Code key={i}>{s.refName ? branchName(s.refName) : 'Todas as branches'}</Code>
                    ))}
                  </span>
                )
              }
            },
            { key: 'block', header: 'Obrigatória', render: (p) => (p.isBlocking ? <Badge>Sim</Badge> : <span className="text-muted">Não</span>) },
            {
              key: 'enabled',
              header: 'Situação',
              render: (p) => (p.isEnabled ? <StateLabel zone="done">Ativa</StateLabel> : <StateLabel zone="idle">Desativada</StateLabel>)
            }
          ]}
        />
      </Section>
      <p className="text-[12px] text-muted">Somente leitura. Criar ou alterar políticas fica no portal do Azure DevOps.</p>
    </div>
  )
}
