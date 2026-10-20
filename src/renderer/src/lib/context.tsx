import { createContext, useContext, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ado, adoList, seg, type Account, type Profile, type Project, type Team } from './api'

/** Organização e projeto atuais vêm da URL: /#/:org/:project/... */
export function useOrg(): string {
  const { org } = useParams()
  return org ?? ''
}

export function useProjectName(): string {
  const { project } = useParams()
  return project ?? ''
}

/** Atalho: { org, project } da rota atual. */
export function useScope() {
  return { org: useOrg(), project: useProjectName() }
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => ado<Profile>({ host: 'app', path: '_apis/profile/profiles/me' }),
    staleTime: Infinity
  })
}

export function useAccounts() {
  const profile = useProfile()
  return useQuery({
    queryKey: ['accounts', profile.data?.id],
    enabled: !!profile.data,
    queryFn: () => adoList<Account>({ host: 'app', path: '_apis/accounts', query: { memberId: profile.data!.id } }),
    staleTime: Infinity
  })
}

export function useProjects(org: string) {
  return useQuery({
    queryKey: [org, 'projects'],
    enabled: !!org,
    queryFn: () => adoList<Project>({ org, path: '_apis/projects', query: { $top: 500 } })
  })
}

export function useProject(org: string, project: string) {
  return useQuery({
    queryKey: [org, 'project', project],
    enabled: !!org && !!project,
    queryFn: () =>
      ado<Project & { defaultTeam?: { id: string; name: string } }>({
        org,
        path: `_apis/projects/${seg(project)}`,
        query: { includeCapabilities: true }
      })
  })
}

export function useTeams(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'teams'],
    enabled: !!org && !!project,
    // Ordem alfabética (com números em ordem natural: "Squad 9" antes de "Squad 10") em todos os seletores de time
    queryFn: async () =>
      (await adoList<Team>({ org, path: `_apis/projects/${seg(project)}/teams`, query: { $top: 500 } })).sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
      )
  })
}

/** Time selecionado (padrão do projeto, sobrescrito por ?team= na URL quando a feature quiser). */
const TeamCtx = createContext<string | null>(null)
export const TeamProvider = ({ team, children }: { team: string | null; children: ReactNode }) => (
  <TeamCtx.Provider value={team}>{children}</TeamCtx.Provider>
)
export function useDefaultTeam(): string | null {
  return useContext(TeamCtx)
}

/** Usuário autenticado na organização (id usado em assignedTo, reviewers, requestedFor). Base do roxo "é meu". */
export function useMe(org: string) {
  return useQuery({
    queryKey: [org, 'me'],
    enabled: !!org,
    staleTime: Infinity,
    queryFn: async () => {
      const d = await ado<{ authenticatedUser: { id: string; providerDisplayName: string; properties?: { Account?: { $value: string } } } }>({
        org,
        path: '_apis/connectionData',
        apiVersion: null
      })
      return {
        id: d.authenticatedUser.id,
        displayName: d.authenticatedUser.providerDisplayName,
        uniqueName: d.authenticatedUser.properties?.Account?.$value ?? ''
      }
    }
  })
}

/** Testa se uma identidade é o usuário atual (por id ou e-mail). */
export function isMe(me: { id: string; uniqueName: string } | undefined, who?: { id?: string; uniqueName?: string } | null): boolean {
  if (!me || !who) return false
  return (!!who.id && who.id === me.id) || (!!who.uniqueName && !!me.uniqueName && who.uniqueName.toLowerCase() === me.uniqueName.toLowerCase())
}
