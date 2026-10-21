# Design system — NEXO

Identidade **NEXO** (“Seu futuro em boas decisões”): tecnologia financeira premium, confiável e acolhedora, reproduzindo a referência visual em `docs/referencia-visual.webp`. Azul-marinho é a estrutura (barra lateral, títulos, botões de navegação), petróleo/turquesa é ação e progresso, dourado aparece só em detalhes e conquistas, sobre fundos claros. Tokens em `src/app/globals.css` (Tailwind v4, `@theme`); componentes em `src/components`.

## Cores

| Papel | Claro | Escuro | Uso |
|---|---|---|---|
| `canvas` | `#F4F7FA` | `#0B1626` | Fundo da página |
| `surface` / `surface-2` | `#FFFFFF` / `#EEF2F7` | `#12233A` / `#18304D` | Cartões e áreas secundárias |
| `line` | `#E3E8EF` | `#22385A` | Bordas e divisórias |
| `ink` / `muted` | `#0B1F3B` / `#5E6B7E` | `#E6EDF6` / `#94A3B8` | Texto principal e secundário |
| `accent` (botão `petrol`) | `#0A7F80` texto branco | `#2CC5C5` texto `#062A2B` | Ação principal em fluxo (Adicionar aporte, Analisar, Enviar) |
| `link` | `#0B6F70` | `#5FD4D4` | Links, rótulos de seção, valores de progresso |
| `sidebar` | `#0B1F3B` | `#0A1828` | Barra lateral e painéis de marca |
| `hero` | `#E6F4F6` | `#12304A` | Faixa do mascote no painel e cartões de leitura |
| `positive` / `negative` | `#0E7A4F` / `#CC2B2B` | `#34D399` / `#F87171` | Receitas, saldo positivo / despesas, risco |
| `warning` / `info` | `#A85A06` / `#2357C9` | `#FBBF24` / `#60A5FA` | Atenção / informativo |

Escalas completas: `navy-50…950` (navy-900 `#0B1F3B`), `petrol-50…900` (500 `#0EA5A5`), `gold-50…900` (500 `#F59E0B`). Cores semânticas são variáveis redefinidas em `.dark`; componentes não usam hexadecimais soltos para estados. O botão `petrol` usa um turquesa escurecido para manter o texto branco legível (4,8:1).

**Selo de demonstração**: fúcsia (`DemoBadge`), propositalmente fora da paleta, para que dado fictício nunca se confunda com dado real.

## Tipografia

- **Inter Variable** em tudo (títulos em peso 700, espaçamento levemente negativo), números tabulares por padrão.
- Fonte servida localmente (`@fontsource-variable/inter`), sem chamada a serviços externos.
- Escala: rótulos 11–12 px, corpo 14 px, valores de destaque 20–30 px, títulos de página 30 px.

## Forma, sombra e movimento

- Raio de cartão 20 px (`--radius-card`), campos e botões 12 px, pílulas arredondadas.
- Sombras `card` (suave) e `pop` (diálogos, toasts, compositor do chat).
- Microinterações em CSS: entrada de página (`template.tsx` + `animate-rise`), cartões com elevação no hover (`.card-hover`), barras de progresso que crescem (`.progress-grow`), mascote flutuando ou comemorando (`animate-float`/`animate-pop`), troca de abas com fade, diálogo com `pop`, botões com estado “Salvando…”, toasts de confirmação, indicador “Consultando seus dados” no chat.
- Tudo desativado com `prefers-reduced-motion`.

## Layout e responsividade

- **Desktop**: barra lateral azul-marinho de 248 px (Início, Contas, Transações, Cartões, Orçamento, Metas, Investimentos, Planejamento, IA Financeira, Relatórios; Notificações e Configurações embaixo; perfil no rodapé). Topo com busca, tema, notificações, atalho do assistente e avatar. Conteúdo até 1240 px.
- **Celular**: topo com logo, notificações e assistente; barra inferior com Início, Transações, Metas, IA e **Mais** (gaveta com todas as áreas, busca, tema e perfil). Ações rápidas no painel, formulários em diálogo com botões de toque grandes, botão de confirmação fixo no seletor de mascote.
- Grades com `minmax(0, 1fr)`: tabelas e listas roláveis nunca alargam a página (verificado por E2E em 24 rotas no desktop e por captura em 390 px).

## Componentes principais

| Componente | Arquivo | Observações |
|---|---|---|
| `Logo`, `LogoMark` | `app/logo.tsx` | Marca “N” em gradiente petróleo; ids únicos por instância |
| `AppShell` | `app/app-shell.tsx` | Barra lateral, topo, barra inferior, gaveta “Mais” e provedor de toasts |
| `Button`, `ButtonLink` | `ui/button.tsx` | `primary` (marinho), `petrol`, `outline`, `secondary`, `ghost`, `danger`, `gold` |
| `Card`, `CardHeader`, `CardBody` | `ui/card.tsx` | Cabeçalho com ícone, descrição e ação |
| `ActionForm`, `Field`, `MoneyInput`, `SubmitButton`, `InlineAction`… | `ui/form.tsx` | Server Actions, erros por campo, estado de envio; dentro de diálogo, fecha ao salvar e confirma com toast |
| `Dialog` | `ui/dialog.tsx` | `<dialog>` nativo; `defaultOpen` para atalhos (`?nova=1`) |
| `Tabs` | `ui/tabs.tsx` | Abas acessíveis (setas, Home/End); painéis inativos continuam montados |
| `ToastProvider`, `useToast` | `ui/toast.tsx` | Confirmações e conquistas com a expressão do mascote; `aria-live` |
| `Badge`, `Callout`, `Progress` | `ui/*` | Tons semânticos; progresso com rótulo acessível |
| `KpiCard`, `DashboardHero`, `PlanList`, `GoalsProgress`, `QuickActions`, `AskMascot`, `PeriodSelect` | `dashboard/*` | Painel; variação só com base comparável (“Sem base para comparar” quando não há) |
| `GoalCover` | `planning/goal-cover.tsx` | Capas vetoriais originais por tipo de meta (viagem, veículo, imóvel, casamento, estudos, independência, aposentadoria, reserva) |
| `CategoryIcon` | `finance/category-icon.tsx` | Ícone e cor da categoria (clareado no escuro); sem categoria, ícone pelo tipo |
| `MascotArt` | `mascots/mascot-art.tsx` | Imagem do mascote no estado pedido; selo de estado quando não há arte própria |
| `MascotPicker` | `mascots/mascot-picker.tsx` | Seis cartões com rádio, prévia de estados e voz |
| `Chat` | `ai/chat.tsx` | Bolhas com nome e hora, próximos passos clicáveis, envio direto (`?enviar=1`) |
| Gráficos | `charts/charts.tsx` | Receitas × despesas, fluxo de caixa, patrimônio, aposentadoria, **evolução da meta** (barras reais + projeção) |

## Gráficos

Paleta categórica validada para daltonismo e contraste:

| Série | Claro | Escuro |
|---|---|---|
| 1 (receitas, acumulado, confirmado) | `#00907F` | `#13A396` |
| 2 (projeção, cenário otimista) | `#B07D00` | `#C08A00` |
| 3 (despesas, com estimativas) | `#3563C9` | `#5A8AE8` |

Um único eixo Y; linha de 2 px, barras com cantos de 4 px; grade discreta; legenda com duas ou mais séries; tooltip; **tabela de dados alternativa** em cada gráfico; eixo compacto (“R$ 7,5 mil”) e meses curtos (“out/26”).

## Mascotes (ilustração)

Os seis personagens (Lince, Capivara, Coruja, Polvo, Raposa, Guardião) usam a **arte enviada pelo usuário na referência visual**, recortada com fundo transparente por `scripts/assets/cutout-mascots.py` e servida em WebP (`public/mascots`). O Lince tem arte própria para os seis estados; nos demais, o estado é indicado por um selo (lupa, lâmpada, troféu, alerta). O manifesto `src/mascots/assets.ts` concentra os arquivos: trocar por arte em alta resolução é só substituir os arquivos. A expressão acompanha o contexto: análise ao calcular, orientação em dicas, celebração em conquistas e toasts de meta atingida, atenção e alerta em riscos.

## Acessibilidade

- Contraste AA dos tokens de texto nos dois temas; foco visível (anel petróleo); `aria-current` na navegação; `role="radiogroup"` no seletor de mascote; `tablist`/`tabpanel` nas abas; `aria-live` em toasts e no chat; botões só com ícone têm rótulo (`sr-only`).
- Informação nunca depende só de cor: badges com texto, ícones nos estados, valores com sinal.
- `pt-BR` em textos, moeda, datas e meses.

## Tema claro/escuro

Alternância sistema → claro → escuro, salva na conta e em cookie (primeiro carregamento sem “piscar”). O escuro tem cores próprias (não é inversão): superfícies azuladas, turquesa mais claro para ação e cores de categoria clareadas.
