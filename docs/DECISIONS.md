# Registro de decisões (ADRs)

Formato curto: contexto → decisão → alternativas → consequências. Nova decisão = nova entrada; decisões não são
reescritas, são substituídas por outra que as referencia.

---

## ADR-001 — Projeto independente em histórico próprio
**Contexto.** O único repositório disponível na sessão (`sistema-financeiro-inteligente`) contém o Meu Banqueiro, em
produção. O pedido é um projeto independente e a sessão não pode criar repositórios.
**Decisão.** O MY OFFICE AI nasce num **histórico git órfão** (nenhum commit ou arquivo em comum com o Meu Banqueiro)
no branch `claude/vibrant-dijkstra-26dxn2`. O `main` do Meu Banqueiro não é tocado.
**Alternativas.** Subpasta no repositório do Meu Banqueiro (mistura produtos, CI e Vercel); aguardar um repositório
novo (bloquearia o trabalho).
**Consequências.** Mover para um repositório próprio é um único `git push` (ver README). O `vercel.json` desliga
deploys automáticos deste branch no projeto Vercel do Meu Banqueiro.

## ADR-002 — Monorepo pnpm com pacotes em TypeScript sem build
**Decisão.** `apps/web`, `apps/worker` (F4) e `packages/*` (core, db, ai, tools). Pacotes exportam o `.ts` direto;
o Next.js transpila (`transpilePackages`) e o worker roda com `tsx`/bundle.
**Por quê.** Web e worker compartilham domínio, schema e regras de acesso sem duplicação, com um único lockfile.
**Alternativa.** Repositórios separados (duplicação e versões divergentes) ou um app só (worker preso à Vercel).

## ADR-003 — Supabase Auth + acesso direto ao Postgres com RLS na transação
**Contexto.** O Supabase oferece a API REST automática (PostgREST). A plataforma precisa de transações, consultas
agregadas, fila com `SKIP LOCKED`, busca vetorial e um worker com o mesmo modelo de permissão.
**Decisão.** O servidor verifica o JWT (`getClaims`) e executa SQL tipado (Drizzle + `postgres.js`) dentro de uma
transação com `request.jwt.claims` e `set local role authenticated`. As **mesmas políticas RLS** valem para o app,
para a API REST (se ligada), para o Realtime e — com o contexto de agente — para o worker.
**Alternativas.** Só PostgREST/RPC (consultas complexas viram funções SQL, worker fica de fora do modelo); só
autorização na aplicação (um bug vaza dados).
**Consequências.** A conexão do app nunca deve contornar o contexto: o pacote `@myoffice/db` só exporta
`withUserContext`/`withAgentContext`, e o papel de conexão recomendado não tem privilégios próprios.

## ADR-004 — Migrations SQL como fonte da verdade; Drizzle para consultas
**Decisão.** `supabase/migrations/*.sql` escritas à mão (RLS, funções, gatilhos e privilégios são SQL de qualquer
jeito). `packages/db/src/schema.ts` espelha as tabelas; teste de deriva compara com o banco real. Migrador próprio
grava na tabela do Supabase CLI, então `supabase db push` e `pnpm db:migrate` são intercambiáveis.
**Alternativa.** `drizzle-kit generate` (não expressa bem RLS/funções/privilégios por coluna).

## ADR-005 — Fila de execução no Postgres (sem Redis no MVP)
**Decisão.** A tabela `executions` é a fila: reivindicação com `FOR UPDATE SKIP LOCKED`, *lease* + heartbeat,
`run_after` para backoff, `idempotency_key` única.
**Por quê.** Estado da fila e estado da execução são a mesma linha (transacional, auditável, visível via Realtime),
sem serviço extra pago. Volume esperado (dezenas a milhares de execuções/dia) cabe folgado.
**Gatilho para rever.** Latência de reivindicação > 1 s ou > 50 execuções/s → adaptador BullMQ/Redis atrás da mesma
interface `Queue`.

## ADR-006 — Isolamento por workspace + contexto de agente + concessões
**Decisão.** Workspace é a fronteira (pessoal 1 por usuário; empresarial N). Agente pertence a exatamente um
workspace. Leitura entre universos só com `access_grants` explícita, registrada, revogável e com validade. Escrita
entre universos não existe. Contexto de agente só restringe.
**Consequências.** A visão consolidada do escritório é do humano; não dá acesso aos agentes.

## ADR-007 — Next.js 16 (App Router), Server Actions, DAL e `proxy.ts`
**Decisão.** Seguir a documentação embutida na versão instalada (16.4.5): `proxy.ts` no lugar de `middleware`,
APIs de requisição assíncronas, Turbopack, Data Access Layer `server-only`. REST `/api/v1` a partir da F4 para
clientes externos.

## ADR-008 — Escritório em Phaser 4, dados no React
**Decisão.** Phaser apenas desenha; o estado vem do React (que vem do banco/Realtime). Carregamento dinâmico só no
cliente. No celular, painel em vez do mapa.
**Alternativas.** Canvas/DOM próprio (reinventa câmera, tilemap, animação); PixiJS (sem cena/tilemap prontos).

## ADR-009 — Provedores de IA atrás de interface; Anthropic primeiro; simulado rotulado
**Decisão.** `AIProvider` com Anthropic (`@anthropic-ai/sdk`) como primeiro adaptador; provedor Simulado para
desenvolvimento sem custo, sempre marcado como simulado na saída, na interface e nas métricas. Embeddings locais
(modelo pequeno no worker) por padrão, porque a Anthropic não oferece embeddings e o MVP não deve ter custo extra.
**Modelo padrão.** `claude-opus-5-5` para Coordenador/planejamento; cada agente pode escolher outro (ex.:
`claude-sonnet-5-5`, `claude-haiku-5-5`) — escolha sua, por agente.

## ADR-010 — Testes de autenticação sem Docker nesta sessão
**Contexto.** A sessão de desenvolvimento não alcança os registros de contêineres nem o site do Supabase, então não
roda `supabase start`.
**Decisão.** (1) Testes de RLS em PostgreSQL 16 real com uma camada de compatibilidade do Supabase; (2) E2E local com
um **emulador do protocolo do Supabase Auth** (só para testes, em `apps/web/e2e/support/`), que assina JWT ES256 e
publica JWKS como o Supabase; (3) **job de CI com Supabase real** (CLI no GitHub Actions) rodando os mesmos testes de
RLS e o E2E contra o GoTrue verdadeiro.
**Consequências.** O emulador nunca é usado fora dos testes; a validação definitiva é o job com Supabase real e o seu
projeto na nuvem.
