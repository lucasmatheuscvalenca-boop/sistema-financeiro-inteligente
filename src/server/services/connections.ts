import { and, desc, eq, inArray } from "drizzle-orm";
import { invoiceForPurchase } from "@/domain/credit-card";
import { addDays } from "@/domain/dates";
import { dedupeRows, normalizeDescription, type ExistingTx } from "@/domain/import/dedupe";
import { accountBalances } from "@/domain/ledger";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { ProviderError } from "../integrations/provider";
import { getProvider } from "../integrations/registry";
import { audit } from "../security/audit";
import { decrypt, encrypt, sha256 } from "../security/crypto";
import { cycleOf, ensureInvoice } from "./cards";
import type { ServiceContext } from "./context";
import { loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";

export type ConnectionRow = typeof s.bankConnections.$inferSelect;

export async function listConnections(ctx: ServiceContext) {
  const connections = await ctx.db.select().from(s.bankConnections).where(eq(s.bankConnections.userId, ctx.userId)).orderBy(desc(s.bankConnections.createdAt));
  if (connections.length === 0) return [];
  const ids = connections.map((c) => c.id);
  const [consents, runs] = await Promise.all([
    ctx.db.select().from(s.bankConsents).where(inArray(s.bankConsents.connectionId, ids)),
    ctx.db.select().from(s.bankSyncRuns).where(inArray(s.bankSyncRuns.connectionId, ids)).orderBy(desc(s.bankSyncRuns.startedAt)),
  ]);
  return connections.map(({ externalRefEncrypted, ...c }) => {
    void externalRefEncrypted;
    const lastSync = c.lastSyncAt?.getTime() ?? 0;
    return {
      ...c,
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
  const provider = getProvider(providerId);
  if (!provider) throw new NotFoundError("Fornecedor desconhecido");
  if (!provider.isConfigured()) throw new ValidationError("Este fornecedor ainda não está configurado. Veja a documentação de integração.");
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
  const provider = getProvider(conn.provider);
  if (!provider) throw new NotFoundError("Fornecedor desconhecido");
  const [consent] = await ctx.db.select().from(s.bankConsents).where(eq(s.bankConsents.connectionId, conn.id)).limit(1);
  if (consent?.expiresAt && consent.expiresAt.getTime() < Date.now()) {
    await ctx.db.update(s.bankConnections).set({ status: "expired", lastError: "Consentimento expirado" }).where(eq(s.bankConnections.id, conn.id));
    return { ok: false, imported: 0, duplicates: 0, matched: 0, error: "O consentimento expirou. Renove a autorização para continuar sincronizando." };
  }
  const ref = decrypt(conn.externalRefEncrypted!);
  const source = provider.isDemo ? "demo" : "connector";
  const [run] = await ctx.db.insert(s.bankSyncRuns).values({ connectionId: conn.id, userId: ctx.userId }).returning({ id: s.bankSyncRuns.id });
  await ctx.db.update(s.bankConnections).set({ status: "syncing" }).where(eq(s.bankConnections.id, conn.id));
  let imported = 0;
  let duplicates = 0;
  let matched = 0;
  try {
    const remoteAccounts = await provider.fetchAccounts(ref);
    const since = conn.lastSyncAt ? addDays(conn.lastSyncAt.toISOString().slice(0, 10), -7) : addDays(ctx.today, -90);
    for (const ra of remoteAccounts) {
      const remoteTxs = await provider.fetchTransactions(ref, ra.externalId, since);
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
        const existing = (await loadTransactions(ctx, { from: addDays(since, -5) }))
          .filter((t) => t.cardId === card!.id)
          .map<ExistingTx>((t) => ({ id: t.id, date: t.date, amountCents: t.kind === "expense" ? -t.amountCents : t.amountCents, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint }));
        const decisions = dedupeRows(
          remoteTxs.map((t, i) => ({ date: t.date, description: t.description, amountCents: t.amountCents, externalId: t.externalId, rawIndex: i })),
          existing,
        );
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
          if (d.row.amountCents > 0 && /pagamento|pgto|payment/i.test(d.row.description)) continue;
          const invoiceId = await ensureInvoice(ctx.db, ctx.userId, card!.id, invoiceForPurchase(d.row.date, cycleOf(card!)));
          const r = await ctx.db
            .insert(s.transactions)
            .values({
              userId: ctx.userId,
              kind: d.row.amountCents < 0 ? "expense" : "refund",
              status: d.row.date <= ctx.today ? "realized" : "scheduled",
              amountCents: Math.abs(d.row.amountCents),
              date: d.row.date,
              description: d.row.description.slice(0, 140),
              cardId: card!.id,
              invoiceId,
              source,
              externalId: d.row.externalId,
              fingerprint: sha256(`${card!.id}|${d.row.date}|${d.row.amountCents}|${normalizeDescription(d.row.description)}`),
              bankConnectionId: conn.id,
            })
            .onConflictDoNothing()
            .returning({ id: s.transactions.id });
          if (r.length) imported++;
          else duplicates++;
        }
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
      const existing = (await loadTransactions(ctx, { from: addDays(since, -5) }))
        .filter((t) => t.accountId === account!.id || t.toAccountId === account!.id)
        .map<ExistingTx>((t) => {
          const out = t.kind === "expense" || t.kind === "card_payment" || (t.kind === "transfer" && t.accountId === account!.id);
          return { id: t.id, date: t.date, amountCents: out ? -t.amountCents : t.amountCents, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint };
        });
      const decisions = dedupeRows(
        remoteTxs.map((t, i) => ({ date: t.date, description: t.description, amountCents: t.amountCents, externalId: t.externalId, rawIndex: i })),
        existing,
      );
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
        const r = await ctx.db
          .insert(s.transactions)
          .values({
            userId: ctx.userId,
            kind: d.row.amountCents < 0 ? "expense" : "income",
            status: d.row.date <= ctx.today ? "realized" : "scheduled",
            amountCents: Math.abs(d.row.amountCents),
            date: d.row.date,
            description: d.row.description.slice(0, 140),
            accountId: account!.id,
            source,
            externalId: d.row.externalId,
            fingerprint: sha256(`${account!.id}|${d.row.date}|${d.row.amountCents}|${normalizeDescription(d.row.description)}`),
            bankConnectionId: conn.id,
          })
          .onConflictDoNothing()
          .returning({ id: s.transactions.id });
        if (r.length) imported++;
        else duplicates++;
      }
      // Alinha o saldo calculado ao saldo informado pelo fornecedor (sem lançamentos fictícios).
      const all = (await loadTransactions(ctx)).map(toLedgerTx);
      const computed = accountBalances([toLedgerAccount(account!)], all, { asOf: ctx.today }).get(account!.id) ?? 0;
      if (computed !== ra.balanceCents) {
        await ctx.db
          .update(s.accounts)
          .set({ initialBalanceCents: account!.initialBalanceCents + (ra.balanceCents - computed) })
          .where(eq(s.accounts.id, account!.id));
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
export async function revokeConnection(ctx: ServiceContext, connectionId: string): Promise<void> {
  const conn = await getConnection(ctx, connectionId);
  const provider = getProvider(conn.provider);
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
