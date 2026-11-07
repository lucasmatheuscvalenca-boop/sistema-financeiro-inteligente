import { addMonthsToKey, endOfMonth, startOfMonth, type MonthKey } from "@/domain/dates";
import { csvMoneyCell, csvTextCell } from "@/lib/csv-export";
import { monthTotals } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { spendingByCategory } from "./budgets";
import { listCategories } from "./categories";
import type { ServiceContext } from "./context";
import { loadTransactions, toLedgerTx, type TxRow } from "./ledger";
import { formLookups } from "./lookups";
import { listTransactions } from "./transactions";

export interface MonthlyPoint {
  month: MonthKey;
  incomeCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
  /** (receitas − despesas) ÷ receitas; null sem receitas no mês. */
  savingsRatePct: number | null;
}

/** Série mensal realizada (transferências e pagamentos de fatura não entram). */
export async function monthlySeries(ctx: ServiceContext, endMonth: MonthKey, months = 12): Promise<MonthlyPoint[]> {
  const first = addMonthsToKey(endMonth, -(months - 1));
  const txs = (await loadTransactions(ctx, { from: startOfMonth(first), to: endOfMonth(endMonth) })).map(toLedgerTx);
  return Array.from({ length: months }, (_, i) => {
    const m = addMonthsToKey(first, i);
    const t = monthTotals(txs, m).realized;
    return { month: m, incomeCents: t.incomeCents, expenseCents: t.expenseCents, netCents: t.netCents, savingsRatePct: t.incomeCents > 0 ? (t.netCents / t.incomeCents) * 100 : null };
  });
}

export interface CategorySlice {
  key: string;
  name: string;
  cents: Cents;
  sharePct: number;
  icon: string | null;
  color: string | null;
}

/** Despesas realizadas do mês por categoria principal (subcategorias somadas na categoria-mãe). */
export async function categoryBreakdown(ctx: ServiceContext, month: MonthKey): Promise<{ slices: CategorySlice[]; totalCents: Cents }> {
  const [{ realized }, categories] = await Promise.all([spendingByCategory(ctx, month), listCategories(ctx, { kind: "expense", includeArchived: true })]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rolled = new Map<string, Cents>();
  for (const [id, cents] of realized) {
    const cat = byId.get(id);
    const key = cat?.parentId ?? (cat ? cat.id : "__sem_categoria__");
    rolled.set(key, (rolled.get(key) ?? 0) + cents);
  }
  const total = [...rolled.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const slices = [...rolled.entries()]
    .filter(([, v]) => v > 0)
    .map(([key, cents]) => ({ key, name: byId.get(key)?.name ?? "Sem categoria", cents, sharePct: total > 0 ? (cents / total) * 100 : 0, icon: byId.get(key)?.icon ?? null, color: byId.get(key)?.color ?? null }))
    .sort((a, b) => b.cents - a.cents);
  return { slices, totalCents: total };
}

const CSV_KIND: Record<string, string> = { income: "Receita", expense: "Despesa", refund: "Estorno", transfer: "Transferência", card_payment: "Pagamento de fatura" };
const CSV_STATUS: Record<string, string> = { realized: "Realizado", scheduled: "Previsto", estimated: "Estimado" };
const CSV_PAGE = 1000;

/**
 * Lançamentos do mês em CSV (separador ";" e vírgula decimal, como o Excel em português). Exporta
 * todos, de página em página (a lista limita 1.000 por consulta), e neutraliza fórmulas nos textos.
 */
export async function transactionsCsv(ctx: ServiceContext, month: string): Promise<string> {
  const rows: TxRow[] = [];
  for (let offset = 0; ; offset += CSV_PAGE) {
    const page = await listTransactions(ctx, { month, limit: CSV_PAGE, offset });
    rows.push(...page);
    if (page.length < CSV_PAGE) break;
  }
  const [cats, look] = await Promise.all([listCategories(ctx, { includeArchived: true }), formLookups(ctx)]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const accName = new Map([...look.accounts.map((a) => [a.id, a.name] as const), ...look.cards.map((c) => [c.id, c.name] as const)]);
  const lines = [["Data", "Descrição", "Tipo", "Situação", "Categoria", "Conta/Cartão", "Valor (R$)"].join(";")];
  for (const t of rows) {
    const sign = t.kind === "income" || t.kind === "refund" ? 1 : t.kind === "expense" ? -1 : 0;
    // Textos (descrição, nomes) podem vir do banco ou de um extrato: neutralizados contra fórmulas.
    const texts = [t.date.split("-").reverse().join("/"), t.description, CSV_KIND[t.kind] ?? t.kind, CSV_STATUS[t.status] ?? t.status, t.categoryId ? (catName.get(t.categoryId) ?? "") : "", accName.get(t.cardId ?? t.accountId ?? "") ?? ""];
    lines.push([...texts.map(csvTextCell), csvMoneyCell((sign || 1) * t.amountCents)].join(";"));
  }
  return lines.join("\n");
}
