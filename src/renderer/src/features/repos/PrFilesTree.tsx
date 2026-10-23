// Árvore de arquivos alterados da aba Arquivos do PR: pastas aninhadas (cadeias com um único filho
// compactadas, como no ADO), filtro por trecho do caminho, navegação por ↑/↓/Enter e um painel
// redimensionável cuja largura fica salva em localStorage.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, File, Folder, FolderOpen, Search } from 'lucide-react'
import { IconButton, Input, cx } from '@/components/ui'

export interface PrFileItem {
  path: string
  changeType: string
}

const WIDTH_KEY = 'devops-desktop:pr-files-width'
const WIDTH_DEFAULT = 320
const WIDTH_MIN = 200
const widthMax = () => Math.max(WIDTH_MIN, Math.floor(window.innerWidth * 0.6))
const clampWidth = (w: number) => Math.min(Math.max(w, WIDTH_MIN), widthMax())

function readWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n > 0 ? n : WIDTH_DEFAULT
  } catch {
    return WIDTH_DEFAULT
  }
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    /* sem localStorage: a largura vale só nesta sessão */
  }
}

// ---------------------------------------------------------------- Montagem da árvore

interface FileNode {
  kind: 'file'
  name: string
  path: string
  changeType: string
}

interface DirNode {
  kind: 'dir'
  key: string
  name: string
  count: number
  children: TreeNode[]
}

type TreeNode = FileNode | DirNode

interface BuildDir {
  key: string
  name: string
  dirs: Map<string, BuildDir>
  files: FileNode[]
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })

function toNodes(dir: BuildDir): TreeNode[] {
  const folders = [...dir.dirs.values()].map((d): DirNode => {
    // Cadeia de pastas com um único filho (e sem arquivos) vira uma linha só: "src/Modules/Dynamics"
    let cur = d
    let name = d.name
    while (cur.dirs.size === 1 && cur.files.length === 0) {
      cur = [...cur.dirs.values()][0]!
      name += '/' + cur.name
    }
    const children = toNodes(cur)
    const count = children.reduce((s, c) => s + (c.kind === 'file' ? 1 : c.count), 0)
    return { kind: 'dir', key: cur.key, name, count, children }
  })
  folders.sort(byName)
  const files = [...dir.files].sort(byName)
  return [...folders, ...files]
}

function buildTree(items: PrFileItem[]): TreeNode[] {
  const root: BuildDir = { key: '', name: '', dirs: new Map(), files: [] }
  for (const it of items) {
    const segs = it.path.split('/').filter(Boolean)
    if (segs.length === 0) continue
    let cur = root
    segs.slice(0, -1).forEach((seg, i) => {
      let next = cur.dirs.get(seg)
      if (!next) {
        next = { key: segs.slice(0, i + 1).join('/'), name: seg, dirs: new Map(), files: [] }
        cur.dirs.set(seg, next)
      }
      cur = next
    })
    cur.files.push({ kind: 'file', name: segs[segs.length - 1]!, path: it.path, changeType: it.changeType })
  }
  return toNodes(root)
}

function collectDirKeys(nodes: TreeNode[], out: Set<string>) {
  for (const n of nodes) {
    if (n.kind === 'dir') {
      out.add(n.key)
      collectDirKeys(n.children, out)
    }
  }
}

function collectVisibleFiles(nodes: TreeNode[], isOpen: (key: string) => boolean, out: string[]) {
  for (const n of nodes) {
    if (n.kind === 'file') out.push(n.path)
    else if (isOpen(n.key)) collectVisibleFiles(n.children, isOpen, out)
  }
}

// ---------------------------------------------------------------- Marca de mudança

const changeLetter = (type: string) => (type.includes('add') ? 'A' : type.includes('delete') ? 'D' : type.includes('rename') ? 'R' : 'M')

/** Letra da mudança (A/M/D/R) com a cor de zona do design system. */
export function ChangeTag({ type }: { type: string }) {
  const letter = changeLetter(type)
  const cls = letter === 'A' ? 'text-done-ink' : letter === 'D' ? 'text-fail-ink' : letter === 'R' ? 'text-new-ink' : 'text-progress-ink'
  return <span className={cx('narrow w-4 shrink-0 text-center text-[12px] font-bold', cls)}>{letter}</span>
}

// ---------------------------------------------------------------- Painel

/**
 * Painel esquerdo (árvore + filtro) com alça redimensionável; `children` ocupa o restante (diff/comentários).
 * Não usa ids DOM fixos: várias abas podem estar montadas ao mesmo tempo.
 */
export function PrFilesPane({
  items,
  selectedPath,
  onSelect,
  children
}: {
  items: PrFileItem[]
  selectedPath?: string
  onSelect: (path: string) => void
  children: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [width, setWidth] = useState(readWidth)
  const treeRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const forceOpen = q !== ''
  const filtered = useMemo(() => (q ? items.filter((i) => i.path.toLowerCase().includes(q)) : items), [items, q])
  const tree = useMemo(() => buildTree(filtered), [filtered])
  const isOpen = (key: string) => forceOpen || !collapsed.has(key)
  const visible: string[] = []
  collectVisibleFiles(tree, isOpen, visible)
  const w = clampWidth(width)

  useEffect(() => {
    if (!selectedPath) return
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(selectedPath)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedPath])

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => {
    const all = new Set<string>()
    collectDirKeys(tree, all)
    setCollapsed(all)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    if (visible.length === 0) return
    e.preventDefault()
    const idx = selectedPath ? visible.indexOf(selectedPath) : -1
    if (e.key === 'Enter') {
      onSelect(idx >= 0 ? visible[idx]! : visible[0]!)
      return
    }
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, visible.length - 1) : Math.max(idx - 1, 0)
    onSelect(visible[next]!)
  }

  // Arraste na janela inteira (o ponteiro sai da alça durante o gesto); soltar salva a largura
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = w
    let last = w
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: PointerEvent) => {
      last = clampWidth(startW + ev.clientX - startX)
      setWidth(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      saveWidth(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
  }

  const onResizeReset = () => {
    setWidth(WIDTH_DEFAULT)
    saveWidth(WIDTH_DEFAULT)
  }

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode[] =>
    nodes.map((n) => {
      if (n.kind === 'dir') {
        const open = isOpen(n.key)
        return (
          <div key={'d:' + n.key}>
            <div
              role="treeitem"
              aria-expanded={open}
              title={n.key}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => toggle(n.key)}
              className="flex h-7 cursor-pointer items-center gap-1.5 pr-3 text-[12px] hover:bg-surface-2"
            >
              {open ? <ChevronDown className="size-3.5 shrink-0 text-muted" /> : <ChevronRight className="size-3.5 shrink-0 text-muted" />}
              {open ? <FolderOpen className="size-3.5 shrink-0 text-muted" /> : <Folder className="size-3.5 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
              <span className="narrow shrink-0 text-[11px] font-semibold text-muted">{n.count}</span>
            </div>
            {open && <div role="group">{renderNodes(n.children, depth + 1)}</div>}
          </div>
        )
      }
      const selected = n.path === selectedPath
      return (
        <div
          key={'f:' + n.path}
          role="treeitem"
          aria-selected={selected}
          data-path={n.path}
          title={n.path}
          style={{ paddingLeft: 8 + depth * 12 + 14 }}
          onClick={() => onSelect(n.path)}
          className={cx(
            'flex h-7 cursor-pointer items-center gap-1.5 border-l-2 pr-3 text-[12px] hover:bg-surface-2',
            selected ? 'border-rule-strong bg-surface-2 font-semibold' : 'border-transparent'
          )}
        >
          <File className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          <ChangeTag type={n.changeType} />
        </div>
      )
    })

  return (
    <div className="flex min-h-0 flex-1">
      <aside style={{ width: w }} className="flex min-h-0 shrink-0 flex-col bg-surface">
        <div className="flex items-center gap-1 border-b border-border px-2 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" />
            <Input className="pl-7" type="search" placeholder="Filtrar arquivos…" aria-label="Filtrar arquivos" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <IconButton title="Expandir tudo" className="size-6" onClick={expandAll}>
            <ChevronsUpDown className="size-3.5" />
          </IconButton>
          <IconButton title="Recolher tudo" className="size-6" onClick={collapseAll}>
            <ChevronsDownUp className="size-3.5" />
          </IconButton>
        </div>
        <div
          ref={treeRef}
          role="tree"
          tabIndex={0}
          aria-label="Arquivos alterados"
          onKeyDown={onKeyDown}
          className="scroll min-h-0 flex-1 overflow-auto py-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/40"
        >
          {tree.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted">Nenhum arquivo corresponde ao filtro.</div>
          ) : (
            renderNodes(tree, 0)
          )}
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painel de arquivos"
        title="Arraste para redimensionar · duplo clique restaura a largura padrão"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
        className="w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-border hover:bg-focus"
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
