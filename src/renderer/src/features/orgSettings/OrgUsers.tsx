import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { ado, adoRaw, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Button, Empty, ErrorBox, Field, IconButton, Input, Loading, Modal, PageHeader, Section, Select, Table, TimeAgo } from '@/components/ui'
import { ConfirmTyped, errMsg } from '../projectSettings/shared'

interface UserEntitlement {
  id: string
  user?: { displayName: string; mailAddress?: string; principalName?: string; subjectKind?: string }
  accessLevel?: { accountLicenseType?: string; status?: string; licensingSource?: string }
  lastAccessedDate?: string
  dateCreated?: string
}

const LEVELS: { value: string; label: string }[] = [
  { value: 'express', label: 'Básico' },
  { value: 'advanced', label: 'Básico + Planos de teste' },
  { value: 'stakeholder', label: 'Partes interessadas' },
  { value: 'msdn', label: 'Assinante Visual Studio' },
  { value: 'none', label: 'Sem licença' }
]

const levelLabel = (v?: string) => LEVELS.find((l) => l.value === v)?.label ?? v ?? '—'

/** Último acesso: a API devolve data mínima quando nunca houve acesso. */
const neverAccessed = (d?: string) => !d || new Date(d).getFullYear() < 2000

/** Carrega todas as páginas de userentitlements (continuationToken no corpo). */
async function fetchAllUsers(org: string): Promise<UserEntitlement[]> {
  const out: UserEntitlement[] = []
  let token: string | undefined
  for (let i = 0; i < 20; i++) {
    const { data } = await adoRaw<{ items: UserEntitlement[]; continuationToken?: string }>({
      org,
      host: 'vsaex',
      path: '_apis/userentitlements',
      query: { $top: 200, continuationToken: token }
    })
    out.push(...(data.items ?? []))
    if (!data.continuationToken) break
    token = data.continuationToken
  }
  return out
}

/** Usuários da organização com nível de acesso. Alterar nível e remover usuário pedem confirmação. */
export function OrgUsers() {
  const { org } = useScope()
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['os', org, 'users'], enabled: !!org, queryFn: () => fetchAllUsers(org) })
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<UserEntitlement | null>(null)
  const [removing, setRemoving] = useState<UserEntitlement | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['os', org, 'users'] })

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    const all = users.data ?? []
    if (!q) return all
    return all.filter((u) => (u.user?.displayName ?? '').toLowerCase().includes(q) || (u.user?.mailAddress ?? '').toLowerCase().includes(q))
  }, [users.data, text])

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={users.data ? `${users.data.length} ${users.data.length === 1 ? 'usuário' : 'usuários'}` : undefined}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar por nome ou e-mail" className="w-72" aria-label="Filtrar usuários" />
        </div>
        {users.isLoading && <Loading label="Carregando usuários…" />}
        {users.isError && <ErrorBox error={users.error} onRetry={() => users.refetch()} />}
        {users.data &&
          (shown.length === 0 ? (
            <Empty title={text ? 'Nenhum usuário com esse filtro' : 'Nenhum usuário encontrado'} />
          ) : (
            <Section title="Usuários e níveis de acesso">
              <Table
                persistKey="orgSettings.users"
                rows={shown}
                rowKey={(u) => u.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Nome',
                    render: (u) => <span className="font-semibold">{u.user?.displayName ?? '—'}</span>,
                    sortValue: (u) => u.user?.displayName
                  },
                  { key: 'mail', header: 'E-mail', render: (u) => <span className="text-muted">{u.user?.mailAddress ?? u.user?.principalName ?? '—'}</span> },
                  {
                    key: 'level',
                    header: 'Nível de acesso',
                    render: (u) => (
                      <button
                        type="button"
                        className="rounded-sm border border-border bg-surface px-2 py-0.5 text-sm hover:bg-surface-2"
                        onClick={() => {
                          setError(null)
                          setEditing(u)
                        }}
                      >
                        {levelLabel(u.accessLevel?.accountLicenseType)}
                      </button>
                    ),
                    sortValue: (u) => levelLabel(u.accessLevel?.accountLicenseType)
                  },
                  {
                    key: 'last',
                    header: 'Último acesso',
                    render: (u) => (neverAccessed(u.lastAccessedDate) ? <span className="text-muted">Nunca</span> : <span className="text-muted"><TimeAgo date={u.lastAccessedDate} /></span>),
                    sortValue: (u) => u.lastAccessedDate
                  },
                  {
                    key: 'act',
                    header: '',
                    align: 'right',
                    width: 48,
                    render: (u) => (
                      <IconButton
                        title={`Remover ${u.user?.displayName ?? 'usuário'}`}
                        onClick={() => {
                          setError(null)
                          setRemoving(u)
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

      {editing && (
        <AccessLevelModal
          org={org}
          user={editing}
          onDone={() => {
            setEditing(null)
            invalidate()
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <RemoveUser
          org={org}
          user={removing}
          error={error}
          onError={setError}
          onDone={() => {
            setRemoving(null)
            invalidate()
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

function AccessLevelModal({ org, user, onDone, onClose }: { org: string; user: UserEntitlement; onDone: () => void; onClose: () => void }) {
  const [level, setLevel] = useState(user.accessLevel?.accountLicenseType ?? 'express')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () =>
      ado({
        org,
        host: 'vsaex',
        method: 'PATCH',
        path: `_apis/userentitlements/${seg(user.id)}`,
        apiVersion: '7.1-preview.3',
        contentType: 'application/json-patch+json',
        body: [{ op: 'replace', path: '/accessLevel', value: { accountLicenseType: level } }]
      }),
    onSuccess: onDone,
    onError: (e) => setError(errMsg(e))
  })
  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title="Alterar nível de acesso"
      width={420}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={level === (user.accessLevel?.accountLicenseType ?? '')}>
            Confirmar alteração
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm">
          Usuário: <b>{user.user?.displayName}</b>
        </div>
        <Field label="Novo nível">
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        {error && <ErrorBox error={error} className="mx-0 my-0" />}
      </div>
    </Modal>
  )
}

function RemoveUser({
  org,
  user,
  error,
  onError,
  onDone,
  onClose
}: {
  org: string
  user: UserEntitlement
  error: string | null
  onError: (m: string) => void
  onDone: () => void
  onClose: () => void
}) {
  const remove = useMutation({
    mutationFn: () => ado({ org, host: 'vsaex', method: 'DELETE', path: `_apis/userentitlements/${seg(user.id)}`, apiVersion: '7.1-preview.3' }),
    onSuccess: onDone,
    onError: (e) => onError(errMsg(e))
  })
  const name = user.user?.displayName ?? ''
  return (
    <ConfirmTyped
      open
      title="Remover usuário"
      expected={name}
      confirmLabel="Remover usuário"
      busy={remove.isPending}
      error={error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <b>{name}</b> perde o acesso à organização e às licenças atribuídas.
    </ConfirmTyped>
  )
}
