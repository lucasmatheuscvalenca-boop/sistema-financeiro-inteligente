# Design system

Identidade “Rumo”: tecnologia financeira premium, confiável e acolhedora. Base azul-marinho, verde-petróleo para progresso e valores positivos, dourado em detalhes e conquistas. Tokens em `src/app/globals.css` (Tailwind v4, `@theme`); componentes em `src/components/ui`.

## Cores

| Papel | Claro | Escuro | Uso |
|---|---|---|---|
| `canvas` | `#F4F7FB` | `#061224` | Fundo da página |
| `surface` / `surface-2` | `#FFFFFF` / `#EEF3F8` | `#0C1D36` / `#122848` | Cartões e áreas secundárias |
| `line` | `#DBE3EE` | `#1F3A60` | Bordas e divisórias |
| `ink` / `muted` | `#0B1F3A` / `#5B6B82` | `#E8EEF8` / `#9DB0CB` | Texto principal e secundário |
| `positive` | `#0B7574` | `#3CC4BB` | Progresso, saldo positivo |
| `negative` | `#C2410C` | `#FB923C` | Saldo negativo, risco importante |
| `warning` | `#8F5F00` | `#F2C14E` | Atenção |
| `info` | `#2B6CB0` | `#7FB2F0` | Informativo |

Escalas completas: `navy-50…950`, `petrol-50…900`, `gold-50…700`. Cores semânticas são variáveis CSS redefinidas na classe `.dark`; nenhum componente usa hexadecimais soltos para estados.

**Selo de demonstração**: fúcsia (`DemoBadge`), propositalmente fora da paleta, para que dado fictício nunca se confunda com dado real.

## Gráficos

Paleta categórica validada para daltonismo e contraste (validador da skill de visualização de dados):

| Série | Claro | Escuro |
|---|---|---|
| 1 (receitas, confirmado, patrimônio) | `#00907F` | `#13A396` |
| 2 (meta, cenário otimista) | `#B07D00` | `#C08A00` |
| 3 (despesas, com estimativas) | `#3563C9` | `#5A8AE8` |

Regras aplicadas: um único eixo Y; marcas finas (linha 2 px, barras com cantos de 4 px); grade discreta; legenda sempre que há duas ou mais séries; tooltip ao passar o mouse; **tabela de dados alternativa** (“Ver dados em tabela”) em cada gráfico; rótulos do eixo em formato compacto (“R$ 7,5 mil”) sem quebra de linha. Status (positivo/atenção/negativo) nunca reutiliza as cores das séries e vem sempre com ícone e texto.

## Tipografia

- Texto: **Inter Variable** (números tabulares ligados por padrão, `tnum`).
- Títulos: **Sora Variable**, espaçamento −1,5%.
- Fontes servidas localmente (`@fontsource-variable`), sem chamada a serviços externos.
- Escala: rótulos 11–12 px, corpo 14 px, valores de destaque 24–32 px, títulos de página 30 px.

## Forma, sombra e movimento

- Raio de cartão 20 px (`--radius-card`), campos e botões 12 px, pílulas totalmente arredondadas.
- Sombra `card` suave e `pop` para diálogos.
- Animações curtas (`rise` 350 ms, `pop` 450 ms), desativadas com `prefers-reduced-motion`.

## Componentes

| Componente | Arquivo | Observações |
|---|---|---|
| `Button`, `ButtonLink` | `ui/button.tsx` | Variantes `primary`, `secondary`, `ghost`, `danger`, `gold`, `petrol`; tamanhos `sm`, `md`, `lg` |
| `Card`, `CardHeader`, `CardBody` | `ui/card.tsx` | Cabeçalho com ícone, descrição e ação |
| `ActionForm`, `Field`, `Input`, `MoneyInput`, `Select`, `Textarea`, `Checkbox`, `SubmitButton`, `InlineAction` | `ui/form.tsx` | Integração com Server Actions; erros por campo; estado de envio; confirmação em ações destrutivas |
| `Dialog` | `ui/dialog.tsx` | `<dialog>` nativo (foco e Esc pelo navegador) |
| `Badge`, `DemoBadge` | `ui/badge.tsx` | Tons semânticos |
| `Callout` | `ui/callout.tsx` | Informativo, positivo, atenção, negativo |
| `Progress`, `ProgressRing` | `ui/progress.tsx` | Rótulo acessível obrigatório |
| `PageHeader`, `Money`, `Stat`, `Delta`, `EmptyState`, `KeyValue` | `ui/misc.tsx` | `Money` formata BRL com sinal e cor opcionais |
| `MascotArt` | `mascots/mascot-art.tsx` | SVG próprio de cada mascote nos 6 estados |
| Gráficos | `charts/charts.tsx` | Receitas × despesas, fluxo de caixa, linha com meta, projeção de aposentadoria |

## Mascotes (ilustração)

Seis personagens desenhados em SVG próprio (sem imagens de terceiros), cada um com paleta própria e seis estados: **neutro, análise, orientação, celebração, atenção e alerta importante**. O estado muda olhos, boca, anel de fundo e um acessório (lupa, balão, confete, sinal de atenção). Todos têm texto alternativo (“Lince, O Estrategista — Celebração”) ou são marcados como decorativos quando o nome já está ao lado.

## Layout e responsividade

- Desktop: barra lateral fixa de 264 px com navegação agrupada (Visão geral, Central financeira, Planejamento, Acompanhamento, Conta) e conteúdo até 1280 px.
- Celular: barra inferior com 5 atalhos (Painel, Lançar, Posso gastar?, Metas, Assistente) e menu completo em gaveta.
- Grades com `minmax(0, 1fr)` para que tabelas e listas roláveis nunca alarguem a página (verificado por teste E2E em 24 rotas no desktop e 5 no celular).

## Acessibilidade

- Contraste de texto (tokens `ink`, `muted`, `positive`, `negative`, `warning`, `info`) de pelo menos 4,5:1 sobre `canvas`, `surface` e `surface-2` nos dois temas (critério WCAG AA para texto normal), conferido por cálculo.
- Foco visível (anel petróleo de 2 px), navegação por teclado, `aria-current` na navegação, `role="radiogroup"` na escolha de mascote, rótulos em todos os campos.
- Informação nunca depende só de cor: badges com texto, ícones nos estados, valores com sinal.
- Idioma `pt-BR`, moeda e datas no padrão brasileiro.

## Tema claro/escuro

O usuário alterna entre sistema → claro → escuro (preferência salva na conta e em cookie para o primeiro carregamento sem “piscar”). No modo sistema, um script mínimo aplica a classe antes da pintura.
