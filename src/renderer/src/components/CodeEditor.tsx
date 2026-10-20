// Editor/visualizador de código (Monaco local, sem CDN) e visualizador de diff.
import Editor, { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

const theme = () => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'vs-dark')

/** Deduz a linguagem do Monaco pela extensão do arquivo. */
export function languageFromPath(path: string): string {
  if (/dockerfile$/i.test(path)) return 'dockerfile'
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', cs: 'csharp', csproj: 'xml', xml: 'xml',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', py: 'python', java: 'java', go: 'go',
    rs: 'rust', sql: 'sql', sh: 'shell', ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
    cpp: 'cpp', c: 'c', h: 'cpp', kt: 'kotlin', php: 'php', rb: 'ruby', swift: 'swift', vb: 'vb',
    fs: 'fsharp', ini: 'ini', toml: 'ini', razor: 'razor', cshtml: 'razor', graphql: 'graphql'
  }
  return map[ext] ?? 'plaintext'
}

export function CodeEditor({
  value,
  onChange,
  path,
  language,
  readOnly = false,
  height = '100%'
}: {
  value: string
  onChange?: (v: string) => void
  path?: string
  language?: string
  readOnly?: boolean
  height?: string | number
}) {
  return (
    <Editor
      height={height}
      value={value}
      language={language ?? (path ? languageFromPath(path) : 'plaintext')}
      theme={theme()}
      onChange={(v) => onChange?.(v ?? '')}
      options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
    />
  )
}

export function DiffViewer({
  original,
  modified,
  path,
  sideBySide = true,
  height = '100%'
}: {
  original: string
  modified: string
  path?: string
  sideBySide?: boolean
  height?: string | number
}) {
  return (
    <DiffEditor
      height={height}
      original={original}
      modified={modified}
      language={path ? languageFromPath(path) : 'plaintext'}
      theme={theme()}
      options={{ readOnly: true, renderSideBySide: sideBySide, minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
    />
  )
}
