import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { invoiceForPurchase, type InvoiceRef } from "@/domain/credit-card";
import { addDays, diffDays, type ISODate } from "@/domain/dates";
import { guessCard, looksLikeTransfer } from "@/domain/import/card-payment";
import { isCardPayment, isOwnTransfer, matchOccurrences, type OccurrenceCandidate, type PendingOccurrence } from "@/domain/import/classify";
import { dedupeRows, fingerprintKey, normalizeDescription, type ExistingTx } from "@/domain/import/dedupe";
import type { ImportedRow } from "@/domain/import/types";
import { accountBalances } from "@/domain/ledger";
import * as s from "../db/schema";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { ProviderError, type ProviderAccount } from "../integrations/provider";
import { resolveProvider } from "../integrations/registry";
import { audit } from "../security/audit";
import { decrypt, encrypt, sha256 } from "../security/crypto";
import { closedInvoiceTotals, cycleOf, ensureInvoice, invoicePaidBy, type CardRow } from "./cards";
import { makeCategorizer } from "./categorize";
import type { ServiceContext } from "./context";
import { loadTransactionsFresh, signedAmountFor, toLedgerAccount, toLedgerTx, type AccountRow, type TxRow } from "./ledger";
import { makeContext } from "./context";
import { pendingOccurrences } from "./recurrences";
import { essentialFromCategory } from "./transactions";
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
  // O identificador da conexão vem do navegador: só vale o que a janela do Open Finance criou para
  // esta pessoa (o token do widget leva o id dela, e o fornecedor grava esse dono na conexão).
  // Item sem dono registrado (criado direto no Meu Pluggy) só vale com as chaves da própria pessoa:
  // aí a Pluggy só devolve itens da aplicação dela.
  const personalKeys =
    conn.ownerRef === null &&
    (await ctx.db.select({ id: s.providerCredentials.userId }).from(s.providerCredentials).where(and(eq(s.providerCredentials.userId, ctx.userId), eq(s.providerCredentials.provider, provider.id))).limit(1)).length > 0;
  if (conn.ownerRef !== undefined && conn.ownerRef !== ctx.userId && !personalKeys) {
    await audit(ctx.db, { userId: ctx.userId, action: "connection.refused", entityType: "bank_connection", metadata: { provider: provider.id, reason: "owner_mismatch" } });
    throw new ValidationError("Esta conexão não foi criada por você na janela do Open Finance. Toque em Conectar meus bancos e conclua por lá.");
  }
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
  /** De quando são os dados que o fornecedor tem do banco, quando ele informa. */
  bankUpdatedAt?: Date | null;
}

export async function syncConnection(ctx: ServiceContext, connectionId: string, opts: { refresh?: boolean } = {}): Promise<SyncResult> {
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
  const counts = { imported: 0, duplicates: 0, matched: 0 };
  let bankUpdatedAt: Date | null = conn.bankUpdatedAt ?? null;
  try {
    if (provider.refresh) {
      // Pede dados novos ao fornecedor (quando a pessoa toca em Atualizar agora) e anota de quando são.
      try {
        bankUpdatedAt = (await provider.refresh(ref, { request: !!opts.refresh })).bankUpdatedAt ?? bankUpdatedAt;
      } catch (e) {
        if (e instanceof ProviderError && e.kind === "consent_expired") throw e;
      }
    }
    const remoteAccounts = await provider.fetchAccounts(ref);
    // O Open Finance entrega lançamentos com alguns dias de atraso: a janela volta 30 dias (a
    // deduplicação cuida das repetições). Na primeira vez, seis meses de histórico.
    const since = conn.lastSyncAt ? addDays(conn.lastSyncAt.toISOString().slice(0, 10), -30) : addDays(ctx.today, -180);
    // 1º passo: garante contas e cartões da conexão, para que pagamentos de fatura e
    // transferências entre essas contas sejam reconhecidos já na primeira sincronização.
    const local = await ensureLocalTargets(ctx, conn, remoteAccounts, { source, since });
    const job = await startSyncJob(ctx, conn, local, { source, since });

    const failures: string[] = [];
    const synced: Array<{ account: AccountRow; balanceCents: number }> = [];
    // Cartões primeiro: o pagamento da fatura, visto na conta, é reconhecido pelo valor da fatura.
    const ordered = [...remoteAccounts].sort((a, b) => Number(b.type === "credit_card") - Number(a.type === "credit_card"));
    for (const ra of ordered) {
      let remoteTxs: Awaited<ReturnType<typeof provider.fetchTransactions>>;
      try {
        remoteTxs = await provider.fetchTransactions(ref, ra.externalId, since);
      } catch (e) {
        // Uma conta com problema não impede as outras de entrar; o erro é mostrado ao final.
        failures.push(`${ra.name}: ${e instanceof ProviderError ? e.message : "falha inesperada"}`);
        continue;
      }
      const target = local.get(ra.externalId)!;
      const rows = remoteTxs.map((t, i) => ({ date: t.date, description: t.description, amountCents: t.amountCents, externalId: t.externalId, rawIndex: i }));
      const bankCategory = new Map(remoteTxs.map((t) => [t.externalId, t.category ?? null]));
      const result = await job.apply(target, rows, (row) => bankCategory.get(row.externalId ?? "") ?? null);
      counts.imported += result.imported;
      counts.duplicates += result.duplicates;
      counts.matched += result.matched;
      if (target.kind === "account") synced.push({ account: target.account, balanceCents: ra.balanceCents });
    }
    // Alinha o saldo calculado ao saldo informado pelo fornecedor (sem lançamentos fictícios), depois
    // de todas as gravações: uma transferência vinda de outra conta também muda o saldo calculado.
    await alignBalances(ctx, synced);
    if (failures.length) throw new ProviderError(failures.join(" · "), "unavailable");
    await ctx.db.update(s.bankConnections).set({ status: "active", lastSyncAt: new Date(), bankUpdatedAt, lastError: null }).where(eq(s.bankConnections.id, conn.id));
    await ctx.db.update(s.bankSyncRuns).set({ status: "success", imported: counts.imported, duplicates: counts.duplicates, finishedAt: new Date() }).where(eq(s.bankSyncRuns.id, run!.id));
    return { ok: true, ...counts, bankUpdatedAt };
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : "Falha inesperada na sincronização";
    const status = e instanceof ProviderError && e.kind === "consent_expired" ? "expired" : "error";
    await ctx.db.update(s.bankConnections).set({ status, bankUpdatedAt, lastError: message }).where(eq(s.bankConnections.id, conn.id));
    await ctx.db.update(s.bankSyncRuns).set({ status: "error", error: message, imported: counts.imported, duplicates: counts.duplicates, finishedAt: new Date() }).where(eq(s.bankSyncRuns.id, run!.id));
    if (!(e instanceof ProviderError)) console.error("[sync] erro inesperado", { connectionId: conn.id, error: e instanceof Error ? e.message : "desconhecido" });
    return { ok: false, ...counts, error: message, bankUpdatedAt };
  }
}

type LocalTarget = { kind: "card"; card: CardRow } | { kind: "account"; account: AccountRow };

/** Contas e cartões desta conexão, criando de uma vez os que o fornecedor trouxe e ainda não existem. */
async function ensureLocalTargets(ctx: ServiceContext, conn: ConnectionRow, remoteAccounts: ProviderAccount[], opts: { source: string; since: ISODate }): Promise<Map<string, LocalTarget>> {
  const [cards, accounts] = await Promise.all([
    ctx.db
      .select()
      .from(s.creditCards)
      .where(and(eq(s.creditCards.userId, ctx.userId), eq(s.creditCards.bankConnectionId, conn.id))),
    ctx.db
      .select()
      .from(s.accounts)
      .where(and(eq(s.accounts.userId, ctx.userId), eq(s.accounts.bankConnectionId, conn.id))),
  ]);
  const newCards = remoteAccounts.filter((ra) => ra.type === "credit_card" && !cards.some((c) => c.externalId === ra.externalId));
  if (newCards.length) {
    cards.push(
      ...(await ctx.db
        .insert(s.creditCards)
        .values(
          newCards.map((ra) => ({
            userId: ctx.userId,
            name: ra.name,
            limitCents: ra.creditLimitCents ?? 0,
            closingDay: ra.closingDay ?? 25,
            dueDay: ra.dueDay ?? 5,
            source: opts.source,
            bankConnectionId: conn.id,
            externalId: ra.externalId,
          })),
        )
        .returning()),
    );
  }
  const newAccounts = remoteAccounts.filter((ra) => ra.type !== "credit_card" && !accounts.some((a) => a.externalId === ra.externalId));
  if (newAccounts.length) {
    accounts.push(
      ...(await ctx.db
        .insert(s.accounts)
        .values(
          newAccounts.map((ra) => ({
            userId: ctx.userId,
            name: ra.name,
            type: ra.type === "savings" ? "savings" : ra.type === "investment" ? "investment" : "checking",
            purpose: ra.type === "savings" ? "reserve" : ra.type === "investment" ? "investment" : "spending",
            institution: conn.institutionName,
            initialBalanceCents: 0,
            initialBalanceDate: opts.since,
            source: opts.source,
            bankConnectionId: conn.id,
            externalId: ra.externalId,
          })),
        )
        .returning()),
    );
  }
  const local = new Map<string, LocalTarget>();
  for (const ra of remoteAccounts) {
    if (ra.type === "credit_card") {
      const card = cards.find((c) => c.externalId === ra.externalId);
      if (card) local.set(ra.externalId, { kind: "card", card });
    } else {
      const account = accounts.find((a) => a.externalId === ra.externalId);
      if (account) local.set(ra.externalId, { kind: "account", account });
    }
  }
  return local;
}

/**
 * Estado de uma sincronização: os lançamentos da pessoa no período são carregados uma vez e
 * atualizados a cada gravação (deduplicação, outra ponta das transferências e baixa das
 * recorrências trabalham sobre essa lista), e as faturas já resolvidas ficam guardadas.
 */
async function startSyncJob(ctx: ServiceContext, conn: ConnectionRow, local: Map<string, LocalTarget>, opts: { source: string; since: ISODate }) {
  const { source, since } = opts;
  const [categorizer, userCards, userAccounts, pool, pending] = await Promise.all([
    makeCategorizer(ctx.db, ctx.userId),
    ctx.db
      .select()
      .from(s.creditCards)
      .where(and(eq(s.creditCards.userId, ctx.userId), isNull(s.creditCards.archivedAt))),
    ctx.db.select({ id: s.accounts.id }).from(s.accounts).where(eq(s.accounts.userId, ctx.userId)),
    loadTransactionsFresh(ctx, { from: addDays(since, -5) }),
    pendingOccurrences(ctx, addDays(since, -7), addDays(ctx.today, 7)),
  ]);
  // Cartões desta conexão primeiro: o pagamento da fatura costuma ser do mesmo banco.
  const payableCards = [...userCards.filter((c) => c.bankConnectionId === conn.id), ...userCards.filter((c) => c.bankConnectionId !== conn.id)];
  const ownAccounts = new Set(userAccounts.map((a) => a.id));
  const connAccounts = [...local.values()].flatMap((x) => (x.kind === "account" ? [x.account] : []));
  let occurrences: PendingOccurrence[] = pending.map((o) => ({
    recurrenceId: o.recurrence.id,
    date: o.date,
    amountCents: o.amountCents,
    kind: o.recurrence.kind as "income" | "expense" | "transfer",
    accountId: o.recurrence.accountId,
    cardId: o.recurrence.cardId,
    description: o.recurrence.description,
    certainty: o.certainty,
  }));
  const invoiceIds = new Map<string, string>();
  const invoiceFor = async (card: CardRow, invoice: InvoiceRef) => {
    const key = `${card.id}|${invoice.closingDate}`;
    let id = invoiceIds.get(key);
    if (!id) {
      id = await ensureInvoice(ctx.db, ctx.userId, card.id, invoice);
      invoiceIds.set(key, id);
    }
    return id;
  };
  const cardTotals = new Map<ISODate, Map<string, number>>();
  const totalsOn = async (date: ISODate) => {
    let totals = cardTotals.get(date);
    if (!totals) {
      totals = await closedInvoiceTotals(ctx.db, ctx.userId, payableCards, date);
      cardTotals.set(date, totals);
    }
    return totals;
  };
  const byId = new Map(pool.map((t) => [t.id, t]));
  const update = async (t: TxRow, changes: Partial<typeof s.transactions.$inferInsert>, history?: Record<string, { from: unknown; to: unknown }>) => {
    const [row] = await ctx.db
      .update(s.transactions)
      .set(changes)
      .where(and(eq(s.transactions.id, t.id), eq(s.transactions.userId, ctx.userId)))
      .returning();
    if (row) Object.assign(t, row);
    if (history) await ctx.db.insert(s.transactionHistory).values({ transactionId: t.id, userId: ctx.userId, action: "update", actorUserId: ctx.userId, changes: history });
  };

  /**
   * Outra ponta de uma transferência entre contas da pessoa, possivelmente de outro banco: mesmo
   * valor, sentido oposto, até 2 dias de diferença. Vale uma transferência já registrada que ainda
   * não tem a linha desta conta, ou uma receita/despesa que veio do banco em outra conta.
   */
  const counterpartOf = (accountId: string, row: ImportedRow): TxRow | null => {
    const out = row.amountCents < 0;
    const amount = Math.abs(row.amountCents);
    let best: { t: TxRow; days: number } | null = null;
    for (const t of pool) {
      if (t.cardId || t.amountCents !== amount) continue;
      const days = Math.abs(diffDays(t.date, row.date));
      if (days > 2) continue;
      const open =
        t.kind === "transfer"
          ? out
            ? t.accountId === accountId && !t.externalId
            : t.toAccountId === accountId && !t.fingerprint
          : t.kind === (out ? "income" : "expense") &&
            !!t.accountId &&
            t.accountId !== accountId &&
            ownAccounts.has(t.accountId) &&
            t.source === source &&
            !t.recurrenceId &&
            // A transferência guarda o identificador do lado que sai e a impressão do lado que entra.
            (out ? !!t.fingerprint : !!t.externalId) &&
            (looksLikeTransfer(t.description) || looksLikeTransfer(row.description) || isOwnTransfer(t.description) || isOwnTransfer(row.description));
      if (open && (!best || days < best.days)) best = { t, days };
    }
    return best?.t ?? null;
  };

  /** Junta esta linha à outra ponta: a receita/despesa da outra conta vira uma transferência só. */
  const joinTransfer = async (accountId: string, row: ImportedRow, other: TxRow) => {
    const out = row.amountCents < 0;
    const fingerprint = syncFingerprint(accountId, row);
    if (other.kind === "transfer") {
      await update(other, { ...(out ? { externalId: row.externalId } : { fingerprint }), reconciledAt: new Date(), status: "realized" });
      return;
    }
    const changes = {
      kind: "transfer",
      accountId: out ? accountId : other.accountId,
      toAccountId: out ? other.accountId : accountId,
      externalId: out ? (row.externalId ?? null) : other.externalId,
      fingerprint: out ? other.fingerprint : fingerprint,
      categoryId: null,
      categoryAuto: false,
      essential: null,
      incomeType: null,
      expenseNature: null,
      reconciledAt: new Date(),
    };
    const history = {
      kind: { from: other.kind, to: changes.kind },
      accountId: { from: other.accountId, to: changes.accountId },
      toAccountId: { from: other.toAccountId, to: changes.toAccountId },
      categoryId: { from: other.categoryId, to: null },
    };
    await update(other, changes, history);
  };

  return {
    /** Grava as linhas de uma conta ou cartão. */
    async apply(target: LocalTarget, rows: ImportedRow[], bankCategoryOf: (row: ImportedRow) => string | null) {
      const targetId = target.kind === "card" ? target.card.id : target.account.id;
      const ref = target.kind === "card" ? { cardId: targetId } : { accountId: targetId };
      const existing = pool.flatMap<ExistingTx>((t) => {
        const signed = signedAmountFor(t, ref);
        return signed === null ? [] : [{ id: t.id, date: t.date, amountCents: signed, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint, source: t.source }];
      });
      const decisions = dedupeRows(rows, existing, { storedFingerprints: (row) => [syncFingerprint(targetId, row), legacySyncFingerprint(targetId, row)] });
      const counts = { imported: 0, duplicates: 0, matched: 0 };
      const toInsert: Array<typeof s.transactions.$inferInsert> = [];
      const candidates: OccurrenceCandidate[] = [];
      for (const d of decisions) {
        if (d.action === "duplicate") {
          counts.duplicates++;
          continue;
        }
        if (d.action === "match") {
          const t = byId.get(d.existingId)!;
          // Na transferência, o identificador é o da conta que paga; a conta que recebe fica com a impressão.
          const inSide = t.kind === "transfer" && t.toAccountId === targetId;
          await update(t, { ...(inSide ? { fingerprint: syncFingerprint(targetId, d.row) } : { externalId: d.row.externalId }), reconciledAt: new Date(), status: "realized" });
          counts.matched++;
          continue;
        }
        const row = d.row;
        const common = {
          userId: ctx.userId,
          status: row.date <= ctx.today ? "realized" : "scheduled",
          amountCents: Math.abs(row.amountCents),
          date: row.date,
          description: row.description.slice(0, 140),
          source,
          externalId: row.externalId,
          fingerprint: syncFingerprint(targetId, row),
          bankConnectionId: conn.id,
        };
        if (target.kind === "card") {
          // Pagamento recebido pela fatura: entra pelo lado da conta que pagou.
          if (row.amountCents > 0 && isCardPayment(row.description)) continue;
          const kind = row.amountCents < 0 ? "expense" : "refund";
          const categoryId = categorizer.suggest(row.description, "expense", bankCategoryOf(row));
          const invoiceId = await invoiceFor(target.card, invoiceForPurchase(row.date, cycleOf(target.card)));
          if (kind === "expense") candidates.push({ index: toInsert.length, date: row.date, amountCents: row.amountCents, kind, description: row.description, accountId: null, cardId: targetId });
          toInsert.push({ ...common, kind, categoryId, categoryAuto: true, essential: essentialFromCategory(kind, categorizer.category(categoryId)), cardId: targetId, invoiceId });
          continue;
        }
        const out = row.amountCents < 0;
        if (out && isCardPayment(row.description) && payableCards.length) {
          // Pagamento de fatura não é despesa: as compras já contaram no cartão. O cartão é o citado
          // na descrição ou o que tem a fatura fechada no valor pago.
          const totals = await totalsOn(row.date);
          const paidId = guessCard(
            row.description,
            row.amountCents,
            payableCards.map((c) => ({ id: c.id, name: c.name, closedInvoiceCents: totals.get(c.id) ?? null })),
          );
          const paidCard = payableCards.find((c) => c.id === paidId) ?? payableCards[0]!;
          toInsert.push({ ...common, kind: "card_payment", accountId: targetId, cardId: paidCard.id, invoiceId: await invoiceFor(paidCard, invoicePaidBy(row.date, paidCard)) });
          continue;
        }
        const other = counterpartOf(targetId, row);
        if (other) {
          await joinTransfer(targetId, row, other);
          counts.matched++;
          continue;
        }
        const sibling = isOwnTransfer(row.description) ? connAccounts.find((a) => a.id !== targetId) : undefined;
        if (sibling) {
          // Aplicação, resgate ou transferência entre contas da mesma conexão. A linha da outra conta,
          // quando chegar, completa esta transferência (identificador de quem paga, impressão de quem recebe).
          toInsert.push({
            ...common,
            kind: "transfer",
            accountId: out ? targetId : sibling.id,
            toAccountId: out ? sibling.id : targetId,
            externalId: out ? row.externalId : null,
            fingerprint: out ? null : common.fingerprint,
          });
          continue;
        }
        const kind = out ? "expense" : "income";
        const categoryId = categorizer.suggest(row.description, kind, bankCategoryOf(row));
        candidates.push({ index: toInsert.length, date: row.date, amountCents: row.amountCents, kind, description: row.description, accountId: targetId, cardId: null });
        toInsert.push({ ...common, kind, accountId: targetId, categoryId, categoryAuto: !!categoryId, essential: essentialFromCategory(kind, categorizer.category(categoryId)) });
      }
      // Recorrências realizadas pelas linhas novas (aluguel, luz, salário): a ocorrência deixa de
      // contar como prevista na projeção, como na importação de extrato.
      if (candidates.length && occurrences.length) {
        const hits = matchOccurrences(candidates, occurrences);
        for (const [index, occ] of hits) Object.assign(toInsert[index]!, { recurrenceId: occ.recurrenceId, occurrenceDate: occ.date });
        const done = new Set([...hits.values()].map((o) => `${o.recurrenceId}|${o.date}`));
        occurrences = occurrences.filter((o) => !done.has(`${o.recurrenceId}|${o.date}`));
      }
      if (toInsert.length) {
        const created = await ctx.db.insert(s.transactions).values(toInsert).onConflictDoNothing().returning();
        counts.imported += created.length;
        counts.duplicates += toInsert.length - created.length;
        for (const t of created) {
          pool.push(t);
          byId.set(t.id, t);
        }
      }
      return counts;
    },
  };
}

/** Acerta o saldo inicial das contas sincronizadas para o saldo calculado bater com o do banco. */
async function alignBalances(ctx: ServiceContext, synced: Array<{ account: AccountRow; balanceCents: number }>): Promise<void> {
  if (synced.length === 0) return;
  const ids = synced.map((x) => x.account.id);
  const [fresh, all] = await Promise.all([
    ctx.db
      .select()
      .from(s.accounts)
      .where(and(eq(s.accounts.userId, ctx.userId), inArray(s.accounts.id, ids))),
    loadTransactionsFresh(ctx),
  ]);
  const computed = accountBalances(fresh.map(toLedgerAccount), all.map(toLedgerTx), { asOf: ctx.today });
  for (const { account, balanceCents } of synced) {
    const row = fresh.find((a) => a.id === account.id);
    if (!row) continue;
    const diff = balanceCents - (computed.get(row.id) ?? 0);
    if (diff !== 0) await ctx.db.update(s.accounts).set({ initialBalanceCents: row.initialBalanceCents + diff }).where(eq(s.accounts.id, row.id));
  }
}

/** A pessoa tem algum banco real conectado (ativo ou com erro)? */
export async function hasRealConnections(ctx: ServiceContext): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: s.bankConnections.id })
    .from(s.bankConnections)
    .where(and(eq(s.bankConnections.userId, ctx.userId), eq(s.bankConnections.isDemo, false), inArray(s.bankConnections.status, ["active", "error", "syncing"])))
    .limit(1);
  return !!row;
}

/** Uma sincronização não passa disso; além, a função foi encerrada no meio (tempo esgotado na Vercel). */
const STUCK_SYNC_MS = 10 * 60_000;

/**
 * Conexões presas em "syncing" há mais de 10 minutos viram "error" (com a tentativa registrada
 * como interrompida) e voltam para a fila das rotinas, em vez de ficarem de fora para sempre.
 */
export async function releaseStuckSyncs(db: Database, userId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_SYNC_MS);
  const conds = [eq(s.bankConnections.status, "syncing"), lt(s.bankConnections.updatedAt, cutoff)];
  if (userId) conds.push(eq(s.bankConnections.userId, userId));
  const stuck = await db
    .update(s.bankConnections)
    .set({ status: "error", lastError: "A sincronização anterior não terminou. Tentando de novo." })
    .where(and(...conds))
    .returning({ id: s.bankConnections.id });
  if (stuck.length) {
    await db
      .update(s.bankSyncRuns)
      .set({ status: "error", error: "Interrompida antes de terminar", finishedAt: new Date() })
      .where(and(inArray(s.bankSyncRuns.connectionId, stuck.map((c) => c.id)), eq(s.bankSyncRuns.status, "running")));
  }
  return stuck.length;
}

/**
 * Ao abrir o app: sincroniza as conexões reais da pessoa que estão sem atualizar há mais de
 * `staleHours` (e sem tentativa nos últimos 30 minutos), para o Meu Banqueiro nunca ficar atrás do
 * fornecedor até a rotina diária. Silencioso: erros ficam registrados na conexão.
 */
export async function syncStaleConnections(ctx: ServiceContext, staleHours = 6): Promise<{ synced: number; imported: number }> {
  await releaseStuckSyncs(ctx.db, ctx.userId);
  const rows = await ctx.db
    .select({ id: s.bankConnections.id, lastSyncAt: s.bankConnections.lastSyncAt })
    .from(s.bankConnections)
    .where(and(eq(s.bankConnections.userId, ctx.userId), eq(s.bankConnections.isDemo, false), inArray(s.bankConnections.status, ["active", "error"])));
  const now = Date.now();
  let synced = 0;
  let imported = 0;
  for (const r of rows) {
    if (r.lastSyncAt && now - r.lastSyncAt.getTime() < staleHours * 3_600_000) continue;
    const [last] = await ctx.db.select({ at: s.bankSyncRuns.startedAt }).from(s.bankSyncRuns).where(eq(s.bankSyncRuns.connectionId, r.id)).orderBy(desc(s.bankSyncRuns.startedAt)).limit(1);
    if (last && now - last.at.getTime() < 30 * 60_000) continue;
    try {
      const result = await syncConnection(ctx, r.id, { refresh: true });
      synced++;
      imported += result.imported;
    } catch {
      // Conexão revogada ou inválida: fica para a tela de conexões.
    }
  }
  return { synced, imported };
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
export interface SyncAllResult {
  connections: number;
  ok: number;
  failed: number;
  imported: number;
  /** Conexões que terminaram com erro: banco e motivo (sem valores), para o aviso ao dono do app. */
  failures: Array<{ connectionId: string; institution: string; error: string }>;
}

export async function syncAllConnections(db: Database): Promise<SyncAllResult> {
  await releaseStuckSyncs(db);
  const rows = await db
    .select({ id: s.bankConnections.id, userId: s.bankConnections.userId, institution: s.bankConnections.institutionName, timezone: s.userPreferences.timezone })
    .from(s.bankConnections)
    .leftJoin(s.userPreferences, eq(s.userPreferences.userId, s.bankConnections.userId))
    .where(and(eq(s.bankConnections.isDemo, false), inArray(s.bankConnections.status, ["active", "error"])));
  let ok = 0;
  let imported = 0;
  const failures: SyncAllResult["failures"] = [];
  for (const r of rows) {
    try {
      const result = await syncConnection(makeContext(db, r.userId, r.timezone ?? "America/Sao_Paulo"), r.id);
      if (result.ok) {
        ok++;
        imported += result.imported;
      } else failures.push({ connectionId: r.id, institution: r.institution, error: result.error ?? "Falha na sincronização" });
    } catch (e) {
      failures.push({ connectionId: r.id, institution: r.institution, error: e instanceof AppError || e instanceof ProviderError ? e.message : "Falha inesperada" });
    }
  }
  return { connections: rows.length, ok, failed: failures.length, imported, failures };
}
