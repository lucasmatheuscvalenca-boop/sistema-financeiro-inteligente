# Migração do banco de produção

Situação em 21/10/2026. Nenhuma credencial aparece neste documento.

## Por que migrar

O banco de produção atual foi criado pelo Neon Claimable Postgres (neon.new, projeto Neon `misty-bar-28575183`, região `us-east-2`). Ele expira em **24/10/2026 às 22:59 UTC (19:59 em Brasília)** se não for assumido por uma conta.

O "claim" falhou porque a conta Neon do usuário é uma **organização gerenciada pela Vercel**. Segundo a documentação atual do Neon:

- *Transfer projects › Limits and requirements*: "Vercel-managed organizations are not supported as source or destination." (https://neon.com/docs/manage/orgs-project-transfer)
- A integração gerenciada pela Vercel cria, para quem já usa o Neon, uma organização "Vercel: <time>" e injeta `DATABASE_URL` e afins no projeto da Vercel; dá para usar um prefixo nas variáveis quando há mais de um banco no mesmo projeto (https://neon.com/docs/guides/vercel-managed-integration).

Ou seja, não existe transferência direta para a organização gerenciada pela Vercel. O único "claim" possível seria para outra organização Neon fora da Vercel, que não fica integrada à Vercel e troca as credenciais no meio do caminho. Por isso, a escolha foi migrar os dados para um banco Neon criado pela aba Storage da Vercel, na conta do usuário.

## Estado do banco atual (antes da migração)

- PostgreSQL 17.11; extensão `plpgsql`; schemas `public` e `drizzle`.
- 42 tabelas, 413 colunas (289 obrigatórias), 86 índices, 170 restrições, 1 sequência.
- Registros: 2 migrações aplicadas (`drizzle.__drizzle_migrations`), 6 mascotes do catálogo, 1 registro de auditoria e 3 de controle de tentativas de login. Nenhum usuário cadastrado.

## Backup (feito e verificado)

- Feito num Vercel Sandbox (rede liberada só para `*.neon.tech`), com `pg_dump` 18.6 em formato custom (`--no-owner --no-acl`), mais o schema em SQL e o inventário (`scripts/banco/inventario.sql`), todos com SHA-256.
- Restaurado com `pg_restore --exit-on-error` num PostgreSQL local e comparado item por item: mesmas colunas, índices, restrições, sequências e tabelas, e **número de linhas e hash do conteúdo idênticos em todas as 42 tabelas**. As únicas diferenças vêm da versão local (PostgreSQL 18): ele registra cada `NOT NULL` também como restrição de catálogo e escreve com outros parênteses uma restrição `CHECK` equivalente.
- O backup fica guardado no snapshot `snap_QX9qRQ5UGrHXWSPBAUYoqiJU52Pw` (projeto da Vercel, válido até 28/10/2026), pasta `/vercel/nexo/backup-20261021T233154Z`, sem credenciais.

## Passo do usuário: criar o banco de destino

1. Vercel → projeto **sistema-financeiro-inteligente** → aba **Storage** → **Create Database** → **Neon** → **Continue** (aceitar os termos, se pedir).
2. Região **São Paulo (sa-east-1)**, se aparecer na lista (senão, Washington D.C. `us-east-1`). Plano **Free**. Nome `nexo-producao`.
3. Em **Connect Project**: projeto **sistema-financeiro-inteligente**, ambientes **Production** e **Preview**. Em **Advanced Options**, prefixo das variáveis **`NOVO_`**. Não ativar o preview branching. **Connect**.
4. Não fazer "Redeploy". O site atual não muda, porque ele continua lendo `DATABASE_URL`.

## Virada (feita pelo assistente depois do passo acima)

1. Conectar no destino e confirmar que está vazio (o script aborta se não estiver).
2. `scripts/banco/migrar.sh`: dump novo da origem, restauração no destino, `ANALYZE` e comparação do inventário (precisa ser idêntico).
3. Só então trocar `DATABASE_URL` e `DATABASE_URL_UNPOOLED` de produção e preview para o banco novo e ajustar a região das funções em `vercel.json` para ficar perto do banco (`gru1` para São Paulo).
4. Publicar, conferir `/api/health` e rodar `scripts/verificar-producao.mjs` (cadastro, login, conta, transação, meta, aporte, persistência após novo login, isolamento entre dois usuários e exclusão das contas de teste).
5. Comparar o inventário da origem com o do dump, para garantir que nada foi gravado na origem durante a virada.

## Volta atrás

- Até 24/10, 22:59 UTC: basta voltar `DATABASE_URL` e `DATABASE_URL_UNPOOLED` para os valores anteriores e publicar. O banco original não é alterado nem apagado.
- Depois disso: restaurar o backup do snapshot em qualquer PostgreSQL 17 ou superior com `pg_restore --no-owner --no-acl`.
