// Recentes da Home. "last" vem do shell (devops-desktop:last); a lista local guarda os projetos abertos pela Home.
// Todo acesso a localStorage é protegido: o app funciona sem ele.

const RECENTS_KEY = 'devops-desktop:home-recents'
const LAST_KEY = 'devops-desktop:last'
const MAX = 8

type RecentsMap = Record<string, string[]>

function readMap(): RecentsMap {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '{}') as RecentsMap
  } catch {
    return {}
  }
}

export function readRecents(org: string): string[] {
  const names = readMap()[org] ?? []
  let last: string | undefined
  try {
    const l = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as { org?: string; project?: string }
    if (l.org === org && l.project) last = decodeURIComponent(l.project)
  } catch {
    last = undefined
  }
  const out = last ? [last, ...names.filter((n) => n !== last)] : names
  return out.slice(0, MAX)
}

export function pushRecent(org: string, name: string) {
  try {
    const map = readMap()
    map[org] = [name, ...(map[org] ?? []).filter((n) => n !== name)].slice(0, MAX)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(map))
  } catch {
    // armazenamento indisponível: ignora
  }
}
