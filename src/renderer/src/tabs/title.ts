import { projectFeatures, projectSettings } from '@/features/registry'

const dec = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Organização de uma rota (/org/...), ou undefined para a raiz. */
export function orgOfRoute(route: string): string | undefined {
  const org = route.split(/[?#]/)[0].split('/').filter(Boolean)[0]
  return org ? dec(org) : undefined
}

/** Título curto da aba: "Projeto · Área" (ou "Projetos", "Configurações…", "Busca…"). */
export function tabTitle(route: string): string {
  const [pathPart, query = ''] = route.split('#')[0].split('?')
  const segs = pathPart.split('/').filter(Boolean).map(dec)
  if (segs.length === 0) return 'Abrindo…'
  const [org, second, third, ...rest] = segs
  if (!second) return org
  if (second === '_home') return 'Projetos'
  if (second === '_settings') return 'Configurações da organização'
  if (second === '_search') {
    const text = new URLSearchParams(query).get('text')
    return text ? `Busca · ${text}` : 'Busca'
  }
  const feature = [...projectFeatures, projectSettings].find((f) => f.path === third)
  if (feature?.id === 'repos' && rest[0] === 'pullrequest' && rest[2]) return `${second} · PR !${rest[2]}`
  const sub = feature?.nav.find((n) => n.path === rest[0])?.label
  return `${second} · ${sub ?? feature?.label ?? 'Projeto'}`
}
