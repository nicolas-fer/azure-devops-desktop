// Comandos de instalação e URLs de registro por protocolo.
import { protocolGroup, type Feed, type FeedPackage, type ProtocolGroup } from './api'

export interface InstallSnippet {
  title: string
  code: string
}

/** URL base do feed (escopo de projeto inclui o nome do projeto). */
function feedBase(org: string, project: string | undefined, feedName: string): string {
  return `https://pkgs.dev.azure.com/${org}/${project ? `${project}/` : ''}_packaging/${feedName}`
}

/** Snippets de instalação para a versão escolhida. */
export function installSnippets(args: {
  org: string
  feed: Feed
  pkg: FeedPackage
  version: string
}): InstallSnippet[] {
  const { org, feed, pkg, version } = args
  const project = feed.scope.kind === 'project' ? feed.scope.project : undefined
  const proto: ProtocolGroup = protocolGroup(pkg.protocolType)
  const base = feedBase(org, project, feed.name)
  switch (proto) {
    case 'nuget':
      return [
        { title: 'Comando', code: `dotnet add package ${pkg.name} --version ${version}` },
        { title: 'Fonte (nuget.config)', code: `${base}/nuget/v3/index.json` }
      ]
    case 'npm':
      return [
        { title: 'Comando', code: `npm install ${pkg.name}@${version}` },
        { title: '.npmrc', code: `registry=${base}/npm/registry/` }
      ]
    case 'pypi':
      return [
        { title: 'Comando', code: `pip install ${pkg.name}==${version} --index-url ${base}/pypi/simple/` },
        { title: 'Índice', code: `${base}/pypi/simple/` }
      ]
    case 'maven':
      return [{ title: 'Repositório (settings.xml / pom.xml)', code: `${base}/maven/v1` }]
    case 'upack':
      return [
        {
          title: 'Azure CLI',
          code: `az artifacts universal download --organization https://dev.azure.com/${org}${
            project ? ` --project "${project}" --scope project` : ''
          } --feed ${feed.name} --name ${pkg.name} --version ${version} --path .`
        }
      ]
    default:
      return []
  }
}
