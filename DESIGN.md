---
name: DevOps Desktop
description: Cliente desktop do Azure DevOps lido como a tabela de classificação do jornal de esportes.
colors:
  shell: "#0d3b44"
  shell-fg: "#e8f1f0"
  shell-muted: "#8fb1b0"
  shell-active: "#165460"
  shell-hover: "#12505c"
  shell-line: "#1e5b66"
  shell-accent: "#3fd1b5"
  bg: "#f4f5f2"
  surface: "#ffffff"
  surface-2: "#eef0ec"
  border: "#d5d9d3"
  rule-strong: "#1b2a2e"
  fg: "#142024"
  muted: "#5d6b6b"
  accent: "#0d3b44"
  accent-fg: "#ffffff"
  focus: "#3fd1b5"
  zone-done: "#1e9e5a"
  zone-progress: "#e3a008"
  zone-fail: "#d93a3a"
  zone-new: "#2f6fde"
  zone-idle: "#a3aba8"
  zone-mine: "#7a3fe0"
  done-ink: "#1a7a47"
  progress-ink: "#9a6c00"
  fail-ink: "#b42828"
  new-ink: "#2457b8"
  mine-ink: "#5b2db0"
  mine-bg: "#f4eefd"
  mine-line: "#c9b5f0"
typography:
  display:
    fontFamily: "'Archivo Narrow', 'Archivo', sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "32px"
    fontFeature: "tnum"
  headline:
    fontFamily: "'Archivo', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  title:
    fontFamily: "'Archivo Narrow', 'Archivo', sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "22px"
    fontFeature: "tnum"
  body:
    fontFamily: "'Archivo', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  meta:
    fontFamily: "'Archivo', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  label:
    fontFamily: "'Archivo Narrow', 'Archivo', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  mono:
    fontFamily: "'Cascadia Code', Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  sm: "3px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.shell-active}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  button-default-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
  button-danger:
    backgroundColor: "{colors.zone-fail}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  button-sm:
    typography: "{typography.meta}"
    padding: "0 8px"
    height: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
  table-header:
    typography: "{typography.label}"
    textColor: "{colors.muted}"
    backgroundColor: "{colors.surface}"
    padding: "0 12px"
    height: "32px"
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    padding: "4px 12px"
    height: "32px"
  table-row-hover:
    backgroundColor: "{colors.surface-2}"
  state-label:
    typography: "{typography.label}"
  mine-toggle-active:
    backgroundColor: "{colors.mine-bg}"
    textColor: "{colors.mine-ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "24px"
  sidebar-item:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.shell-fg}"
    padding: "0 12px"
    height: "32px"
  sidebar-item-active:
    backgroundColor: "{colors.shell-active}"
    textColor: "#ffffff"
  topbar:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.shell-fg}"
    height: "44px"
  kanban-column:
    width: "280px"
  kanban-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "8px"
---

# Design System: DevOps Desktop

## Overview

**Creative North Star: "Tabela do Brasileirão"**

O dia de trabalho lido como a tabela de classificação do campeonato na página de esportes do jornal. Linhas densas cortadas por réguas finas, numerais condensados tabulares e, colada à borda esquerda de cada linha e de cada card, uma faixa de zona colorida que diz o estado de tudo de relance, como G4, Sul-Americana e Z4. O layout e os controles são os de um app desktop comum (barra lateral, abas, tabelas ordenáveis, filtros, botões); o mundo entra só por tipo, paleta, densidade e a faixa de zona.

A moldura é um shell azul-petróleo sólido (barra superior de 44px e barra lateral de 224px), e o trabalho acontece numa área clara de papel-jornal levemente esverdeado. A densidade é alta e deliberada: linhas de 32px, cards com 8px de respiro, títulos de seção em Archivo Narrow 28px. Acima de cada lista, uma linha de classificação com contadores por zona funciona como placar e como filtro.

O sistema recusa o padrão da categoria: cinzas Fluent, azul de destaque e pílulas coloridas de status. Estado é cor de zona em faixa e quadradinho, nunca pílula preenchida. Não imita a marca Microsoft/Azure.

**Key Characteristics:**
- Shell petróleo sólido com filete verde-água de 3px no item ativo.
- Área de trabalho papel-jornal, superfícies brancas, réguas de 1px e régua escura de 2px sob todo cabeçalho.
- Faixa de zona de 4px à esquerda de toda linha ou card que tem estado; segunda faixa roxa de 2px para "é meu".
- Archivo para leitura, Archivo Narrow tabular para números, IDs, cabeçalhos e títulos de página.
- Plano: sem sombras em superfícies de repouso, sem gradientes, sem vidro.

## Colors

Uma moldura petróleo comprometida, uma área de trabalho neutra de jornal e cinco cores de zona que carregam todo o significado de estado; o roxo é reservado.

### Primary
- **Petróleo do Shell** (shell / accent): fundo da barra superior e da barra lateral, e o mesmo petróleo é a ação primária (botão sólido com texto branco). Uma cor só para moldura e para "faça isto".
- **Petróleo Ativo** (shell-active): item ativo da barra lateral e hover do botão primário. **Petróleo Hover** (shell-hover) é o hover de itens do shell; **Linha do Shell** (shell-line) separa a base da barra lateral e contorna a busca.
- **Verde-Água Filete** (shell-accent / focus): o filete de 3px do item ativo, a borda do item selecionado nos seletores e o anel de foco de 2px em toda a interface.
- **Texto do Shell** (shell-fg) e **Texto Secundário do Shell** (shell-muted): rótulos da navegação; subitens inativos e separadores "/" da trilha da barra superior.

### Secondary
As cinco cores de zona. Cada uma tem um preenchimento (faixa de 4px, quadradinho de 8px) e uma tinta com contraste AA para texto sobre fundo claro.
- **Verde Classificado** (zone-done, tinta done-ink): concluído, build succeeded, PR completed, voto aprovado.
- **Âmbar Em Disputa** (zone-progress, tinta progress-ink): em andamento, resolvido, em revisão, run em execução, aguardando autor, sucesso parcial.
- **Vermelho Rebaixamento** (zone-fail, tinta fail-ink): falhou, bloqueado, rejeitado, conflito de merge. Também o botão de perigo.
- **Azul Estreante** (zone-new, tinta new-ink): novo, proposto, enfileirado, rascunho. A tinta azul é também a cor de links no conteúdo renderizado e nos rodapés dos seletores.
- **Cinza Fora da Disputa** (zone-idle, tinta muted): removido, cancelado, abandonado, sem voto, pulado.

O mapeamento estado → zona é código (`src/renderer/src/lib/zones.ts`: work item por stateCategory com heurística por nome, build por status/result, PR por status/draft/mergeStatus, voto de revisor, timeline de run); não decida zonas por tela.

### Tertiary
- **Roxo É Meu** (zone-mine, com mine-ink, mine-bg, mine-line): só marca o percurso do usuário: a segunda faixa de 2px, o quadradinho e o estado ativo do filtro "Atribuídos a mim", e o texto "(você)".

### Neutral
- **Papel-Jornal** (bg): fundo da área de trabalho e de quadros.
- **Branco Superfície** (surface): cabeçalho de página, tabelas, seções, cards, campos, modais.
- **Zebra** (surface-2): hover e seleção de linha, código inline, blocos de código.
- **Régua** (border): réguas de 1px entre linhas, bordas de campos, cards e seções.
- **Régua Forte** (rule-strong): a régua de 2px sob cabeçalhos de tabela, de seção, de coluna do kanban e de modal; sublinhado da aba ativa e do contador selecionado.
- **Tinta** (fg) e **Tinta Esmaecida** (muted): texto principal; cabeçalhos de coluna, metadados, placeholders, prefixo de ID em títulos de entidade.

Tema escuro (`prefers-color-scheme: dark`, só redefine neutros e tintas; shell e zonas mantêm os matizes): bg #10181a, surface #172124, surface-2 #1d2a2d, border #2a3a3d, rule-strong #c9d6d3, fg #e3ecea, muted #8da09d, done-ink #4cc985, progress-ink #f0c24b, fail-ink #f07a7a, new-ink #7fa6f0, mine-ink #c3a5ff, mine-bg #2a2140, mine-line #4b3a78. O tema escuro existe no código mas não tem evidência renderizada.

### Cores de identidade de dados
Ícones de tipo de work item usam cor fixa por tipo: Bug no vermelho de zona, Task no âmbar de zona, User Story no azul de zona, Issue na tinta âmbar, Epic #8a5a2b, Feature #2d6e8a, desconhecido em muted. Avatares de iniciais sorteiam o fundo, com texto branco, entre #3e7c6b, #8a5a2b, #4b5fa8, #9c3d5a, #5b7a2e, #2d6e8a, #a0522d. Essas cores identificam quem e o quê, nunca o estado.

### Named Rules
**The Zone Carries State Rule.** Estado é dito por zona (faixa de 4px, quadradinho de 8px, rótulo em tinta da zona), nunca por pílula preenchida nem por cor nova. Se um estado não cabe nas cinco zonas, ele vai para a mais próxima em `zones.ts`.

**The Reserved Purple Rule.** O roxo existe só para "é meu": faixa de 2px, quadradinho e filtro ativo "Atribuídos a mim", texto "(você)". Nenhum outro uso, nem decorativo, nem de destaque, nem em paletas de avatar ou realce de linha.

**The One Petrol Rule.** Moldura e ação primária são o mesmo petróleo. Não existe um segundo azul de marca.

## Typography

**Display Font:** Archivo Narrow 500/600/700 (com Archivo, sans-serif), sempre com `font-variant-numeric: tabular-nums`
**Body Font:** Archivo 400/500/600 (com Segoe UI, system-ui), local via @fontsource, sem CDN
**Label/Mono Font:** Archivo Narrow para rótulos; Cascadia Code (com Consolas) para código, logs, diffs, branches e hashes

**Character:** Uma família em duas larguras: a larga para ler, a condensada para contar. Números, IDs e cabeçalhos ficam em colunas tabulares como numa tabela de jornal.

### Hierarchy
- **Display** (Narrow 700, 28px/32px): título de seção no cabeçalho de página ("Quadro", "Pull requests"), uma linha, truncado; também h1 do conteúdo renderizado.
- **Headline** (Archivo 600, 20px/28px): título longo de entidade (PR, work item, run), quebra com `text-balance`, com prefixo de ID em Narrow 700 esmaecido ("!29762", "#4821"). Título de modal usa Narrow 700 20px.
- **Title** (Narrow 700, 15px/22px): números do placar (contadores da linha de classificação e da coluna do kanban), a marca "DevOps Desktop" na barra superior; em Archivo 500, título do estado vazio e h3 renderizado.
- **Body** (Archivo 400, 13px/20px): texto base de tabelas, cards, campos e botões (500 em botões e abas); ID de card em Narrow 600 13px; nome de coluna do kanban em Narrow 700 13px caixa-alta 0.04em.
- **Meta** (Archivo 400, 12px/16px): metadados, dicas de campo, trilha, botões pequenos, filtro "é meu", erro; rótulos da linha de classificação em Narrow 600 12px caixa-alta 0.04em.
- **Label** (Narrow 600, 11px/16px, 0.04em, caixa-alta, tinta esmaecida): cabeçalhos de coluna de tabela, títulos de seção, rótulos de campo, rótulos de estado (em tinta da zona), badges de tag (Archivo 11px, sem caixa-alta).
- **Mono** (Cascadia Code 12.5px): blocos e trechos de código, diffs, logs; código inline usa 12px.

### Named Rules
**The Count In Narrow Rule.** Todo número que se compara com outro (ID, contador, duração, story points, WIP) é Archivo Narrow tabular. Prosa nunca é Narrow.

**The Short Ramp Rule.** A escala é 11 / 12 / 13 / 15 / 20 / 28 (mono 12.5). O plano original previa 11/13/15/20/28; o build adotou 12px como degrau de metadados em todo o app, e ele é parte do sistema. Nada fora desses degraus.

## Layout

App desktop de janela grande (≥1000px). Barra superior de 44px em petróleo: marca em Narrow, seletores de organização e projeto separados por "/", busca central de 420px com atalho "Ctrl K", configurações e avatar à direita. Barra lateral de 224px (48px recolhida) com itens de 32px e subitens de 28px recuados a 41px. A área de trabalho rola por dentro de cada feature.

Ordem vertical de toda tela de feature: cabeçalho de página (superfície branca, 24px de gutter lateral, 16px no topo, abas encostadas na régua inferior), depois a barra de ferramentas (24px lateral, 12px vertical, 12px de gap) com a linha de classificação, o filtro "é meu" e os filtros, depois o conteúdo denso. Tabelas: linhas e cabeçalho de 32px, células com 12px lateral. Kanban: colunas de 280px com 16px de gap, padding de 16px na área, cards com 8px entre si e 8px de respiro interno. Detalhe de entidade: coluna principal de seções empilhadas com 16px de gap e trilho lateral de seções à direita.

Espaçamento de bloco segue a grade de 4px (4 / 8 / 12 / 16 / 24). Gaps internos entre ícone e rótulo são 6px, e a faixa "é meu" tem 2px; esses são os únicos valores fora da grade e são consistentes.

### Named Rules
**The World Never Supplies The Layout Rule.** A estrutura é a do Azure DevOps e de qualquer app desktop. O mundo entra por tipo, cor, densidade e faixa de zona, não por composição.

## Elevation & Depth

Plano por padrão. Profundidade vem de camadas tonais (papel-jornal, branco, zebra) e de réguas: 1px entre linhas, 2px escura sob cabeçalhos. Sombra existe só em coisas que flutuam sobre a interface.

### Shadow Vocabulary
- **Sobreposição** (`box-shadow: 0 8px 24px rgba(0,0,0,0.18)`): modais, painel lateral deslizante, menus dos seletores. Modal sobre véu preto 40%, painel lateral sobre véu preto 25%.
- **Indicador de soltura** (`box-shadow: inset 0 2px 0 var(--color-focus)`): linha de backlog sob o item arrastado. A coluna do kanban mostra a soltura com contorno tracejado de 2px em verde-água sobre zebra.

### Named Rules
**The Flat Rest Rule.** Cards, tabelas e seções nunca têm sombra. Se precisa separar, use régua.

## Shapes

Cantos discretos de 3px em botões, campos, cards, seções, badges, código inline, modais e menus. Linhas de tabela não têm raio. O único círculo é o avatar de iniciais. A faixa de zona é um retângulo cheio sem raio, cortado pelo `overflow-hidden` do card. Quadradinhos de zona são quadrados de 8px sem raio: a geometria é de tabela impressa.

## Components

### Buttons
Compactos e diretos, como controles de app desktop.
- **Shape:** cantos de 3px, altura de 28px (24px no tamanho pequeno, texto 12px), borda de 1px sempre presente.
- **Primary:** petróleo sólido com texto branco, 12px de padding lateral, peso 500; hover vira Petróleo Ativo. Uma ação primária por cabeçalho, à direita.
- **Default:** superfície branca com borda de régua; hover em zebra.
- **Ghost:** sem borda nem fundo; hover em zebra. Usado em "Abrir no navegador" e ações de cabeçalho de seção.
- **Danger / Success:** vermelho e verde de zona com texto branco; hover com brilho 95%.
- **Hover / Focus:** transição de cor de 150ms; foco global é anel verde-água de 2px com 1px de afastamento. Desabilitado em 50% de opacidade. Carregando troca o ícone por spinner.
- **Icon button:** 28px quadrado, tinta esmaecida, hover em zebra; `title` obrigatório.

### Chips
- **Badge de tag:** 18px de altura, borda de régua, texto 11px esmaecido, 3px de raio. Variante de perigo com borda vermelha 40% e tinta de falha. Badges são para tags e marcadores (ex.: "obrigatório"), nunca para estado.
- **Filtro "é meu" (MineToggle):** 24px, borda de régua e texto esmaecido em repouso; ativo em mine-bg, borda mine-line, tinta mine-ink. Começa com o quadradinho roxo e termina com "· N" em Narrow.

### Cards / Containers
- **Card do kanban:** superfície branca, borda de régua, 3px, faixa de zona à esquerda, 8px de padding. Linha de cima: ícone do tipo (14px na cor do tipo), ID em Narrow 600 13px, rótulo "Bloqueado" se houver. Título em 500 com 18px de entrelinha, até duas linhas. Rodapé: até duas tags, comentários, story points em caixinha Narrow, pessoa.
- **Seção (painéis e trilhos):** superfície branca, borda de régua, 3px; cabeçalho de 32px no estilo label com régua forte de 2px embaixo e ações à direita.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).

### Inputs / Fields
- **Style:** 28px, borda de régua de 1px, superfície branca, 3px, 8px lateral, texto 13px, placeholder esmaecido. Select fica do tamanho do conteúdo (128–320px) em barras de filtro e estica dentro de Field.
- **Focus:** borda verde-água mais anel de 2px verde-água a 40%.
- **Field:** rótulo no estilo label acima, dica em 12px esmaecida abaixo, 4px de gap.
- **Busca da barra superior:** variante no shell, borda Linha do Shell, foco com borda verde-água.

### Navigation
- **Barra lateral:** itens de 32px com ícone de 16px e rótulo 13px em Texto do Shell, borda esquerda de 3px transparente; hover em Petróleo Hover; ativo em Petróleo Ativo, texto branco 600 e filete verde-água de 3px. Subitens da área ativa em 12.5px, Texto Secundário do Shell, ativo branco 600.
- **Abas:** 13px peso 500, 20px de gap, inativa esmaecida, ativa em Tinta com sublinhado de 2px em Régua Forte assentado sobre a régua do cabeçalho. Contagem em Narrow 600 ao lado.
- **Seletores de org/projeto:** botão no shell com chevron; menu flutuante branco com filtro, itens de 32px, selecionado com filete verde-água de 3px, rodapé em tinta azul.

### Faixa de Zona (ZoneStripe)
O gesto assinatura. Faixa vertical de 4px colada à borda esquerda, altura total da linha ou card, na cor de preenchimento da zona; quando o item é do usuário, uma segunda faixa roxa de 2px logo ao lado. Aparece em toda linha de tabela com estado, todo card do kanban, linhas compactas da coluna final, itens de política e revisores no trilho do PR, work items vinculados.

### Linha de Classificação (Standings)
Contadores por zona no formato de cabeçalho de tabela, separados por "·" em cor de régua: quadradinho de zona, rótulo Narrow 600 12px caixa-alta 0.04em, número em Narrow 700 15px. Clicar filtra; o contador ativo ganha sublinhado de 2px em Régua Forte. Contador de falha com valor acima de zero passa para tinta de falha. A coluna do kanban repete o formato no próprio cabeçalho (quadradinho, nome, contagem, WIP).

### Rótulo de Estado (StateLabel)
Quadradinho de zona de 8px mais texto Narrow 600 11px caixa-alta 0.04em na tinta da zona. Substitui pílulas coloridas. WIP estourado é a única marcação com fundo: vermelho a 15% (ou âmbar a 20% quando no limite), 3px, Narrow 600 12px.

### Tabela
Cabeçalho fixo em superfície branca, células no estilo label com régua forte de 2px embaixo; ordenação por clique com chevron de 12px e coluna ativa em Tinta. Linhas de 32px com régua de 1px, hover e seleção em zebra (100ms). Coluna de faixa de 6px à esquerda quando há zona. Coluna de posição: ID em Narrow 600 (#1234, !1287), como a colocação.

### Estados de Carga e Erro
Carregando: spinner de 16px esmaecido com texto, 24px de respiro. Vazio: ícone de 24px, título em 15px 500, texto esmaecido, centralizado. Erro (ErrorBox): caixa branca com borda vermelha a 40%, 3px, ícone de alerta em tinta de falha, título 500 e dica em 12px em pt-BR derivados do status HTTP (401 PAT recusado, 403 sem permissão, 404, sem conexão, 5xx), "Detalhes técnicos" recolhível em mono, botão pequeno "Tentar de novo".

## Do's and Don'ts

### Do:
- **Do** colocar a faixa de zona de 4px em toda linha e card que tem estado, com a zona vinda de `zones.ts`.
- **Do** abrir toda lista com a linha de classificação e o filtro "Atribuídos a mim" na barra de ferramentas.
- **Do** usar a régua forte de 2px sob todo cabeçalho de tabela, seção, coluna e modal, e réguas de 1px entre linhas.
- **Do** escrever IDs, contadores, durações e títulos de seção em Archivo Narrow tabular.
- **Do** manter linhas de tabela em 32px, cantos em 3px e espaçamento de bloco na grade de 4px.
- **Do** usar os componentes compartilhados de `components/ui.tsx` em vez de recriar estilos por tela.
- **Do** escrever a interface em pt-BR mantendo os termos do Azure DevOps (work item, sprint, PR, pipeline, run).

### Don't:
- **Don't** usar pílulas coloridas preenchidas para estado; use o Rótulo de Estado.
- **Don't** usar roxo fora do "é meu", inclusive em avatares, ícones de tipo ou realces.
- **Don't** pôr sombra em cards, tabelas ou seções; sombra é só de sobreposição.
- **Don't** usar gradientes, vidro, neon ou um segundo azul de marca.
- **Don't** imitar a marca, os logos ou os cinzas Fluent da Microsoft/Azure.
- **Don't** criar tamanhos de texto fora de 11 / 12 / 13 / 15 / 20 / 28 (mono 12.5).
- **Don't** escrever cores hexadecimais literais para superfícies, bordas ou texto; essas vêm de token. A única exceção são as cores de identidade de dados (ícones de tipo de work item, paleta de avatar).
