# Modelo de dados

Fonte da verdade: `src/server/db/schema.ts` (Drizzle) e as migrações em `drizzle/`. Nomes de colunas no banco em `snake_case`.

## Convenções

- **Dinheiro**: inteiros em centavos (`*_cents`, `bigint` lido como número). Nunca `float`.
- **Datas de calendário**: tipo `date` (`AAAA-MM-DD`), sem fuso. Instantes (criação, login, sincronização) em `timestamptz`.
- **Mês de referência**: texto `AAAA-MM`, validado por `CHECK`.
- **Chaves**: UUID aleatório. Toda tabela de dados tem `user_id` com `ON DELETE CASCADE` (excluir a conta apaga tudo).
- **Domínios fechados** (tipos, status, procedência) são protegidos por `CHECK` no banco além da validação na aplicação.

## Grupos de tabelas

### Identidade, sessão e preferências
| Tabela | Conteúdo | Regras |
|---|---|---|
| `users` | nome, e-mail, hash da senha (scrypt) | e-mail único sem diferenciar maiúsculas |
| `sessions` | hash SHA-256 do token, validade, último uso, navegador | o token em si só existe no cookie |
| `auth_rate_limits` | contadores por chave e janela | login, cadastro e IA |
| `mascots` | catálogo oficial (6 linhas, via migração) | `CHECK` com os seis IDs |
| `user_preferences` | mascote, tema, fuso, margem de segurança, frequência de revisão, máximo de alertas/dia, etapa do onboarding | `mascot_id` com FK para `mascots`; sem mascote o app não libera a área logada |
| `mascot_selections` | histórico de escolhas de mascote | — |
| `financial_profiles` | campos estruturados vindos do briefing (renda, despesas essenciais, situação profissional…) | alimenta diagnóstico, reserva e margem |
| `briefing_sections` | respostas por etapa (`personal`, `financial`, `life`) em JSON + data de conclusão | chave primária (usuário, etapa); parcial permitido |

### Central financeira
| Tabela | Conteúdo | Regras |
|---|---|---|
| `accounts` | contas e carteiras: tipo, finalidade (`spending`, `reserve`, `goals`, `investment`), saldo inicial e **data do saldo inicial**, origem | só `spending` entra no saldo livre; só `reserve` conta na reserva |
| `credit_cards` | limite, dia de fechamento e de vencimento, conta de pagamento padrão | dias 1–31; limite ≥ 0 |
| `card_invoices` | uma linha por ciclo (data de fechamento e vencimento) | única por (cartão, fechamento) |
| `categories` | categorias e subcategorias (2 níveis), receita/despesa, essencial | padrão criado no cadastro |
| `recurrences` | regra (semanal, quinzenal, mensal, anual; intervalo; dia; início/fim/quantidade), certeza (`scheduled` ou `estimated`) | ocorrências são projetadas, não pré-geradas |
| `installment_plans` | compra parcelada (total, número de parcelas) | 1–120 parcelas |
| `transactions` | o razão: `income`, `expense`, `refund`, `transfer`, `card_payment`; status `realized`/`scheduled`/`estimated`; conta, conta destino, cartão, fatura, parcela, recorrência + data da ocorrência, origem, ID externo, impressão digital, lote de importação, conexão bancária | ver regras abaixo |
| `transaction_history` | antes/depois de cada criação, edição e exclusão | sem FK, sobrevive à exclusão |
| `import_batches` | arquivo importado, contagens | — |
| `budgets` | limite por categoria e mês, percentual de alerta | único por (usuário, categoria, mês) |

**Regras do razão garantidas no banco (`transactions_shape`)** — defesa em profundidade contra dupla contagem:

| Tipo | Conta | Conta destino | Cartão |
|---|---|---|---|
| `income` | obrigatória | vazia | vazio |
| `expense` / `refund` | **exatamente um** entre conta e cartão | vazia | — |
| `transfer` | obrigatória | obrigatória e diferente da origem | vazio |
| `card_payment` | obrigatória (de onde sai) | vazia | obrigatório (fatura que liquida) |

Outras: valor sempre positivo (o sentido vem do tipo); ID externo único por conta/cartão (índices parciais) para sincronização idempotente; uma única materialização por (recorrência, data da ocorrência).

### Planejamento
| Tabela | Conteúdo | Regras |
|---|---|---|
| `goals` | alvo, prazo, prioridade 1–5, aporte planejado, dia do aporte, rendimento anual hipotético, conta onde o dinheiro fica, status | alvo > 0 |
| `goal_contributions` | aporte, resgate ou rendimento; data; conta de origem; quem registrou (compartilhamento) | aporte com conta de origem gera transferência, não despesa |
| `emergency_fund_settings` | meses-alvo, mínimo, prazo desejado, despesa essencial informada manualmente | 1–36 meses |
| `assets`, `asset_valuations` | bens e investimentos com **procedência** (`confirmed`, `informed`, `estimated`) e histórico de avaliações | valor ≥ 0 |
| `debts` | saldo devedor, parcela, juros ao mês, parcelas restantes, procedência | — |
| `net_worth_snapshots` | patrimônio mensal (contas + bens − dívidas) | único por (usuário, mês) |
| `retirement_plans`, `projection_snapshots` | premissas do plano e resultados salvos | resultados são projeções, não patrimônio |

### Inteligência e engajamento
| Tabela | Conteúdo |
|---|---|
| `memory_items`, `memory_item_history` | memória contextual: tipo, conteúdo, origem (`declared`/`inferred`), status (`active`, `pending_confirmation`, `rejected`); excluir remove o conteúdo também do histórico |
| `ai_conversations`, `ai_messages` | conversas, papel, modo (llm/local), ferramentas usadas e dados de referência da resposta |
| `alerts` | causa, impacto, ação, severidade, status, impressão digital (evita repetir o mesmo alerta) |
| `user_achievements`, `financial_reviews`, `savings_challenges`, `challenge_check_ins` | conquistas, revisões periódicas, desafios voluntários (um check-in por dia) |

### Conexões bancárias e compartilhamento
| Tabela | Conteúdo |
|---|---|
| `bank_connections` | fornecedor, instituição, **referência externa cifrada** (AES-256-GCM), demo?, status, última sincronização, último erro |
| `bank_consents` | escopos, finalidade, ID do consentimento no fornecedor, concessão, expiração, revogação |
| `bank_sync_runs` | cada sincronização: status, importados, duplicados, erro |
| `resource_shares` | compartilhamento de **uma meta**: dono, e-mail convidado, hash do token do convite, permissão (`view`/`contribute`), status, expiração, aceite, revogação |
| `audit_log` | eventos de segurança e dados (login, troca de senha, exportação, conexão, compartilhamento…), sem valores financeiros |

## Relações principais

```
users 1─1 user_preferences ─► mascots
users 1─N accounts, credit_cards 1─N card_invoices
users 1─N transactions ─► accounts / credit_cards / card_invoices / categories / recurrences / installment_plans / bank_connections
users 1─N goals 1─N goal_contributions ─► accounts (origem) ; goals ─► accounts (onde fica guardado)
users 1─N bank_connections 1─N bank_consents, bank_sync_runs ; accounts/cards/transactions ─► bank_connections
goals 1─N resource_shares (dono) ─► users (convidado)
```

## Como os saldos são obtidos

Não existe coluna de saldo. O saldo de uma conta é: saldo inicial + efeitos dos lançamentos **realizados** a partir da data do saldo inicial (`accountBalances` em `src/domain/ledger.ts`). “Ajustar saldo” recalcula o saldo inicial para que o saldo de hoje bata com o informado (sem criar receita ou despesa fictícia) e registra o evento na auditoria. Assim não existe saldo armazenado que possa ficar dessincronizado dos lançamentos.
