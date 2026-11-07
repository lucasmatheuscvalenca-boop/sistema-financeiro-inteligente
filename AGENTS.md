# MY OFFICE AI — instruções para agentes de código

- Leia ARCHITECTURE.md, DATABASE.md e SECURITY.md antes de mudar algo estrutural; registre decisões em docs/DECISIONS.md.
- **Banco**: `supabase/migrations/*.sql` é a fonte da verdade. Nunca edite migration já publicada; crie outra. Toda
  tabela nova: RLS ativada, privilégios padrão revogados, políticas com `app.can_read/can_write/can_manage`,
  espelho em `packages/db/src/schema.ts` (o teste de deriva cobra) e testes de isolamento em `packages/db/test`.
- **App web**: dados só pela DAL (`apps/web/src/server/dal`) com `db().asUser(auth.claims, …)`. Toda Server Action
  chama `requireAuth()` e valida com Zod. Nada de segredos com prefixo `NEXT_PUBLIC_`.
- **Honestidade**: nada de dados ou agentes simulados sem rótulo explícito; módulos futuros dizem que não existem.
- Antes de enviar: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db` e, se mexer na interface, `pnpm build && pnpm test:e2e`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
