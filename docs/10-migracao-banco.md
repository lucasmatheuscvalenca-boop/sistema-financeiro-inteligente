# Migração do banco de produção

Concluída em 22/10/2026. Nenhuma credencial aparece neste documento.

## Situação atual

| | Banco novo (em uso) | Banco antigo (temporário) |
| --- | --- | --- |
| Projeto Neon | `neon-orange-umbrella`, criado pela aba Storage da Vercel na conta do usuário | `misty-bar-28575183`, criado pelo Neon Claimable Postgres (neon.new) |
| PostgreSQL / região | 18.6, `us-east-1` | 17.11, `us-east-2` |
| Ligação com o site | variáveis com prefixo `NOVO_` (sensíveis, gerenciadas pela integração) e `DATABASE_ENV_PREFIX=NOVO_` | `DATABASE_URL` e `DATABASE_URL_UNPOOLED`, mantidas só para a volta atrás |
| Estado | recebe todas as leituras e escritas do site | intacto, sem escritas desde a migração; **expira sozinho em 24/10/2026 às 22:59 UTC (19:59 em Brasília)** |

As funções da Vercel rodam em `iad1` (Washington), ao lado do banco novo.

## Por que não houve transferência direta

O "claim" do banco temporário falhou porque a conta Neon do usuário é uma **organização gerenciada pela Vercel**. Segundo a documentação atual do Neon:

- *Transfer projects › Limits and requirements*: "Vercel-managed organizations are not supported as source or destination." (https://neon.com/docs/manage/orgs-project-transfer)
- A integração gerenciada pela Vercel cria uma organização "Vercel: <time>" e injeta `DATABASE_URL` e afins no projeto da Vercel, com prefixo opcional nas variáveis quando há mais de um banco no mesmo projeto (https://neon.com/docs/guides/vercel-managed-integration).

Não existe transferência direta para essa organização. O único "claim" possível seria para uma organização Neon fora da Vercel, sem a integração e com troca manual de credenciais. Por isso a estratégia foi migrar os dados para um banco Neon criado pela aba Storage da Vercel, na conta do usuário, sem repetir o "claim".

## Banco antigo antes da migração

- PostgreSQL 17.11; extensão `plpgsql`; schemas `public` e `drizzle`.
- 42 tabelas, 413 colunas, 86 índices, 170 restrições, 1 sequência.
- Registros: 2 migrações aplicadas (`drizzle.__drizzle_migrations`), 6 mascotes do catálogo, 1 registro de auditoria e 3 de controle de tentativas de login. Nenhum usuário cadastrado.

## Backup (feito antes de qualquer mudança)

- Feito num Vercel Sandbox (rede liberada só para `*.neon.tech`) com `pg_dump` 18.6 em formato custom (`--no-owner --no-acl`), mais o schema em SQL e o inventário (`scripts/banco/inventario.sql`), todos com SHA-256.
- Restaurado com `pg_restore --exit-on-error` num PostgreSQL separado e comparado item por item: mesmas tabelas, colunas, índices, restrições e sequências, e **mesmo número de linhas e hash do conteúdo nas 42 tabelas**.
- Guardado no snapshot `snap_QX9qRQ5UGrHXWSPBAUYoqiJU52Pw` (projeto da Vercel, válido até 28/10/2026), pasta `/vercel/nexo/backup-20261021T233154Z`, sem credenciais.

## Como foi feito

1. **Banco de destino.** O usuário criou o `neon-orange-umbrella` em Vercel › Storage e o conectou ao projeto (Production e Preview) com o prefixo `NOVO_`. As variáveis ficaram sensíveis: nem a API nem o assistente conseguem lê-las, só os builds e as funções da Vercel. Por isso a cópia rodou **dentro de um build da Vercel**, e as credenciais nunca saíram dela.
2. **Cópia verificada** (`scripts/migrar-dados.ts`, num deploy de preview com `MIGRAR_DADOS_NEXO=1` e `MIGRAR_DESTINO_PREFIXO=NOVO_`):
   - aborta se origem e destino forem o mesmo banco, se os schemas do app (`public`, `drizzle`) no destino não estiverem vazios ou se faltar alguma extensão da origem. O schema `neon_auth` (9 tabelas, criado pelo próprio Neon) não é tocado;
   - aplica no destino as mesmas migrações Drizzle que criaram a origem e compara o schema: **413 colunas, 86 índices e 170 restrições idênticos**. Duas diferenças vêm só da versão 18 e foram desconsideradas: ela registra cada `NOT NULL` também como restrição de catálogo (289) e escreve uma restrição `CHECK` com outros parênteses;
   - copia as linhas na ordem das chaves estrangeiras, numa única transação, e ajusta as sequências;
   - confere que a origem não mudou durante a cópia e que o inventário completo (42 tabelas, número de linhas e MD5 do conteúdo) ficou idêntico:

     | Tabela | Linhas | Hash (12 primeiros) |
     | --- | --- | --- |
     | `drizzle.__drizzle_migrations` | 2 | `f6f21a4ad060` |
     | `public.audit_log` | 1 | `22542795dd72` |
     | `public.auth_rate_limits` | 3 | `7a52e2ca1eaf` |
     | `public.mascots` | 6 | `2c21cccca1b0` |

     As outras 38 tabelas estão vazias nos dois bancos.
3. **Virada.** Só depois da cópia confirmada: `DATABASE_ENV_PREFIX=NOVO_` em produção e preview, `MIGRAR_DADOS_NEXO=0`, funções em `iad1` e nova publicação em produção. O build aplicou as migrações no banco novo (nenhuma pendente) e `/api/health` respondeu `{"ok":true,"db":"ok"}` a partir de `iad1`. Depois disso o script saiu do build (`vercel.json`); ele continua no repositório para referência.

O app escolhe o banco em `src/server/db/connection.ts`: com `DATABASE_ENV_PREFIX=NOVO_` ele lê `NOVO_DATABASE_URL` (aplicação) e `NOVO_DATABASE_URL_UNPOOLED` (migrações); sem o prefixo, `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.

## Testes realizados

- **Backup**: restauração completa e comparação do inventário (acima).
- **Script de cópia**: ensaios locais (PostgreSQL 17 → 18), incluindo os casos em que ele deve abortar; testes unitários da escolha de banco por prefixo (`tests/unit/connection.test.ts`).
- **Cópia na Vercel**: comparação de schema e de conteúdo (acima).
- **Site publicado** (`scripts/verificar-producao.mjs`, 22/10/2026, a partir de um sandbox com rede liberada só para o domínio do site): **33 de 33 verificações OK**
  - login com senha errada recusado;
  - cadastro e onboarding de dois usuários (mascotes Lince e Raposa);
  - conta com saldo de R$ 2.000,00; transação de R$ 150,00 no Mercado; saldo atualizado para R$ 1.850,00;
  - meta de R$ 5.000,00 com aporte de R$ 500,00 (10%);
  - login em nova sessão com meta, transação, conta e saldo preservados;
  - isolamento: o segundo usuário não vê conta, meta nem transação do primeiro, e o acesso direto à meta dele responde 404; cada um mantém o próprio mascote;
  - exclusão das duas contas de teste pelo próprio app, com a sessão encerrada.
- **Banco antigo depois dos testes**: os mesmos hashes de antes e nenhum usuário. Ou seja, o site grava só no banco novo.

As contas de teste foram excluídas. No banco novo ficam só os registros que o app sempre guarda: dois de auditoria anônimos ("conta excluída") e alguns de controle de tentativas de login.

## Volta atrás

- **Até 24/10/2026, 22:59 UTC**: apagar `DATABASE_ENV_PREFIX` (Vercel › projeto › Settings › Environment Variables) e publicar de novo, ou promover a publicação anterior à virada. O site volta ao banco antigo, **sem** o que foi gravado no banco novo depois da virada.
- **Depois disso** o banco antigo deixa de existir: `DATABASE_URL` e `DATABASE_URL_UNPOOLED` apontam para um banco expirado. Não apague `DATABASE_ENV_PREFIX`, ou o site para. O backup do snapshot guarda o estado anterior à migração e pode ser restaurado em qualquer PostgreSQL 17 ou superior com `pg_restore --no-owner --no-acl`.

## Limpeza opcional (pelo painel da Vercel)

- `MIGRAR_DADOS_NEXO` e `MIGRAR_DESTINO_PREFIXO` já não têm efeito e podem ser apagadas.
- Depois de 24/10, `DATABASE_URL` e `DATABASE_URL_UNPOOLED` (as antigas, sem prefixo) também podem ser apagadas.
- O banco antigo não precisa de nenhuma ação: ele expira sozinho.
