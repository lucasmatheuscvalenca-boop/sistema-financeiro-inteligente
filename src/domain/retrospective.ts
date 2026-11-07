import { merchantKey, prettyMerchant } from "./categorize";
import type { ISODate, MonthKey } from "./dates";
import type { Cents } from "./money";

/** "Seu ano com o Banqueiro": os destaques de um ano a partir das movimentações realizadas. */

export interface RetroTx {
  date: ISODate;
  kind: string;
  amountCents: Cents;
  description: string;
  /** Categoria principal (subcategorias somadas na mãe). */
  category: string | null;
}

export interface Retrospective {
  year: number;
  incomeCents: Cents;
  expenseCents: Cents;
  savedCents: Cents;
  savingsRatePct: number | null;
  monthsWithData: number;
  bestMonth: { month: MonthKey; savedCents: Cents } | null;
  priciestMonth: { month: MonthKey; expenseCents: Cents } | null;
  topCategory: { name: string; cents: Cents; sharePct: number } | null;
  favoritePlace: { name: string; count: number; cents: Cents } | null;
  biggestPurchase: { description: string; cents: Cents; date: ISODate } | null;
  activeDays: number;
  transactions: number;
}

export function buildRetrospective(year: number, txs: readonly RetroTx[]): Retrospective {
  const inYear = txs.filter((t) => t.date.startsWith(`${year}-`));
  const incomes = inYear.filter((t) => t.kind === "income");
  const expenses = inYear.filter((t) => t.kind === "expense");
  const refunds = inYear.filter((t) => t.kind === "refund");
  const incomeCents = incomes.reduce((s, t) => s + t.amountCents, 0);
  const expenseCents = expenses.reduce((s, t) => s + t.amountCents, 0) - refunds.reduce((s, t) => s + t.amountCents, 0);

  const months = new Map<MonthKey, { income: Cents; expense: Cents }>();
  for (const t of inYear) {
    const m = t.date.slice(0, 7);
    const v = months.get(m) ?? { income: 0, expense: 0 };
    if (t.kind === "income") v.income += t.amountCents;
    else if (t.kind === "expense") v.expense += t.amountCents;
    else if (t.kind === "refund") v.expense -= t.amountCents;
    months.set(m, v);
  }
  const monthList = [...months.entries()].filter(([, v]) => v.income || v.expense);
  const withIncome = monthList.filter(([, v]) => v.income > 0);
  const best = withIncome.sort((a, b) => b[1].income - b[1].expense - (a[1].income - a[1].expense))[0];
  const priciest = [...monthList].sort((a, b) => b[1].expense - a[1].expense)[0];

  const byCategory = new Map<string, Cents>();
  for (const t of expenses) {
    const name = t.category ?? "Sem categoria";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amountCents);
  }
  const top = [...byCategory.entries()].filter(([name]) => name !== "Sem categoria").sort((a, b) => b[1] - a[1])[0];

  const places = new Map<string, { name: string; count: number; cents: Cents }>();
  for (const t of expenses) {
    const key = merchantKey(t.description);
    if (!key) continue;
    const p = places.get(key) ?? { name: prettyMerchant(t.description), count: 0, cents: 0 };
    p.count += 1;
    p.cents += t.amountCents;
    places.set(key, p);
  }
  const favorite = [...places.values()].sort((a, b) => b.count - a.count || b.cents - a.cents)[0];
  const biggest = [...expenses].sort((a, b) => b.amountCents - a.amountCents)[0];

  return {
    year,
    incomeCents,
    expenseCents,
    savedCents: incomeCents - expenseCents,
    savingsRatePct: incomeCents > 0 ? ((incomeCents - expenseCents) / incomeCents) * 100 : null,
    monthsWithData: monthList.length,
    bestMonth: best ? { month: best[0], savedCents: best[1].income - best[1].expense } : null,
    priciestMonth: priciest && priciest[1].expense > 0 ? { month: priciest[0], expenseCents: priciest[1].expense } : null,
    topCategory: top && expenseCents > 0 ? { name: top[0], cents: top[1], sharePct: (top[1] / expenseCents) * 100 } : null,
    favoritePlace: favorite && favorite.count >= 2 ? favorite : null,
    biggestPurchase: biggest ? { description: biggest.description, cents: biggest.amountCents, date: biggest.date } : null,
    activeDays: new Set(inYear.map((t) => t.date)).size,
    transactions: inYear.length,
  };
}
