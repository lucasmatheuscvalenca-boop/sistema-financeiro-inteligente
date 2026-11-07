import { detectAnnualCharges, setAsidePlan, type SetAsideLine } from "@/domain/annual";
import { merchantKey, suggestCategory } from "@/domain/categorize";
import { addDays, type ISODate } from "@/domain/dates";
import { nextOccurrence, type Frequency } from "@/domain/recurrence";
import { listCategories, type CategoryRow } from "./categories";
import type { ServiceContext } from "./context";
import { loadTransactions } from "./ledger";
import { listRecurrences, type RecurrenceRow } from "./recurrences";
import { getSpending } from "./spending";

interface AnnualSource {
  key: string;
  name: string;
  amountCents: number;
  nextDate: ISODate;
  /** "registrada" = recorrência anual cadastrada; "historico" = achada nas cobranças. */
  origin: "registrada" | "historico";
  recurrenceId: string | null;
  subscription: boolean;
}

export type AnnualItem = SetAsideLine<AnnualSource>;

function isSubscriptionLike(name: string, categoryId: string | null, categories: CategoryRow[]): boolean {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const root = categories.find((c) => !c.parentId && c.name === "Assinaturas");
  const cat = categoryId ? byId.get(categoryId) : undefined;
  if (cat && root && (cat.id === root.id || cat.parentId === root.id)) return true;
  return suggestCategory(name, "expense")?.category === "Assinaturas";
}

function nextOf(r: RecurrenceRow, today: ISODate): ISODate | null {
  return nextOccurrence({ startDate: r.startDate, frequency: r.frequency as Frequency, interval: r.interval, dayOfMonth: r.dayOfMonth, endDate: r.endDate, count: r.count }, today);
}

/** Despesas anuais: as cadastradas como recorrência anual e as achadas no histórico de cobranças. */
export async function getAnnualExpenses(ctx: ServiceContext): Promise<{ items: AnnualItem[]; monthlyCents: number; yearlyCents: number }> {
  const [txs, recs, categories] = await Promise.all([loadTransactions(ctx, { from: addDays(ctx.today, -800), to: ctx.today }), listRecurrences(ctx, { activeOnly: true }), listCategories(ctx, { kind: "expense" })]);
  const yearly = recs.filter((r) => r.kind === "expense" && r.frequency === "yearly");
  const registered = yearly
    .map((r) => ({ r, next: nextOf(r, ctx.today) }))
    .filter((x): x is { r: RecurrenceRow; next: ISODate } => !!x.next)
    .map(({ r, next }) => ({ key: `rec:${r.id}`, name: r.description, amountCents: r.amountCents, nextDate: next, origin: "registrada" as const, recurrenceId: r.id, subscription: isSubscriptionLike(r.description, r.categoryId, categories) }));
  const known = new Set(yearly.map((r) => merchantKey(r.description)));
  const detected = detectAnnualCharges(
    txs.filter((t) => t.status === "realized" && t.kind === "expense").map((t) => ({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents, categoryId: t.categoryId })),
    ctx.today,
  )
    .filter((d) => !known.has(d.key))
    .map((d) => ({ key: `hist:${d.key}`, name: d.name, amountCents: d.amountCents, nextDate: d.nextDate, origin: "historico" as const, recurrenceId: null, subscription: isSubscriptionLike(d.name, d.categoryId, categories) }));
  const plan = setAsidePlan<AnnualSource>([...registered, ...detected], ctx.today);
  return { items: plan.lines, monthlyCents: plan.monthlyCents, yearlyCents: plan.yearlyCents };
}

export interface SubscriptionsPanel {
  monthly: Array<{ key: string; name: string; amountCents: number; day: number; yearlyCents: number }>;
  annual: AnnualItem[];
  monthlyTotalCents: number;
  yearlyTotalCents: number;
}

/** Painel de assinaturas: as mensais (com o custo no ano) e as anuais, com a próxima renovação. */
export async function getSubscriptionsPanel(ctx: ServiceContext): Promise<SubscriptionsPanel> {
  const [spending, annual] = await Promise.all([getSpending(ctx), getAnnualExpenses(ctx)]);
  const monthly = spending.subscriptions.map((s) => ({ key: s.key, name: s.name, amountCents: s.amountCents, day: s.day, yearlyCents: s.amountCents * 12 })).sort((a, b) => b.amountCents - a.amountCents);
  const annualSubs = annual.items.filter((i) => i.subscription);
  const monthlyTotalCents = monthly.reduce((t, m) => t + m.amountCents, 0);
  return { monthly, annual: annualSubs, monthlyTotalCents, yearlyTotalCents: monthlyTotalCents * 12 + annualSubs.reduce((t, a) => t + a.amountCents, 0) };
}
