import { addDays, dateWithClampedDay, diffDays, formatDateShort, monthName, parts, type ISODate } from "./dates";
import { formatMoney, type Cents } from "./money";

/**
 * “Seu plano de hoje” e a mensagem de abertura do painel. Tudo é derivado dos dados
 * e de regras explícitas (nada aleatório). Cada ação traz o motivo e o destino.
 */

export type PlanKind = "setup" | "pending" | "bills" | "budget" | "goal" | "reserve" | "risk" | "data" | "invest";

export interface PlanItem {
  key: string;
  kind: PlanKind;
  title: string;
  detail: string;
  action: { label: string; href: string };
  /** Ação principal do dia (destacada). */
  primary?: boolean;
  priority: number;
}

export interface PlanGoal {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "archived";
  health: string;
  /** Aporte esperado no mês (planejado ou necessário), quando houver. */
  monthlyTargetCents: Cents | null;
  contributedThisMonthCents: Cents;
  contributionDay: number;
}

export interface PlanBudgetLine {
  categoryName: string;
  usedPct: number;
  status: "ok" | "warning" | "exceeded";
}

export interface DailyPlanInput {
  today: ISODate;
  hasAccounts: boolean;
  goals: PlanGoal[];
  budgetLines: PlanBudgetLine[];
  /** Compromissos confirmados a pagar (contas, faturas), com data. */
  payables: Array<{ date: ISODate; label: string; amountCents: Cents }>;
  overdue: Array<{ amountCents: Cents; kind: "income" | "expense" }>;
  reserve: { belowMinimum: boolean; gapToMinimumCents: Cents } | null;
  lastDataUpdate: ISODate | null;
  /** Folga até o fim do mês acima da margem de segurança (null se não for possível calcular). */
  extraCents: Cents | null;
}

const MAX_ITEMS = 5;
const BILL_WINDOW_DAYS = 3;
const STALE_DAYS = 7;
const MIN_EXTRA_CENTS = 100_00;

function contributionDate(today: ISODate, day: number): ISODate {
  const { year, month } = parts(today);
  return dateWithClampedDay(year, month, day);
}

export function buildDailyPlan(input: DailyPlanInput): PlanItem[] {
  const items: PlanItem[] = [];
  if (!input.hasAccounts) {
    items.push({
      key: "setup-account",
      kind: "setup",
      title: "Cadastre sua primeira conta",
      detail: "Sem contas não há saldo, previsão nem resposta confiável para “Posso gastar?”.",
      action: { label: "Cadastrar", href: "/contas" },
      priority: 0,
    });
  }

  const overdueExpenses = input.overdue.filter((o) => o.kind === "expense");
  if (input.overdue.length) {
    const total = overdueExpenses.reduce((s, o) => s + o.amountCents, 0);
    items.push({
      key: "pending",
      kind: "pending",
      title: `Confirme ${input.overdue.length} lançamento(s) previsto(s) já vencido(s)`,
      detail: total ? `${formatMoney(total)} em despesas aguardando confirmação.` : "Receitas previstas que ainda não foram confirmadas.",
      action: { label: "Revisar", href: "/movimentacoes?status=scheduled" },
      priority: 1,
    });
  }

  const limit = addDays(input.today, BILL_WINDOW_DAYS);
  const bills = input.payables.filter((p) => p.date >= input.today && p.date <= limit);
  if (bills.length) {
    const total = bills.reduce((s, b) => s + b.amountCents, 0);
    items.push({
      key: "bills",
      kind: "bills",
      title: `${bills.length} ${bills.length === 1 ? "conta vence" : "contas vencem"} nos próximos ${BILL_WINDOW_DAYS} dias`,
      detail: `${formatMoney(total)} no total · a primeira em ${formatDateShort(bills[0]!.date)}.`,
      action: { label: "Ver contas", href: "/movimentacoes?status=scheduled" },
      priority: 2,
    });
  }

  for (const line of input.budgetLines) {
    if (line.status === "exceeded") {
      items.push({
        key: `budget-${line.categoryName}`,
        kind: "budget",
        title: `Rever gastos com ${line.categoryName.toLowerCase()}`,
        detail: `${Math.round(line.usedPct - 100)}% acima do planejado para o mês.`,
        action: { label: "Ver detalhes", href: "/orcamento" },
        priority: 3,
      });
    } else if (line.status === "warning") {
      items.push({
        key: `budget-${line.categoryName}`,
        kind: "budget",
        title: `${line.categoryName} já usou ${Math.round(line.usedPct)}% do orçamento`,
        detail: "Ainda dá para ajustar antes de passar do limite.",
        action: { label: "Ver detalhes", href: "/orcamento" },
        priority: 5,
      });
    }
  }

  for (const g of input.goals) {
    if (g.status !== "active") continue;
    const target = g.monthlyTargetCents ?? 0;
    const pending = target - g.contributedThisMonthCents;
    if (pending > 0) {
      const due = contributionDate(input.today, g.contributionDay);
      const days = diffDays(input.today, due);
      if (days <= 7) {
        items.push({
          key: `goal-${g.id}`,
          kind: "goal",
          title: `Separar o aporte de ${g.name}`,
          detail: `${formatMoney(pending)} ${days < 0 ? `pendente desde ${formatDateShort(due)}` : days === 0 ? "previsto para hoje" : `até ${formatDateShort(due)}`}.`,
          action: { label: "Resolver", href: `/metas/${g.id}` },
          priority: 4,
        });
        continue;
      }
    }
    if (g.health === "at_risk" || g.health === "overdue") {
      items.push({
        key: `risk-${g.id}`,
        kind: "risk",
        title: g.health === "overdue" ? `O prazo de ${g.name} passou` : `Rever a meta ${g.name}`,
        detail: g.health === "overdue" ? "Defina uma nova data ou ajuste o valor-alvo." : "No ritmo atual, ela termina depois da data desejada.",
        action: { label: "Ver opções", href: `/metas/${g.id}` },
        priority: 6,
      });
    }
  }

  if (input.reserve?.belowMinimum) {
    items.push({
      key: "reserve",
      kind: "reserve",
      title: "Fortalecer a reserva de emergência",
      detail: input.reserve.gapToMinimumCents > 0 ? `Faltam ${formatMoney(input.reserve.gapToMinimumCents)} para o mínimo recomendado.` : "A reserva está abaixo do mínimo recomendado.",
      action: { label: "Ver reserva", href: "/reserva" },
      priority: 4,
    });
  }

  if (input.hasAccounts) {
    const idle = input.lastDataUpdate ? diffDays(input.lastDataUpdate, input.today) : null;
    if (idle === null || idle > STALE_DAYS) {
      items.push({
        key: "data",
        kind: "data",
        title: "Atualize seus lançamentos",
        detail: idle === null ? "Ainda não há movimentações registradas." : `O último lançamento foi há ${idle} dias.`,
        action: { label: "Lançar", href: "/movimentacoes" },
        priority: 7,
      });
    }
  }

  const blockers = items.some((i) => i.kind === "budget" && i.priority === 3) || input.reserve?.belowMinimum || items.some((i) => i.kind === "pending");
  if (!blockers && input.extraCents !== null && input.extraCents >= MIN_EXTRA_CENTS) {
    items.push({
      key: "invest",
      kind: "invest",
      title: "Você pode investir um valor extra",
      detail: `${formatMoney(input.extraCents)} disponível acima da sua margem até o fim do mês.`,
      action: { label: "Ver opções", href: "/metas" },
      priority: 8,
    });
  }

  const sorted = items.sort((a, b) => a.priority - b.priority).slice(0, MAX_ITEMS);
  if (sorted[0]) sorted[0].primary = true;
  return sorted;
}

// ─── Mensagem de abertura ────────────────────────────────────────────────────

export type InsightTone = "positive" | "neutral" | "caution" | "critical" | "unknown";

export interface HeroInsightInput {
  today: ISODate;
  hasAccounts: boolean;
  firstNegativeDate: ISODate | null;
  exceededBudget: string | null;
  reserveBelowMinimum: boolean;
  /** Meta ativa no prazo com data mais próxima. */
  onTrackGoal: { id: string; name: string; targetDate: ISODate } | null;
  /** Meta em risco com data mais próxima. */
  atRiskGoal: { id: string; name: string } | null;
  monthEndConfirmedCents: Cents | null;
}

export interface HeroInsight {
  tone: InsightTone;
  message: string;
  href: string;
  linkLabel: string;
}

export function heroInsight(i: HeroInsightInput): HeroInsight {
  if (!i.hasAccounts) {
    return { tone: "unknown", message: "Cadastre uma conta ou importe um extrato e eu passo a acompanhar seus números todos os dias.", href: "/contas", linkLabel: "Cadastrar conta" };
  }
  if (i.firstNegativeDate) {
    return { tone: "critical", message: `Pelas contas confirmadas, seu saldo pode ficar negativo em ${formatDateShort(i.firstNegativeDate)}. Vamos ver o que ajustar?`, href: "/fluxo-de-caixa", linkLabel: "Ver fluxo de caixa" };
  }
  if (i.exceededBudget) {
    return { tone: "caution", message: `Os gastos com ${i.exceededBudget.toLowerCase()} passaram do planejado neste mês. Ajustar agora protege suas metas.`, href: "/orcamento", linkLabel: "Ver orçamento" };
  }
  if (i.reserveBelowMinimum) {
    return { tone: "caution", message: "Sua reserva de emergência está abaixo do mínimo recomendado. Ela vem antes das metas de consumo.", href: "/reserva", linkLabel: "Ver reserva" };
  }
  if (i.atRiskGoal) {
    return { tone: "caution", message: `No ritmo atual, ${i.atRiskGoal.name} termina depois da data desejada. Dá para simular ajustes.`, href: `/metas/${i.atRiskGoal.id}`, linkLabel: "Simular" };
  }
  if (i.onTrackGoal) {
    const { month, year } = parts(i.onTrackGoal.targetDate);
    const sameYear = year === parts(i.today).year;
    return {
      tone: "positive",
      message: `Se mantiver seu ritmo, ${i.onTrackGoal.name} em ${monthName(month).toLowerCase()}${sameYear ? "" : ` de ${year}`} continua no caminho certo.`,
      href: `/metas/${i.onTrackGoal.id}`,
      linkLabel: "Ver meta",
    };
  }
  if (i.monthEndConfirmedCents !== null && i.monthEndConfirmedCents > 0) {
    return { tone: "positive", message: `Seus compromissos confirmados cabem no mês: a previsão de fechamento é de ${formatMoney(i.monthEndConfirmedCents)} livres.`, href: "/fluxo-de-caixa", linkLabel: "Ver previsão" };
  }
  return { tone: "neutral", message: "Registre receitas e compromissos do mês para eu prever o fechamento com segurança.", href: "/movimentacoes", linkLabel: "Lançar" };
}

/** Variação percentual com base explícita. Sem base comparável (zero ou negativa), não há percentual. */
export function percentChange(current: Cents, previous: Cents): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
