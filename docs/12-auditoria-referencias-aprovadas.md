# Auditoria: implementação atual × referências aprovadas

Fonte da verdade: `design/referencias/` (pacote “Referências Aprovadas”). A imagem 04 define o personagem, a 06 o símbolo da marca e as 01, 02 e 03 a composição do Início. Pela regra do pacote, outras pranchas de mascote não são fonte de identidade.

## Onde o design mora

| Assunto | Arquivos |
|---|---|
| Tokens (cores, fontes, raios, sombras, textura) | `src/app/globals.css` (`@theme`, `:root`, `.dark`, `.silk`, `.gold-rule`, `.stat-strip`); exportação em `docs/design-tokens.json` |
| Tema claro/escuro | Classe `dark` no `<html>` (`src/app/layout.tsx`), cookie `rumo_theme` e preferência da conta; `ThemeToggle` na barra superior |
| Componentes base | `src/components/ui/*` (botão, campos, cartão, seção, faixa de números, selos, avisos, progresso, abas, diálogo, toasts) |
| Estrutura do app | `src/components/app/app-shell.tsx` (barra lateral, topo, barra inferior e gaveta “Mais”), `logo.tsx`, `silk.tsx`, `nav-config.ts` |
| Início | `src/app/(app)/painel/page.tsx`, `src/components/spending/category-list.tsx` |
| Personagem | `src/components/mascots/banker-art.tsx`, `mascot-art.tsx`, `meet-banker.tsx`; `src/mascots/catalog.ts` e `voice.ts` |
| Páginas | 34 rotas do app, login, cadastro, onboarding, página pública, termos e privacidade |

O personagem aparece em 21 arquivos: Início, alertas, metas, reserva, aposentadoria, Posso gastar?, revisão, conquistas, planejamento, convite, configurações, onboarding, login/cadastro, página pública, chat, barra lateral e toasts.

## Histórico do personagem

| Versão | Onde | Situação |
|---|---|---|
| Seis animais (Lince, Capivara, Coruja, Polvo, Raposa, Guardião) | `public/mascots/*.webp` até o PR #12 | Removidos |
| Banqueiro sem barba, terno verde e gravata dourada | `banker-art.tsx` no PR #12 (commit `5d4863b`) | **Igual à referência 04, aprovado** |
| Banqueiro com barba, colete e gravata verde | `banker-art.tsx` no PR #13 | Rejeitado |
| Arquivo-mestre | `design/banqueiro/banqueiro-master.svg` | Novo, reconstruído da versão aprovada |

## Diferenças entre o que está no ar (PR #13) e as referências

| Ponto | Referência aprovada | No ar hoje |
|---|---|---|
| Personagem | 04: sem barba, cabelo curto com têmporas grisalhas, terno verde, gravata dourada | Barba, bigode, cabelo ondulado, colete e gravata verde |
| Símbolo | 06: “B” com a haste dourada e o corpo verde | Laço dourado em espiral |
| Cabeçalho do Início | Rótulo “INÍCIO”, “Bom dia, Pessoa” em serifa, “Novembro · último lançamento em 03/11” | Título “Início” e frase de saudação |
| Indicador principal | Ocupa a largura toda, filete dourado à esquerda, rótulo dourado em caixa alta, valor grande, barra, “Já gastou X de Y (46%)”, saldo livre, “Testar uma compra” | Mais estreito, canto dourado em curva |
| Dica do Banqueiro | Dentro do indicador, à direita, separada por um filete vertical | Fora do indicador, ao lado, encolhendo o indicador |
| Gastos | “Gastos de novembro”, “Ver tudo ›” e filete sob o título; total grande e variação; rosca com legenda | “Gastos do mês” sem link no título |
| Compromissos | “Próximos 7 dias úteis”, “Agenda ›”; data, descrição, “Hoje · previsto” e valor com sinal | Data “Seg, 03/nov” e valor sem sinal |
| Barra lateral | Itens, rótulo “MAIS” com a lista, cartão “SEU CONSULTOR · O Banqueiro”, perfil | “Mais” recolhível e “Seu consultor digital” |
| Cores das categorias | As da própria categoria | Paleta fixa por posição |
| Tokens | Fundo `#F7F5EF`, linha `#E6E1D8`, secundário `#58665D` | `#FAF7EF`, `#E6E1DB`, `#55645D` |
| Celular | 03: mesma hierarquia, com a dica dentro do indicador | Dica fora do indicador, ocupando muito espaço |

A prancha enviada junto com o pacote mostra barba, espiral e dica fora do indicador. Ela conflita com o pacote e com o pedido de não reduzir o indicador, então segue valendo o pacote.

## Plano por fases

1. **Personagem** (esta entrega): arquivo-mestre, seis expressões, ícones independentes e variantes, validados contra a 04. A interface ainda não foi alterada.
2. **Início**, depois da aprovação do personagem: composição das referências 01, 02 e 03 com o personagem novo, nas quatro versões (computador claro e escuro, celular claro e escuro). No celular, o indicador fica compacto e a dica ganha composição própria.
3. **Restante do sistema**, depois da aprovação do Início: os mesmos componentes e tokens em todas as telas.
