// Library: grupos de variáveis (listar, criar, editar, excluir; segredos nunca são exibidos) e secure files (listar, excluir).
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  IconButton,
  Input,
  Loading,
  Modal,
  PageHeader,
  Person,
  Table,
  Tabs,
  TimeAgo,
  cx,
  type Column
} from '@/components/ui'
import { ado, seg } from '@/lib/api'
import { useProject, useScope } from '@/lib/context'
import { ConfirmModal, InlineNote } from './common'
import { errorText } from './errors'
import { useSecureFiles, useVariableGroup, useVariableGroups } from './queries'
import type { SecureFile, VariableGroup } from './types'

type LibTab = 'groups' | 'files'

export function Library() {
  const [tab, setTab] = useState<LibTab>('groups')
  return (
    <>
      <PageHeader title="Library" subtitle="Grupos de variáveis e secure files do projeto">
        <Tabs
          tabs={[
            { key: 'groups', label: 'Grupos de variáveis' },
            { key: 'files', label: 'Secure files' }
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>
      {tab === 'groups' ? <VariableGroups /> : <SecureFiles />}
    </>
  )
}

// ---------------------------------------------------------------- Grupos de variáveis

interface VarRow {
  key: number
  name: string
  value: string
  isSecret: boolean
  /** Segredo existente que ainda não foi substituído: envia value null para manter o valor. */
  keepSecret: boolean
}

function VariableGroups() {
  const { org, project } = useScope()
  const groups = useVariableGroups(org, project)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const list = groups.data ?? []
  const active = selectedId ?? list[0]?.id ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b-2 border-rule-strong px-3 py-2">
          <span className="colhead flex-1">Grupos</span>
          <Button size="sm" icon={<Plus className="size-3" />} onClick={() => setCreating(true)}>
            Novo grupo
          </Button>
        </div>
        {groups.isLoading && <Loading label="Carregando grupos…" />}
        {groups.isError && <ErrorBox error={groups.error} onRetry={() => groups.refetch()} />}
        {groups.data && list.length === 0 && <div className="px-3 py-4 text-[12px] text-muted">Nenhum grupo de variáveis.</div>}
        <ul className="overflow-auto">
          {list.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSelectedId(g.id)}
                className={cx('flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2', g.id === active && 'bg-surface-2 font-semibold')}
              >
                <span className="truncate">{g.name}</span>
                <span className="text-[12px] text-muted">
                  {Object.keys(g.variables ?? {}).length} variável(is) · <TimeAgo date={g.modifiedOn} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        {active ? (
          <GroupEditor key={active} id={active} onDeleted={() => setSelectedId(null)} />
        ) : (
          groups.data && <Empty title="Selecione um grupo" />
        )}
      </div>

      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelectedId(id) }} />}
    </div>
  )
}

function GroupEditor({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const group = useVariableGroup(org, project, id)
  const [rows, setRows] = useState<VarRow[]>([])
  const [seq, setSeq] = useState(1000)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [del, setDel] = useState(false)

  // Monta as linhas quando o grupo carrega. Segredos chegam sem valor e nunca são exibidos.
  useEffect(() => {
    if (!group.data) return
    setRows(
      Object.entries(group.data.variables ?? {}).map(([name, v], i) => ({
        key: i,
        name,
        value: v.isSecret ? '' : (v.value ?? ''),
        isSecret: !!v.isSecret,
        keepSecret: !!v.isSecret
      }))
    )
    setSeq(1000)
  }, [group.data])

  const dirty = group.data
    ? JSON.stringify(rows.map((r) => [r.name, r.value, r.isSecret, r.keepSecret])) !==
      JSON.stringify(
        Object.entries(group.data.variables ?? {}).map(([name, v]) => [name, v.isSecret ? '' : (v.value ?? ''), !!v.isSecret, !!v.isSecret])
      )
    : false

  const save = useMutation({
    mutationFn: () => {
      const g = group.data!
      const vars: Record<string, { value: string | null; isSecret?: boolean }> = {}
      for (const r of rows) {
        if (!r.name.trim()) continue
        vars[r.name.trim()] = r.isSecret && r.keepSecret ? { value: null, isSecret: true } : { value: r.value, isSecret: r.isSecret }
      }
      return ado<VariableGroup>({
        org,
        path: `${seg(project)}/_apis/distributedtask/variablegroups/${id}`,
        method: 'PUT',
        body: { ...g, variables: vars },
        apiVersion: '7.1-preview.2'
      })
    },
    onSuccess: () => {
      setNote({ kind: 'ok', text: 'Grupo salvo.' })
      qc.invalidateQueries({ queryKey: [org, project, 'library'] })
    },
    onError: (e) => setNote({ kind: 'err', text: errorText(e) })
  })

  const remove = useMutation({
    mutationFn: () =>
      ado({ org, path: `${seg(project)}/_apis/distributedtask/variablegroups/${id}`, method: 'DELETE', apiVersion: '7.1-preview.2' }),
    onSuccess: () => {
      setDel(false)
      qc.invalidateQueries({ queryKey: [org, project, 'library', 'groups'] })
      onDeleted()
    }
  })

  if (group.isLoading) return <Loading label="Carregando variáveis…" />
  if (group.isError) return <ErrorBox error={group.error} onRetry={() => group.refetch()} />
  if (!group.data) return null
  const g = group.data

  const update = (i: number, patch: Partial<VarRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="narrow truncate text-2xl font-bold">{g.name}</div>
          <div className="text-[12px] text-muted">
            {g.description || 'Sem descrição'} · modificado <TimeAgo date={g.modifiedOn} />
            {g.modifiedBy && <> por {g.modifiedBy.displayName}</>}
          </div>
        </div>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setDel(true)}>
          Excluir grupo
        </Button>
        <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          Salvar
        </Button>
      </div>

      {note && <InlineNote kind={note.kind}>{note.text}</InlineNote>}

      <div className="flex flex-col border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1.5fr_auto_auto] items-center gap-2 border-b-2 border-rule-strong px-3 py-1.5">
          <span className="colhead">Nome</span>
          <span className="colhead">Valor</span>
          <span className="colhead">Segredo</span>
          <span />
        </div>
        {rows.length === 0 && <div className="px-3 py-4 text-muted">Nenhuma variável neste grupo.</div>}
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_1.5fr_auto_auto] items-center gap-2 border-b border-border px-3 py-1.5">
            <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Nome da variável" />
            <Input
              type={r.isSecret ? 'password' : 'text'}
              value={r.value}
              placeholder={r.isSecret && r.keepSecret ? '•••••• (mantido; digite para substituir)' : undefined}
              onChange={(e) => update(i, { value: e.target.value, keepSecret: false })}
              aria-label="Valor da variável"
            />
            <label className="flex items-center gap-1 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={r.isSecret}
                onChange={(e) => update(i, { isSecret: e.target.checked, value: '', keepSecret: false })}
              />
              {r.isSecret && <Lock className="size-3" />}
            </label>
            <IconButton title="Remover variável" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        ))}
        <div className="px-3 py-2">
          <Button size="sm" icon={<Plus className="size-3" />} onClick={() => { setRows([...rows, { key: seq, name: '', value: '', isSecret: false, keepSecret: false }]); setSeq(seq + 1) }}>
            Adicionar variável
          </Button>
        </div>
      </div>
      <p className="text-[12px] text-muted">Valores de segredos não são exibidos. Deixe em branco um segredo existente para mantê-lo.</p>

      <ConfirmModal
        open={del}
        title="Excluir grupo de variáveis?"
        message={`O grupo ${g.name} e todas as variáveis dele serão excluídos. Pipelines que usam o grupo vão falhar.`}
        confirmLabel="Excluir"
        danger
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
        onClose={() => setDel(false)}
      />
    </div>
  )
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const proj = useProject(org, project)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useMutation({
    mutationFn: () =>
      ado<VariableGroup>({
        org,
        path: `${seg(project)}/_apis/distributedtask/variablegroups`,
        method: 'POST',
        apiVersion: '7.1-preview.2',
        body: {
          name: name.trim(),
          description,
          type: 'Vsts',
          variables: {},
          variableGroupProjectReferences: [{ name: name.trim(), projectReference: { id: proj.data?.id, name: project } }]
        }
      }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: [org, project, 'library', 'groups'] })
      onCreated(g.id)
    }
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Novo grupo de variáveis"
      width={440}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim() || !proj.data} onClick={() => create.mutate()}>
            Criar grupo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Descrição (opcional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {create.isError && <ErrorBox error={create.error} />}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Secure files

function SecureFiles() {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const files = useSecureFiles(org, project)
  const [target, setTarget] = useState<SecureFile | null>(null)
  const del = useMutation({
    mutationFn: (f: SecureFile) => ado({ org, path: `${seg(project)}/_apis/distributedtask/securefiles/${f.id}`, method: 'DELETE', apiVersion: '7.1-preview.1' }),
    onSuccess: () => {
      setTarget(null)
      qc.invalidateQueries({ queryKey: [org, project, 'library', 'securefiles'] })
    }
  })

  const columns: Column<SecureFile>[] = [
    { key: 'name', header: 'Arquivo', render: (f) => <span className="flex items-center gap-2 truncate font-medium"><KeyRound className="size-3.5 text-muted" />{f.name}</span> },
    { key: 'by', header: 'Criado por', width: 200, render: (f) => <Person identity={f.createdBy ?? null} size={18} /> },
    { key: 'created', header: 'Criado', width: 130, render: (f) => <span className="text-[12px] text-muted"><TimeAgo date={f.createdOn} /></span> },
    { key: 'modified', header: 'Modificado', width: 130, render: (f) => <span className="text-[12px] text-muted"><TimeAgo date={f.modifiedOn} /></span> },
    {
      key: 'actions',
      header: '',
      width: 110,
      align: 'right',
      render: (f) => (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={(e) => { e.stopPropagation(); setTarget(f) }}>
          Excluir
        </Button>
      )
    }
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {files.isLoading && <Loading label="Carregando secure files…" />}
      {files.isError && <ErrorBox error={files.error} onRetry={() => files.refetch()} />}
      {files.data && files.data.length === 0 && <Empty title="Nenhum secure file neste projeto" />}
      {files.data && files.data.length > 0 && <Table persistKey="pipelines.library.secureFiles" rows={files.data} columns={columns} rowKey={(f) => f.id} />}
      <div className="px-6 py-3">
        <Badge>Conteúdo dos arquivos não é exibido</Badge>
      </div>
      <ConfirmModal
        open={!!target}
        title="Excluir secure file?"
        message={`O arquivo ${target?.name ?? ''} será excluído. Pipelines que o usam vão falhar.`}
        confirmLabel="Excluir"
        danger
        pending={del.isPending}
        error={del.error}
        onConfirm={() => target && del.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </div>
  )
}
