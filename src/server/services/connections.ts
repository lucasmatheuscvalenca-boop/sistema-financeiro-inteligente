import { and, desc, eq, inArray } from "drizzle-orm";
import { invoiceForPurchase, shiftInvoice } from "@/domain/credit-card";
import { addDays } from "@/domain/dates";
import { isCardPayment, isOwnTransfer } from "@/domain/import/classify";
import { dedupeRows, fingerprintKey, normalizeDescription, type ExistingTx } from "@/domain/import/dedupe";
import type { ImportedRow } from "@/domain/import/types";
import { accountBalances } from "@/domain/ledger";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { ProviderError } from "../integrations/provider";
import { resolveProvider } from "../integrations/registry";
import { audit } from "../security/audit";
import { decrypt, encrypt, sha256 } from "../security/crypto";
import { cycleOf, ensureInvoice } from "./cards";
import { makeCategorizer } from "./categorize";
import type { ServiceContext } from "./context";
import { loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";
import { makeContext } from "./context";
import type { Database } from "../db/client";

export type ConnectionRow = typeof s.bankConnections.$inferSelect;

function syncFingerprint(targetId: string, row: Pick<ImportedRow, "date" | "amountCents" | "description">): string {
  return sha256(`${targetId}|${fingerprintKey(row)}`);
}

/** Formato antigo, para não reimportar o que já veio antes desta versão. */
function legacySyncFingerprint(targetId: string, row: ImportedRow): string {
  return sha256(`${targetId}|${row.date}|${row.amountCents}|${normalizeDescription(row.description)}`);
}

export async function listConnections(ctx: ServiceContext) {
  const connections = await ctx.db.select().from(s.bankConnections).where(eq(s.bankConnections.userId, ctx.userId)).orderBy(desc(s.bankConnections.createdAt));
  if (connections.length === 0) return [];
  const ids = connections.map((c) => c.id);
  const [consents, runs] = await Promise.all([
    ctx.db.select().from(s.bankConsents).where(inArray(s.bankConsents.connectionId, ids)),
    ctx.db.select().from(s.bankSyncRuns).where(inArray(s.bankSyncRuns.connectionId, ids)).orderBy(desc(s.bankSyncRuns.startedAt)),
  ]);
  return connections.map(({ externalRefEncrypted, ...c }) => {
    const lastSync = c.lastSyncAt?.getTime() ?? 0;
    // Identificador da conexão no fornecedor, usado para renovar a autorização na janela dele.
    let providerItemId: string | null = null;
    if (!c.isDemo && externalRefEncrypted) {
      try {
        providerItemId = decrypt(externalRefEncrypted);
      } catch {
        providerItemId = null;
      }
    }
    return {
      ...c,
      providerItemId,
      stale: c.status !== "revoked" && Date.now() - lastSync > 24 * 3600 * 1000,
      consent: consents.find((x) => x.connectionId === c.id) ?? null,
      runs: runs.filter((r) => r.connectionId === c.id).slice(0, 5),
    };
  });
}

async function getConnection(ctx: ServiceContext, id: string): Promise<ConnectionRow> {
  const [row] = await ctx.db
    .select()
    .from(s.bankConnections)
    .where(and(eq(s.bankConnections.id, id), eq(s.bankConnections.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Conexão não encontrada");
  return row;
}

/**
 * Cria uma conexão após o consentimento explícito do usuário (confirmado na interface).
 * Nunca recebe senha bancária: o fornecedor real autentica no próprio ambiente.
 */
export async function connectProvider(ctx: ServiceContext, providerId: string, params: { itemId?: string; consentAccepted: boolean }) {
  if (!params.consentAccepted) throw new ValidationError("É preciso autorizar o compartilhamento de dados para conectar.");
  const provider = await resolveProvider(ctx.db, ctx.userId, providerId);
  if (!provider) throw new NotFoundError("Fornecedor desconhecido");
  if (!provider.isConfigured()) throw new ValidationError("Este fornecedor ainda não está configurado. Ative o Open Finance com as suas chaves da Pluggy.");
  const conn = await provider.connect({ userId: ctx.userId, itemId: params.itemId });
  const [row] = await ctx.db
    .insert(s.bankConnections)
    .values({
      userId: ctx.userId,
      provider: provider.id,
      institutionName: conn.institutionName,
      externalRefEncrypted: encrypt(conn.externalRef),
      isDemo: provider.isDemo,
      status: "active",
    })
    .returning();
  await ctx.db.insert(s.bankConsents).values({
    userId: ctx.userId,
    connectionId: row!.id,
    scopes: conn.consent.scopes,
    purpose: conn.consent.purpose,
    providerConsentId: conn.consent.providerConsentId,
    expiresAt: conn.consent.expiresAt,
  });
  await audit(ctx.db, { userId: ctx.userId, action: "connection.created", entityType: "bank_connection", entityId: row!.id, metadata: { provider: provider.id } });
  const sync = await syncConnection(ctx, row!.id);
  return { connectionId: row!.id, sync };
}

export interface SyncResult {
  ok: boolean;
  imported: number;
  duplicates: number;
  matched: number;
  error?: string;
}

export async function syncConnection(ctx: ServiceContext, connectionId: string): Promise<SyncResult> {
  const conn = await getConnection(ctx, connectionId);
  if (conn.status === "revoked") throw new ValidationError("Esta conexão foi revogada. Conecte novamente para sincronizar.");
  const provider = await resolveProvider(ctx.db, ctx.userId, conn.provider);
  if (!provider) throw new NotFoundError("Fornecedor desconhecido");
  const [consent] = await ctx.db.select().from(s.bankConsents).where(eq(s.bankConsents.connectionId, conn.id)).limit(1);
  const ref = decrypt(conn.externalRefEncrypted!);
  if (consent?.expiresAt && consent.expiresAt.getTime() < Date.now()) {
    // A pessoa pode ter reautorizado no fornecedor (no Meu Pluggy, reconectando o banco): confere lá antes de desistir.
    try {
      const renewed = await provider.connect({ userId: ctx.userId, itemId: ref });
      if (renewed.consent.expiresAt && renewed.consent.expiresAt.getTime() > Date.now()) {
        await ctx.db.update(s.bankConsents).set({ grantedAt: new Date(), revokedAt: null, expiresAt: renewed.consent.expiresAt }).where(eq(s.bankConsents.id, consent.id));
      } else throw new ProviderError("Consentimento expirado", "consent_expired");
    } catch {
      await ctx.db.update(s.bankConnections).set({ status: "expired", lastError: "Consentimento expirado" }).where(eq(s.bankConnections.id, conn.id));
      return { ok: false, imported: 0, duplicates: 0, matched: 0, error: "A autorização venceu. Reconecte o banco no Meu Pluggy e toque em Atualizar agora." };
    }
  }
  const source = provider.isDemo ? "demo" : "connector";
  const [run] = await ctx.db.insert(s.bankSyncRuns).values({ connectionId: conn.id, userId: ctx.userId }).returning({ id: s.bankSyncRuns.id });
  await ctx.db.update(s.bankConnections).set({ status: "syncing" }).where(eq(s.bankConnections.id, conn.id));
  let imported = 0;
  let duplicates = 0;
  let matched = 0;
  try {
    const remoteAccounts = await provider.fetchAccounts(ref);
    // O Open Finance entrega lançamentos com alguns dias de atraso: a janela volta 30 dias (a
    // deduplicação cuida das repetições). Na primeira vez, seis meses de histórico.
    const since = conn.lastSyncAt ? addDays(conn.lastSyncAt.toISOString().slice(0, 10), -30) : addDays(ctx.today, -180);
    // 1º passo: garante contas e cartões da conexão, para que pagamentos de fatura e
    // transferências entre essas contas sejam reconhecidos já na primeira sincronização.
    const local = new Map<string, { kind: "card"; card: typeof s.creditCards.$inferSelect } | { kind: "account"; account: typeof s.accounts.$inferSelect }>();
    for (const ra of remoteAccounts) {
      if (ra.type === "credit_card") {
        let [card] = await ctx.db
          .select()
          .from(s.creditCards)
          .where(and(eq(s.creditCards.userId, ctx.userId), eq(s.creditCards.bankConnectionId, conn.id), eq(s.creditCards.externalId, ra.externalId)))
          .limit(1);
        if (!card) {
          [card] = await ctx.db
            .insert(s.creditCards)
            .values({
              userId: ctx.userId,
              name: ra.name,
              limitCents: ra.creditLimitCents ?? 0,
              closingDay: ra.closingDay ?? 25,
              dueDay: ra.dueDay ?? 5,
              source,
              bankConnectionId: conn.id,
              externalId: ra.externalId,
            })
            .returning();
        }
        local.set(ra.externalId, { kind: "card", card: card! });
        continue;
      }
      let [account] = await ctx.db
        .select()
        .from(s.accounts)
        .where(and(eq(s.accounts.userId, ctx.userId), eq(s.accounts.bankConnectionId, conn.id), eq(s.accounts.externalId, ra.externalId)))
        .limit(1);
      if (!account) {
        [account] = await ctx.db
          .insert(s.accounts)
          .values({
            userId: ctx.userId,
            name: ra.name,
            type: ra.type === "savings" ? "savings" : ra.type === "investment" ? "investment" : "checking",
            purpose: ra.type === "savings" ? "reserve" : ra.type === "investment" ? "investment" : "spending",
            institution: conn.institutionName,
            initialBalanceCents: 0,
            initialBalanceDate: since,
            source,
            bankConnectionId: conn.id,
            externalId: ra.externalId,
          })
          .returning();
      }
      local.set(ra.externalId, { kind: "account", account: account! });
    }
    const categorizer = await makeCategorizer(ctx.db, ctx.userId);
    const userCards = (await ctx.db.select().from(s.creditCards).where(eq(s.creditCards.userId, ctx.userId))).filter((c) => !c.archivedAt);
    // Cartões desta conexão primeiro: o pagamento da fatura costuma ser do mesmo banco.
    const payableCards = [...userCards.filter((c) => c.bankConnectionId === conn.id), ...userCards.filter((c) => c.bankConnectionId !== conn.id)];

    for (const ra of remoteAccounts) {
      const remoteTxs = await provider.fetchTransactions(ref, ra.externalId, since);
      const target = local.get(ra.externalId)!;
      const rows = remoteTxs.map((t, i) => ({ date: t.date, description: t.description, amountCents: t.amountCents, externalId: t.externalId, rawIndex: i }));
      const bankCategory = new Map(remoteTxs.map((t) => [t.externalId, t.category ?? null]));
      if (target.kind === "card") {
        const card = target.card;
        const existing = (await loadTransactions(ctx, { from: addDays(since, -5) }))
          .filter((t) => t.cardId === card.id)
          .map<ExistingTx>((t) => ({ id: t.id, date: t.date, amountCents: t.kind === "expense" ? -t.amountCents : t.amountCents, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint }));
        const decisions = dedupeRows(rows, existing, { storedFingerprints: (row) => [syncFingerprint(card.id, row), legacySyncFingerprint(card.id, row)] });
        for (const d of decisions) {
          if (d.action === "duplicate") {
            duplicates++;
            continue;
          }
          if (d.action === "match") {
            await ctx.db.update(s.transactions).set({ externalId: d.row.externalId, reconciledAt: new Date(), status: "realized" }).where(and(eq(s.transactions.id, d.existingId), eq(s.transactions.userId, ctx.userId)));
            matched++;
            continue;
          }
          // Pagamento recebido pela fatura: entra pelo lado da conta que pagou.
          if (d.row.amountCents > 0 && isCardPayment(d.row.description)) continue;
          const invoiceId = await ensureInvoice(ctx.db, ctx.userId, card.id, invoiceForPurchase(d.row.date, cycleOf(card)));
          const r = await ctx.db
            .insert(s.transactions)
            .values({
              userId: ctx.userId,
              kind: d.row.amountCents < 0 ? "expense" : "refund",
              categoryId: categorizer.suggest(d.row.description, "expense", bankCategory.get(d.row.externalId ?? "")),
              categoryAuto: true,
              status: d.row.date <= ctx.today ? "realized" : "scheduled",
              amountCents: Math.abs(d.row.amountCents),
              date: d.row.date,
              description: d.row.description.slice(0, 140),
              cardId: card.id,
              invoiceId,
              source,
              externalId: d.row.externalId,
              fingerprint: syncFingerprint(card.id, d.row),
              bankConnectionId: conn.id,
            })
            .onConflictDoNothing()
            .returning({ id: s.transactions.id });
          if (r.length) imported++;
          else duplicates++;
        }
        continue;
      }
      const account = target.account;
      const siblings = [...local.values()].flatMap((x) => (x.kind === "account" && x.account.id !== account.id ? [x.account] : []));
      const existing = (await loadTransactions(ctx, { from: addDays(since, -5) }))
        .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
        .map<ExistingTx>((t) => {
          const out = t.kind === "expense" || t.kind === "card_payment" || (t.kind === "transfer" && t.accountId === account.id);
          return { id: t.id, date: t.date, amountCents: out ? -t.amountCents : t.amountCents, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint };
        });
      const decisions = dedupeRows(rows, existing, { storedFingerprints: (row) => [syncFingerprint(account.id, row), legacySyncFingerprint(account.id, row)] });
      for (const d of decisions) {
        if (d.action === "duplicate") {
          duplicates++;
          continue;
        }
        if (d.action === "match") {
          await ctx.db.update(s.transactions).set({ externalId: d.row.externalId, reconciledAt: new Date(), status: "realized" }).where(and(eq(s.transactions.id, d.existingId), eq(s.transactions.userId, ctx.userId)));
          matched++;
          continue;
        }
        const out = d.row.amountCents < 0;
        const common = {
          userId: ctx.userId,
          status: d.row.date <= ctx.today ? "realized" : "scheduled",
          amountCents: Math.abs(d.row.amountCents),
          date: d.row.date,
          description: d.row.description.slice(0, 140),
          source,
          externalId: d.row.externalId,
          fingerprint: syncFingerprint(account.id, d.row),
          bankConnectionId: conn.id,
        };
        let values: typeof s.transactions.$inferInsert;
        const paidCard = out && isCardPayment(d.row.description) ? payableCards[0] : undefined;
        const sibling = isOwnTransfer(d.row.description) ? siblings[0] : undefined;
        if (paidCard) {
          // Pagamento de fatura não é despesa: as compras já contaram no cartão.
          const invoiceId = await ensureInvoice(ctx.db, ctx.userId, paidCard.id, shiftInvoice(invoiceForPurchase(d.row.date, cycleOf(paidCard)), -1, cycleOf(paidCard)));
          values = { ...common, kind: "card_payment", accountId: account.id, cardId: paidCard.id, invoiceId };
        } else if (sibling) {
          // Aplicação, resgate ou transferência entre contas da mesma conexão.
          values = { ...common, kind: "transfer", accountId: out ? account.id : sibling.id, toAccountId: out ? sibling.id : account.id };
        } else {
          const kind = out ? "expense" : "income";
          const categoryId = categorizer.suggest(d.row.description, kind, bankCategory.get(d.row.externalId ?? ""));
          values = { ...common, kind, accountId: account.id, categoryId, categoryAuto: !!categoryId };
        }
        const r = await ctx.db.insert(s.transactions).values(values).onConflictDoNothing().returning({ id: s.transactions.id });
        if (r.length) imported++;
        else duplicates++;
      }
      // Alinha o saldo calculado ao saldo informado pelo fornecedor (sem lançamentos fictícios).
      const [fresh] = await ctx.db.select().from(s.accounts).where(eq(s.accounts.id, account.id)).limit(1);
      const all = (await loadTransactions(ctx)).map(toLedgerTx);
      const computed = accountBalances([toLedgerAccount(fresh!)], all, { asOf: ctx.today }).get(account.id) ?? 0;
      if (computed !== ra.balanceCents) {
        await ctx.db
          .update(s.accounts)
          .set({ initialBalanceCents: fresh!.initialBalanceCents + (ra.balanceCents - computed) })
          .where(eq(s.accounts.id, account.id));
      }
    }
    await ctx.db.update(s.bankConnections).set({ status: "active", lastSyncAt: new Date(), lastError: null }).where(eq(s.bankConnections.id, conn.id));
    await ctx.db.update(s.bankSyncRuns).set({ status: "success", imported, duplicates, finishedAt: new Date() }).where(eq(s.bankSyncRuns.id, run!.id));
    return { ok: true, imported, duplicates, matched };
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : "Falha inesperada na sincronização";
    const status = e instanceof ProviderError && e.kind === "consent_expired" ? "expired" : "error";
    await ctx.db.update(s.bankConnections).set({ status, lastError: message }).where(eq(s.bankConnections.id, conn.id));
    await ctx.db.update(s.bankSyncRuns).set({ status: "error", error: message, imported, duplicates, finishedAt: new Date() }).where(eq(s.bankSyncRuns.id, run!.id));
    if (!(e instanceof ProviderError)) console.error("[sync] erro inesperado", { connectionId: conn.id, error: e instanceof Error ? e.message : "desconhecido" });
    return { ok: false, imported, duplicates, matched, error: message };
  }
}

/** Revoga o consentimento: a sincronização para imediatamente. Os dados já importados ficam até o usuário apagá-los. */
/** Depois de renovar a autorização no fornecedor, a conexão volta a ficar ativa e sincronizável. */
export async function reactivateConnection(ctx: ServiceContext, connectionId: string): Promise<void> {
  const conn = await getConnection(ctx, connectionId);
  await ctx.db.update(s.bankConnections).set({ status: "active", lastError: null }).where(eq(s.bankConnections.id, conn.id));
  await ctx.db.update(s.bankConsents).set({ grantedAt: new Date(), revokedAt: null }).where(eq(s.bankConsents.connectionId, conn.id));
  await audit(ctx.db, { userId: ctx.userId, action: "connection.reauthorized", entityType: "bank_connection", entityId: conn.id });
}

export async function revokeConnection(ctx: ServiceContext, connectionId: string): Promise<void> {
  const conn = await getConnection(ctx, connectionId);
  const provider = await resolveProvider(ctx.db, ctx.userId, conn.provider);
  if (provider && conn.externalRefEncrypted) {
    try {
      await provider.revoke(decrypt(conn.externalRefEncrypted));
    } catch {
      // Revogação local acontece mesmo se o fornecedor estiver indisponível.
    }
  }
  await ctx.db.update(s.bankConnections).set({ status: "revoked", externalRefEncrypted: null }).where(eq(s.bankConnections.id, conn.id));
  await ctx.db.update(s.bankConsents).set({ revokedAt: new Date() }).where(eq(s.bankConsents.connectionId, conn.id));
  await audit(ctx.db, { userId: ctx.userId, action: "connection.revoked", entityType: "bank_connection", entityId: conn.id });
}

/** Apaga a conexão e os dados importados por ela (contas, cartões e movimentações). */
export async function deleteConnectionData(ctx: ServiceContext, connectionId: string): Promise<void> {
  const conn = await getConnection(ctx, connectionId);
  if (conn.status !== "revoked" && !conn.isDemo) throw new ValidationError("Revogue a conexão antes de apagar os dados importados.");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.transactions).where(and(eq(s.transactions.userId, ctx.userId), eq(s.transactions.bankConnectionId, conn.id)));
    await tx.delete(s.creditCards).where(and(eq(s.creditCards.userId, ctx.userId), eq(s.creditCards.bankConnectionId, conn.id)));
    await tx.delete(s.accounts).where(and(eq(s.accounts.userId, ctx.userId), eq(s.accounts.bankConnectionId, conn.id)));
    await tx.delete(s.bankConnections).where(eq(s.bankConnections.id, conn.id));
  });
  await audit(ctx.db, { userId: ctx.userId, action: "connection.deleted", entityType: "bank_connection", entityId: conn.id });
}

/**
 * Roda a sincronização de todas as conexões reais ativas ou com erro, de todas as pessoas
 * (usada pela rotina diária). Cada conexão falha sozinha, sem derrubar as outras.
 */
export async function syncAllConnections(db: Database): Promise<{ connections: number; ok: number; failed: number; imported: number }> {
  const rows = await db
    .select({ id: s.bankConnections.id, userId: s.bankConnections.userId, timezone: s.userPreferences.timezone })
    .from(s.bankConnections)
    .leftJoin(s.userPreferences, eq(s.userPreferences.userId, s.bankConnections.userId))
    .where(and(eq(s.bankConnections.isDemo, false), inArray(s.bankConnections.status, ["active", "error"])));
  let ok = 0;
  let failed = 0;
  let imported = 0;
  for (const r of rows) {
    try {
      const result = await syncConnection(makeContext(db, r.userId, r.timezone ?? "America/Sao_Paulo"), r.id);
      if (result.ok) {
        ok++;
        imported += result.imported;
      } else failed++;
    } catch {
      failed++;
    }
  }
  return { connections: rows.length, ok, failed, imported };
}
