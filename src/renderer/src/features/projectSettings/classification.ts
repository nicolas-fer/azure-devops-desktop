import { useQuery } from '@tanstack/react-query'
import { ado, seg } from '@/lib/api'

export type Structure = 'Iterations' | 'Areas'

export interface ClassificationNode {
  id: number
  identifier: string
  name: string
  structureType: string
  hasChildren?: boolean
  children?: ClassificationNode[]
  attributes?: { startDate?: string; finishDate?: string }
}

/** Linha achatada da árvore. `chain` são os nomes abaixo da raiz (ex.: ["Sprint 1"]). */
export interface NodeRow {
  node: ClassificationNode
  depth: number
  chain: string[]
  isRoot: boolean
}

/** Caminho relativo à estrutura usado pela API de classificação (ex.: "Sprint%201/Sub"). Raiz = "". */
export const nodeRel = (chain: string[]) => chain.map((s) => encodeURIComponent(s)).join('/')

export const nodePath = (structure: Structure, chain: string[]) => [structure, nodeRel(chain)].filter(Boolean).join('/')

export function flattenNodes(root: ClassificationNode): NodeRow[] {
  const out: NodeRow[] = []
  const walk = (n: ClassificationNode, depth: number, chain: string[]) => {
    out.push({ node: n, depth, chain, isRoot: depth === 0 })
    for (const c of n.children ?? []) walk(c, depth + 1, [...chain, c.name])
  }
  walk(root, 0, [])
  return out
}

export function useClassificationTree(org: string, project: string, structure: Structure) {
  return useQuery({
    queryKey: ['ps', org, project, 'classification', structure],
    enabled: !!org && !!project,
    queryFn: () =>
      ado<ClassificationNode>({
        org,
        path: `${seg(project)}/_apis/wit/classificationnodes/${structure}`,
        query: { $depth: 10 }
      })
  })
}

/** Lista de caminhos de área no formato de teamfieldvalues: "Projeto\\Sub\\Neto". */
export const areaValue = (project: string, chain: string[]) => [project, ...chain].join('\\')

export const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '')
export const isoFromInput = (d: string) => `${d}T00:00:00Z`
