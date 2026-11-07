import { and, eq, lte } from "drizzle-orm";
import * as s from "../db/schema";
import { prettyMerchant } from "@/domain/categorize";
import { accountBalances } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { listCategories } from "./categories";
import type { ServiceContext } from "./context";
import { loadAccounts, loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";

/**
 * Ajuda para o Imposto de Renda: os números que a declaração pede, tirados do que já está no
 * app. Não calcula imposto nem substitui o programa da Receita; serve para conferir e copiar.
 */

export interface TaxAccountLine {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  /** Saldo em 31/12 do ano anterior e do ano escolhido (null quando a conta ainda não existia). */
  previousCents: Cents | null;
  currentCents: Cents | null;
}

export interface TaxAssetLine {
  id: string;
  name: string;
  category: string;
  previousCents: Cents | null;
  currentCents: Cents | null;
}

export interface TaxIncomeGroup {
  name: string;
  cents: Cents;
  sources: Array<{ name: string; cents: Cents }>;
}

export interface TaxExpenseLine {
  id: string;
  date: string;
  description: string;
  category: string;
  cents: Cents;
}

export interface TaxHelp {
  year: number;
  accounts: TaxAccountLine[];
  assets: TaxAssetLine[];
  debts: Array<{ id: string; name: string; category: string; outstandingCents: Cents; valuedAt: string }>;
  income: { totalCents: Cents; groups: TaxIncomeGroup[] };
  health: { totalCents: Cents; lines: TaxExpenseLine[] };
  education: { totalCents: Cents; lines: TaxExpenseLine[] };
}

export async function getTaxHelp(ctx: ServiceContext, year: number): Promise<TaxHelp> {
  const end = `${year}-12-31`;
  const prevEnd = `${year - 1}-12-31`;
  const start = `${year}-01-01`;
  const [accounts, allTxs, categories, assets, valuations, debts] = await Promise.all([
    loadAccounts(ctx, { includeArchived: true }),
    loadTransactions(ctx, { to: end }),
    listCategories(ctx, { includeArchived: true }),
    ctx.db.select().from(s.assets).where(eq(s.assets.userId, ctx.userId)),
    ctx.db.select().from(s.assetValuations).where(and(eq(s.assetValuations.userId, ctx.userId), lte(s.assetValuations.valuedAt, end))),
    ctx.db.select().from(s.debts).where(eq(s.debts.userId, ctx.userId)),
  ]);

  // Saldos em 31/12: mesma regra de saldo do resto do app, cortada na data.
  const ledgerTxs = allTxs.map(toLedgerTx);
  const ledgerAccounts = accounts.map(toLedgerAccount);
  const atEnd = accountBalances(ledgerAccounts, ledgerTxs, { asOf: end });
  const atPrev = accountBalances(ledgerAccounts, ledgerTxs, { asOf: prevEnd });
  const existed = (a: (typeof accounts)[number], date: string) => (a.initialBalanceDate ?? a.createdAt.toISOString().slice(0, 10)) <= date;
  const accountLines: TaxAccountLine[] = accounts
    .filter((a) => existed(a, end) && (!a.archivedAt || a.archivedAt.toISOString().slice(0, 10) > prevEnd))
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      previousCents: existed(a, prevEnd) ? (atPrev.get(a.id) ?? 0) : null,
      currentCents: atEnd.get(a.id) ?? 0,
    }));

  // Outros bens: o valor mais recente até cada 31/12 (histórico de avaliações ou o valor cadastrado).
  const valueAt = (asset: (typeof assets)[number], date: string): Cents | null => {
    const hist = valuations.filter((v) => v.assetId === asset.id && v.valuedAt <= date).sort((a, b) => b.valuedAt.localeCompare(a.valuedAt))[0];
    if (hist) return hist.valueCents;
    return asset.valuedAt <= date ? asset.valueCents : null;
  };
  const assetLines: TaxAssetLine[] = assets
    .filter((a) => !a.archivedAt || a.archivedAt.toISOString().slice(0, 10) > prevEnd)
    .map((a) => ({ id: a.id, name: a.name, category: a.category, previousCents: valueAt(a, prevEnd), currentCents: valueAt(a, end) }))
    .filter((a) => a.previousCents !== null || a.currentCents !== null);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const rootOf = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    return c?.parentId ? byId.get(c.parentId) : c;
  };
  const inYear = allTxs.filter((t) => t.date >= start && t.date <= end && t.status === "realized");

  // Rendimentos: por categoria e, dentro dela, por fonte pagadora (como o nome aparece no extrato).
  const groups = new Map<string, { cents: number; sources: Map<string, number> }>();
  for (const t of inYear.filter((x) => x.kind === "income")) {
    const name = rootOf(t.categoryId)?.name ?? "Sem categoria";
    const g = groups.get(name) ?? { cents: 0, sources: new Map() };
    g.cents += t.amountCents;
    const src = prettyMerchant(t.description) || t.description;
    g.sources.set(src, (g.sources.get(src) ?? 0) + t.amountCents);
    groups.set(name, g);
  }
  const incomeGroups = [...groups.entries()]
    .map(([name, g]) => ({ name, cents: g.cents, sources: [...g.sources.entries()].map(([n, c]) => ({ name: n, cents: c })).sort((a, b) => b.cents - a.cents).slice(0, 8) }))
    .sort((a, b) => b.cents - a.cents);

  // Despesas que costumam ser dedutíveis: saúde e educação (com a subcategoria, para separar farmácia).
  const expenseLines = (rootName: RegExp) =>
    inYear
      .filter((t) => t.kind === "expense" && rootName.test(rootOf(t.categoryId)?.name ?? ""))
      .map((t) => ({ id: t.id, date: t.date, description: t.description, category: (t.categoryId ? byId.get(t.categoryId)?.name : null) ?? "", cents: t.amountCents }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const health = expenseLines(/^sa[uú]de$/i);
  const education = expenseLines(/^educa[cç][aã]o$/i);

  return {
    year,
    accounts: accountLines,
    assets: assetLines,
    debts: debts.filter((d) => !d.archivedAt).map((d) => ({ id: d.id, name: d.name, category: d.category, outstandingCents: d.outstandingCents, valuedAt: d.valuedAt })),
    income: { totalCents: incomeGroups.reduce((t, g) => t + g.cents, 0), groups: incomeGroups },
    health: { totalCents: health.reduce((t, l) => t + l.cents, 0), lines: health },
    education: { totalCents: education.reduce((t, l) => t + l.cents, 0), lines: education },
  };
}
