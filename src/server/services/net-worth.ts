import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { monthKey } from "@/domain/dates";
import { computeNetWorth, type NetWorthItem, type NetWorthSummary } from "@/domain/net-worth";
import * as s from "../db/schema";
import { NotFoundError } from "../errors";
import { listAccountsWithBalances } from "./accounts";
import { listCardsOverview } from "./cards";
import type { ServiceContext } from "./context";
import { isoDate, parse } from "./common";
import { cardLabel } from "@/domain/text";

export type AssetRow = typeof s.assets.$inferSelect;
export type DebtRow = typeof s.debts.$inferSelect;

export const ASSET_CATEGORIES = ["investment", "real_estate", "vehicle", "retirement", "receivable", "other"] as const;
export const DEBT_CATEGORIES = ["loan", "financing", "mortgage", "other"] as const;

export interface NetWorthOverview {
  items: NetWorthItem[];
  summary: NetWorthSummary;
  history: Array<{ month: string; assetsCents: number; liabilitiesCents: number; netWorthCents: number }>;
  assets: AssetRow[];
  debts: DebtRow[];
}

/**
 * Patrimônio consolidado. Saldos de contas e faturas são "confirmados" (vêm dos lançamentos);
 * bens e dívidas informados pelo usuário mantêm a procedência declarada. Nenhuma cotação é inventada.
 */
export async function getNetWorth(ctx: ServiceContext, opts: { saveSnapshot?: boolean } = {}): Promise<NetWorthOverview> {
  const [accounts, cards, assets, debts] = await Promise.all([
    listAccountsWithBalances(ctx),
    listCardsOverview(ctx),
    ctx.db
      .select()
      .from(s.assets)
      .where(and(eq(s.assets.userId, ctx.userId), isNull(s.assets.archivedAt)))
      .orderBy(desc(s.assets.valueCents)),
    ctx.db
      .select()
      .from(s.debts)
      .where(and(eq(s.debts.userId, ctx.userId), isNull(s.debts.archivedAt)))
      .orderBy(desc(s.debts.outstandingCents)),
  ]);
  const items: NetWorthItem[] = [];
  for (const a of accounts) {
    const isInvestment = a.type === "investment" || a.purpose === "investment";
    if (a.balanceCents >= 0) {
      items.push({
        id: `account:${a.id}`,
        name: a.name,
        side: "asset",
        category: isInvestment ? "investment" : "cash",
        valueCents: a.balanceCents,
        provenance: "confirmed",
        liquid: !isInvestment,
      });
    } else {
      items.push({ id: `account:${a.id}`, name: `${a.name} (saldo negativo)`, side: "liability", category: "other", valueCents: -a.balanceCents, provenance: "confirmed" });
    }
  }
  for (const c of cards) {
    if (c.limit.committedCents > 0) {
      items.push({ id: `card:${c.id}`, name: cardLabel(c.name), side: "liability", category: "credit_card", valueCents: c.limit.committedCents, provenance: "confirmed" });
    }
  }
  for (const a of assets) {
    items.push({ id: `asset:${a.id}`, name: a.name, side: "asset", category: a.category as NetWorthItem["category"], valueCents: a.valueCents, provenance: a.provenance as NetWorthItem["provenance"], liquid: a.liquid });
  }
  for (const d of debts) {
    items.push({ id: `debt:${d.id}`, name: d.name, side: "liability", category: d.category as NetWorthItem["category"], valueCents: d.outstandingCents, provenance: d.provenance as NetWorthItem["provenance"] });
  }
  const summary = computeNetWorth(items);
  if (opts.saveSnapshot !== false && items.length > 0) {
    const month = monthKey(ctx.today);
    const breakdown = Object.fromEntries(summary.byCategory.map((c) => [`${c.side}:${c.category}`, c.valueCents]));
    await ctx.db
      .insert(s.netWorthSnapshots)
      .values({ userId: ctx.userId, month, assetsCents: summary.assetsCents, liabilitiesCents: summary.liabilitiesCents, netWorthCents: summary.netWorthCents, breakdown })
      .onConflictDoUpdate({
        target: [s.netWorthSnapshots.userId, s.netWorthSnapshots.month],
        set: { assetsCents: summary.assetsCents, liabilitiesCents: summary.liabilitiesCents, netWorthCents: summary.netWorthCents, breakdown },
      });
  }
  const history = await ctx.db
    .select({ month: s.netWorthSnapshots.month, assetsCents: s.netWorthSnapshots.assetsCents, liabilitiesCents: s.netWorthSnapshots.liabilitiesCents, netWorthCents: s.netWorthSnapshots.netWorthCents })
    .from(s.netWorthSnapshots)
    .where(eq(s.netWorthSnapshots.userId, ctx.userId))
    .orderBy(asc(s.netWorthSnapshots.month));
  return { items, summary, history, assets, debts };
}

const assetSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  category: z.enum(ASSET_CATEGORIES),
  valueCents: z.number().int().min(0).max(100_000_000_000_00),
  provenance: z.enum(["confirmed", "informed", "estimated"]).default("informed"),
  valuedAt: isoDate,
  liquid: z.boolean().default(false),
  notes: z.string().trim().max(500).nullish(),
});

export async function upsertAsset(ctx: ServiceContext, input: z.input<typeof assetSchema>, id?: string): Promise<AssetRow> {
  const data = parse(assetSchema, input);
  return ctx.db.transaction(async (tx) => {
    let row: AssetRow | undefined;
    if (id) {
      [row] = await tx
        .update(s.assets)
        .set(data)
        .where(and(eq(s.assets.id, id), eq(s.assets.userId, ctx.userId)))
        .returning();
      if (!row) throw new NotFoundError("Bem não encontrado");
    } else {
      [row] = await tx
        .insert(s.assets)
        .values({ ...data, userId: ctx.userId })
        .returning();
    }
    await tx.insert(s.assetValuations).values({ assetId: row!.id, userId: ctx.userId, valueCents: data.valueCents, provenance: data.provenance, valuedAt: data.valuedAt });
    return row!;
  });
}

export async function archiveAsset(ctx: ServiceContext, id: string): Promise<void> {
  const r = await ctx.db
    .update(s.assets)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.assets.id, id), eq(s.assets.userId, ctx.userId)))
    .returning({ id: s.assets.id });
  if (r.length === 0) throw new NotFoundError("Bem não encontrado");
}

const debtSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  category: z.enum(DEBT_CATEGORIES),
  outstandingCents: z.number().int().min(0).max(100_000_000_000_00),
  monthlyPaymentCents: z.number().int().min(0).nullish(),
  interestRateMonthlyBps: z.coerce.number().int().min(0).max(5000).nullish(),
  remainingInstallments: z.coerce.number().int().min(0).max(600).nullish(),
  provenance: z.enum(["confirmed", "informed", "estimated"]).default("informed"),
  valuedAt: isoDate,
  notes: z.string().trim().max(500).nullish(),
});

export async function upsertDebt(ctx: ServiceContext, input: z.input<typeof debtSchema>, id?: string): Promise<DebtRow> {
  const data = parse(debtSchema, input);
  if (id) {
    const [row] = await ctx.db
      .update(s.debts)
      .set(data)
      .where(and(eq(s.debts.id, id), eq(s.debts.userId, ctx.userId)))
      .returning();
    if (!row) throw new NotFoundError("Dívida não encontrada");
    return row;
  }
  const [row] = await ctx.db
    .insert(s.debts)
    .values({ ...data, userId: ctx.userId })
    .returning();
  return row!;
}

export async function archiveDebt(ctx: ServiceContext, id: string): Promise<void> {
  const r = await ctx.db
    .update(s.debts)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.debts.id, id), eq(s.debts.userId, ctx.userId)))
    .returning({ id: s.debts.id });
  if (r.length === 0) throw new NotFoundError("Dívida não encontrada");
}

export async function assetValuationHistory(ctx: ServiceContext, assetId: string) {
  return ctx.db
    .select()
    .from(s.assetValuations)
    .where(and(eq(s.assetValuations.assetId, assetId), eq(s.assetValuations.userId, ctx.userId)))
    .orderBy(asc(s.assetValuations.valuedAt));
}

