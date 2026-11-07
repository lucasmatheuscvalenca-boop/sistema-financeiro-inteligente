# Cópia de segurança e restauração

O banco fica no Neon. Existem duas redes de proteção: a restauração instantânea do próprio Neon, para desfazer um erro recente, e a cópia diária do Meu Banqueiro, guardada fora do banco, para voltar dias ou meses.

## Cópia diária do Meu Banqueiro

| O quê | Como |
|---|---|
| Quando | Todo dia, na rotina das 6h (`/api/cron/sync`), **antes** da sincronização dos bancos |
| Conteúdo | Todas as tabelas do schema `public`, numa leitura só (todas do mesmo instante). Ficam de fora só dados de passagem: sessões, tentativas de login, códigos de senha e do Telegram, propostas do bot não confirmadas |
| Formato | Arquivo `.mbbk`: JSON gerado pelo próprio Postgres, compactado (gzip) e cifrado com AES-256-GCM. Qualquer byte alterado impede a abertura |
| Chave | Derivada da `APP_ENCRYPTION_KEY` (HKDF-SHA256, uso `backup-v1`). Não existe outra chave para guardar, mas **sem a `APP_ENCRYPTION_KEY` nenhuma cópia abre** |
| Onde | Vercel Blob **privado**, pasta `backups/` (`backups/2026-11-07T09-00-12Z.mbbk`) |
| Quantas | As 30 mais recentes e, dos últimos 12 meses, a primeira de cada mês |
| Teste mensal | Uma vez por mês a rotina baixa a cópia, abre, restaura tudo num schema provisório (`mb_restore_check`) e confere as linhas de cada tabela. Tudo acontece dentro de uma transação desfeita no fim: os dados reais nem são tocados |
| Avisos | Se a cópia falhar, se o teste mensal achar diferença ou se o armazenamento não estiver ligado na produção, o dono do app recebe e-mail (`ADMIN_EMAIL` ou, sem ele, `SMTP_USER`). O registro fica no `audit_log` (`backup.created` e `backup.restore_checked`) |

Privacidade: o que alguém apaga no app (ou a conta inteira) continua nas cópias até elas saírem da retenção, no máximo 12 meses. O aviso de privacidade (`/privacidade`) informa isso. Se for preciso restaurar, avise quem apagou dados depois da cópia usada.

Código: `src/server/backup/` (formato, armazenamento, cópia e restauração) e `src/server/services/backup.ts` (rotina).

### Ligar o armazenamento (uma vez)

1. Na Vercel, abra o projeto **sistema-financeiro-inteligente** › **Storage** › **Create Database** › **Blob**.
2. Nome `meubanqueiro-backups`, acesso **Private**, região **Washington, D.C. (iad1)**, a mesma do app.
3. **Connect** ao projeto, marcando **Production**. Isso cria a variável `BLOB_READ_WRITE_TOKEN`.
4. Publique de novo (ou espere a próxima publicação). A cópia começa na rotina do dia seguinte.

### Guarde a chave fora da Vercel

Copie o valor de `APP_ENCRYPTION_KEY` (Vercel › Settings › Environment Variables) para um gerenciador de senhas. Se a conta da Vercel for perdida, é ela que abre as cópias. Nunca coloque essa chave no repositório nem em mensagens.

## Como restaurar

### Erro recente (até 6 horas): restauração do Neon

No plano gratuito, o Neon guarda as últimas **6 horas** de mudanças (até 1 GB de histórico). Nos planos pagos o período é maior: Launch até 7 dias, Scale até 30.

1. Console do Neon › projeto › **Backup & Restore** (ou **Branches** › branch principal › **Restore**).
2. Escolha o horário de antes do problema e confirme.
3. O Neon guarda o estado de antes da restauração num branch de reserva: dá para desfazer.

Isso volta o banco inteiro, das duas pessoas. Se o problema for só de uma, prefira corrigir pelo app.

### Mais antigo: cópia do Meu Banqueiro

A restauração grava **só num banco novo e vazio**. O script recusa um banco que já tenha pessoas cadastradas, então não sobrescreve nem apaga nada.

1. No computador, num `.env.local`: `APP_ENCRYPTION_KEY` (a da produção) e `BLOB_READ_WRITE_TOKEN` (Vercel › Storage › meubanqueiro-backups › `.env.local`).
2. Confira a cópia antes de tudo:
   ```bash
   pnpm backup:restaurar --ultimo --conferir
   # ou um arquivo baixado: pnpm backup:restaurar --arquivo copia.mbbk --conferir
   ```
3. Crie um banco novo (no Neon: **Branches** › **Create branch** a partir de um ponto vazio, ou um projeto novo). Coloque a URL dele em `DATABASE_URL` no `.env.local` e aplique as migrações da mesma versão do código:
   ```bash
   pnpm db:migrate
   ```
4. Restaure:
   ```bash
   pnpm backup:restaurar --ultimo            # a mais nova
   pnpm backup:restaurar --arquivo copia.mbbk
   ```
   O script mostra quantas tabelas e linhas gravou e confere cada tabela.
5. Aponte o app para o banco novo (troque a variável na Vercel ou use `DATABASE_ENV_PREFIX`, veja `docs/10-migracao-banco.md`) e publique.

Para guardar uma cópia cifrada no computador: `pnpm backup:restaurar --ultimo --salvar copia.mbbk`.

## Referências

- [Neon: planos e período de restauração](https://neon.com/docs/introduction/plans)
- [Neon: cópias e restauração](https://neon.com/docs/manage/backups)
