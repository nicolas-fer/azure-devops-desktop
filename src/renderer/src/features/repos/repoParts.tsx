// Peças compartilhadas pelas telas de Repos: resolução do repositório pela URL, troca de repositório,
// seletor de branch/tag (versão) e diálogo de clone.
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Copy, GitBranch } from 'lucide-react'
import { Button, Empty, ErrorBox, Loading, Modal, Select, Field, Input, cx } from '@/components/ui'
import { useScope } from '@/lib/context'
import { seg } from '@/lib/api'
import {
  refName,
  useAdoList,
  useRepos,
  parseVersion,
  versionToStr,
  type GitRef,
  type GitRepo,
  type Version
} from './repoApi'

const LAST_REPO_KEY = 'devops-desktop:repos:last'

/** Base das rotas de Repos dentro do projeto atual. */
export function useReposBase() {
  const { org, project } = useScope()
  return `/${org}/${seg(project)}/repos`
}

function readLastRepo(org: string, project: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_REPO_KEY) ?? '{}') as Record<string, string>
    return all[`${org}/${project}`] ?? null
  } catch {
    return null
  }
}

function saveLastRepo(org: string, project: string, repo: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_REPO_KEY) ?? '{}') as Record<string, string>
    all[`${org}/${project}`] = repo
    localStorage.setItem(LAST_REPO_KEY, JSON.stringify(all))
  } catch {
    /* localStorage indisponível: segue sem lembrar */
  }
}

/**
 * Resolve o repositório da URL (:repo). Sem repo na URL, usa o último escolhido (ou o primeiro)
 * e reescreve a rota para incluir o nome. Renderiza children(repo) quando resolvido.
 */
export function RepoGate({ children }: { children: (repo: GitRepo) => ReactNode }) {
  const { org, project } = useScope()
  const { repo: param } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const repos = useRepos(org, project)

  useEffect(() => {
    if (!repos.data || repos.data.length === 0) return
    if (param) {
      if (repos.data.some((r) => r.name === param)) saveLastRepo(org, project, param)
      return
    }
    const last = readLastRepo(org, project)
    const pick = repos.data.find((r) => r.name === last) ?? repos.data[0]!
    navigate(`${pathname.replace(/\/$/, '')}/${seg(pick.name)}`, { replace: true })
  }, [repos.data, param, org, project, pathname, navigate])

  if (repos.isLoading) return <Loading label="Carregando repositórios…" />
  if (repos.isError) return <ErrorBox error={repos.error} onRetry={() => repos.refetch()} />
  if (!repos.data || repos.data.length === 0) return <Empty title="Nenhum repositório neste projeto" />
  if (!param) return <Loading label="Abrindo repositório…" />
  const repo = repos.data.find((r) => r.name === param)
  if (!repo) return <Empty title="Repositório não encontrado">O repositório "{param}" não existe neste projeto.</Empty>
  return <>{children(repo)}</>
}

/** Seletor de repositório do cabeçalho. Troca mantém a tela atual (screen) e zera a sub-rota. */
export function RepoSwitcher({ screen, repo }: { screen: string; repo: GitRepo }) {
  const { org, project } = useScope()
  const navigate = useNavigate()
  const repos = useRepos(org, project)
  const base = useReposBase()
  if (!repos.data) return null
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted">
      <GitBranch className="size-3.5" />
      <Select
        aria-label="Repositório"
        className="h-6 w-56 text-[12px]"
        value={repo.name}
        onChange={(e) => navigate(`${base}/${screen}/${seg(e.target.value)}`)}
      >
        {repos.data.map((r) => (
          <option key={r.id} value={r.name}>
            {r.name}
          </option>
        ))}
      </Select>
    </label>
  )
}

/** Versão (branch, tag ou commit) guardada em ?v=. Padrão: branch padrão do repositório. */
export function useVersion(repo: GitRepo): [Version, (v: Version) => void] {
  const [params, setParams] = useSearchParams()
  const fallback: Version = { type: 'branch', name: (repo.defaultBranch ?? 'refs/heads/main').replace(/^refs\/heads\//, '') }
  const v = parseVersion(params.get('v'), fallback)
  const set = (next: Version) => {
    const p = new URLSearchParams(params)
    p.set('v', versionToStr(next))
    setParams(p, { replace: false })
  }
  return [v, set]
}

/** Lista de refs do repositório (branches ou tags), para selects de versão. */
export function useRefs(org: string, project: string, repo: string, kind: 'heads' | 'tags') {
  return useAdoList<GitRef>(org, project, ['refs', repo, kind], {
    path: `${seg(project)}/_apis/git/repositories/${seg(repo)}/refs`,
    query: { filter: `${kind}/`, peelTags: kind === 'tags' ? true : undefined, $top: 1000 }
  })
}

/** Seletor de branch ou tag. Dispara onChange com a versão escolhida. */
export function VersionSelect({
  org,
  project,
  repo,
  value,
  onChange,
  className
}: {
  org: string
  project: string
  repo: string
  value: Version
  onChange: (v: Version) => void
  className?: string
}) {
  const heads = useRefs(org, project, repo, 'heads')
  const tags = useRefs(org, project, repo, 'tags')
  const current = versionToStr(value)
  const hasHead = heads.data?.some((r) => r.name === refName(value.name)) ?? false
  const hasTag = tags.data?.some((r) => r.name === refName(value.name, 'tag')) ?? false
  return (
    <Select
      aria-label="Branch ou tag"
      className={cx('h-7 w-64 font-mono text-[12px]', className)}
      value={current}
      onChange={(e) => {
        const i = e.target.value.indexOf(':')
        onChange({ type: e.target.value.slice(0, i) as Version['type'], name: e.target.value.slice(i + 1) })
      }}
    >
      {!hasHead && !hasTag && <option value={current}>{value.name}</option>}
      <optgroup label="Branches">
        {heads.data?.map((r) => (
          <option key={r.name} value={`branch:${r.name.replace(/^refs\/heads\//, '')}`}>
            {r.name.replace(/^refs\/heads\//, '')}
          </option>
        ))}
      </optgroup>
      {tags.data && tags.data.length > 0 && (
        <optgroup label="Tags">
          {tags.data.map((r) => (
            <option key={r.name} value={`tag:${r.name.replace(/^refs\/tags\//, '')}`}>
              {r.name.replace(/^refs\/tags\//, '')}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  )
}

/** Diálogo "Clonar" com URLs HTTPS e SSH e botão copiar. */
export function CloneDialog({ repo, open, onClose }: { repo: GitRepo; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Clonar repositório" width={560}>
      <div className="flex flex-col gap-3">
        <CopyField label="HTTPS" value={repo.remoteUrl} />
        <CopyField label="SSH" value={repo.sshUrl} />
        <p className="text-[12px] text-muted">
          Use o PAT como senha ao clonar por HTTPS. O app não grava credenciais nos comandos copiados.
        </p>
      </div>
    </Modal>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} className="font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
        <Button
          icon={ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined)
            setOk(true)
            setTimeout(() => setOk(false), 1500)
          }}
        >
          {ok ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </Field>
  )
}
