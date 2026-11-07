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

## Onda 3B — melhorias sem mudança no banco

| Escolha | O que faz | Onde |
|---|---|---|
| Reserva: "usei a reserva" | Registra o uso com o motivo (transferência da reserva para a conta de gastos, ou só o plano quando foi pago direto da reserva) e cria a reposição mensal em 3 a 24 meses, que entra na agenda e no fluxo de caixa | `services/reserve-use.ts`, `/reserva` |
| Lembretes | Autorização do banco vencendo (30 dias; importante na última semana), fatura fechando em até 2 dias, despesa ou assinatura anual em até 15 dias, patrimônio sem atualizar há mais de 35 dias e "o dinheiro entrou: hora de guardar" para metas com aporte pendente | `domain/reminders.ts`, `services/alerts.ts` |
| Orçamento | No mês atual sem limites, copia os do mês anterior uma única vez (se a pessoa apagar, não volta) | `services/budgets.ts` (`autoCopyBudgets`) |
| Metas compartilhadas | "Quem colocou quanto": aportes menos resgates por pessoa, com a porcentagem | `metas/[id]/page.tsx` |
| Importar extrato | Volta no banco da última importação (em qualquer aparelho) e aceita vários arquivos: cada um é conferido e gravado na sua vez | `importar/page.tsx`, `finance/import-wizard.tsx` |
| Posso gastar? | Atalhos ao segurar o ícone do app instalado: Posso gastar?, Novo lançamento e Agenda (Android e computador) | `app/manifest.ts` |
| Assistente | "Gastei 80 no mercado", "paguei 120 de luz ontem", "recebi 500 de freela": proposta com categoria, conta e data; grava só no toque em "Confirmar e gravar" (no histórico o botão não volta, para não duplicar) | `ai/quick-entry.ts`, `services/quick-entry.ts`, `ai/chat.tsx` |

## Onda 3C — recursos com tabelas novas

| Escolha | O que faz | Onde |
|---|---|---|
| Notificação no celular | Ativada por aparelho em Configurações › Notificações (no iPhone, com o app na Tela de Início); "Enviar teste"; avisos importantes e de atenção chegam como notificação, no máximo três por rodada | `notifications/push.ts`, `public/sw.js`, `app/push-setup.tsx` |
| Alertas por notificação e e-mail | A rotina diária (6h) envia os avisos novos: notificação para importantes e de atenção, e-mail só para os importantes; cada um uma vez só | `services/notifications.ts` (`dispatchAlerts`) |
| Resumo semanal por e-mail | Às segundas: gastos da semana comparados com a anterior, onde mais foi, próximos 7 dias, livre para gastar e metas | `domain/weekly-summary.ts`, `sendWeeklySummary` |
| Modo "Nosso lar" | Convite pelo e-mail da conta da outra pessoa; cada despesa ganha "Minha / Nossa / De fulano (paguei)" em Lançamentos e uma conta pode ser conjunta (tudo que sai dela é nosso). A outra pessoa só vê o que foi marcado; o resto continua privado | `services/household.ts`, `/casal`, `finance/quick-ownership.tsx` |
| Divisão e acerto | Meio a meio ou proporcional à renda informada; o que foi pago só pela outra pessoa entra inteiro na conta dela; "Já transferimos" abate a diferença; quem deve vê o Pix copia e cola com a chave de quem recebe | `domain/split.ts`, `domain/pix.ts` |
| Reunião mensal | Roteiro de 15 minutos com os números do mês, o acerto, os combinados do mês anterior e os combinados novos, guardados para os dois | `/casal/reuniao` |

Ficam para as próximas partes, porque precisam de tabelas novas: histórico das decisões do "Posso gastar?", alertas por notificação e e-mail, etiquetas e divisão de lançamentos, modo casal, divisão de contas, reunião mensal, resumo semanal, gasto por mensagem e uso sem internet.
