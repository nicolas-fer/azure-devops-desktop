import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado, seg, type Project } from '@/lib/api'
import { Button, ErrorBox, Field, Input, Modal, Textarea } from '@/components/ui'

/** Detalhe do projeto com capacidades (processo, controle de versão) e time padrão. */
export type ProjectDetail = Project & {
  revision?: number
  capabilities?: {
    processTemplate?: { templateName?: string; templateTypeId?: string }
    versioncontrol?: { sourceControlType?: string }
  }
  defaultTeam?: { id: string; name: string }
}

export function useProjectDetail(org: string, project: string) {
  return useQuery({
    queryKey: ['ps', org, project, 'detail'],
    enabled: !!org && !!project,
    queryFn: () => ado<ProjectDetail>({ org, path: `_apis/projects/${seg(project)}`, query: { includeCapabilities: true } })
  })
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Modal de confirmação de ação destrutiva: o usuário digita o nome exato para liberar o botão. */
export function ConfirmTyped({
  open,
  title,
  expected,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  expected: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const ok = typed === expected
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      width={480}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} disabled={!ok}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" key={String(open)}>
        <div className="text-sm">{children}</div>
        <Field label={`Digite "${expected}" para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
        {error && <ErrorBox error={error} className="mx-0 my-0" />}
      </div>
    </Modal>
  )
}

/** Modal de nome (e descrição opcional) para criar ou renomear. */
export function NamedModal({
  open,
  title,
  initialName = '',
  initialDescription = '',
  withDescription,
  submitLabel,
  busy,
  error,
  onSubmit,
  onClose
}: {
  open: boolean
  title: string
  initialName?: string
  initialDescription?: string
  withDescription?: boolean
  submitLabel: string
  busy?: boolean
  error?: string | null
  onSubmit: (v: { name: string; description: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    onSubmit({ name: name.trim(), description: description.trim() })
  }
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      width={480}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="named-modal-form" loading={busy} disabled={!name.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="named-modal-form" onSubmit={submit} className="flex flex-col gap-3" key={String(open)}>
        <Field label="Nome">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={256} />
        </Field>
        {withDescription && (
          <Field label="Descrição">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
        )}
        {error && <ErrorBox error={error} className="mx-0 my-0" />}
      </form>
    </Modal>
  )
}
