// Tela Arquivos: árvore preguiçosa, visualizador (texto/imagem/binário), README, histórico,
// edição com commit, novo arquivo, exclusão, upload e clonagem.
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, File, FileImage, Folder, FolderOpen, Download, Pencil, Trash2, Upload, FilePlus, Link2 } from 'lucide-react'
import {
  Avatar,
  Button,
  Code,
  Empty,
  ErrorBox,
  ExternalButton,
  Field,
  Input,
  Loading,
  Markdown,
  Modal,
  PageHeader,
  Tabs,
  Toolbar,
  cx,
  formatDate,
  useResizableColumns
} from '@/components/ui'
import { CodeEditor } from '@/components/CodeEditor'
import { ado, adoList, saveBase64, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { CloneDialog, RepoGate, RepoSwitcher, VersionSelect, useReposBase, useVersion } from './repoParts'
import {
  branchHead,
  commitChanges,
  repoKey,
  repoPath,
  shortHash,
  useRepoMutation,
  versionQuery,
  versionToStr,
  type GitCommit,
  type GitItem,
  type GitRepo,
  type PushChange,
  type Version
} from './repoApi'

const normPath = (p: string) => p.replace(/\/+$/, '') || '/'
/** Caminho absoluto a partir do splat da rota ("src/a.cs" → "/src/a.cs"). */
const toItemPath = (splat: string) => '/' + splat.replace(/^\/+|\/+$/g, '')
const encodePath = (p: string) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/')
const parentOf = (p: string) => {
  const n = normPath(p)
  const i = n.lastIndexOf('/')
  return i <= 0 ? '/' : n.slice(0, i)
}
const baseName = (p: string) => normPath(p).split('/').pop() ?? ''
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i

export function FilesScreen() {
  return <RepoGate>{(repo) => <FilesView repo={repo} />}</RepoGate>
}

function FilesView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const { '*': splat = '' } = useParams()
  const navigate = useNavigate()
  const base = useReposBase()
  const [version, setVersion] = useVersion(repo)
  const [tab, setTab] = useState<'conteudo' | 'historico'>('conteudo')
  const [cloneOpen, setCloneOpen] = useState(false)
  const itemPath = toItemPath(splat)
  const vq = versionQuery(version)

  const openPath = (p: string) => {
    const to = `${base}/files/${seg(repo.name)}${p === '/' ? '' : '/' + encodePath(p)}`
    navigate({ pathname: to, search: `?v=${encodeURIComponent(versionToStr(version))}` })
  }

  const current = useQuery({
    queryKey: repoKey(org, project, 'item', repo.name, versionToStr(version), itemPath),
    queryFn: () =>
      ado<GitItem>({
        org,
        path: `${repoPath(project, repo.name)}/items`,
        query: { path: itemPath, ...vq, includeContentMetadata: true }
      })
  })

  const rootChildren = useQuery({
    queryKey: repoKey(org, project, 'tree', repo.name, versionToStr(version), '/'),
    queryFn: () => childrenOf(org, project, repo.name, version, '/')
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Arquivos"
        subtitle={repo.name}
        breadcrumb={<Crumbs repo={repo.name} path={itemPath} onOpen={openPath} />}
        actions={
          <>
            <RepoSwitcher screen="files" repo={repo} />
            <Button variant="ghost" size="sm" icon={<Link2 className="size-3.5" />} onClick={() => setCloneOpen(true)}>
              Clonar
            </Button>
            <ExternalButton
              url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}?path=${encodeURIComponent(itemPath)}&version=GB${encodeURIComponent(version.name)}`)}
            />
          </>
        }
      >
        <div className="flex items-center gap-3 pb-2">
          <VersionSelect org={org} project={project} repo={repo.name} value={version} onChange={setVersion} />
        </div>
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <aside className="scroll flex w-72 shrink-0 flex-col overflow-auto border-r border-border bg-surface">
          <QueryState query={rootChildren} label="raiz">
            {(items) => (
              <div className="flex flex-col py-1">
                {items.length === 0 && <Empty title="Repositório vazio" />}
                {items.map((it) => (
                  <TreeNode
                    key={it.path}
                    org={org}
                    project={project}
                    repo={repo.name}
                    version={version}
                    item={it}
                    depth={0}
                    selected={itemPath}
                    onOpen={openPath}
                  />
                ))}
              </div>
            )}
          </QueryState>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {current.isLoading ? (
            <Loading />
          ) : current.isError ? (
            <ErrorBox error={current.error} onRetry={() => current.refetch()} />
          ) : !current.data ? null : current.data.isFolder ? (
            <FolderView org={org} project={project} repo={repo} version={version} path={itemPath} onOpen={openPath} />
          ) : (
            <>
              <Tabs
                className="px-4 pt-1"
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'conteudo', label: 'Conteúdo' },
                  { key: 'historico', label: 'Histórico' }
                ]}
              />
              {tab === 'conteudo' ? (
                <FileView org={org} project={project} repo={repo} version={version} item={current.data} onOpen={openPath} />
              ) : (
                <FileHistory org={org} project={project} repo={repo.name} version={version} path={itemPath} />
              )}
            </>
          )}
        </section>
      </div>
      <CloneDialog repo={repo} open={cloneOpen} onClose={() => setCloneOpen(false)} />
    </div>
  )
}

/** Filhos imediatos de uma pasta (sem a própria pasta). */
async function childrenOf(org: string, project: string, repo: string, version: Version, folder: string): Promise<GitItem[]> {
  const scope = normPath(folder)
  const items = await adoList<GitItem>({
    org,
    path: `${repoPath(project, repo)}/items`,
    query: { scopePath: scope, recursionLevel: 'OneLevel', ...versionQuery(version) }
  })
  return items
    .filter((i) => normPath(i.path) !== scope)
    .sort((a, b) => (a.isFolder === b.isFolder ? a.path.localeCompare(b.path, 'pt-BR') : a.isFolder ? -1 : 1))
}

/** Estados de loading/erro de uma query local, com dados entregues a children. */
function QueryState<T>({
  query,
  label,
  children
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: T; refetch: () => unknown }
  label: string
  children: (data: T) => ReactNode
}) {
  if (query.isLoading) return <Loading label={`Carregando ${label}…`} />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  return <>{children(query.data)}</>
}

function TreeNode({
  org,
  project,
  repo,
  version,
  item,
  depth,
  selected,
  onOpen
}: {
  org: string
  project: string
  repo: string
  version: Version
  item: GitItem
  depth: number
  selected: string
  onOpen: (p: string) => void
}) {
  const isSelected = normPath(selected) === normPath(item.path)
  const containsSelected = !!item.isFolder && normPath(selected).startsWith(normPath(item.path) + '/')
  const [open, setOpen] = useState(containsSelected)
  const children = useQuery({
    queryKey: repoKey(org, project, 'tree', repo, versionToStr(version), item.path),
    enabled: !!item.isFolder && open,
    queryFn: () => childrenOf(org, project, repo, version, item.path)
  })
  const Icon = item.isFolder ? (open ? FolderOpen : Folder) : IMAGE_RE.test(item.path) ? FileImage : File
  return (
    <div>
      <div
        className={cx('flex h-7 cursor-pointer items-center gap-1 pr-2 text-[13px] hover:bg-surface-2', isSelected && 'bg-surface-2 font-semibold')}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (item.isFolder) setOpen((o) => !o)
          onOpen(item.path)
        }}
        title={item.path}
      >
        {item.isFolder ? (
          open ? <ChevronDown className="size-3.5 shrink-0 text-muted" /> : <ChevronRight className="size-3.5 shrink-0 text-muted" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0 text-muted" />
        <span className="truncate">{baseName(item.path)}</span>
      </div>
      {item.isFolder && open && (
        <div>
          {children.isLoading && (
            <div style={{ paddingLeft: 8 + (depth + 1) * 12 }} className="h-7 text-[12px] leading-7 text-muted">
              Carregando…
            </div>
          )}
          {children.isError && (
            <div style={{ paddingLeft: 8 + (depth + 1) * 12 }} className="text-[12px] text-fail-ink">
              Falha ao carregar pasta
            </div>
          )}
          {children.data?.map((c) => (
            <TreeNode key={c.path} org={org} project={project} repo={repo} version={version} item={c} depth={depth + 1} selected={selected} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function Crumbs({ repo, path, onOpen }: { repo: string; path: string; onOpen: (p: string) => void }) {
  const parts = normPath(path).split('/').filter(Boolean)
  return (
    <nav className="flex flex-wrap items-center gap-1">
      <button className="hover:text-fg" onClick={() => onOpen('/')}>
        {repo}
      </button>
      {parts.map((p, i) => {
        const to = '/' + parts.slice(0, i + 1).join('/')
        return (
          <span key={to} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button className={cx('hover:text-fg', i === parts.length - 1 && 'font-semibold text-fg')} onClick={() => onOpen(to)}>
              {p}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

function FolderView({
  org,
  project,
  repo,
  version,
  path,
  onOpen
}: {
  org: string
  project: string
  repo: GitRepo
  version: Version
  path: string
  onOpen: (p: string) => void
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const children = useQuery({
    queryKey: repoKey(org, project, 'folder', repo.name, versionToStr(version), path),
    queryFn: () => childrenOf(org, project, repo.name, version, path)
  })
  const readme = useQuery({
    queryKey: repoKey(org, project, 'readme', repo.name, versionToStr(version), path),
    queryFn: async () => {
      for (const name of ['README.md', 'readme.md']) {
        const p = normPath(path) === '/' ? `/${name}` : `${normPath(path)}/${name}`
        try {
          const d = await ado<{ content?: string }>({
            org,
            path: `${repoPath(project, repo.name)}/items`,
            query: { path: p, includeContent: true, ...versionQuery(version) }
          })
          if (typeof d.content === 'string') return d.content
        } catch {
          /* sem README neste nível */
        }
      }
      return null
    }
  })

  const rz = useResizableColumns('repos.files.folder', [{ key: 'name' }, { key: 'size', width: 96 }])
  return (
    <div className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center gap-2">
        <span className="colhead flex-1">Conteúdo da pasta</span>
        <Button size="sm" icon={<FilePlus className="size-3.5" />} onClick={() => setNewOpen(true)}>
          Novo arquivo
        </Button>
        <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => setUploadOpen(true)}>
          Upload
        </Button>
      </div>
      <QueryState query={children} label="pasta">
        {(items) =>
          items.length === 0 ? (
            <Empty title="Pasta vazia" />
          ) : (
            <table className={cx('w-full border-collapse text-sm', rz.custom && '[&_td]:overflow-hidden')} style={rz.tableStyle}>
              <thead className="sticky top-0 z-[1] bg-surface">
                <tr className="border-b-2 border-rule-strong">
                  <th data-col="name" style={{ width: rz.width('name') }} className="colhead relative h-8 overflow-visible px-2 text-left">Nome{rz.handle('name')}</th>
                  <th data-col="size" style={{ width: rz.width('size') }} className="colhead relative h-8 overflow-visible w-24 px-2 text-right">Tamanho{rz.handle('size')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.path} className="h-8 cursor-pointer border-b border-border hover:bg-surface-2" onClick={() => onOpen(it.path)}>
                    <td className="px-2 py-1">
                      <span className="inline-flex items-center gap-2">
                        {it.isFolder ? <Folder className="size-4 text-muted" /> : <File className="size-4 text-muted" />}
                        {baseName(it.path)}
                      </span>
                    </td>
                    <td className="narrow px-2 text-right text-[12px] text-muted">{it.isFolder ? '' : formatBytes(it.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
      <div>
        {readme.isLoading && <Loading label="Carregando README…" />}
        {readme.isError && <ErrorBox error={readme.error} onRetry={() => readme.refetch()} />}
        {readme.data && (
          <div className="rounded-sm border border-border bg-surface p-4">
            <div className="colhead mb-2">README.md</div>
            <Markdown>{readme.data}</Markdown>
          </div>
        )}
      </div>
      <NewFileModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        org={org}
        project={project}
        repo={repo.name}
        version={version}
        folder={path}
        onCreated={(p) => {
          setNewOpen(false)
          onOpen(p)
        }}
      />
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        org={org}
        project={project}
        repo={repo.name}
        version={version}
        folder={path}
        existing={children.data?.map((c) => normPath(c.path)) ?? []}
      />
    </div>
  )
}

function formatBytes(n?: number) {
  if (n === undefined) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Novo arquivo: pede nome, cria commit "add" com conteúdo vazio e abre o arquivo. */
function NewFileModal({
  open,
  onClose,
  org,
  project,
  repo,
  version,
  folder,
  onCreated
}: {
  open: boolean
  onClose: () => void
  org: string
  project: string
  repo: string
  version: Version
  folder: string
  onCreated: (path: string) => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const target = `${normPath(folder) === '/' ? '' : normPath(folder)}/${name.trim().replace(/^\/+/, '')}`
  const create = useRepoMutation(org, project, async () => {
    const head = await branchHead(org, project, repo, version.name)
    if (!head) throw new Error('Só é possível commitar em uma branch. Selecione uma branch.')
    return commitChanges(org, project, repo, {
      branch: version.name,
      oldObjectId: head,
      message: message.trim(),
      changes: [{ changeType: 'add', path: target, content: '' }]
    })
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo arquivo"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || !message.trim()}
            onClick={() => {
              setErr(null)
              create.mutate(undefined, {
                onSuccess: () => onCreated(target),
                onError: (e) => setErr(e instanceof Error ? e.message : String(e))
              })
            }}
          >
            Criar e commitar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nome do arquivo" hint={`Em ${normPath(folder)} na branch ${version.name}`}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: docs/notas.md" autoFocus />
        </Field>
        <Field label="Mensagem do commit">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={name ? `Adiciona ${name.trim()}` : ''} />
        </Field>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      </div>
    </Modal>
  )
}

/** Upload: lê os arquivos em base64 e envia um único push com um change "add" por arquivo (ou "edit" se já existir). */
function UploadModal({
  open,
  onClose,
  org,
  project,
  repo,
  version,
  folder,
  existing
}: {
  open: boolean
  onClose: () => void
  org: string
  project: string
  repo: string
  version: Version
  folder: string
  existing: string[]
}) {
  const [files, setFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const upload = useRepoMutation(org, project, async () => {
    const head = await branchHead(org, project, repo, version.name)
    if (!head) throw new Error('Só é possível commitar em uma branch. Selecione uma branch.')
    const changes: PushChange[] = []
    for (const f of files) {
      const b64 = await fileToBase64(f)
      const path = `${normPath(folder) === '/' ? '' : normPath(folder)}/${f.name}`
      changes.push({ changeType: existing.includes(normPath(path)) ? 'edit' : 'add', path, content: b64, base64: true })
    }
    return commitChanges(org, project, repo, { branch: version.name, oldObjectId: head, message: message.trim(), changes })
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload de arquivos"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={upload.isPending}
            disabled={files.length === 0 || !message.trim()}
            onClick={() => {
              setErr(null)
              upload.mutate(undefined, {
                onSuccess: () => {
                  setFiles([])
                  setMessage('')
                  onClose()
                },
                onError: (e) => setErr(e instanceof Error ? e.message : String(e))
              })
            }}
          >
            Enviar e commitar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Arquivos" hint={`Destino: ${normPath(folder)} na branch ${version.name}`}>
          <input type="file" multiple className="text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </Field>
        {files.length > 0 && (
          <ul className="text-[12px] text-muted">
            {files.map((f) => (
              <li key={f.name}>
                {f.name} · {formatBytes(f.size)}
              </li>
            ))}
          </ul>
        )}
        <Field label="Mensagem do commit">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Adiciona arquivos" />
        </Field>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      </div>
    </Modal>
  )
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

function FileView({
  org,
  project,
  repo,
  version,
  item,
  onOpen
}: {
  org: string
  project: string
  repo: GitRepo
  version: Version
  item: GitItem
  onOpen: (p: string) => void
}) {
  const content = useQuery({
    queryKey: repoKey(org, project, 'content', repo.name, versionToStr(version), item.path, item.objectId),
    queryFn: async (): Promise<{ isBinary: boolean; contentType?: string; data: string }> => {
      const meta = await ado<{ content?: string; contentMetadata?: { isBinary?: boolean; contentType?: string } }>({
        org,
        path: `${repoPath(project, repo.name)}/items`,
        query: { path: item.path, includeContent: true, ...versionQuery(version) }
      })
      if (meta.contentMetadata?.isBinary) {
        const b64 = await ado<string>({
          org,
          path: `${repoPath(project, repo.name)}/items`,
          query: { path: item.path, download: true, ...versionQuery(version) },
          responseType: 'base64'
        })
        return { isBinary: true, contentType: meta.contentMetadata.contentType, data: b64 }
      }
      return { isBinary: false, contentType: meta.contentMetadata?.contentType, data: meta.content ?? '' }
    }
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const commit = useRepoMutation(org, project, async (change: PushChange) => {
    const head = await branchHead(org, project, repo.name, version.name)
    if (!head) throw new Error('Só é possível commitar em uma branch. Selecione uma branch.')
    return commitChanges(org, project, repo.name, { branch: version.name, oldObjectId: head, message: message.trim(), changes: [change] })
  })

  if (content.isLoading) return <Loading label="Carregando arquivo…" />
  if (content.isError) return <ErrorBox error={content.error} onRetry={() => content.refetch()} />
  if (!content.data) return null
  const data = content.data
  const text = data.data
  const dirty = editing && draft !== text

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar className="py-2">
        <Code>{item.path}</Code>
        <span className="text-[12px] text-muted">
          {formatBytes(item.size)} · {shortHash(item.objectId)}
        </span>
        <div className="flex-1" />
        {!data.isBinary && !editing && (
          <Button
            size="sm"
            icon={<Pencil className="size-3.5" />}
            onClick={() => {
              setDraft(text)
              setMessage(`Atualiza ${baseName(item.path)}`)
              setEditing(true)
              setErr(null)
            }}
          >
            Editar
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadItem(baseName(item.path), data)}>
          Baixar
        </Button>
        {!editing && (
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => {
              setMessage(`Remove ${baseName(item.path)}`)
              setErr(null)
              setDeleteOpen(true)
            }}
          >
            Excluir
          </Button>
        )}
      </Toolbar>
      {editing && (
        <div className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-2">
          <div className="flex items-center gap-2">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem do commit" className="flex-1" />
            <span className="text-[12px] text-muted">em</span>
            <Code>{version.name}</Code>
            <Button
              variant="primary"
              loading={commit.isPending}
              disabled={!message.trim() || !dirty}
              onClick={() => {
                setErr(null)
                commit.mutate(
                  { changeType: 'edit', path: item.path, content: draft },
                  {
                    onSuccess: () => setEditing(false),
                    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
                  }
                )
              }}
            >
              Commitar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
          {err && <div className="text-[12px] text-fail-ink">{err}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {data.isBinary ? (
          IMAGE_RE.test(item.path) && data.contentType?.startsWith('image/') ? (
            <div className="flex h-full items-center justify-center overflow-auto p-6">
              <img alt={item.path} className="max-h-full max-w-full" src={`data:${data.contentType};base64,${data.data}`} />
            </div>
          ) : (
            <Empty title="Arquivo binário">Use “Baixar” para abrir este arquivo.</Empty>
          )
        ) : (
          <CodeEditor value={editing ? draft : text} readOnly={!editing} onChange={editing ? setDraft : undefined} path={item.path} />
        )}
      </div>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir arquivo"
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={commit.isPending}
              disabled={!message.trim()}
              onClick={() =>
                commit.mutate(
                  { changeType: 'delete', path: item.path },
                  {
                    onSuccess: () => {
                      setDeleteOpen(false)
                      onOpen(parentOf(item.path))
                    },
                    onError: (e) => setErr(e instanceof Error ? e.message : String(e))
                  }
                )
              }
            >
              Excluir e commitar
            </Button>
          </>
        }
      >
        <p className="mb-3">
          O arquivo <Code>{item.path}</Code> será removido em um novo commit na branch {version.name}.
        </p>
        <Field label="Mensagem do commit">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {err && <div className="mt-2 text-[12px] text-fail-ink">{err}</div>}
      </Modal>
    </div>
  )
}

function downloadItem(name: string, data: { isBinary: boolean; contentType?: string; data: string }) {
  const b64 = data.isBinary ? data.data : btoa(String.fromCharCode(...new TextEncoder().encode(data.data)))
  saveBase64(b64, name, data.contentType ?? 'application/octet-stream')
}

function FileHistory({ org, project, repo, version, path }: { org: string; project: string; repo: string; version: Version; path: string }) {
  const rz = useResizableColumns('repos.files.history', [{ key: 'hash', width: 80 }, { key: 'message' }, { key: 'author' }, { key: 'date' }])
  const commits = useQuery({
    queryKey: repoKey(org, project, 'history', repo, versionToStr(version), path),
    queryFn: () =>
      adoList<GitCommit>({
        org,
        path: `${repoPath(project, repo)}/commits`,
        query: {
          'searchCriteria.itemPath': path,
          'searchCriteria.itemVersion.version': version.name,
          'searchCriteria.itemVersion.versionType': version.type,
          $top: 30
        }
      })
  })
  return (
    <div className="scroll min-h-0 flex-1 overflow-auto p-4">
      <QueryState query={commits} label="histórico">
        {(list) =>
          list.length === 0 ? (
            <Empty title="Sem commits para este arquivo" />
          ) : (
            <table className={cx('w-full border-collapse text-sm', rz.custom && '[&_td]:overflow-hidden')} style={rz.tableStyle}>
              <thead className="sticky top-0 z-[1] bg-surface">
                <tr className="border-b-2 border-rule-strong">
                  <th data-col="hash" style={{ width: rz.width('hash') }} className="colhead relative h-8 overflow-visible w-20 px-2 text-left">Hash{rz.handle('hash')}</th>
                  <th data-col="message" style={{ width: rz.width('message') }} className="colhead relative h-8 overflow-visible px-2 text-left">Mensagem{rz.handle('message')}</th>
                  <th data-col="author" style={{ width: rz.width('author') }} className="colhead relative h-8 overflow-visible px-2 text-left">Autor{rz.handle('author')}</th>
                  <th data-col="date" style={{ width: rz.width('date') }} className="colhead relative h-8 overflow-visible px-2 text-right">Data{rz.handle('date')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.commitId} className="h-8 border-b border-border">
                    <td className="w-20 px-2">
                      <Code>{shortHash(c.commitId)}</Code>
                    </td>
                    <td className="truncate px-2">{c.comment.split('\n')[0]}</td>
                    <td className="px-2 whitespace-nowrap text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar name={c.author.name} size={18} />
                        {c.author.name}
                      </span>
                    </td>
                    <td className="narrow px-2 text-right text-[12px] whitespace-nowrap text-muted">{formatDate(c.author.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
    </div>
  )
}
