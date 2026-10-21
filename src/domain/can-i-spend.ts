import Decimal from "decimal.js";
import { addDays, diffDays, formatDateBR, minDate, type ISODate } from "./dates";
import { buildInstallmentSchedule, type CardCycle } from "./credit-card";
import { lowestBetween, nextConfirmedIncome, projectCashFlow, type CashEvent } from "./cashflow";
import { delayFromReduction } from "./goals";
import { DecimalMath, formatMoney, type Cents } from "./money";

/**
 * "Posso gastar?" — avalia uma despesa pretendida contra o fluxo de caixa até o
 * próximo recebimento confirmado, compromissos, orçamento, metas e margem de segurança.
 * Nada aqui grava dados: todas as opções retornadas são simulações.
 */

export type SpendVerdict =
  | "cabe"
  | "estoura_orcamento"
  | "consome_margem"
  | "afeta_metas"
  | "nao_recomendado"
  | "sem_limite"
  | "dados_insuficientes";

export type SpendLevel = "green" | "yellow" | "red" | "gray";

export const VERDICT_LEVEL: Record<SpendVerdict, SpendLevel> = {
  cabe: "green",
  estoura_orcamento: "yellow",
  consome_margem: "yellow",
  afeta_metas: "yellow",
  nao_recomendado: "red",
  sem_limite: "red",
  dados_insuficientes: "gray",
};

export const VERDICT_TITLE: Record<SpendVerdict, string> = {
  cabe: "Cabe no seu planejamento",
  estoura_orcamento: "Cabe no caixa, mas estoura o orçamento da categoria",
  consome_margem: "Cabe, mas consome sua margem de segurança",
  afeta_metas: "Só cabe se você reduzir aportes em metas",
  nao_recomendado: "Não recomendado agora: compromete contas futuras",
  sem_limite: "O limite disponível do cartão não comporta esta compra",
  dados_insuficientes: "Faltam dados para uma análise confiável",
};

export type SpendPayment =
  | { method: "account" }
  | { method: "card"; cardName: string; cycle: CardCycle; installments: number; availableLimitCents: Cents };

export interface SpendGoal {
  goalId: string;
  name: string;
  priority: number;
  currentCents: Cents;
  targetCents: Cents;
  monthlyContributionCents: Cents;
  contributionDay: number;
  annualReturnRate?: number | null;
}

export interface SpendBudget {
  categoryId: string;
  categoryName: string;
  limitCents: Cents;
  committedCents: Cents;
}

export interface SpendDataQuality {
  lastDataUpdate: ISODate | null;
  hasIncomeInfo: boolean;
  hasBankConnection: boolean;
  connectionStale: boolean;
  missing: string[];
}

export interface CanISpendInput {
  today: ISODate;
  amountCents: Cents;
  description?: string;
  purchaseDate?: ISODate;
  payment: SpendPayment;
  /** Saldo realizado das contas disponíveis para gastos. null = nenhuma conta cadastrada. */
  openingAvailableCents: Cents | null;
  /** Eventos futuros (próximos ~90 dias). Aportes em metas devem vir com optional=true e sourceId=goalId. */
  events: readonly CashEvent[];
  safetyMarginCents: Cents;
  budget?: SpendBudget | null;
  otherBudgets?: ReadonlyArray<{ categoryId: string; categoryName: string; remainingCents: Cents }>;
  goals?: readonly SpendGoal[];
  dataQuality: SpendDataQuality;
  cheaperAlternativeCents?: Cents;
}

export interface SpendAnalysis {
  verdict: SpendVerdict;
  level: SpendLevel;
  title: string;
  amountCents: Cents;
  asOf: ISODate;
  horizon: { start: ISODate; end: ISODate; nextIncomeDate: ISODate | null; reason: string };
  impactDates: ISODate[];
  before: { lowestDate: ISODate; lowestBalanceCents: Cents; freeToSpendCents: Cents };
  after: { lowestDate: ISODate; lowestBalanceCents: Cents; leftoverAfterMarginCents: Cents } | null;
  safetyMarginCents: Cents;
  preExistingShortfall: { date: ISODate; balanceCents: Cents } | null;
  /** Quanto faltaria para cobrir os compromissos mesmo sem nenhum aporte em metas. */
  commitmentShortfallCents: Cents;
  affectedCommitments: Array<{ date: ISODate; label: string; amountCents: Cents; balanceAfterCents: Cents }>;
  goalsAtRisk: Array<{ goalId: string; name: string; reductionCents: Cents; delayMonths: number | null }>;
  budget: (SpendBudget & { committedAfterCents: Cents; remainingAfterCents: Cents; exceeded: boolean }) | null;
  card: { cardName: string; availableLimitCents: Cents; installments: number; dueDates: ISODate[] } | null;
  estimatedIncomeIgnoredCents: Cents;
  maxSafeAmountCents: Cents;
  alternatives: {
    cheaper: { amountCents: Cents; verdict: SpendVerdict; leftoverAfterMarginCents: Cents | null } | null;
    postpone: { date: ISODate; verdict: SpendVerdict; leftoverAfterMarginCents: Cents | null } | null;
    reviewBudget: { fromCategoryId: string; fromCategoryName: string; moveCents: Cents } | null;
  };
  options: Array<{ id: "buy" | "reduce" | "postpone" | "adjust_goal" | "review_budget"; label: string; detail: string }>;
  caveats: string[];
  assumptions: string[];
  facts: string[];
}

function purchaseEvents(input: CanISpendInput, purchaseDate: ISODate, amount: Cents): CashEvent[] {
  const label = input.description?.trim() || "Despesa avaliada";
  if (input.payment.method === "account") {
    return [{ date: purchaseDate, amountCents: -amount, label, kind: "purchase", certainty: "confirmed" }];
  }
  const schedule = buildInstallmentSchedule({
    totalCents: amount,
    count: input.payment.installments,
    firstDate: purchaseDate,
    cycle: input.payment.cycle,
  });
  return schedule.map((s) => ({
    date: s.invoice!.dueDate,
    amountCents: -s.amountCents,
    label: `${label} (parcela ${s.number}/${s.of} na fatura ${input.payment.method === "card" ? input.payment.cardName : ""})`.trim(),
    kind: "purchase" as const,
    certainty: "confirmed" as const,
  }));
}

interface CoreResult {
  verdict: SpendVerdict;
  impactDates: ISODate[];
  horizonEnd: ISODate;
  nextIncomeDate: ISODate | null;
  reason: string;
  before: { lowestDate: ISODate; lowestBalanceCents: Cents; freeToSpendCents: Cents };
  after: { lowestDate: ISODate; lowestBalanceCents: Cents; leftoverAfterMarginCents: Cents };
  lowestWithoutGoals: { date: ISODate; balanceCents: Cents };
  preExisting: { date: ISODate; balanceCents: Cents } | null;
  projectionWithoutGoals: ReturnType<typeof projectCashFlow>;
  projectionWithGoals: ReturnType<typeof projectCashFlow>;
  budgetAfter: SpendAnalysis["budget"];
}

function evaluateCore(input: CanISpendInput, amount: Cents, purchaseDate: ISODate): CoreResult {
  const opening = input.openingAvailableCents ?? 0;
  const pEvents = purchaseEvents(input, purchaseDate, amount);
  const impactDates = [...new Set(pEvents.map((e) => e.date))].sort();
  const firstImpact = impactDates[0] ?? purchaseDate;
  const lastImpact = impactDates[impactDates.length - 1] ?? purchaseDate;

  const nextIncome = nextConfirmedIncome(input.events, input.today);
  const incomeAfterLast = nextConfirmedIncome(input.events, lastImpact);
  const baseEnd = nextIncome ? addDays(nextIncome.date, -1) : addDays(input.today, 30);
  const afterLastEnd = incomeAfterLast ? addDays(incomeAfterLast.date, -1) : addDays(lastImpact, 30);
  const horizonEnd = minDate(addDays(input.today, 120), baseEnd > afterLastEnd ? baseEnd : afterLastEnd);
  const reason = nextIncome
    ? `até a véspera do próximo recebimento confirmado (${formatDateBR(nextIncome.date)})`
    : "nos próximos 30 dias (nenhuma receita confirmada foi encontrada)";

  const baseline = projectCashFlow({ startDate: input.today, endDate: horizonEnd, openingCents: opening, events: input.events });
  const withGoals = projectCashFlow({
    startDate: input.today,
    endDate: horizonEnd,
    openingCents: opening,
    events: [...input.events, ...pEvents],
  });
  const withoutGoals = projectCashFlow({
    startDate: input.today,
    endDate: horizonEnd,
    openingCents: opening,
    events: [...input.events, ...pEvents],
    includeOptional: false,
  });

  const lowBefore = lowestBetween(baseline, firstImpact, horizonEnd);
  const lowAfter = lowestBetween(withGoals, firstImpact, horizonEnd);
  const lowNoGoals = lowestBetween(withoutGoals, firstImpact, horizonEnd);
  const preExisting = baseline.lowestConfirmed.balanceCents < 0 ? baseline.lowestConfirmed : null;

  let budgetAfter: SpendAnalysis["budget"] = null;
  if (input.budget) {
    const committedAfter = input.budget.committedCents + amount;
    budgetAfter = {
      ...input.budget,
      committedAfterCents: committedAfter,
      remainingAfterCents: input.budget.limitCents - committedAfter,
      exceeded: committedAfter > input.budget.limitCents,
    };
  }

  let verdict: SpendVerdict;
  if (input.payment.method === "card" && amount > input.payment.availableLimitCents) verdict = "sem_limite";
  else if (lowNoGoals.balanceCents < 0) verdict = "nao_recomendado";
  else if (lowAfter.balanceCents < 0) verdict = "afeta_metas";
  else if (lowAfter.balanceCents < input.safetyMarginCents) verdict = "consome_margem";
  else if (budgetAfter?.exceeded) verdict = "estoura_orcamento";
  else verdict = "cabe";

  return {
    verdict,
    impactDates,
    horizonEnd,
    nextIncomeDate: nextIncome?.date ?? null,
    reason,
    before: {
      lowestDate: lowBefore.date,
      lowestBalanceCents: lowBefore.balanceCents,
      freeToSpendCents: Math.max(0, lowBefore.balanceCents - input.safetyMarginCents),
    },
    after: {
      lowestDate: lowAfter.date,
      lowestBalanceCents: lowAfter.balanceCents,
      leftoverAfterMarginCents: lowAfter.balanceCents - input.safetyMarginCents,
    },
    lowestWithoutGoals: lowNoGoals,
    preExisting,
    projectionWithoutGoals: withoutGoals,
    projectionWithGoals: withGoals,
    budgetAfter,
  };
}

export function canISpend(input: CanISpendInput): SpendAnalysis {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Informe um valor maior que zero");
  }
  const purchaseDate = input.purchaseDate && input.purchaseDate > input.today ? input.purchaseDate : input.today;
  const caveats: string[] = [];
  const assumptions: string[] = [];
  const facts: string[] = [];
  const dq = input.dataQuality;

  if (!dq.hasIncomeInfo) caveats.push("Não encontrei receitas confirmadas futuras. A análise considera os próximos 30 dias sem novas entradas.");
  if (!dq.hasBankConnection) caveats.push("Sem conexão bancária: os saldos dependem dos lançamentos que você registrou.");
  if (dq.connectionStale) caveats.push("A última sincronização bancária tem mais de 24 horas; os saldos podem estar desatualizados.");
  if (dq.lastDataUpdate && diffDays(dq.lastDataUpdate, input.today) > 7) {
    caveats.push(`Seus lançamentos não são atualizados desde ${formatDateBR(dq.lastDataUpdate)}.`);
  }
  for (const m of dq.missing) caveats.push(m);

  const estimatedIncome = input.events
    .filter((e) => e.certainty === "estimated" && e.amountCents > 0 && e.date >= input.today)
    .reduce((s, e) => s + e.amountCents, 0);

  if (input.openingAvailableCents === null) {
    const commitments = input.events
      .filter((e) => e.certainty === "confirmed" && e.amountCents < 0 && diffDays(input.today, e.date) <= 30)
      .reduce((s, e) => s - e.amountCents, 0);
    const income = input.events
      .filter((e) => e.certainty === "confirmed" && e.amountCents > 0 && diffDays(input.today, e.date) <= 30)
      .reduce((s, e) => s + e.amountCents, 0);
    const needed = input.amountCents + commitments + input.safetyMarginCents - income;
    caveats.unshift("Nenhuma conta disponível para gastos foi cadastrada, então não sei quanto você tem hoje.");
    return {
      verdict: "dados_insuficientes",
      level: "gray",
      title: VERDICT_TITLE.dados_insuficientes,
      amountCents: input.amountCents,
      asOf: input.today,
      horizon: { start: input.today, end: addDays(input.today, 30), nextIncomeDate: null, reason: "próximos 30 dias" },
      impactDates: [purchaseDate],
      before: { lowestDate: input.today, lowestBalanceCents: 0, freeToSpendCents: 0 },
      after: null,
      safetyMarginCents: input.safetyMarginCents,
      preExistingShortfall: null,
      commitmentShortfallCents: 0,
      affectedCommitments: [],
      goalsAtRisk: [],
      budget: null,
      card: null,
      estimatedIncomeIgnoredCents: estimatedIncome,
      maxSafeAmountCents: 0,
      alternatives: { cheaper: null, postpone: null, reviewBudget: null },
      options: [],
      caveats,
      assumptions: [
        `Análise condicional: a compra só caberia se seu saldo disponível hoje fosse de pelo menos ${formatMoney(Math.max(0, needed))}, considerando compromissos e receitas confirmadas dos próximos 30 dias e a margem de segurança.`,
      ],
      facts,
    };
  }

  const core = evaluateCore(input, input.amountCents, purchaseDate);

  assumptions.push(`Saldo inicial: ${formatMoney(input.openingAvailableCents)} nas contas marcadas como disponíveis para gastos.`);
  assumptions.push(`Período analisado: de ${formatDateBR(input.today)} a ${formatDateBR(core.horizonEnd)}, ${core.reason}.`);
  assumptions.push(`Margem de segurança mantida: ${formatMoney(input.safetyMarginCents)}.`);
  assumptions.push("Receitas estimadas (não confirmadas) não entram na conta.");
  const goalOutflows = input.events
    .filter((e) => e.optional && e.date >= input.today && e.date <= core.horizonEnd)
    .reduce((s, e) => s - e.amountCents, 0);
  if (goalOutflows > 0) assumptions.push(`Aportes planejados em metas no período: ${formatMoney(goalOutflows)}.`);

  // Compromissos afetados: dias em que o saldo (sem aportes) fica negativo depois da compra.
  const affectedCommitments: SpendAnalysis["affectedCommitments"] = [];
  const firstImpact = core.impactDates[0] ?? purchaseDate;
  for (const day of core.projectionWithoutGoals.days) {
    if (day.date < firstImpact || day.confirmedCents >= 0) continue;
    for (const e of day.events) {
      if (e.amountCents < 0 && e.certainty === "confirmed" && !e.optional && affectedCommitments.length < 6) {
        affectedCommitments.push({ date: day.date, label: e.label, amountCents: -e.amountCents, balanceAfterCents: day.confirmedCents });
      }
    }
  }

  // Metas em risco: cortar aportes das metas de menor prioridade até cobrir o déficit.
  const goalsAtRisk: SpendAnalysis["goalsAtRisk"] = [];
  if (core.verdict === "afeta_metas" || core.verdict === "nao_recomendado") {
    let shortfall = Math.max(0, -core.after.lowestBalanceCents);
    if (core.verdict === "nao_recomendado") shortfall -= Math.max(0, -core.lowestWithoutGoals.balanceCents);
    const plannedByGoal = new Map<string, Cents>();
    for (const e of input.events) {
      if (!e.optional || !e.sourceId || e.date < input.today || e.date > core.horizonEnd) continue;
      plannedByGoal.set(e.sourceId, (plannedByGoal.get(e.sourceId) ?? 0) - e.amountCents);
    }
    const goals = [...(input.goals ?? [])].sort((a, b) => b.priority - a.priority);
    for (const g of goals) {
      if (shortfall <= 0) break;
      const planned = plannedByGoal.get(g.goalId) ?? 0;
      if (planned <= 0) continue;
      const cut = Math.min(planned, shortfall);
      shortfall -= cut;
      const delay = delayFromReduction({
        targetCents: g.targetCents,
        currentCents: g.currentCents,
        monthlyContributionCents: g.monthlyContributionCents,
        contributionDay: g.contributionDay,
        annualReturnRate: g.annualReturnRate,
        today: input.today,
        reductionCents: cut,
      });
      goalsAtRisk.push({ goalId: g.goalId, name: g.name, reductionCents: cut, delayMonths: delay.delayMonths });
    }
  }

  // Valor máximo seguro (sem tocar em metas, margem ou orçamento).
  // No cartão parcelado a soma das parcelas acaba saindo do mesmo caixa no período analisado,
  // então o limite seguro continua sendo a folga (conservador), além do limite do cartão.
  let maxSafe = core.before.freeToSpendCents;
  if (input.payment.method === "card") maxSafe = Math.min(maxSafe, input.payment.availableLimitCents);
  if (input.budget) maxSafe = Math.min(maxSafe, Math.max(0, input.budget.limitCents - input.budget.committedCents));
  maxSafe = Math.max(0, maxSafe);

  // Alternativa mais barata.
  const cheaperAmount =
    input.cheaperAlternativeCents && input.cheaperAlternativeCents > 0 && input.cheaperAlternativeCents < input.amountCents
      ? input.cheaperAlternativeCents
      : new DecimalMath(input.amountCents).mul(0.5).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  let cheaper: SpendAnalysis["alternatives"]["cheaper"] = null;
  if (cheaperAmount > 0 && core.verdict !== "cabe") {
    const c = evaluateCore(input, cheaperAmount, purchaseDate);
    cheaper = { amountCents: cheaperAmount, verdict: c.verdict, leftoverAfterMarginCents: c.after.leftoverAfterMarginCents };
  }

  // Adiar até o próximo recebimento.
  let postpone: SpendAnalysis["alternatives"]["postpone"] = null;
  if (core.nextIncomeDate && core.verdict !== "cabe") {
    const p = evaluateCore(input, input.amountCents, core.nextIncomeDate);
    postpone = { date: core.nextIncomeDate, verdict: p.verdict, leftoverAfterMarginCents: p.after.leftoverAfterMarginCents };
  }

  // Rever orçamento: remanejar de outra categoria com folga.
  let reviewBudget: SpendAnalysis["alternatives"]["reviewBudget"] = null;
  if (core.budgetAfter?.exceeded) {
    const overflow = -core.budgetAfter.remainingAfterCents;
    const donor = [...(input.otherBudgets ?? [])]
      .filter((b) => b.categoryId !== core.budgetAfter!.categoryId && b.remainingCents >= overflow)
      .sort((a, b) => b.remainingCents - a.remainingCents)[0];
    if (donor) reviewBudget = { fromCategoryId: donor.categoryId, fromCategoryName: donor.categoryName, moveCents: overflow };
  }

  const options: SpendAnalysis["options"] = [];
  options.push({
    id: "buy",
    label: "Realizar a compra",
    detail:
      core.after.leftoverAfterMarginCents >= 0
        ? `Seu ponto mais baixo no período seria ${formatMoney(core.after.lowestBalanceCents)} em ${formatDateBR(core.after.lowestDate)}.`
        : `Seu saldo chegaria a ${formatMoney(core.after.lowestBalanceCents)} em ${formatDateBR(core.after.lowestDate)}.`,
  });
  if (cheaper) {
    options.push({
      id: "reduce",
      label: `Reduzir para ${formatMoney(cheaper.amountCents)}`,
      detail: `Resultado: ${VERDICT_TITLE[cheaper.verdict].toLowerCase()}.`,
    });
  }
  if (maxSafe > 0 && maxSafe < input.amountCents) {
    options.push({
      id: "reduce",
      label: `Gastar até ${formatMoney(maxSafe)}`,
      detail: "Valor máximo que mantém compromissos, aportes planejados, margem de segurança e orçamento.",
    });
  }
  if (postpone) {
    options.push({
      id: "postpone",
      label: `Adiar para ${formatDateBR(postpone.date)}`,
      detail: `Depois do próximo recebimento: ${VERDICT_TITLE[postpone.verdict].toLowerCase()}.`,
    });
  }
  if (goalsAtRisk.length > 0) {
    options.push({
      id: "adjust_goal",
      label: "Ajustar aportes de metas",
      detail: goalsAtRisk
        .map(
          (g) =>
            `${g.name}: aportar ${formatMoney(g.reductionCents)} a menos` +
            (g.delayMonths ? ` (atraso estimado de ${g.delayMonths} ${g.delayMonths === 1 ? "mês" : "meses"})` : ""),
        )
        .join("; "),
    });
  }
  if (reviewBudget) {
    options.push({
      id: "review_budget",
      label: `Remanejar ${formatMoney(reviewBudget.moveCents)} de ${reviewBudget.fromCategoryName}`,
      detail: "A outra categoria tem folga suficiente neste mês.",
    });
  }

  facts.push(`Saldo disponível hoje: ${formatMoney(input.openingAvailableCents)}.`);
  if (core.nextIncomeDate) facts.push(`Próximo recebimento confirmado: ${formatDateBR(core.nextIncomeDate)}.`);
  if (core.preExisting) {
    facts.push(
      `Mesmo sem esta despesa, seu saldo projetado fica negativo (${formatMoney(core.preExisting.balanceCents)}) em ${formatDateBR(core.preExisting.date)}.`,
    );
  }
  if (estimatedIncome > 0) {
    caveats.push(`Há ${formatMoney(estimatedIncome)} em receitas estimadas que não foram contadas até serem confirmadas.`);
  }

  return {
    verdict: core.verdict,
    level: VERDICT_LEVEL[core.verdict],
    title: VERDICT_TITLE[core.verdict],
    amountCents: input.amountCents,
    asOf: input.today,
    horizon: { start: input.today, end: core.horizonEnd, nextIncomeDate: core.nextIncomeDate, reason: core.reason },
    impactDates: core.impactDates,
    before: core.before,
    after: core.after,
    safetyMarginCents: input.safetyMarginCents,
    preExistingShortfall: core.preExisting,
    commitmentShortfallCents: Math.max(0, -core.lowestWithoutGoals.balanceCents),
    affectedCommitments,
    goalsAtRisk,
    budget: core.budgetAfter,
    card:
      input.payment.method === "card"
        ? {
            cardName: input.payment.cardName,
            availableLimitCents: input.payment.availableLimitCents,
            installments: input.payment.installments,
            dueDates: core.impactDates,
          }
        : null,
    estimatedIncomeIgnoredCents: estimatedIncome,
    maxSafeAmountCents: maxSafe,
    alternatives: { cheaper, postpone, reviewBudget },
    options,
    caveats,
    assumptions,
    facts,
  };
}
