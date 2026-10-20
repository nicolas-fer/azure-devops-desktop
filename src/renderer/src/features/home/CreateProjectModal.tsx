import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, Loading } from '@/components/ui'
import { useProjects } from '@/lib/context'
import { seg } from '@/lib/api'
import { createProject, getOperation, listProcesses, operationDone, operationFailed, type CreateProjectInput, type OperationRef } from './api'

const INVALID_NAME = /[\/:*?"<>|#$%&+]/

/** Criação de projeto: POST _apis/projects e acompanhamento da operação até concluir. */
export function CreateProjectModal({ org, open, onClose }: { org: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const projects = useProjects(org)
  const processes = useQuery({ queryKey: ['home', org, 'processes'], queryFn: () => listProcesses(org), enabled: open && !!org, staleTime: Infinity })
  const [form, setForm] = useState({ name: '', description: '', visibility: 'private' as 'private' | 'public', sourceControl: 'Git' as 'Git' | 'Tfvc', processId: '' })
  const [error, setError] = useState<string | null>(null)
  const [opId, setOpId] = useState<string | null>(null)

  // Processo padrão assim que a lista chega
  useEffect(() => {
    if (!form.processId && processes.data?.length) {
      const def = processes.data.find((p) => p.isDefault) ?? processes.data[0]
      setForm((f) => ({ ...f, processId: def.id }))
    }
  }, [processes.data, form.processId])

  // Reinicia ao abrir
  useEffect(() => {
    if (open) {
      setError(null)
      setOpId(null)
      setForm((f) => ({ ...f, name: '', description: '' }))
    }
  }, [open])

  const create = useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(org, input),
    onSuccess: (op: OperationRef) => setOpId(op.id),
    onError: (e) => setError(e instanceof Error ? e.message : String(e))
  })

  const op = useQuery({
    queryKey: ['home', org, 'operation', opId],
    queryFn: () => getOperation(org, opId!),
    enabled: !!opId,
    refetchInterval: (q) => (operationDone(q.state.data?.status) ? false : 1500)
  })

  const status = op.data?.status
  const finished = operationDone(status)
  const failed = operationFailed(status)

  // Operação concluída com sucesso: atualiza a lista e abre o projeto
  useEffect(() => {
    if (!opId || !finished || failed) return
    qc.invalidateQueries({ queryKey: [org, 'projects'] })
    qc.invalidateQueries({ queryKey: [org, 'me'] })
    void (async () => {
      const list = await projects.refetch()
      const created = list.data?.find((p) => p.name.toLowerCase() === form.name.trim().toLowerCase())
      onClose()
      navigate(`/${org}/${seg(created?.name ?? form.name.trim())}/boards`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opId, finished, failed])

  const nameError = !form.name.trim()
    ? 'Informe um nome.'
    : form.name.trim().length > 64
      ? 'Use no máximo 64 caracteres.'
      : INVALID_NAME.test(form.name)
        ? 'Caracteres não permitidos: \ / : * ? " < > | # $ % & +'
        : (projects.data ?? []).some((p) => p.name.toLowerCase() === form.name.trim().toLowerCase())
          ? 'Já existe um projeto com esse nome.'
          : null

  const running = create.isPending || (!!opId && !finished)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (nameError || !form.processId || running) return
    setError(null)
    create.mutate({ ...form })
  }

  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title="Novo projeto"
      width={520}
      footer={
        opId && !finished ? (
          <span className="text-sm text-muted">Criando projeto…</span>
        ) : (
          <>
            <Button onClick={onClose} disabled={running}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="create-project-form" loading={running} disabled={!!nameError || !form.processId}>
              Criar projeto
            </Button>
          </>
        )
      }
    >
      {processes.isLoading ? (
        <Loading label="Carregando processos…" />
      ) : processes.isError ? (
        <ErrorBox error={processes.error} onRetry={() => processes.refetch()} />
      ) : (
        <form id="create-project-form" onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Nome" hint={nameError && form.name ? <span className="text-fail-ink">{nameError}</span> : undefined}>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={running} maxLength={80} />
          </Field>
          <Field label="Descrição">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={running} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visibilidade">
              <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as 'private' | 'public' })} disabled={running}>
                <option value="private">Privado</option>
                <option value="public">Público</option>
              </Select>
            </Field>
            <Field label="Controle de versão">
              <Select value={form.sourceControl} onChange={(e) => setForm({ ...form, sourceControl: e.target.value as 'Git' | 'Tfvc' })} disabled={running}>
                <option value="Git">Git</option>
                <option value="Tfvc">TFVC</option>
              </Select>
            </Field>
          </div>
          <Field label="Processo">
            <Select value={form.processId} onChange={(e) => setForm({ ...form, processId: e.target.value })} disabled={running}>
              {(processes.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          {opId && !finished && <div className="text-sm text-muted">Operação {opId.slice(0, 8)} em andamento ({status ?? 'na fila'})…</div>}
          {(error || (opId && failed)) && (
            <ErrorBox error={error ?? op.data?.detailedMessage ?? op.data?.resultMessage ?? 'A criação do projeto falhou.'} className="mx-0 my-0" />
          )}
        </form>
      )}
    </Modal>
  )
}
