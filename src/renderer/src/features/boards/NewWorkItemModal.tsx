// Modal "Novo work item": escolhe o tipo (_apis/wit/workitemtypes) e cria com título.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ado, seg } from '@/lib/api'
import { Button, Field, Input, Loading, Modal, ErrorBox } from '@/components/ui'
import { typeIcon, useWorkItemTypes, wiKey } from './lib'

export function NewWorkItemModal({
  org,
  project,
  open,
  onClose,
  onCreated,
  areaPath,
  iterationPath,
  defaultType
}: {
  org: string
  project: string
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
  areaPath?: string
  iterationPath?: string
  defaultType?: string
}) {
  const qc = useQueryClient()
  const types = useWorkItemTypes(org, project)
  const [type, setType] = useState<string>('')
  const [title, setTitle] = useState('')
  const chosen = type || defaultType || types.data?.[0]?.name || ''

  const create = useMutation({
    mutationFn: () => {
      const ops: { op: string; path: string; value: string }[] = [{ op: 'add', path: '/fields/System.Title', value: title.trim() }]
      if (areaPath) ops.push({ op: 'add', path: '/fields/System.AreaPath', value: areaPath })
      if (iterationPath) ops.push({ op: 'add', path: '/fields/System.IterationPath', value: iterationPath })
      return ado<{ id: number }>({
        org,
        path: `${seg(project)}/_apis/wit/workitems/$${seg(chosen)}`,
        method: 'POST',
        contentType: 'application/json-patch+json',
        body: ops
      })
    },
    onSuccess: (wi) => {
      qc.invalidateQueries({ queryKey: wiKey(org, project) })
      setTitle('')
      setType('')
      onCreated(wi.id)
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo work item"
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!title.trim() || !chosen}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Criar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim() && chosen && !create.isPending) create.mutate()
        }}
      >
        {types.isLoading && <Loading label="Carregando tipos…" />}
        {types.isError && <ErrorBox error={types.error} onRetry={() => types.refetch()} />}
        {types.data && (
          <Field label="Tipo">
            <div className="grid grid-cols-2 gap-1.5">
              {types.data.map((t) => {
                const ico = typeIcon(t.name)
                const Icon = ico.icon
                const on = chosen === t.name
                return (
                  <button
                    key={t.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(t.name)}
                    className={`flex h-8 items-center gap-2 rounded-sm border px-2 text-left text-sm ${on ? 'border-rule-strong bg-surface-2 font-semibold' : 'border-border bg-surface hover:bg-surface-2'}`}
                  >
                    <Icon className="size-3.5 shrink-0" style={{ color: ico.color }} />
                    <span className="truncate">{t.name}</span>
                  </button>
                )
              })}
            </div>
          </Field>
        )}
        <Field label="Título">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descreva o trabalho" />
        </Field>
        {create.isError && <div className="text-[12px] text-fail-ink">{(create.error as Error).message}</div>}
      </form>
    </Modal>
  )
}
