<p align="center">
  <img src="build/icon.png" width="96" alt="DevOps Desktop">
</p>

<h1 align="center">DevOps Desktop</h1>

<p align="center">
  Cliente desktop do <b>Azure DevOps</b> para Windows e Linux, autenticado só por um <b>Personal Access Token (PAT)</b>.<br>
  Sem login no navegador, sem SSO: abriu, já está trabalhando.
</p>

<p align="center">
  <a href="https://github.com/nicolas-fer/azure-devops-desktop/releases/latest"><b>⬇ Baixar a última versão</b></a>
</p>

---

## O que tem

- **Boards** — work items (com formulário completo, discussão, histórico, links e anexos), quadro kanban com arrastar e soltar, backlogs, sprints (taskboard com filtros, capacidade, trabalho restante) e queries WIQL.
- **Repos** — arquivos (visualizar, editar e commitar), commits com diff, pushes, branches, tags e pull requests (revisão, votos, comentários em linha, conclusão).
- **Pipelines** — pipelines, execuções com logs ao vivo, executar pipeline, editar YAML, environments, releases e library.
- **Artifacts** — feeds e pacotes, com comandos de instalação.
- **Configurações** do projeto e da organização, e **busca global** (código e work items).
- **Abas** na barra de título para abrir vários projetos ao mesmo tempo (Ctrl+T, Ctrl+W, Ctrl+Tab).
- **Colunas redimensionáveis** em todas as tabelas, com a largura salva por tela.

O PAT nunca sai do processo principal do app nem é gravado em disco: ele é lido da variável de ambiente a cada execução.

---

## 1. Gere o seu PAT

1. Entre em `https://dev.azure.com/<sua-organização>` no navegador.
2. Clique no ícone de **configurações do usuário** (canto superior direito, ao lado do seu avatar) → **Personal access tokens**.
3. Clique em **+ New Token** e preencha:
   - **Name:** `DevOps Desktop`
   - **Organization:** **All accessible organizations** (recomendado — assim o app lista suas organizações sozinho). Se preferir restringir a uma organização, veja a variável `AZURE_DEVOPS_ORG` no passo 3.
   - **Expiration:** o prazo que a sua empresa permitir (ex.: 90 dias). Quando expirar, gere outro e atualize a variável.
   - **Scopes:** escolha **Custom defined**, clique em **Show all scopes** e marque os escopos da tabela abaixo.
4. Clique em **Create** e **copie o token** (ele só aparece uma vez).

| Escopo | Permissão | Para quê |
|---|---|---|
| Work Items | Read & write | Boards: work items, quadros, backlogs, sprints, queries |
| Code | Read & write | Repos e pull requests (ler, commitar, votar, concluir) e busca de código |
| Build | Read & execute | Pipelines e execuções |
| Release | Read, write, execute & manage | Releases clássicas |
| Environment | Read & manage | Environments |
| Pipeline Resources | Use & manage | Aprovar ou rejeitar etapas de pipeline |
| Variable Groups | Read, create & manage | Library (grupos de variáveis) |
| Secure Files | Read, create & manage | Library (secure files) |
| Packaging | Read & write | Artifacts (feeds e pacotes) |
| Project and Team | Read, write & manage | Projetos, times, iterações e áreas |
| Graph | Read | Grupos e permissões |
| Identity | Read | Buscar pessoas (atribuir work item, revisores) |
| User Profile | Read | Seu perfil e a lista de organizações |
| Member Entitlement Management | Read | Usuários da organização |
| Agent Pools | Read | Pools e agentes |
| Service Connections | Read | Conexões de serviço do projeto |
| Notifications | Read | Assinaturas de notificação |
| Extensions | Read | Extensões instaladas |

> Só vai **consultar** e não quer que o app altere nada? Marque apenas as permissões de leitura (*Read*) de cada escopo. As telas funcionam, e as ações de escrita mostram o erro de permissão.
>
> Quer o caminho mais curto? **Full access** também funciona, mas dá ao token mais poder do que o app precisa.

---

## 2. Instale o app

Baixe o arquivo do seu sistema na [página de releases](https://github.com/nicolas-fer/azure-devops-desktop/releases/latest).

### Windows

1. Baixe **`DevOps-Desktop-Setup-x.y.z.exe`** e execute.
2. O instalador não é assinado com certificado, então o Windows SmartScreen pode avisar *"O Windows protegeu o computador"*. Clique em **Mais informações → Executar assim mesmo**.
3. Escolha a pasta de instalação. Os atalhos são criados na área de trabalho e no menu Iniciar.

Para atualizar, basta instalar a versão nova por cima.

### Linux

**Debian, Ubuntu, Mint, Pop!_OS (.deb):**

```bash
sudo apt install ./devops-desktop_x.y.z_amd64.deb
```

O app aparece no menu de aplicativos como **DevOps Desktop** (ou rode `devops-desktop` no terminal).

**Qualquer distribuição (AppImage):**

```bash
chmod +x DevOps-Desktop-x.y.z.AppImage
./DevOps-Desktop-x.y.z.AppImage
```

O AppImage precisa do FUSE 2. Se ele não abrir, instale:

```bash
# Ubuntu 22.04
sudo apt install libfuse2
# Ubuntu 24.04 ou mais novo
sudo apt install libfuse2t64
```

---

## 3. Configure a variável `AZURE_DEVOPS_EXT_PAT`

O app lê o PAT da variável de ambiente **`AZURE_DEVOPS_EXT_PAT`** — a mesma que a extensão `az devops` da Azure CLI usa, então se você já tem a CLI configurada, não precisa fazer nada.

Opcional: **`AZURE_DEVOPS_ORG`** com o nome da organização (o trecho depois de `dev.azure.com/`). Use se o seu PAT for restrito a uma organização ou se quiser abrir sempre na mesma.

### Windows

No **PowerShell** (vale para o seu usuário, de forma permanente):

```powershell
[Environment]::SetEnvironmentVariable('AZURE_DEVOPS_EXT_PAT', 'cole-o-token-aqui', 'User')
```

Opcional:

```powershell
[Environment]::SetEnvironmentVariable('AZURE_DEVOPS_ORG', 'minha-org', 'User')
```

Ou pela interface: menu Iniciar → *"Editar as variáveis de ambiente para sua conta"* → **Novo…** → nome `AZURE_DEVOPS_EXT_PAT`, valor = token.

Depois **feche e abra o DevOps Desktop** (programas já abertos não enxergam variáveis novas). Se o atalho continuar sem enxergar a variável, saia da sessão do Windows e entre de novo.

### Linux

Apps abertos pelo menu gráfico não leem o `~/.bashrc`. Coloque a variável num lugar que a sessão gráfica carrega:

**Opção A — `~/.profile` (Ubuntu, Debian, Mint e a maioria das distros):**

```bash
echo "export AZURE_DEVOPS_EXT_PAT='cole-o-token-aqui'" >> ~/.profile
# opcional
echo "export AZURE_DEVOPS_ORG='minha-org'" >> ~/.profile
chmod 600 ~/.profile
```

**Opção B — `environment.d` (sessões com systemd: GNOME, KDE Plasma, Fedora, Arch):**

```bash
mkdir -p ~/.config/environment.d
cat > ~/.config/environment.d/devops-desktop.conf <<'EOF'
AZURE_DEVOPS_EXT_PAT=cole-o-token-aqui
# AZURE_DEVOPS_ORG=minha-org
EOF
chmod 600 ~/.config/environment.d/devops-desktop.conf
```

Em qualquer das opções, **saia da sessão e entre de novo** para o menu de aplicativos enxergar a variável. Para testar na hora, sem relogar, abra pelo terminal:

```bash
AZURE_DEVOPS_EXT_PAT='cole-o-token-aqui' devops-desktop
```

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| *"A variável de ambiente AZURE_DEVOPS_EXT_PAT não está definida"* | A variável não chegou ao app. Confira o passo 3 e reabra o app (no Linux, saia da sessão e entre de novo). |
| *"PAT recusado"* | O token expirou ou foi revogado. Gere outro e atualize a variável. |
| *"Sem permissão"* numa tela | Falta um escopo no token. Edite o PAT no Azure DevOps e marque o escopo da tabela do passo 1. |
| *"Não foi possível listar suas organizações"* | O PAT foi criado para uma organização só. Defina `AZURE_DEVOPS_ORG` ou gere o token com **All accessible organizations**. |
| AppImage não abre no Ubuntu 24.04 (erro de *sandbox*) | O AppArmor bloqueia o sandbox do Chromium em AppImages. Rode `./DevOps-Desktop-x.y.z.AppImage --no-sandbox` ou prefira o pacote `.deb`. |
| Windows avisa que o app é de editor desconhecido | Esperado: o instalador não é assinado. **Mais informações → Executar assim mesmo**. |

---

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl+K | Busca global |
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / anterior |
| Ctrl+1 … Ctrl+9 | Ir para a aba N |
| Ctrl+clique ou botão do meio num projeto | Abrir em nova aba |
| Duplo clique na borda de uma coluna | Restaurar a largura original |

---

## Revisão IA

A aba **Revisão IA** de um pull request abre um terminal dentro do app com o Claude Code (`claude`) na pasta do clone local do repositório. Escolha a pasta uma vez por repositório; ela fica salva. É preciso ter o Claude Code instalado e disponível no terminal:

```bash
npm install -g @anthropic-ai/claude-code
```

## Desenvolvimento

Requisitos: **Node.js 24** e Git.

```bash
git clone https://github.com/nicolas-fer/azure-devops-desktop.git
cd azure-devops-desktop
npm install
npm run dev
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o app em modo de desenvolvimento |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Compila para `out/` |
| `npm run dist:win` | Gera o instalador do Windows em `dist/` |
| `npm run dist:linux` | Gera AppImage e .deb em `dist/` (rode no Linux) |

Stack: Electron, React 19, TypeScript, Vite (electron-vite), Tailwind CSS v4, TanStack Query e React Router. Todas as chamadas à API REST do Azure DevOps saem do processo principal (`src/main/ado.ts`). O design system está documentado em [DESIGN.md](DESIGN.md).

### Publicar uma versão

O workflow [`release.yml`](.github/workflows/release.yml) gera os instaladores de Windows e Linux e cria a release no GitHub quando uma tag `v*` é enviada:

```bash
npm version patch -m "Versão %s"
git push origin main --follow-tags
```

---

## Licença

[MIT](LICENSE). Projeto independente, sem vínculo com a Microsoft. "Azure DevOps" é marca da Microsoft.
