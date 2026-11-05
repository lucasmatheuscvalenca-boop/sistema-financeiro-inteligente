import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { detectSubscriptions, suggestCategory, topMerchants, type DetectedSubscription, type MerchantTotal } from "@/domain/categorize";
import { addMonthsToKey, dateWithClampedDay, endOfMonth, monthKey, parts, startOfMonth, type ISODate, type MonthKey } from "@/domain/dates";
import { percentChange } from "@/domain/daily-plan";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { listCategories } from "./categories";
import type { ServiceContext } from "./context";
import { loadTransactions, type TxRow } from "./ledger";

export interface SpendingCategory {
  id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  cents: Cents;
  pct: number;
  /** Subcategorias com gasto, maiores primeiro. */
  children: Array<{ id: string; name: string; cents: Cents }>;
}

export interface SpendingOverview {
  month: MonthKey;
  isCurrentMonth: boolean;
  /** Despesas realizadas (líquidas de estornos) no mês. */
  totalCents: Cents;
  /** Mesmo período do mês anterior (até o mesmo dia, no mês corrente) ou o mês inteiro. */
  previousCents: Cents;
  previousLabel: string;
  deltaPct: number | null;
  /** Média dos três meses anteriores completos. */
  averageCents: Cents | null;
  categories: SpendingCategory[];
  uncategorizedCount: number;
  /** Streaming, apps, academia: o que a pessoa pensa como "assinatura". */
  subscriptions: DetectedSubscription[];
  /** Outras cobranças que se repetem todo mês (aluguel, luz, parcela). */
  fixedCharges: DetectedSubscription[];
  merchants: MerchantTotal[];
}

/** Despesa com sinal: compra soma, estorno abate. Transferências e pagamentos de fatura não entram. */
function signedExpense(t: TxRow): Cents {
  if (t.status !== "realized") return 0;
  if (t.kind === "expense") return t.amountCents;
  if (t.kind === "refund") return -t.amountCents;
  return 0;
}

/**
 * "Com o que gastei este mês": despesas realizadas por categoria principal, com as subcategorias
 * dentro, mais assinaturas detectadas e os lugares onde mais saiu dinheiro.
 */
export async function getSpending(ctx: ServiceContext, month?: MonthKey): Promise<SpendingOverview> {
  const current = monthKey(ctx.today);
  const m = month ?? current;
  const isCurrent = m === current;
  const from = startOfMonth(addMonthsToKey(m, -3));
  const to = endOfMonth(m);
  const [txs, categories] = await Promise.all([loadTransactions(ctx, { from, to }), listCategories(ctx, { kind: "expense", includeArchived: true })]);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const inMonth = txs.filter((t) => t.date >= startOfMonth(m) && t.date <= to);
  const totals = new Map<string | null, Cents>();
  const childTotals = new Map<string, Cents>();
  let total = 0;
  let uncategorizedCount = 0;
  for (const t of inMonth) {
    const v = signedExpense(t);
    if (v === 0) continue;
    total += v;
    const cat = t.categoryId ? byId.get(t.categoryId) : undefined;
    if (!cat) {
      if (t.kind === "expense") uncategorizedCount++;
      totals.set(null, (totals.get(null) ?? 0) + v);
      continue;
    }
    const parentId = cat.parentId ?? cat.id;
    totals.set(parentId, (totals.get(parentId) ?? 0) + v);
    if (cat.parentId) childTotals.set(cat.id, (childTotals.get(cat.id) ?? 0) + v);
  }
  const positiveTotal = [...totals.values()].reduce((sum, v) => sum + Math.max(0, v), 0);
  const cats: SpendingCategory[] = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, cents]) => {
      const cat = id ? byId.get(id) : undefined;
      return {
        id,
        name: cat?.name ?? "Sem categoria",
        color: cat?.color ?? null,
        icon: cat?.icon ?? null,
        cents,
        pct: positiveTotal > 0 ? (cents / positiveTotal) * 100 : 0,
        children: [...childTotals.entries()]
          .filter(([cid, v]) => v > 0 && byId.get(cid)?.parentId === id)
          .map(([cid, v]) => ({ id: cid, name: byId.get(cid)!.name, cents: v }))
          .sort((a, b) => b.cents - a.cents),
      };
    })
    .sort((a, b) => b.cents - a.cents);

  // Comparação justa: no mês corrente, só até o mesmo dia do mês anterior.
  const prev = addMonthsToKey(m, -1);
  const prevStart = startOfMonth(prev);
  const prevEnd: ISODate = isCurrent ? dateWithClampedDay(parts(prevStart).year, parts(prevStart).month, parts(ctx.today).day) : endOfMonth(prev);
  const previousCents = txs.filter((t) => t.date >= prevStart && t.date <= prevEnd).reduce((sum, t) => sum + signedExpense(t), 0);
  const fullMonths = [1, 2, 3].map((i) => addMonthsToKey(m, -i)).map((k) => txs.filter((t) => t.date >= startOfMonth(k) && t.date <= endOfMonth(k)).reduce((sum, t) => sum + signedExpense(t), 0));
  const withData = fullMonths.filter((v) => v > 0);
  const averageCents = withData.length ? Math.round(withData.reduce((a, b) => a + b, 0) / withData.length) : null;

  // Assinaturas: olha os últimos quatro meses para achar a cadência; só saídas realizadas sem ser transferência.
  const outflows = txs.filter((t) => t.status === "realized" && t.kind === "expense").map((t) => ({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents, accountId: t.accountId, cardId: t.cardId, categoryId: t.categoryId }));
  const recurring = detectSubscriptions(outflows).filter((sub) => sub.lastDate >= startOfMonth(addMonthsToKey(m, -1)));
  const assinaturas = categories.find((c) => !c.parentId && c.name === "Assinaturas");
  const isSubscription = (sub: DetectedSubscription) => {
    const cat = sub.categoryId ? byId.get(sub.categoryId) : undefined;
    if (cat && assinaturas && (cat.id === assinaturas.id || cat.parentId === assinaturas.id)) return true;
    const guess = suggestCategory(sub.name, "expense");
    return guess?.category === "Assinaturas" || /academia|smart fit|gympass|wellhub|totalpass/i.test(sub.name);
  };
  const subscriptions = recurring.filter(isSubscription);
  // Contas fixas pedem mais evidência (três cobranças) para não confundir mercado semanal com conta fixa.
  const fixedCharges = recurring.filter((sub) => !isSubscription(sub) && sub.occurrences >= 3);
  const merchants = topMerchants(
    inMonth.filter((t) => t.status === "realized" && t.kind === "expense").map((t) => ({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents })),
    5,
  );

  return {
    month: m,
    isCurrentMonth: isCurrent,
    totalCents: total,
    previousCents,
    previousLabel: isCurrent ? `mesmo período de ${monthLabel(prev)}` : monthLabel(prev),
    deltaPct: percentChange(total, previousCents),
    averageCents,
    categories: cats,
    uncategorizedCount,
    subscriptions,
    fixedCharges,
    merchants,
  };
}

function monthLabel(key: MonthKey): string {
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return names[Number(key.slice(5, 7)) - 1]!;
}

/** Quantos lançamentos de receita/despesa do mês ainda estão sem categoria. */
export async function countUncategorized(ctx: ServiceContext, month: MonthKey): Promise<number> {
  const rows = await ctx.db
    .select({ id: s.transactions.id })
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), isNull(s.transactions.categoryId), inArray(s.transactions.kind, ["income", "expense"]), gte(s.transactions.date, startOfMonth(month)), lte(s.transactions.date, endOfMonth(month))));
  return rows.length;
}
