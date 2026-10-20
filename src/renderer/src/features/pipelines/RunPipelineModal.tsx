// Modal "Executar pipeline": branch/tag, variáveis que permitem override, parâmetros de template e stages a pular.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Field, Input, Loading, Modal, Select, Button, ErrorBox, cx } from '@/components/ui'
import { ado, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { errorText } from './errors'
import { shortRef } from './lib'
import { useDefinition, useRepoRefs, useYamlMeta } from './queries'

export function RunPipelineModal({
  open,
  definitionId,
  definitionName,
  onClose,
  onStarted
}: {
  open: boolean
  definitionId: number
  definitionName: string
  onClose: () => void
  onStarted: (buildId: number) => void
}) {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const def = useDefinition(org, project, definitionId)
  const repoId = def.data?.repository?.id
  const yamlFile = def.data?.process?.yamlFilename
  const isYaml = !!yamlFile
  const heads = useRepoRefs(org, project, repoId, 'heads')
  const tags = useRepoRefs(org, project, repoId, 'tags')

  const [ref, setRef] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState<{ name: string; value: string }[]>([])
  const [params, setParams] = useState<Record<string, string>>({})
  const [skip, setSkip] = useState<Set<string>>(new Set())

  // Padrão: branch padrão do repositório da definição.
  useEffect(() => {
    if (!ref && def.data) setRef(def.data.repository?.defaultBranch ?? 'refs/heads/main')
  }, [def.data, ref])

  // Variáveis da definição que permitem override.
  const overridable = useMemo(
    () => Object.entries(def.data?.variables ?? {}).filter(([, v]) => v.allowOverride === true),
    [def.data]
  )

  const branchShort = shortRef(ref)
  const isTag = ref.startsWith('refs/tags/')
  // Leitura do YAML só para branches; para tags usa a branch padrão.
  const yamlBranch = isTag ? shortRef(def.data?.repository?.defaultBranch) || 'main' : branchShort
  const yaml = useYamlMeta(org, project, repoId, yamlBranch || undefined, isYaml ? yamlFile : undefined)

  // Parâmetros com o padrão do YAML quando o YAML muda (sem sobrescrever o que o usuário digitou).
  useEffect(() => {
    if (!yaml.meta) return
    setParams((p) => {
      const n = { ...p }
      for (const prm of yaml.meta!.parameters) if (!(prm.name in n)) n[prm.name] = prm.default ?? ''
      return n
    })
  }, [yaml.meta])

  const run = useMutation({
    mutationFn: async () => {
      const varMap: Record<string, string> = {}
      for (const [name, v] of overridable) {
        const val = overrides[name]
        if (val !== undefined && val !== (v.value ?? '')) varMap[name] = val
      }
      for (const c of custom) if (c.name.trim()) varMap[c.name.trim()] = c.value

      if (isYaml) {
        // Execução de pipeline YAML (runs). O id retornado é o id do build.
        const body = {
          resources: { repositories: { self: { refName: ref } } },
          variables: Object.fromEntries(Object.entries(varMap).map(([k, v]) => [k, { value: v }])),
          templateParameters: Object.fromEntries(
            (yaml.meta?.parameters ?? []).map((p) => [p.name, params[p.name] ?? p.default ?? ''])
          ),
          stagesToSkip: [...skip]
        }
        const r = await ado<{ id: number }>({
          org,
          path: `${seg(project)}/_apis/pipelines/${definitionId}/runs`,
          method: 'POST',
          body,
          apiVersion: '7.1-preview.1'
        })
        return r.id
      }
      // Pipeline clássico: build com a branch escolhida e as variáveis informadas.
      const r = await ado<{ id: number }>({
        org,
        path: `${seg(project)}/_apis/build/builds`,
        method: 'POST',
        body: { definition: { id: definitionId }, sourceBranch: ref, parameters: JSON.stringify(varMap) }
      })
      return r.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: [org, project, 'pipelines'] })
      onStarted(id)
    }
  })

  const refOptions = (
    <>
      <optgroup label="Branches">
        {(heads.data ?? []).map((r) => (
          <option key={r.name} value={r.name}>
            {shortRef(r.name)}
          </option>
        ))}
      </optgroup>
      {(tags.data?.length ?? 0) > 0 && (
        <optgroup label="Tags">
          {(tags.data ?? []).map((r) => (
            <option key={r.name} value={r.name}>
              {shortRef(r.name)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )

  const footer = (
    <>
      <Button onClick={onClose} disabled={run.isPending}>
        Cancelar
      </Button>
      <Button variant="primary" loading={run.isPending} disabled={!def.data || !ref} onClick={() => run.mutate()}>
        Executar
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={`Executar pipeline · ${definitionName}`} width={640} footer={footer}>
      {def.isLoading && <Loading label="Carregando definição…" />}
      {def.isError && <ErrorBox error={def.error} onRetry={() => def.refetch()} />}
      {def.data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch ou tag">
              {heads.isError || tags.isError || !repoId ? (
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="refs/heads/main" />
              ) : (
                <Select value={ref} onChange={(e) => setRef(e.target.value)} disabled={heads.isLoading}>
                  {!heads.data && <option value={ref}>{shortRef(ref)}</option>}
                  {refOptions}
                </Select>
              )}
            </Field>
            <Field label="Tipo de pipeline" hint={isYaml ? `YAML: ${yamlFile}` : 'Clássico (sem YAML)'}>
              <Input value={isYaml ? 'YAML' : 'Clássico'} readOnly />
            </Field>
          </div>

          {isYaml && yaml.isLoading && <Loading label="Lendo parâmetros do YAML…" />}
          {isYaml && yaml.isError && (
            <ErrorBox error={`Não foi possível ler ${yamlFile} em ${yamlBranch}: ${errorText(yaml.error)}`} />
          )}

          {yaml.meta && yaml.meta.parameters.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="colhead border-b-2 border-rule-strong pb-1">Parâmetros de template</div>
              {yaml.meta.parameters.map((p) => (
                <Field key={p.name} label={p.displayName ?? p.name} hint={p.type}>
                  {p.type === 'boolean' ? (
                    <Select value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </Select>
                  ) : p.values?.length ? (
                    <Select value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}>
                      {p.values.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} />
                  )}
                </Field>
              ))}
            </section>
          )}

          {yaml.meta && yaml.meta.stages.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="colhead border-b-2 border-rule-strong pb-1">Stages a pular</div>
              <div className="flex flex-wrap gap-2">
                {yaml.meta.stages.map((s) => {
                  const on = skip.has(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const n = new Set(skip)
                        if (on) n.delete(s)
                        else n.add(s)
                        setSkip(n)
                      }}
                      className={cx(
                        'inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[12px]',
                        on ? 'border-zone-idle bg-surface-2 text-fg line-through' : 'border-border bg-surface text-muted hover:text-fg'
                      )}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <div className="colhead border-b-2 border-rule-strong pb-1">Variáveis</div>
            {overridable.length === 0 && custom.length === 0 && (
              <div className="text-[12px] text-muted">
                Nenhuma variável com override definida na pipeline. Variáveis declaradas só no YAML não são listadas pela API.
              </div>
            )}
            {overridable.map(([name, v]) => (
              <Field key={name} label={name} hint={v.isSecret ? 'Segredo: digite para substituir' : undefined}>
                <Input
                  type={v.isSecret ? 'password' : 'text'}
                  value={overrides[name] ?? (v.isSecret ? '' : (v.value ?? ''))}
                  placeholder={v.isSecret ? '••••••' : undefined}
                  onChange={(e) => setOverrides({ ...overrides, [name]: e.target.value })}
                />
              </Field>
            ))}
            {custom.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label="Nome">
                  <Input value={c.name} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </Field>
                <Field label="Valor">
                  <Input value={c.value} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </Field>
                <Button size="sm" variant="ghost" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                  Remover
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" onClick={() => setCustom([...custom, { name: '', value: '' }])}>
                Adicionar variável
              </Button>
            </div>
          </section>

          {run.isError && <ErrorBox error={run.error} />}
        </div>
      )}
    </Modal>
  )
}
