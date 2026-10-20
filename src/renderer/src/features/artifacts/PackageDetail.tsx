// Detalhe de um pacote: versões com ações (promover, listar, excluir, baixar) e comandos de instalação.
import { useState } from 'react'
import { ArrowUpCircle, Check, Copy, Download, Eye, EyeOff, Trash2 } from 'lucide-react'
import { saveBase64 } from '@/lib/api'
import { Badge, Button, formatDate, IdCell, Loading, QueryView, StateLabel, Table, Tabs, TimeAgo } from '@/components/ui'
import type { Zone } from '@/lib/zones'
import {
  PROTOCOL_LABEL,
  WRITABLE_PROTOCOLS,
  downloadPackageVersion,
  protocolGroup,
  useFeedViews,
  usePackageVersions,
  useVersionAction,
  type Feed,
  type FeedPackage,
  type PackageVersion
} from './api'
import { installSnippets } from './install'
import { PROTOCOL_ICON } from './icons'

export function PackageDetail({ org, feed, pkg }: { org: string; feed: Feed; pkg: FeedPackage }) {
  const [tab, setTab] = useState<'versoes' | 'instalacao'>('versoes')
  const versions = usePackageVersions(org, feed, pkg.id)
  const proto = protocolGroup(pkg.protocolType)
  const Icon = PROTOCOL_ICON[proto]
  const description = pkg.versions.find((v) => v.isLatest)?.packageDescription || pkg.versions[0]?.packageDescription || ''

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Icon className="size-3.5" />
          {PROTOCOL_LABEL[proto]}
          <span>·</span>
          <span className="font-mono">{pkg.normalizedName}</span>
        </div>
        {description ? <p className="mt-1 text-sm text-fg">{description}</p> : <p className="mt-1 text-sm text-muted">Sem descrição.</p>}
      </div>

      <div className="px-4">
        <Tabs
          tabs={[
            { key: 'versoes', label: 'Versões', count: versions.data?.length },
            { key: 'instalacao', label: 'Instalação e dependências' }
          ]}
          value={tab}
          onChange={setTab}
          className="border-b border-border"
        />
      </div>

      <div className="p-4">
        <QueryView query={versions} empty={(d) => d.length === 0} emptyTitle="Nenhuma versão encontrada">
          {(list) => {
            const sorted = [...list].sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())
            if (tab === 'versoes') {
              return (
                <Table<PackageVersion>
                  persistKey="artifacts.package.versions"
                  rows={sorted}
                  rowKey={(v) => v.id}
                  zone={(v): Zone => (v.isListed ? 'done' : 'idle')}
                  columns={[
                    {
                      key: 'versao',
                      header: 'Versão',
                      width: 170,
                      render: (v) => (
                        <span className="inline-flex items-center gap-2">
                          <IdCell>{v.version}</IdCell>
                          {v.isLatest && <Badge>última</Badge>}
                        </span>
                      )
                    },
                    {
                      key: 'estado',
                      header: 'Estado',
                      width: 120,
                      render: (v) => <StateLabel zone={v.isListed ? 'done' : 'idle'}>{v.isListed ? 'Listada' : 'Não listada'}</StateLabel>
                    },
                    {
                      key: 'views',
                      header: 'Visões',
                      render: (v) => (
                        <span className="flex flex-wrap gap-1">
                          {v.views.map((x) => (
                            <Badge key={x.id}>@{x.name}</Badge>
                          ))}
                        </span>
                      )
                    },
                    {
                      key: 'publicada',
                      header: 'Publicada',
                      width: 170,
                      render: (v) => (
                        <span className="text-muted" title={formatDate(v.publishDate)}>
                          <TimeAgo date={v.publishDate} />
                        </span>
                      )
                    },
                    {
                      key: 'autor',
                      header: 'Autor',
                      width: 140,
                      render: (v) => <span className="truncate text-muted">{v.author || '—'}</span>
                    },
                    {
                      key: 'acoes',
                      header: '',
                      width: 420,
                      align: 'right',
                      render: (v) => <VersionActions org={org} feed={feed} pkg={pkg} version={v} />
                    }
                  ]}
                />
              )
            }
            return <InstallPanel org={org} feed={feed} pkg={pkg} versions={sorted} />
          }}
        </QueryView>
      </div>
    </div>
  )
}

/** Ações de uma versão. Escritas só para NuGet e npm nesta versão do app. */
function VersionActions({ org, feed, pkg, version }: { org: string; feed: Feed; pkg: FeedPackage; version: PackageVersion }) {
  const act = useVersionAction(org, feed, pkg)
  const views = useFeedViews(org, feed)
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const writable = WRITABLE_PROTOCOLS.includes(protocolGroup(pkg.protocolType))
  const available = (views.data ?? []).filter((v) => !version.views.some((x) => x.name === v.name))
  const busy = act.isPending || downloading

  const run = (action: Parameters<typeof act.mutate>[0]['action'], confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return
    setError(null)
    act.mutate(
      { version: version.version, action },
      { onError: (e) => setError(e instanceof Error ? e.message : String(e)) }
    )
  }

  const download = async () => {
    setError(null)
    setDownloading(true)
    try {
      const b64 = await downloadPackageVersion(org, feed, pkg, version.version)
      saveBase64(b64, `${pkg.name}.${version.version}.nupkg`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {writable && available.length > 0 && (
          <>
            <select
              aria-label="Visão de destino"
              className="h-6 rounded-sm border border-border bg-surface px-1 text-[12px]"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Promover para…</option>
              {available.map((v) => (
                <option key={v.id} value={v.name}>
                  @{v.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" disabled={!target || busy} icon={<ArrowUpCircle className="size-3.5" />} onClick={() => run({ kind: 'promote', view: target })}>
              Promover
            </Button>
          </>
        )}
        {writable && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            icon={version.isListed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            onClick={() =>
              run(
                { kind: 'list', listed: !version.isListed },
                version.isListed ? `Deixar a versão ${version.version} não listada?` : undefined
              )
            }
          >
            {version.isListed ? 'Não listar' : 'Listar'}
          </Button>
        )}
        {protocolGroup(pkg.protocolType) === 'nuget' && (
          <Button size="sm" variant="ghost" disabled={busy} loading={downloading} icon={<Download className="size-3.5" />} onClick={download}>
            Baixar
          </Button>
        )}
        {writable && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => run({ kind: 'delete' }, `Excluir a versão ${version.version} de ${pkg.name}? Esta ação não pode ser desfeita.`)}
          >
            Excluir
          </Button>
        )}
      </div>
      {error && <span className="max-w-full text-right text-[12px] break-all text-fail-ink">{error}</span>}
    </div>
  )
}

/** Comandos de instalação da versão escolhida, dependências e origem. */
function InstallPanel({ org, feed, pkg, versions }: { org: string; feed: Feed; pkg: FeedPackage; versions: PackageVersion[] }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const current = versions.find((v) => v.version === chosen) ?? versions.find((v) => v.isLatest) ?? versions[0]
  if (!current) return <Loading label="Carregando versões…" />
  const snippets = installSnippets({ org, feed, pkg, version: current.version })
  const upstreams = (current.sourceChain ?? []).map((s) => s.name ?? s.feedName ?? 'upstream')

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="colhead">Versão</span>
        <select
          aria-label="Versão para instalação"
          className="h-7 rounded-sm border border-border bg-surface px-2 text-sm"
          value={current.version}
          onChange={(e) => setChosen(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.version}>
              {v.version}
              {v.isLatest ? ' (última)' : ''}
            </option>
          ))}
        </select>
      </label>

      {snippets.length === 0 ? (
        <p className="text-muted">Comandos de instalação não disponíveis para {PROTOCOL_LABEL[protocolGroup(pkg.protocolType)]}.</p>
      ) : (
        snippets.map((s) => <Snippet key={s.title} title={s.title} code={s.code} />)
      )}

      <section>
        <div className="colhead mb-1">Origem</div>
        <p className="text-muted">{upstreams.length > 0 ? `Vem de upstream: ${upstreams.join(', ')}` : 'Publicada neste feed.'}</p>
      </section>

      <section>
        <div className="colhead mb-1">Dependências</div>
        {(current.dependencies ?? []).length === 0 ? (
          <p className="text-muted">Sem dependências declaradas nesta versão.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 border-t border-border">
            {(current.dependencies ?? []).map((d, i) => (
              <li key={`${d.packageName}-${i}`} className="flex items-center gap-3 border-b border-border py-1 text-sm">
                <span className="font-medium">{d.packageName}</span>
                <span className="narrow text-muted">{d.versionRange ?? ''}</span>
                <span className="ml-auto text-[12px] text-muted">{d.group ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <span className="colhead flex-1">{title}</span>
        <Button size="sm" variant="ghost" onClick={copy} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}>
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <pre className="overflow-auto rounded-sm border border-border bg-surface-2 p-2 font-mono text-[12.5px] whitespace-pre-wrap break-all">{code}</pre>
    </section>
  )
}

