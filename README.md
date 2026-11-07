# MY OFFICE AI

Escritório digital pessoal e empresarial com agentes de IA: universos **pessoal** e **empresarial** isolados no banco
de dados, um escritório em pixel art como experiência central, coordenador, agentes especialistas, memória, projetos e
autonomia supervisionada.

> **Status:** Fase 0 (arquitetura) concluída · Fase 1 (fundação) implementada e testada — falta só validar no seu
> projeto Supabase na nuvem. Próxima: Fase 2 (escritório pixel art). Detalhes em [ROADMAP.md](ROADMAP.md).

| Documento | Conteúdo |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | visão geral, componentes, isolamento, execução, escritório, memória, riscos e custos |
| [DATABASE.md](DATABASE.md) | modelo de dados, RLS, funções, migrations e testes de isolamento |
| [SECURITY.md](SECURITY.md) | modelo de ameaças, autenticação, RLS, segredos, prompt injection, aprovações |
| [ROADMAP.md](ROADMAP.md) | fases 0–8, critérios e decisões pendentes |
| [docs/DECISIONS.md](docs/DECISIONS.md) | decisões técnicas (ADRs) |

## O que funciona hoje (Fase 1)

- **Conta**: cadastro, entrada, saída, confirmação de e-mail (dois fluxos oficiais do Supabase), lista opcional de
  e-mails permitidos.
- **Universos**: o cadastro cria o universo **Pessoal** com 8 categorias; a tela de boas-vindas cria a primeira
  empresa (**Explosion Digital** sugerida) com 8 categorias empresariais; outras empresas pelas Configurações (até 20).
- **Alternar universos** pelo seletor (verde = pessoal, roxo = empresarial), mantendo o módulo aberto.
- **Categorias**: criar, renomear e arquivar por universo.
- **Isolamento no banco**: RLS em todas as tabelas; agentes restritos ao próprio universo; compartilhamento só por
  concessão explícita, registrada, revogável e com validade; auditoria imutável.
- **Navegação** com os 11 módulos. Os de fases futuras dizem claramente que ainda não existem — sem dados de exemplo.
- **Desktop, iPad e celular** (menu em gaveta no celular), tema azul-marinho, CSP com nonce por requisição.

## Rodar

Pré-requisitos: Node.js 22 e pnpm 10 (`npm install -g pnpm`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # preencha conforme a opção A ou B
pnpm dev                                        # http://localhost:3000
```

### Opção A — Supabase na nuvem (sem Docker; recomendado para você)

1. Crie um projeto gratuito em supabase.com (região São Paulo, se disponível).
2. Aplique a migration — escolha **uma**:
   - **SQL Editor** do Supabase: cole e rode `supabase/migrations/20261107000100_foundation.sql`; ou
   - no terminal: `SUPABASE_DB_MIGRATION_URL="<Connect › Direct connection>" pnpm db:migrate`.
3. (Recomendado) rode `supabase/hardening/app-role.sql` no SQL Editor, trocando a senha.
4. Preencha `apps/web/.env.local`:
   - `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (*Project Settings › API keys*, chave **publicável**);
   - `SUPABASE_DB_URL` (*Connect › Transaction pooler*, porta 6543; usuário `myoffice_app.<ref>` se fez o passo 3);
   - `MYOFFICE_ALLOWED_EMAILS` com o seu e-mail.
5. *Authentication › URL Configuration*: Site URL `http://localhost:3000` (e depois o endereço publicado).

### Opção B — Supabase local (Docker + Supabase CLI)

```bash
supabase start                 # aplica supabase/migrations automaticamente
supabase status                # mostra API URL, chave publicável e DB URL
```
Use `API URL` em `SUPABASE_URL`, a chave publicável em `SUPABASE_PUBLISHABLE_KEY` e o `DB URL` em `SUPABASE_DB_URL`.

## Variáveis de ambiente (app web)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | sim | chave publicável (pública por desenho; quem protege os dados é a RLS) |
| `SUPABASE_DB_URL` | sim | conexão do servidor com o Postgres (pooler de transação) |
| `MYOFFICE_ALLOWED_EMAILS` | recomendada | só estes e-mails entram |
| `SITE_URL` | não | endereço público usado nos links de confirmação |

Nenhuma chave secreta (service role, Anthropic) é usada pelo app web.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` | app web em desenvolvimento / build de produção |
| `pnpm typecheck` · `pnpm lint` | TypeScript estrito · ESLint |
| `pnpm test` | unitários (domínio, cliente do banco, redirecionamentos) |
| `pnpm test:db` | isolamento RLS em PostgreSQL real (`TEST_ADMIN_DATABASE_URL`, padrão `postgres://postgres:postgres@127.0.0.1:5432/postgres`) |
| `pnpm test:e2e` | navegador (Playwright): build + PostgreSQL local + emulador do protocolo do Supabase Auth |
| `pnpm db:migrate` | aplica `supabase/migrations` (`SUPABASE_DB_MIGRATION_URL`) |

## Testes (última execução, 07/11/2026)

| Suíte | Resultado |
|---|---|
| Unitários | 23 testes passando (core 9, banco 4, web 10) |
| Isolamento RLS em PostgreSQL 16 | 31 cenários + 8 de deriva do schema, todos passando — teste de mutação: quebrar a regra de agentes derruba 7 deles |
| E2E no Chromium (desktop + celular) | 7 cenários passando |
| Lint e typecheck | sem erros |
| CI com Supabase real (GitHub Actions, job `supabase-real`) | migration aplicada pelo Supabase CLI; 39 testes de banco e os 7 cenários E2E passando contra o Postgres e o Supabase Auth verdadeiros |

## Estrutura

```
apps/web/         Next.js 16: proxy.ts (sessão + CSP), app/ (rotas), server/ (env, auth, DAL, ações), components/
packages/core/    domínio puro: universos, papéis, estados de agente, módulos, validação
packages/db/      schema Drizzle, cliente com contexto RLS (asUser/asAgent), migrador, testes de isolamento
supabase/         config.toml, migrations SQL (fonte da verdade), hardening/
```

## Repositório

Repositório próprio e privado: **github.com/lucasmatheuscvalenca-boop/my-office-ai** (branch `main`). O projeto é
**independente** do Meu Banqueiro — nenhum arquivo ou commit em comum.

Histórico: as Fases 0 e 1 nasceram no branch `claude/vibrant-dijkstra-26dxn2` do repositório
`sistema-financeiro-inteligente` (a sessão de desenvolvimento não podia criar repositórios) e foram trazidas para cá
com o mesmo histórico. A partir daqui o desenvolvimento segue neste repositório (ver ADR-011).

O `vercel.json` na raiz só existe para impedir que aquele branch antigo seja publicado no projeto Vercel do Meu
Banqueiro. O projeto Vercel do MY OFFICE AI usará *Root Directory* `apps/web`, com a configuração própria (Fase 8).
