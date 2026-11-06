# Design system — Meu Banqueiro

Direção visual **Premium Editorial Finance**: um banco privado editorial, não um painel de SaaS. Verde profundo como estrutura (barra lateral, indicador principal, faixas de marca), verde de ação para botões e progresso, dourado só em detalhes (filetes, rótulos, selos), creme no tema claro e verde quase preto no escuro. Serifa editorial nos títulos e números grandes, filetes e tipografia no lugar de caixas. Tokens em `src/app/globals.css` (Tailwind v4, `@theme`) e exportados em `docs/design-tokens.json`; componentes em `src/components`.

## Princípios

1. **Hierarquia por tipografia e espaço**, não por molduras: seções têm título em serifa com um filete embaixo (`Section`); listas e tabelas usam divisórias finas (`divide-line`); números importantes ficam grandes em serifa.
2. **Cartão só com motivo funcional**: formulários, o indicador principal, capas de metas e o cartão de crédito. KPIs ficam em faixas de números com filetes (`StatStrip`), nunca em fileiras de caixas.
3. **Textura orgânica** (`.silk` e `<Silk/>`): dobras largas e desfocadas, como seda, com a luz entrando pelo canto inferior esquerdo e cruzando o verde na diagonal. Só nas áreas de marca: barra lateral, indicador principal, painel do login e apresentação do Banqueiro.
4. **Dourado é detalhe**: filete de 3 px (`gold-rule`), rótulos em caixa alta sobre o verde, links no indicador principal e o selo de comemoração. Nunca grandes áreas.
5. **Os dois temas são desenhados**, não invertidos: o escuro usa verdes profundos com superfícies ligeiramente mais claras e o verde de ação sem aparência neon.

## Cores

| Papel | Claro | Escuro | Uso |
|---|---|---|---|
| `canvas` | `#FAF7EF` | `#061B16` | Fundo da página |
| `surface` / `surface-2` | `#FFFDF9` / `#F0EDE4` | `#0B241D` / `#10352A` | Formulários, destaques e áreas secundárias |
| `line` | `#E6E1DB` | `#1E3A34` | Filetes e divisórias |
| `field` / `field-line` | `#FFFFFF` / `#CFC8BA` | `#0B241D` / `#2C5244` | Campos de formulário |
| `ink` / `muted` | `#0F1F18` / `#55645D` | `#E9F6ED` / `#9BB0A6` | Texto principal e secundário |
| `accent` (botão `primary`) | `#064B3B` texto branco | `#3FBF7F` texto `#04231B` | Ação principal (Analisar, Registrar, Salvar) |
| `link` | `#0A5C48` | `#8FD4B5` | Links, rótulos de seção (eyebrow), ícones de lista |
| `sidebar` | `#002D25` | `#002D25` | Barra lateral com textura |
| `hero` / `hero-ink` / `hero-muted` | `#064B3B` / `#F2F0E9` / `#BFD2C9` | `#0B3A30` / `#F2F0E9` / `#9BB0A6` | Indicador principal, veredito do Posso gastar?, faixas de marca |
| `positive` / `negative` | `#0F7A4A` / `#B42318` | `#5FD3A0` / `#FF8A80` | Receitas, saldo positivo / despesas, risco |
| `warning` / `info` | `#8A5A00` / `#1F5F9E` | `#E8C77A` / `#8FBDEB` | Atenção / informativo |

Escalas completas: `forest-50…950` (institucional `forest-700` `#064B3B`, profundo `forest-900` `#002D25`, escuro `forest-950` `#061B16`, superfície `forest-800` `#0B3A30`), `leaf-50…900` (destaque `leaf-700` `#008B56`, ação `leaf-500` `#22C55E`, ação no escuro `leaf-400` `#3FBF7F`) e `gold-50…900` (`gold-500` `#D4AF57`, `gold-300` `#E8C77A`). Os nomes antigos `navy-*` e `petrol-*` são apelidos das escalas novas. Cores semânticas são variáveis redefinidas em `.dark`; componentes não usam hexadecimais soltos para estados.

**Selo de demonstração**: fúcsia (`DemoBadge`), propositalmente fora da paleta, para que dado fictício nunca se confunda com dado real.

## Tipografia

- **Jost Variable** (geométrica, licença livre OFL) em todo o sistema. Foi a escolhida entre as alternativas gratuitas mais próximas da Nano Light, que é paga.
- `font-display` (`h1`–`h3`, títulos de seção, números de destaque e a marca): peso 400, espaçamento −1 %. Uma regra fora de camada mantém o peso 400 em todo `h1` e `font-display`, mesmo onde o componente pede semibold; `h2` e `h3` com peso próprio seguem marcando a hierarquia.
- `font-sans` (corpo, rótulos, botões, tabelas e formulários): peso 400, com 500–600 para valores e destaques; `tabular-nums` nas colunas de valores.
- Fontes servidas localmente (`@fontsource-variable`), sem chamada a serviços externos.
- Escala: eyebrow 11 px em caixa alta com espaçamento 0,16 em; rótulos 12 px; corpo 14–16 px; títulos de seção 20 px; títulos de página 28–36 px; indicador principal 44–56 px; totais 30–34 px.

## Forma, sombra e movimento

- Raio de cartão 10 px (`--radius-card`), campos e botões 8 px, selos em pílula. Cartões sem sombra, só filete; sombra `pop` reservada a diálogos, toasts e ao compositor do chat.
- Filetes: `border-line` entre linhas; `border-ink/80` (escuro: `border-line`) sob títulos de seção e nas faixas de números; `gold-rule` (3 px dourado) como detalhe de marca.
- Textura orgânica: `.silk` (gradientes radiais em CSS) e `<Silk/>` (SVG com desfoque, em `app/silk.tsx`, `strength` ajustável).
- Microinterações em CSS: entrada de página (`template.tsx` + `animate-rise`), cartões com elevação no hover (`.card-hover`), barras de progresso que crescem (`.progress-grow`), O Banqueiro flutuando ou comemorando (`animate-float`/`animate-pop`), troca de abas com fade, diálogo com `pop`, botões com estado “Salvando…”, toasts de confirmação, indicador “Consultando seus dados” no chat.
- Tudo desativado com `prefers-reduced-motion`.

## Layout e responsividade

- **Cinco abas** em qualquer tamanho: Início, Gastos, Lançamentos, Metas e Mais. As três perguntas do dia a dia (quanto posso gastar, com o que gastei, o que vence) têm resposta em Início.
- **Computador e telas largas (a partir de 1024 px, inclusive tablets deitados)**: barra lateral verde com textura, **fixa na tela** (não rola com o conteúdo), com as quatro abas, "Mais" (Bancos e cartões, Assistente, Patrimônio, Notificações, Configurações) e "Seu consultor digital" no rodapé. O botão ao lado da marca recolhe a barra para 76 px, só com ícones (o nome aparece ao passar o mouse, e notificações viram um ponto vermelho), e abre de novo. A escolha fica no cookie `mb_barra` e vale em todas as telas, sem piscar ao carregar. Topo com busca, tema, notificações, avatar do Banqueiro, perfil e sair. Conteúdo até 1240 px.
- **Metas** reúne os três planos de longo prazo em abas internas: metas e projetos, reserva de emergência e aposentadoria, com um resumo de uma linha dos dois últimos no topo.
- **Celular**: topo com logo, notificações e assistente; barra inferior com Início, Gastos, Lançamentos, Metas e **Mais** (gaveta com o que não cabe nas abas: Dinheiro, Planejar e Conta; busca, tema e perfil). Ações rápidas no painel, formulários em diálogo com botões de toque grandes, apresentação do Banqueiro em coluna única.
- Grades com `minmax(0, 1fr)`: tabelas e listas roláveis nunca alargam a página (verificado por E2E em 24 rotas no desktop e por captura em 390 px).

## Componentes principais

| Componente | Arquivo | Observações |
|---|---|---|
| `Logo`, `LogoMark` | `app/logo.tsx` | Laço dourado em espiral (fita que se fecha em anel); wordmark em serifa, empilhado na barra lateral; ids únicos por instância |
| `Silk` | `app/silk.tsx` | Textura orgânica em SVG para áreas de marca |
| `Section`, `Row` | `ui/section.tsx` | Seção editorial: título em serifa com filete, descrição, ação ou link à direita; linha de lista |
| `StatStrip`, `Stat` | `ui/misc.tsx` | Faixa de números separados por filetes (2 a 4 colunas) |
| `AppShell` | `app/app-shell.tsx` | Barra lateral, topo, barra inferior, gaveta “Mais” e provedor de toasts |
| `Button`, `ButtonLink` | `ui/button.tsx` | `primary`/`petrol` (verde de ação), `outline`, `secondary`, `ghost`, `danger`, `gold` |
| `Card`, `CardHeader`, `CardBody` | `ui/card.tsx` | Caixa plana com filete, só para formulários e destaques |
| `ActionForm`, `Field`, `MoneyInput`, `SubmitButton`, `InlineAction`… | `ui/form.tsx` | Server Actions, erros por campo, estado de envio; dentro de diálogo, fecha ao salvar e confirma com toast |
| `Dialog` | `ui/dialog.tsx` | `<dialog>` nativo; `defaultOpen` para atalhos (`?nova=1`) |
| `Tabs` | `ui/tabs.tsx` | Abas acessíveis (setas, Home/End); painéis inativos continuam montados |
| `ToastProvider`, `useToast` | `ui/toast.tsx` | Confirmações e conquistas com a expressão do mascote; `aria-live` |
| `Badge`, `Callout`, `Progress` | `ui/*` | Tons semânticos; progresso com rótulo acessível |
| `QuickActions`, `PeriodSelect` | `dashboard/*` | Ações rápidas e seletor de período |
| `SpendingDonut`, `CategoryRows` | `spending/category-list.tsx` | Rosca de gastos por categoria e lista com barras |
| `GoalCover` | `planning/goal-cover.tsx` | Capas vetoriais originais por tipo de meta (viagem, veículo, imóvel, casamento, estudos, independência, aposentadoria, reserva) |
| `CategoryIcon` | `finance/category-icon.tsx` | Ícone e cor da categoria (clareado no escuro); sem categoria, ícone pelo tipo |
| `BanqueiroMascot` | `mascots/banqueiro-mascot.tsx` | O Banqueiro a partir dos arquivos do kit: `expressao`, `pose` ou `avatar`, `object-fit: contain`, sem filtros |
| `MascotArt` | `mascots/mascot-art.tsx` | Atalho quadrado que traduz o estado do contexto em expressão do kit |
| `MeetBanker` | `mascots/meet-banker.tsx` | Apresentação do consultor: expressões para experimentar, voz e botão de confirmação no primeiro acesso |
| `Chat` | `ai/chat.tsx` | Bolhas com nome e hora, próximos passos clicáveis, envio direto (`?enviar=1`) |
| Gráficos | `charts/charts.tsx` | Receitas × despesas, fluxo de caixa, patrimônio, aposentadoria, **evolução da meta** (barras reais + projeção) |

## Gráficos

Paleta categórica validada para daltonismo e contraste:

| Série | Claro | Escuro |
|---|---|---|
| 1 (receitas, acumulado, confirmado) | `#064B3B` | `#5FD3A0` |
| 2 (projeção, cenário otimista) | `#B8923B` | `#E8C77A` |
| 3 (despesas, com estimativas) | `#3E6FB1` | `#8FBDEB` |

Um único eixo Y; linha de 2 px, barras com cantos de 4 px; grade discreta; legenda com duas ou mais séries; tooltip; **tabela de dados alternativa** em cada gráfico; eixo compacto (“R$ 7,5 mil”) e meses curtos (“out/26”).

Nas leituras de gastos (rosca e legenda), a cor segue a posição da categoria, da maior para a menor, com a paleta `--cat-1…8` definida por tema: verde profundo, verde de ação, dourado, verde-claro, lavanda, azul-claro, verde pálido e dourado escuro. No escuro a ordem começa pelo verde de ação, para a primeira fatia não sumir no fundo.

## O Banqueiro (ilustração)

A arte vem do kit aprovado (`design/referencias/LEIA-ME-kit.txt`): homem adulto de cabelo castanho ondulado, óculos, barba e bigode aparados, colete verde-escuro e camisa branca. Os arquivos ficam em `public/assets/banqueiro/` (`expressoes/`, `avatares/`, `poses/`) exatamente como vieram no kit, com o SHA-256 de cada um em `design/referencias/SHA256-ativos-banqueiro.txt`. São PNGs com transparência; os SVGs do kit são só contêineres do mesmo PNG. A interface usa o componente `BanqueiroMascot` (`src/components/mascots/banqueiro-mascot.tsx`), que recebe `expressao`, `pose` ou `avatar`, aplica `object-fit: contain` e não usa filtro nem efeito. Alguns recortes do kit trouxeram restos da prancha (pílulas de rótulo, a mão ou a cabeça de uma pose vizinha); em vez de editar a arte, o manifesto `src/mascots/banqueiro-assets.ts` declara a área visível de cada arquivo. A expressão acompanha o contexto: análise ao calcular, orientação em dicas, comemoração em conquistas e toasts de meta atingida, atenção e alerta em riscos.

## Acessibilidade

- Contraste AA dos tokens de texto nos dois temas (texto sobre creme 14:1; `muted` 5,6:1; `accent` com texto branco 8:1); foco visível (contorno na cor de ação; seleção de texto dourada); `aria-current` na navegação; botões de expressão com `aria-pressed` na apresentação do Banqueiro; `tablist`/`tabpanel` nas abas; `aria-live` em toasts e no chat; botões só com ícone têm rótulo (`sr-only`).
- Informação nunca depende só de cor: badges com texto, ícones nos estados, valores com sinal.
- `pt-BR` em textos, moeda, datas e meses.

## Tema claro/escuro

Alternância sistema → claro → escuro, salva na conta e em cookie (primeiro carregamento sem “piscar”). O escuro tem cores próprias (não é inversão): fundo verde quase preto, superfícies verde-profundas, filetes `#1E3A30`, verde de ação `#3FBF7F` com texto escuro, dourado mais claro nos detalhes e cores de categoria clareadas. A barra lateral e a textura são as mesmas nos dois temas.
