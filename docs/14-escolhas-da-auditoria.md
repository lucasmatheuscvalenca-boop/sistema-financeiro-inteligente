# Escolhas da auditoria de novembro de 2026

A auditoria completa (design, sistema e produto) foi publicada com variações e o usuário marcou o que fazer. Este documento registra, por onda, o que foi implementado e onde está. As escolhas "manter como está" e "não" ficaram de fora (cadastro aberto, convite por e-mail, "o que mudou desde ontem" no Início).

## Onda 1B — design (PR #22)

| Escolha | O que mudou | Onde |
|---|---|---|
| Cabeçalho | Título com botão ⓘ que abre a explicação; sem rótulo acima do título | `ui/page-title.tsx`, `ui/misc.tsx` |
| Barra do topo | Tema e Sair dentro do menu do avatar | `app/profile-menu.tsx`, `app/theme-toggle.tsx` |
| Gráficos | Despesas em verde-sálvia | `globals.css` (`--chart-3`) |
| Orçamento | Cartões com edição em diálogo | `orcamento/page.tsx` |
| Configurações no celular | Lista de seções com voltar | `app/settings-tabs.tsx`, `configuracoes/perfil` |
| Sessões | Este acesso + outros agrupados, "encerrar todos" | `configuracoes/privacidade` |
| Página inicial | O Banqueiro se apresentando | `app/page.tsx` |
| Pequenas correções | Nomes, Gastos no celular, larguras, meses vazios, bordas, cores de categoria, leitor de tela | várias |

## Onda 3A — telas novas

| Escolha | O que faz | Onde |
|---|---|---|
| Simulador de financiamento | Casa ou carro: financiar (SAC ou Price, pelo CET) × juntar antes guardando a mesma parcela, com valorização do bem, rendimento e aluguel na espera; "prefiro juntar" cria a meta preenchida | `domain/financing.ts`, `/financiamento` |
| Central de parcelas + cartões | Quanto das próximas 12 faturas já está comprometido, quando cada parcelamento termina (parcelas do banco projetadas pela última recebida), melhor dia de compra e aviso de fechamento | `domain/installments.ts`, `services/installments.ts`, `/parcelas` |
| Painel de assinaturas | Mensais com o custo no ano, anuais com a próxima renovação e aviso a 30 dias | `services/yearly.ts`, `/assinaturas` |
| Despesas anuais | IPVA, IPTU, seguro, Natal: cadastradas (recorrência anual estimada) ou achadas no histórico (11 a 13 meses, valor parecido), cada uma com "separe R$ X por mês" até o vencimento | `domain/annual.ts`, `/despesas-anuais` |
| Ajuda para o IR | Saldos de cada conta em 31/12 (dois anos), outros bens pelo valor da época, dívidas, rendimentos por categoria e fonte, gastos de saúde e educação com a lista para conferir os recibos; imprimir ou salvar PDF | `services/tax.ts`, `/imposto-de-renda` |
| Retrospectiva | "Seu ano com o Banqueiro": entrou, saiu, guardado nas metas, melhor mês, mês mais caro, categoria, lugar favorito, maior gasto, patrimônio | `domain/retrospective.ts`, `/retrospectiva` |
| Relatórios | Comparação com os 12 meses anteriores e com o mesmo mês do ano anterior | `relatorios/page.tsx` |
| Fluxo de caixa | "E se a renda atrasar 5, 10 ou 15 dias?" com o menor saldo antes e depois | `domain/cashflow.ts` (`delayIncome`), `/fluxo-de-caixa?atraso=` |
| Agenda | Arquivo de calendário (.ics) dos próximos 90 dias, com lembrete às 9h da véspera, para o Google Agenda ou o iPhone | `domain/ics.ts`, `/api/agenda` |
