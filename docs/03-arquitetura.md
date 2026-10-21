# Arquitetura

## Visão geral

Aplicação web única (monólito modular) em Next.js, com PostgreSQL. A regra de ouro: **todo número financeiro sai de um motor determinístico testado**; a interface e a IA apenas apresentam e explicam esses números.

```
Navegador (React 19, Server Components + Client Components)
      │  formulários → Server Actions        leitura → Server Components
      ▼
app/ (rotas, ações)  ── valida sessão ──►  server/auth (sessão em cookie httpOnly)
      │
      ▼
server/services  (casos de uso; recebem ServiceContext {db, userId, timezone, today})
      │  ├── server/ai            ferramentas determinísticas + modo local + provedor Claude
      │  ├── server/integrations  contrato BankDataProvider (demo, Pluggy)
      │  └── server/security      hash, cifragem, auditoria, limite de tentativas
      ▼
domain/  (funções puras: dinheiro, datas, cartão, ledger, metas, caixa, Posso gastar?, aposentadoria…)
      │
      ▼
server/db (Drizzle ORM)  ──►  PostgreSQL 16 (constraints, FKs, índices, migrações versionadas)
```

## Stack e motivos

| Escolha | Motivo | Alternativas consideradas |
|---|---|---|
| **Next.js 16 (App Router) + React 19 + TypeScript estrito** | Um só projeto para interface e servidor; Server Actions eliminam uma API REST paralela; streaming e Server Components deixam o painel rápido | SPA + API separada (mais código e mais superfície de ataque no início) |
| **PostgreSQL 16** | Integridade transacional, `CHECK`, chaves estrangeiras, índices parciais; essencial para dinheiro | SQLite (sem multiusuário real), NoSQL (sem integridade relacional) |
| **Drizzle ORM** | SQL explícito e tipado, migrações em SQL legível, sem “mágica” em consultas financeiras | Prisma (cliente pesado, menos controle do SQL) |
| **Valores em centavos inteiros + decimal.js** | Sem erro de ponto flutuante; juros e taxas com precisão arbitrária e arredondamento explícito | `number` em reais (erros de arredondamento) |
| **Datas ISO sem fuso (`AAAA-MM-DD`)** e “hoje” calculado no fuso do usuário | Vencimentos e aportes são datas de calendário, não instantes; evita o erro clássico de virar o dia em UTC | `Date` com horário |
| **Tailwind CSS v4** com tokens em CSS | Design system com variáveis trocadas no tema escuro; nada de cores soltas | CSS-in-JS |
| **Recharts** | Gráficos acessíveis e responsivos com tooltip e tabela alternativa | Chart.js |
| **Claude via `@anthropic-ai/sdk`** com ferramentas `strict` | O modelo só obtém números chamando ferramentas do motor; esquemas estritos impedem parâmetros inventados | Respostas livres do modelo (risco de números inventados) |
| **Vitest + Playwright** | Unitários rápidos, integração contra PostgreSQL real, E2E no navegador | Jest |

## Camadas e responsabilidades

### `src/domain` — motor financeiro
Funções puras, sem banco e sem relógio implícito (sempre recebem `today`). Exemplos: `requiredContribution` (aporte necessário pelo calendário real), `invoiceForPurchase` (fatura de uma compra pelo dia de fechamento), `projectCashFlow`, `canISpend`, `planRetirement`, `allocateMonthlyCapacity`, `computeNetWorth`, `generateAlerts`. As fórmulas estão em [07-regras-financeiras.md](07-regras-financeiras.md).

### `src/server/services` — casos de uso
- Toda função recebe `ServiceContext`; o `userId` vem **apenas da sessão validada no servidor**, nunca do formulário.
- Toda leitura/escrita filtra por `user_id`. IDs de outro usuário passam por `assertOwned` e resultam em “não encontrado” (não revela existência).
- Validação com zod na entrada; erros de negócio viram mensagens amigáveis (`AppError`).
- Operações compostas (ex.: parcelamento, pagamento de fatura, exclusão de dados de conexão) rodam em transação.

### `src/app` — rotas e ações
- Grupo `(auth)`: entrar e criar conta. `onboarding`: fluxo inicial. Grupo `(app)`: área logada (exige onboarding concluído com mascote escolhido).
- `proxy.ts` (antigo middleware) faz só a verificação otimista do cookie; a validação real acontece em cada página e ação.
- Ações de servidor usam `runAction`, que injeta o contexto do usuário, converte erros e revalida as páginas afetadas.
- Rotas de API: `/api/exportar` (exportação dos dados do usuário) e `/api/health` (saúde do banco).

### `src/server/ai` — camada de IA
- **Ferramentas determinísticas** (`tools.ts`): resumo financeiro, Posso gastar?, quanto posso gastar hoje, quanto posso gastar numa categoria, status de metas, cálculo de aporte, aportes do mês, queda de renda, mudanças nos gastos, projeção de caixa, prioridades, aposentadoria, reserva, busca de movimentações e memória. Cada saída traz data de referência, período, fatos, estimativas, premissas e o que falta.
- **Provedor Claude** (`anthropic-provider.ts`): laço manual de ferramentas, esquemas `strict`, esforço `medium`, fallback de servidor para recusas; o modelo recebe os fatos já formatados (o objeto bruto fica no servidor). Histórico só em texto (últimas 12 mensagens).
- **Modo local** (`local-engine.ts`): sem chave de API, interpreta as perguntas principais por regras e responde com as mesmas ferramentas. Também é o plano B quando o provedor falha ou recusa (com aviso na resposta).
- A IA **não executa transações nem altera dados**. Limite: 60 perguntas por hora por usuário.

### `src/server/integrations` — dados bancários
Contrato `BankDataProvider` (conectar, listar contas, listar transações, revogar). Implementações: `DemoProvider` (fictício, sinalizado) e `PluggyProvider` (não validado). O serviço `connections.ts` cuida de consentimento, sincronização idempotente (ID externo + impressão digital), conciliação com previstos, histórico de execuções, revogação e exclusão. Detalhes em [02-open-finance.md](02-open-finance.md).

## Multiusuário e SaaS

- Isolamento lógico por `user_id` em todas as tabelas de dados, reforçado por testes de acesso cruzado (integração e E2E).
- Compartilhamento é uma exceção explícita: `resource_shares` concede acesso a **uma meta** (ver ou contribuir), com aceite pela conta do e-mail convidado, expiração e revogação imediata.
- Preparado para crescer: sessões e limites de tentativa no banco (sem estado em memória), servidor sem estado, migrações versionadas. Próximos passos para SaaS: planos/assinaturas, filas para sincronização bancária, Row Level Security no PostgreSQL como segunda barreira, observabilidade.

## Custos (ordem de grandeza, a confirmar com os fornecedores)

| Item | Observação |
|---|---|
| Hospedagem do app | Qualquer plataforma Node.js (Vercel, Render, Railway, VPS). Uso pessoal cabe em planos de entrada |
| PostgreSQL gerenciado | Neon, Supabase, RDS etc. Volume de dados pessoal é pequeno (poucos MB por usuário) |
| IA (Claude) | Cobrança por tokens. Custo controlado por: só chamar quando o usuário pergunta, fatos compactos das ferramentas, histórico limitado a 12 mensagens e 60 perguntas/hora. Sem chave, custo zero (modo local) |
| Open Finance | Maior custo do produto como SaaS: agregadores relatam mensalidades na casa de R$ 1,5 mil a R$ 6 mil (fontes secundárias, ver doc 02). Para uso pessoal, avaliar opções gratuitas do fornecedor |

## Decisões e trade-offs registrados

1. **Compra no cartão é a despesa; pagamento da fatura é transferência de liquidação.** Evita dupla contagem e permite orçamento por data de compra.
2. **Recorrências são projetadas, não pré-geradas.** Ocorrências viram lançamentos ao serem confirmadas; nada de milhares de linhas futuras para editar.
3. **Saldo inicial com data.** Lançamentos anteriores à data do saldo inicial ficam no histórico sem alterar o saldo (importações antigas não distorcem o saldo atual).
4. **Receitas estimadas nunca entram no saldo disponível** até serem confirmadas; as projeções mostram duas linhas (confirmada × com estimativas).
5. **IA explica, motor calcula.** Mesmo com modelo de linguagem, nenhum número vem do modelo.
6. **Mascote muda o tom, nunca a regra.** Todas as vozes recebem os mesmos fatos (testado).
