import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { ado, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Button, Empty, ErrorBox, Field, IconButton, Input, Loading, Modal, PageHeader, Section, Table, Tabs } from '@/components/ui'
import { ConfirmTyped, errMsg } from './shared'
import { dateInput, flattenNodes, isoFromInput, nodePath, useClassificationTree, type NodeRow, type Structure } from './classification'
import { TeamSettings } from './TeamSettings'

type Tab = 'iterations' | 'areas' | 'team'
type Dialog =
  | { kind: 'create'; parent: NodeRow }
  | { kind: 'edit'; row: NodeRow }
  | { kind: 'delete'; row: NodeRow }
  | null

/** Iterações e áreas do projeto (árvore de classificação) e configurações do time. */
export function Iterations() {
  const { org, project } = useScope()
  const [tab, setTab] = useState<Tab>('iterations')
  const structure: Structure = tab === 'areas' ? 'Areas' : 'Iterations'

  return (
    <>
      <PageHeader
        title="Iterações e áreas"
        breadcrumb={<span>Configurações do projeto · {project}</span>}
      >
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'iterations', label: 'Iterações' },
            { key: 'areas', label: 'Áreas' },
            { key: 'team', label: 'Configurações do time' }
          ]}
        />
      </PageHeader>
      {tab === 'team' ? (
        <TeamSettings org={org} project={project} />
      ) : (
        <ClassificationTree org={org} project={project} structure={structure} />
      )}
    </>
  )
}

function ClassificationTree({ org, project, structure }: { org: string; project: string; structure: Structure }) {
  const tree = useClassificationTree(org, project, structure)
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)
  const isIter = structure === 'Iterations'

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ps', org, project, 'classification', structure] })
    qc.invalidateQueries({ queryKey: ['ps', org, project, 'classification'] })
    qc.invalidateQueries({ queryKey: ['ps', org, project, 'team-iterations'] })
  }

  const close = () => {
    setDialog(null)
    setError(null)
  }

  const save = useMutation({
    mutationFn: (v: { name: string; start: string; finish: string }) => {
      const attributes = isIter && (v.start || v.finish) ? { startDate: v.start ? isoFromInput(v.start) : undefined, finishDate: v.finish ? isoFromInput(v.finish) : undefined } : undefined
      if (dialog?.kind === 'edit') {
        return ado({
          org,
          method: 'PATCH',
          path: `${seg(project)}/_apis/wit/classificationnodes/${nodePath(structure, dialog.row.chain)}`,
          contentType: 'application/json',
          body: { name: v.name, ...(attributes ? { attributes } : {}) }
        })
      }
      const parent = dialog?.kind === 'create' ? dialog.parent.chain : []
      return ado({
        org,
        method: 'POST',
        path: `${seg(project)}/_apis/wit/classificationnodes/${nodePath(structure, parent)}`,
        body: { name: v.name, ...(attributes ? { attributes } : {}) }
      })
    },
    onSuccess: () => {
      close()
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  const remove = useMutation({
    mutationFn: (row: NodeRow) =>
      ado({ org, method: 'DELETE', path: `${seg(project)}/_apis/wit/classificationnodes/${nodePath(structure, row.chain)}` }),
    onSuccess: () => {
      close()
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  if (tree.isLoading) return <Loading />
  if (tree.isError) return <div className="p-6"><ErrorBox error={tree.error} onRetry={() => tree.refetch()} /></div>
  if (!tree.data) return null
  const rows = flattenNodes(tree.data)

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">
          {rows.length - 1} {isIter ? (rows.length - 1 === 1 ? 'iteração' : 'iterações') : rows.length - 1 === 1 ? 'área' : 'áreas'}
        </span>
        <div className="flex-1" />
        <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ kind: 'create', parent: rows[0] })}>
          {isIter ? 'Nova iteração' : 'Nova área'}
        </Button>
      </div>
      <Section title={isIter ? 'Árvore de iterações' : 'Árvore de áreas'}>
        <Table
          persistKey="projectSettings.iterations"
          rows={rows}
          rowKey={(r) => r.node.identifier}
          columns={[
            {
              key: 'name',
              header: 'Nome',
              render: (r) => (
                <span className="flex items-center gap-2" style={{ paddingLeft: r.depth * 16 }}>
                  <span className={r.isRoot ? 'font-bold' : r.depth === 1 ? 'font-semibold' : ''}>{r.node.name}</span>
                  {r.isRoot && <span className="text-[12px] text-muted">raiz</span>}
                </span>
              )
            },
            ...(isIter
              ? [
                  {
                    key: 'start',
                    header: 'Início',
                    render: (r: NodeRow) => <span className="narrow text-muted">{dateInput(r.node.attributes?.startDate) || '—'}</span>
                  },
                  {
                    key: 'finish',
                    header: 'Fim',
                    render: (r: NodeRow) => <span className="narrow text-muted">{dateInput(r.node.attributes?.finishDate) || '—'}</span>
                  }
                ]
              : []),
            {
              key: 'act',
              header: '',
              align: 'right' as const,
              width: 132,
              render: (r: NodeRow) => (
                <span className="flex justify-end gap-1">
                  <IconButton title={isIter ? 'Adicionar sub-iteração' : 'Adicionar sub-área'} onClick={() => setDialog({ kind: 'create', parent: r })}>
                    {isIter ? <CalendarPlus className="size-3.5" /> : <Plus className="size-3.5" />}
                  </IconButton>
                  {!r.isRoot && (
                    <>
                      <IconButton title={`Editar ${r.node.name}`} onClick={() => setDialog({ kind: 'edit', row: r })}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton title={`Excluir ${r.node.name}`} onClick={() => setDialog({ kind: 'delete', row: r })}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </>
                  )}
                </span>
              )
            }
          ]}
        />
      </Section>
      {rows.length === 1 && <Empty title={isIter ? 'Nenhuma iteração criada' : 'Nenhuma área criada'} />}

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <NodeModal
          mode={dialog.kind}
          title={
            dialog.kind === 'create'
              ? `${isIter ? 'Nova iteração' : 'Nova área'} em ${dialog.parent.node.name}`
              : `Editar ${dialog.row.node.name}`
          }
          isIter={isIter}
          initialName={dialog.kind === 'edit' ? dialog.row.node.name : ''}
          initialStart={dialog.kind === 'edit' ? dateInput(dialog.row.node.attributes?.startDate) : ''}
          initialFinish={dialog.kind === 'edit' ? dateInput(dialog.row.node.attributes?.finishDate) : ''}
          busy={save.isPending}
          error={error}
          onSubmit={(v) => save.mutate(v)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmTyped
          open
          title={isIter ? 'Excluir iteração' : 'Excluir área'}
          expected={dialog.row.node.name}
          confirmLabel="Excluir"
          busy={remove.isPending}
          error={error}
          onConfirm={() => remove.mutate(dialog.row)}
          onClose={close}
        >
          <b>{dialog.row.node.name}</b> e os nós abaixo dele serão excluídos. Itens de trabalho vinculados podem impedir a exclusão.
        </ConfirmTyped>
      )}
    </div>
  )
}

/** Criar/renomear nó. Datas só para iterações. */
function NodeModal({
  mode,
  title,
  isIter,
  initialName,
  initialStart,
  initialFinish,
  busy,
  error,
  onSubmit,
  onClose
}: {
  mode: 'create' | 'edit'
  title: string
  isIter: boolean
  initialName: string
  initialStart: string
  initialFinish: string
  busy: boolean
  error: string | null
  onSubmit: (v: { name: string; start: string; finish: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [start, setStart] = useState(initialStart)
  const [finish, setFinish] = useState(initialFinish)
  const dateError = start && finish && finish < start ? 'A data final deve ser igual ou posterior à inicial.' : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || dateError || busy) return
    onSubmit({ name: name.trim(), start, finish })
  }
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      width={460}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="node-modal-form" loading={busy} disabled={!name.trim() || !!dateError}>
            {mode === 'create' ? 'Criar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="node-modal-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nome">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={256} />
        </Field>
        {isIter && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de início">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Data de término" hint={dateError ? <span className="text-fail-ink">{dateError}</span> : undefined}>
              <Input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} />
            </Field>
          </div>
        )}
        {error && <ErrorBox error={error} className="mx-0 my-0" />}
      </form>
    </Modal>
  )
}
