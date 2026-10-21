import { z } from "zod";
import { addDays, addMonthsToKey, dateWithClampedDay, formatDateBR, formatMonthKey, monthKey, parts, type ISODate } from "@/domain/dates";
import { contributionDates, requiredContribution } from "@/domain/goals";
import { simulateIncomeShock, spendingChanges } from "@/domain/insights";
import { formatMoney, type Cents } from "@/domain/money";
import { projectCashFlow } from "@/domain/cashflow";
import { listAlerts } from "../services/alerts";
import { spendingByCategory } from "../services/budgets";
import { listCategories, type CategoryRow } from "../services/categories";
import type { ServiceContext } from "../services/context";
import { getEmergencyOverview } from "../services/emergency";
import { goalAllocationPlan, listGoals } from "../services/goals";
import { activeMemory } from "../services/memory";
import { estimateMonthlyBasis } from "../services/planning";
import { getRetirementOverview } from "../services/retirement";
import { getFinancialSnapshot } from "../services/snapshot";
import { evaluateSpend } from "../services/spend";
import { listTransactions } from "../services/transactions";
import { listCardsOverview } from "../services/cards";

/**
 * Ferramentas de consulta usadas pelo assistente. Todas são SOMENTE LEITURA e chamam o
 * motor determinístico; a IA interpreta os resultados, mas nunca calcula nem grava dados.
 * Cada resultado informa a data de referência, fatos, estimativas, premissas e lacunas.
 */
export interface ToolOutput {
  tool: string;
  asOf: ISODate;
  period?: string;
  summary: string;
  facts: string[];
  estimates: string[];
  assumptions: string[];
  missing: string[];
  data?: unknown;
}

export interface FinancialTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  jsonSchema: Record<string, unknown>;
  run(ctx: ServiceContext, input: z.output<S>): Promise<ToolOutput>;
}

function tool<S extends z.ZodType>(t: FinancialTool<S>): FinancialTool<S> {
  return t;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

export function findCategory(categories: readonly CategoryRow[], name: string | null | undefined): CategoryRow | null {
  if (!name) return null;
  const n = norm(name);
  return (
    categories.find((c) => norm(c.name) === n) ??
    categories.find((c) => norm(c.name).startsWith(n) || n.startsWith(norm(c.name))) ??
    categories.find((c) => norm(c.name).includes(n)) ??
    null
  );
}

const empty = { type: "object", properties: {}, required: [], additionalProperties: false };

export const resumoFinanceiro = tool({
  name: "resumo_financeiro",
  description:
    "Retrato financeiro do mês: saldo disponível, valor reservado para metas, receitas e despesas (realizadas, previstas e estimadas), comparação com o mês anterior, contas a pagar, valores a receber, projeção de fechamento e qualidade dos dados.",
  schema: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).nullish() }),
  jsonSchema: {
    type: "object",
    properties: { mes: { type: ["string", "null"], description: "Mês no formato AAAA-MM. Nulo = mês atual." } },
    required: ["mes"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    const snap = await getFinancialSnapshot(ctx, input.mes ?? undefined);
    const m = snap.monthTotals;
    const p = snap.previousMonthTotals;
    const facts = [
      `Saldo nas contas disponíveis para gastos: ${formatMoney(snap.totals.availableCents)}.`,
      `Já reservado para metas dentro desse saldo: ${formatMoney(snap.totals.reservedForGoalsCents)}. Livre: ${formatMoney(snap.totals.freeCents)}.`,
      `Receitas realizadas em ${formatMonthKey(snap.month)}: ${formatMoney(m.realized.incomeCents)} (mês anterior: ${formatMoney(p.realized.incomeCents)}).`,
      `Despesas realizadas em ${formatMonthKey(snap.month)}: ${formatMoney(m.realized.expenseCents)} (mês anterior: ${formatMoney(p.realized.expenseCents)}).`,
      `Reserva de emergência (contas de reserva): ${formatMoney(snap.totals.reserveCents)}.`,
      `Aportes em metas no mês: ${formatMoney(snap.contributionsThisMonthCents)}.`,
    ];
    if (snap.payables.length) facts.push(`Contas a pagar até o fim do mês: ${formatMoney(snap.payables.reduce((s, x) => s + x.amountCents, 0))} em ${snap.payables.length} compromisso(s).`);
    const confirmedReceivables = snap.receivables.filter((r) => r.certainty === "confirmed").reduce((s, x) => s + x.amountCents, 0);
    const estimatedReceivables = snap.receivables.filter((r) => r.certainty === "estimated").reduce((s, x) => s + x.amountCents, 0);
    if (confirmedReceivables) facts.push(`A receber confirmado até o fim do mês: ${formatMoney(confirmedReceivables)}.`);
    const estimates: string[] = [];
    if (estimatedReceivables) estimates.push(`Receitas estimadas (não confirmadas) até o fim do mês: ${formatMoney(estimatedReceivables)}.`);
    if (snap.monthEnd) {
      estimates.push(`Projeção de saldo livre no fim do mês: ${formatMoney(snap.monthEnd.confirmedCents)} só com valores confirmados; ${formatMoney(snap.monthEnd.withEstimatedCents)} incluindo estimativas.`);
    }
    if (snap.overdue.length) facts.push(`${snap.overdue.length} lançamento(s) previsto(s) com data passada ainda não confirmado(s).`);
    return {
      tool: "resumo_financeiro",
      asOf: snap.asOf,
      period: snap.month,
      summary: `Resumo de ${formatMonthKey(snap.month)}`,
      facts,
      estimates,
      assumptions: ["Transferências entre contas próprias e pagamentos de fatura não contam como receita ou despesa.", "Compras no cartão contam como despesa na data da compra/parcela."],
      missing: snap.dataQuality.missing,
      data: { totals: snap.totals, monthTotals: m, previousMonthTotals: p, monthEnd: snap.monthEnd, lastDataUpdate: snap.dataQuality.lastDataUpdate },
    };
  },
});

export const possoGastar = tool({
  name: "posso_gastar",
  description:
    "Avalia se uma despesa cabe no planejamento: considera saldo livre, receitas confirmadas até o próximo recebimento, contas e faturas futuras, orçamento da categoria, aportes planejados, reserva e margem de segurança. Retorna veredito, valor máximo seguro e alternativas simuladas.",
  schema: z.object({
    valor_centavos: z.number().int().positive(),
    descricao: z.string().max(140).nullish(),
    categoria: z.string().max(60).nullish(),
    forma_pagamento: z.enum(["conta", "cartao"]).default("conta"),
    cartao: z.string().max(60).nullish(),
    parcelas: z.number().int().min(1).max(24).default(1),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      valor_centavos: { type: "integer", description: "Valor em centavos (R$ 600,00 = 60000)." },
      descricao: { type: ["string", "null"] },
      categoria: { type: ["string", "null"], description: "Nome da categoria de despesa, se souber (ex.: Lazer)." },
      forma_pagamento: { type: "string", enum: ["conta", "cartao"] },
      cartao: { type: ["string", "null"], description: "Nome do cartão quando a forma for cartão." },
      parcelas: { type: "integer" },
    },
    required: ["valor_centavos", "descricao", "categoria", "forma_pagamento", "cartao", "parcelas"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    const categories = await listCategories(ctx, { kind: "expense" });
    const cat = findCategory(categories, input.categoria);
    let cardId: string | undefined;
    const missing: string[] = [];
    if (input.forma_pagamento === "cartao") {
      const cards = await listCardsOverview(ctx);
      const card = (input.cartao ? cards.find((c) => norm(c.name).includes(norm(input.cartao!))) : undefined) ?? cards[0];
      if (card) cardId = card.id;
      else missing.push("Nenhum cartão cadastrado; a análise considerou pagamento pela conta.");
    }
    if (input.categoria && !cat) missing.push(`Não encontrei a categoria "${input.categoria}"; o orçamento por categoria não foi considerado.`);
    const r = await evaluateSpend(ctx, {
      amountCents: input.valor_centavos,
      description: input.descricao ?? undefined,
      categoryId: cat?.id,
      method: cardId ? "card" : "account",
      cardId,
      installments: input.parcelas,
    });
    const facts = [...r.facts, `Veredito: ${r.title}.`];
    if (r.after) facts.push(`Ponto mais baixo do saldo livre no período após a despesa: ${formatMoney(r.after.lowestBalanceCents)} em ${formatDateBR(r.after.lowestDate)}.`);
    facts.push(`Valor máximo que mantém compromissos, aportes, margem e orçamento: ${formatMoney(r.maxSafeAmountCents)}.`);
    if (r.affectedCommitments.length) facts.push(`Compromissos que ficariam descobertos: ${r.affectedCommitments.map((c) => `${c.label} (${formatDateBR(c.date)})`).join(", ")}.`);
    if (r.goalsAtRisk.length) facts.push(`Metas afetadas: ${r.goalsAtRisk.map((g) => `${g.name} (−${formatMoney(g.reductionCents)}${g.delayMonths ? `, atraso de ${g.delayMonths} mês(es)` : ""})`).join("; ")}.`);
    if (r.budget) facts.push(`Orçamento de ${r.budget.categoryName}: restariam ${formatMoney(r.budget.remainingAfterCents)} de ${formatMoney(r.budget.limitCents)}.`);
    const estimates = r.options.map((o) => `Simulação — ${o.label}: ${o.detail}`);
    return {
      tool: "posso_gastar",
      asOf: r.asOf,
      period: `${formatDateBR(r.horizon.start)} a ${formatDateBR(r.horizon.end)}`,
      summary: r.title,
      facts,
      estimates,
      assumptions: r.assumptions,
      missing: [...missing, ...r.caveats],
      data: r,
    };
  },
});

export const quantoPossoGastarHoje = tool({
  name: "quanto_posso_gastar_hoje",
  description:
    "Quanto dá para gastar hoje, sem categoria específica, mantendo contas e faturas até o próximo recebimento confirmado, aportes planejados das metas, reserva e margem de segurança. Use quando a pessoa não informar um valor.",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(ctx) {
    // Avalia uma despesa simbólica de R$ 0,01 só para obter o valor máximo seguro do período.
    const r = await evaluateSpend(ctx, { amountCents: 1, method: "account", installments: 1 });
    const facts = [`Valor máximo para gastar hoje mantendo compromissos, aportes e margem de segurança: ${formatMoney(r.maxSafeAmountCents)}.`, ...r.facts];
    facts.push(`Margem de segurança considerada: ${formatMoney(r.safetyMarginCents)}.`);
    if (r.before) facts.push(`Ponto mais baixo previsto do saldo livre até ${formatDateBR(r.horizon.end)}: ${formatMoney(r.before.lowestBalanceCents)} em ${formatDateBR(r.before.lowestDate)}.`);
    return {
      tool: "quanto_posso_gastar_hoje",
      asOf: r.asOf,
      period: `${formatDateBR(r.horizon.start)} a ${formatDateBR(r.horizon.end)}`,
      summary: `Até ${formatMoney(r.maxSafeAmountCents)} hoje`,
      facts,
      estimates: [],
      assumptions: r.assumptions,
      missing: r.caveats,
      data: { maxSafeAmountCents: r.maxSafeAmountCents, horizon: r.horizon, before: r.before, safetyMarginCents: r.safetyMarginCents },
    };
  },
});

export const gastoCategoria = tool({
  name: "quanto_posso_gastar_categoria",
  description: "Quanto ainda dá para gastar numa categoria até o fim do mês, combinando o orçamento da categoria com o caixa livre (compromissos, aportes e margem de segurança).",
  schema: z.object({ categoria: z.string().min(1).max(60) }),
  jsonSchema: {
    type: "object",
    properties: { categoria: { type: "string", description: "Nome da categoria (ex.: Lazer, Restaurantes)." } },
    required: ["categoria"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    const categories = await listCategories(ctx, { kind: "expense" });
    const cat = findCategory(categories, input.categoria);
    if (!cat) {
      return {
        tool: "quanto_posso_gastar_categoria",
        asOf: ctx.today,
        summary: "Categoria não encontrada",
        facts: [],
        estimates: [],
        assumptions: [],
        missing: [`Não encontrei a categoria "${input.categoria}". Categorias disponíveis: ${categories.filter((c) => !c.parentId).map((c) => c.name).join(", ")}.`],
      };
    }
    const r = await evaluateSpend(ctx, { amountCents: 1, categoryId: cat.id });
    const facts: string[] = [];
    const missing = [...r.caveats];
    if (r.budget) facts.push(`Orçamento de ${r.budget.categoryName} em ${formatMonthKey(monthKey(ctx.today))}: limite ${formatMoney(r.budget.limitCents)}, comprometido ${formatMoney(r.budget.committedCents)}, restam ${formatMoney(Math.max(0, r.budget.limitCents - r.budget.committedCents))}.`);
    else missing.push(`Não há orçamento definido para ${cat.name}; o limite considerado é apenas o caixa livre.`);
    facts.push(`Folga de caixa considerando compromissos, aportes e margem: ${formatMoney(r.before.freeToSpendCents)}.`);
    facts.push(`Valor que pode ser gasto com ${cat.name} com segurança: ${formatMoney(r.maxSafeAmountCents)}.`);
    return {
      tool: "quanto_posso_gastar_categoria",
      asOf: r.asOf,
      period: `até ${formatDateBR(r.horizon.end)}`,
      summary: `${cat.name}: até ${formatMoney(r.maxSafeAmountCents)}`,
      facts,
      estimates: [],
      assumptions: r.assumptions,
      missing,
      data: { categoryId: cat.id, maxSafeAmountCents: r.maxSafeAmountCents, budget: r.budget },
    };
  },
});

export const statusMetas = tool({
  name: "status_metas",
  description: "Situação de todas as metas: progresso, saldo, aporte necessário por mês, projeção de conclusão, risco de atraso e conflitos de priorização (sem usar o mesmo dinheiro duas vezes).",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const [goals, plan] = await Promise.all([listGoals(ctx), goalAllocationPlan(ctx)]);
    const own = goals.filter((g) => g.access === "owner" && g.goal.status !== "archived");
    const healthLabel: Record<string, string> = {
      completed: "concluída",
      paused: "pausada",
      overdue: "prazo vencido",
      insufficient_periods: "sem tempo hábil para aportes",
      on_track: "no prazo",
      at_risk: "em risco de atraso",
      not_started: "não iniciada",
      no_deadline: "sem prazo",
    };
    const facts = own.map((g) => {
      const d = g.diagnosis;
      const req = d.required.perPeriodCents !== null ? `aporte necessário ${formatMoney(d.required.perPeriodCents)}/mês` : d.required.explanation;
      return `${g.goal.name}: ${d.progressPct.toFixed(0)}% (${formatMoney(g.balances.balanceCents)} de ${formatMoney(g.goal.targetCents)}), ${healthLabel[d.health]}, ${req}${g.goal.targetDate ? `, prazo ${formatDateBR(g.goal.targetDate)}` : ""}.`;
    });
    const estimates = own
      .filter((g) => g.diagnosis.projection?.completionDate)
      .map((g) => `${g.goal.name}: conclusão projetada em ${formatDateBR(g.diagnosis.projection!.completionDate!)} com ${formatMoney(g.diagnosis.basisMonthlyCents)}/mês (${g.diagnosis.basis === "planned" ? "aporte planejado" : "média recente"}).`);
    if (plan.allocation.hasConflict) {
      estimates.push(`Conflito: a capacidade mensal estimada (${formatMoney(plan.capacityCents)}) não cobre todos os aportes necessários (${formatMoney(plan.allocation.totalRequiredCents)}).`);
      for (const alt of plan.allocation.alternatives) {
        if (alt.newCompletionDate) estimates.push(`Alternativa para ${alt.name}: com ${formatMoney(plan.allocation.allocations.find((a) => a.goalId === alt.goalId)!.allocatedCents)}/mês, concluiria por volta de ${formatDateBR(alt.newCompletionDate)}.`);
      }
    }
    const atRisk = own.filter((g) => ["at_risk", "overdue", "insufficient_periods"].includes(g.diagnosis.health));
    return {
      tool: "status_metas",
      asOf: ctx.today,
      summary: own.length ? `${own.length} meta(s), ${atRisk.length} com risco` : "Nenhuma meta cadastrada",
      facts: facts.length ? facts : ["Nenhuma meta cadastrada."],
      estimates,
      assumptions: ["Projeções usam o aporte planejado ou a média dos últimos 3 meses.", "Rendimentos informados nas metas são hipotéticos.", ...plan.capacityPremises],
      missing: [],
      data: {
        goals: own.map((g) => ({ id: g.goal.id, name: g.goal.name, health: g.diagnosis.health, progressPct: g.diagnosis.progressPct, requiredMonthlyCents: g.diagnosis.required.perPeriodCents, priority: g.goal.priority })),
        allocation: plan.allocation,
      },
    };
  },
});

/** Palavras da pergunta que indicam o tipo de meta ("viajar" -> travel). */
const GOAL_WORD_KIND: Array<[RegExp, string]> = [
  [/^via(g|j)/, "travel"],
  [/^(carro|moto|veiculo)/, "vehicle"],
  [/^(casa|apartamento|imovel|entrada)/, "home"],
  [/^casamento/, "wedding"],
  [/^(curso|faculdade|intercambio|pos|mba)/, "education"],
];

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Próxima ocorrência de um mês pelo nome ("março" -> 01/03 do próximo março). */
export function nextMonthStart(name: string, today: ISODate): ISODate | null {
  const idx = MONTHS.indexOf(norm(name));
  if (idx < 0) return null;
  const t = parts(today);
  const year = idx + 1 > t.month ? t.year : t.year + 1;
  return dateWithClampedDay(year, idx + 1, 1);
}

export const calcularAporte = tool({
  name: "calcular_aporte",
  description:
    "Calcula quanto guardar por mês para um objetivo. Use o nome de uma meta existente OU informe valor-alvo e data. Considera o calendário real de aportes e informa quando o prazo é insuficiente.",
  schema: z.object({
    meta: z.string().max(80).nullish(),
    valor_alvo_centavos: z.number().int().positive().nullish(),
    data_alvo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    ja_guardado_centavos: z.number().int().min(0).nullish(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      meta: { type: ["string", "null"], description: "Nome (ou parte do nome) de uma meta existente." },
      valor_alvo_centavos: { type: ["integer", "null"] },
      data_alvo: { type: ["string", "null"], description: "AAAA-MM-DD" },
      ja_guardado_centavos: { type: ["integer", "null"] },
    },
    required: ["meta", "valor_alvo_centavos", "data_alvo", "ja_guardado_centavos"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    const goals = (await listGoals(ctx)).filter((g) => g.access === "owner");
    const kindHint = input.meta ? GOAL_WORD_KIND.find(([re]) => re.test(norm(input.meta!)))?.[1] : undefined;
    const found = input.meta
      ? (goals.find((g) => norm(g.goal.name).includes(norm(input.meta!))) ?? (kindHint ? goals.find((g) => g.goal.kind === kindHint && g.goal.status === "active") : undefined))
      : undefined;
    const target = input.valor_alvo_centavos ?? found?.goal.targetCents ?? null;
    // "Viajar em março" com uma meta de viagem em março: vale a data cadastrada na meta.
    const sameMonth = !!found?.goal.targetDate && !!input.data_alvo && monthKey(found.goal.targetDate) === monthKey(input.data_alvo);
    const date = (sameMonth ? found!.goal.targetDate : input.data_alvo) ?? found?.goal.targetDate ?? null;
    const current = input.ja_guardado_centavos ?? found?.balances.balanceCents ?? 0;
    const missing: string[] = [];
    if (!target) missing.push("Valor-alvo do objetivo.");
    if (!date) missing.push("Data desejada.");
    if (!target || !date) {
      return {
        tool: "calcular_aporte",
        asOf: ctx.today,
        summary: "Faltam dados para calcular",
        facts: found ? [`Meta encontrada: ${found.goal.name}.`] : input.meta ? [`Não encontrei uma meta chamada "${input.meta}".`] : [],
        estimates: [],
        assumptions: [],
        missing,
      };
    }
    const day = found?.goal.contributionDay ?? 5;
    const r = requiredContribution({
      targetCents: target,
      currentCents: current,
      today: ctx.today,
      targetDate: date,
      contributionDay: day,
      annualReturnRate: found?.goal.expectedAnnualReturnBps ? found.goal.expectedAnnualReturnBps / 10000 : null,
    });
    const dates = contributionDates(ctx.today, date, day);
    const facts = [
      `Objetivo: ${formatMoney(target)} até ${formatDateBR(date)}${found ? ` (meta "${found.goal.name}")` : ""}.`,
      `Já guardado: ${formatMoney(current)}. Falta: ${formatMoney(r.remainingCents)}.`,
      `Aportes possíveis até o prazo (dia ${day} de cada mês): ${dates.length}.`,
    ];
    if (r.perPeriodCents !== null) facts.push(`Aporte necessário: ${formatMoney(r.perPeriodCents)} por mês.`);
    facts.push(r.explanation);
    return {
      tool: "calcular_aporte",
      asOf: ctx.today,
      period: `${formatDateBR(ctx.today)} a ${formatDateBR(date)}`,
      summary: r.perPeriodCents !== null ? `${formatMoney(r.perPeriodCents)} por mês` : r.explanation,
      facts,
      estimates: r.projectedYieldCents ? [`Rendimento projetado incluído: ${formatMoney(r.projectedYieldCents)} (hipotético).`] : [],
      assumptions: [
        "Divisão pelo número real de datas de aporte até o prazo.",
        input.data_alvo && !sameMonth ? "Data informada na pergunta (início do mês citado, para o dinheiro estar disponível antes)." : "Data da meta cadastrada.",
      ],
      missing,
      data: r,
    };
  },
});

export const aporteDoMes = tool({
  name: "aporte_do_mes",
  description: "Quanto falta aportar neste mês somando todas as metas ativas e a reserva de emergência, com o detalhe de cada uma.",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const [goals, emergency] = await Promise.all([listGoals(ctx), getEmergencyOverview(ctx)]);
    const facts: string[] = [];
    let total = 0;
    for (const g of goals.filter((x) => x.access === "owner" && x.goal.status === "active" && x.diagnosis.remainingCents > 0)) {
      const planned = g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents;
      if (!planned) continue;
      const left = Math.max(0, planned - g.diagnosis.contributedThisMonthCents);
      total += left;
      facts.push(`${g.goal.name}: ${formatMoney(left)} pendente(s) (plano de ${formatMoney(planned)}/mês, já aportado ${formatMoney(g.diagnosis.contributedThisMonthCents)}).`);
    }
    if (emergency.evaluation.recommendedContributionCents > 0) {
      facts.push(`Reserva de emergência: aporte recomendado de ${formatMoney(emergency.evaluation.recommendedContributionCents)} por mês.`);
      total += emergency.evaluation.recommendedContributionCents;
    }
    facts.unshift(`Total sugerido para aportar em ${formatMonthKey(monthKey(ctx.today))}: ${formatMoney(total)}.`);
    return {
      tool: "aporte_do_mes",
      asOf: ctx.today,
      period: monthKey(ctx.today),
      summary: `Aportes do mês: ${formatMoney(total)}`,
      facts,
      estimates: [],
      assumptions: ["Usa o aporte planejado de cada meta ou o aporte necessário para cumprir o prazo.", "Aportes de reserva não contam como gasto: é dinheiro guardado."],
      missing: goals.length === 0 ? ["Nenhuma meta cadastrada."] : [],
    };
  },
});

export const simularQuedaRenda = tool({
  name: "simular_queda_renda",
  description: "Simula o orçamento mensal se a renda cair um percentual: nova sobra, quanto cortar e quantos meses a reserva cobriria.",
  schema: z.object({ percentual: z.number().min(1).max(100) }),
  jsonSchema: { type: "object", properties: { percentual: { type: "number", description: "Queda da renda em % (ex.: 20)." } }, required: ["percentual"], additionalProperties: false },
  async run(ctx, input) {
    const [basis, emergency, goals] = await Promise.all([estimateMonthlyBasis(ctx), getEmergencyOverview(ctx), listGoals(ctx)]);
    const planned = goals.filter((g) => g.access === "owner" && g.goal.status === "active").reduce((s, g) => s + (g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents ?? 0), 0);
    const missing: string[] = [];
    if (basis.incomeSource === "none") missing.push("Renda mensal: cadastre receitas recorrentes ou complete o briefing.");
    const r = simulateIncomeShock({
      monthlyIncomeCents: basis.incomeCents,
      essentialCents: basis.essentialCents,
      nonEssentialCents: basis.nonEssentialCents,
      plannedContributionsCents: planned,
      reserveCents: emergency.evaluation.currentCents,
      dropPct: input.percentual,
    });
    const facts = [
      `Renda mensal considerada: ${formatMoney(r.incomeBeforeCents)} → ${formatMoney(r.incomeAfterCents)} com queda de ${r.dropPct}%.`,
      `Despesas + aportes planejados: ${formatMoney(r.committedCents)} (essenciais ${formatMoney(basis.essentialCents)}, demais ${formatMoney(basis.nonEssentialCents)}, aportes ${formatMoney(planned)}).`,
      `Sobra mensal: ${formatMoney(r.marginBeforeCents)} hoje → ${formatMoney(r.marginAfterCents)} após a queda.`,
    ];
    if (r.cutNeededCents > 0) {
      facts.push(`Seria preciso cortar ${formatMoney(r.cutNeededCents)} por mês${r.coverableByNonEssential ? ", o que cabe reduzindo gastos não essenciais e aportes" : "; só cortes em não essenciais e aportes não bastam"}.`);
    }
    if (r.monthsReserveCovers !== null) facts.push(`Mesmo sem gastos não essenciais, faltaria dinheiro para o essencial; a reserva cobriria cerca de ${r.monthsReserveCovers} mês(es).`);
    return {
      tool: "simular_queda_renda",
      asOf: ctx.today,
      summary: `Queda de ${r.dropPct}%: sobra de ${formatMoney(r.marginAfterCents)}`,
      facts,
      estimates: ["Simulação hipotética: nenhum dado foi alterado."],
      assumptions: basis.premises,
      missing,
      data: r,
    };
  },
});

export const mudancasGastos = tool({
  name: "mudancas_gastos",
  description: "Compara os gastos por categoria do mês atual (ou informado) com o mês anterior e aponta o que aumentou ou diminuiu.",
  schema: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).nullish() }),
  jsonSchema: { type: "object", properties: { mes: { type: ["string", "null"] } }, required: ["mes"], additionalProperties: false },
  async run(ctx, input) {
    const month = input.mes ?? monthKey(ctx.today);
    const prev = addMonthsToKey(month, -1);
    const [cur, before, categories] = await Promise.all([spendingByCategory(ctx, month), spendingByCategory(ctx, prev), listCategories(ctx, { includeArchived: true })]);
    const top = new Map(categories.map((c) => [c.id, c.parentId ?? c.id]));
    const name = new Map(categories.map((c) => [c.id, c.name]));
    const roll = (m: Map<string, Cents>) => {
      const r = new Map<string, Cents>();
      for (const [k, v] of m) {
        const t = top.get(k) ?? k;
        r.set(t, (r.get(t) ?? 0) + v);
      }
      return [...r.entries()].map(([categoryId, amountCents]) => ({ categoryId, name: name.get(categoryId) ?? "Sem categoria", amountCents }));
    };
    const changes = spendingChanges(roll(cur.realized), roll(before.realized), 1000);
    const isCurrent = month === monthKey(ctx.today);
    const facts = changes.slice(0, 8).map((c) => {
      const dir = c.direction === "new" ? "novo gasto" : c.direction === "gone" ? "sem gastos neste mês" : c.direction === "up" ? "aumentou" : "diminuiu";
      return `${c.name}: ${formatMoney(c.previousCents)} → ${formatMoney(c.currentCents)} (${dir}${c.deltaPct !== null ? `, ${c.deltaPct > 0 ? "+" : ""}${c.deltaPct.toFixed(0)}%` : ""}).`;
    });
    return {
      tool: "mudancas_gastos",
      asOf: ctx.today,
      period: `${formatMonthKey(month)} vs ${formatMonthKey(prev)}`,
      summary: changes.length ? `${changes.filter((c) => c.direction === "up" || c.direction === "new").length} categoria(s) com aumento` : "Sem variações relevantes",
      facts: facts.length ? facts : ["Não houve variações relevantes (acima de R$ 10,00) entre os meses."],
      estimates: [],
      assumptions: isCurrent ? ["O mês atual ainda não terminou: a comparação usa os gastos realizados até hoje."] : [],
      missing: [],
      data: changes,
    };
  },
});

export const projecaoCaixa = tool({
  name: "projecao_caixa",
  description: "Projeção diária do saldo livre nas contas de gasto para os próximos dias: menor saldo, data de risco de saldo negativo e totais de entradas e saídas.",
  schema: z.object({ dias: z.number().int().min(7).max(120).default(30) }),
  jsonSchema: { type: "object", properties: { dias: { type: "integer", description: "Horizonte em dias (7 a 120)." } }, required: ["dias"], additionalProperties: false },
  async run(ctx, input) {
    const snap = await getFinancialSnapshot(ctx);
    const p = projectCashFlow({ startDate: ctx.today, endDate: addDays(ctx.today, input.dias), openingCents: snap.cash.freeCents, events: snap.cash.events });
    const facts = [
      `Saldo livre hoje: ${formatMoney(snap.cash.freeCents)}.`,
      `Entradas confirmadas nos próximos ${input.dias} dias: ${formatMoney(p.totals.confirmedInCents)}; saídas confirmadas (incl. aportes planejados): ${formatMoney(p.totals.confirmedOutCents)}.`,
      `Menor saldo projetado (confirmado): ${formatMoney(p.lowestConfirmed.balanceCents)} em ${formatDateBR(p.lowestConfirmed.date)}.`,
    ];
    if (p.firstNegativeConfirmed) facts.push(`Risco de saldo negativo a partir de ${formatDateBR(p.firstNegativeConfirmed)}.`);
    return {
      tool: "projecao_caixa",
      asOf: ctx.today,
      period: `${formatDateBR(ctx.today)} a ${formatDateBR(p.endDate)}`,
      summary: p.firstNegativeConfirmed ? `Saldo negativo previsto em ${formatDateBR(p.firstNegativeConfirmed)}` : "Sem saldo negativo previsto",
      facts,
      estimates: p.totals.estimatedInCents ? [`Receitas estimadas no período (não contadas na linha confirmada): ${formatMoney(p.totals.estimatedInCents)}.`] : [],
      assumptions: ["Inclui contas previstas, recorrências, faturas a vencer e aportes planejados.", "Despesas vencidas não confirmadas entram hoje; receitas vencidas não entram."],
      missing: snap.dataQuality.missing,
    };
  },
});

export const prioridades = tool({
  name: "prioridades",
  description: "Lista o que merece atenção agora: alertas ativos (com causa, impacto e ação), contas vencidas não confirmadas e próximos vencimentos.",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const [alerts, snap] = await Promise.all([listAlerts(ctx), getFinancialSnapshot(ctx)]);
    const facts = alerts.slice(0, 6).map((a) => `[${a.severity === "important" ? "Importante" : a.severity === "attention" ? "Atenção" : "Info"}] ${a.title} — ${a.cause} Ação: ${a.action}`);
    for (const o of snap.overdue.slice(0, 3)) facts.push(`Pendente de confirmação: ${o.label} (${formatDateBR(o.date)}, ${formatMoney(o.amountCents)}).`);
    const upcoming = snap.payables.filter((p) => p.date <= addDays(ctx.today, 7)).slice(0, 5);
    for (const u of upcoming) facts.push(`Vence em breve: ${u.label} em ${formatDateBR(u.date)} (${formatMoney(u.amountCents)}).`);
    return {
      tool: "prioridades",
      asOf: ctx.today,
      summary: facts.length ? `${facts.length} ponto(s) de atenção` : "Nada urgente",
      facts: facts.length ? facts : ["Nenhum alerta ativo e nenhum vencimento nos próximos 7 dias."],
      estimates: [],
      assumptions: ["Alertas são recalculados ao abrir o painel."],
      missing: snap.dataQuality.missing,
    };
  },
});

export const statusAposentadoria = tool({
  name: "status_aposentadoria",
  description: "Situação do plano de aposentadoria: capital necessário, patrimônio projetado (real e nominal), aporte necessário, cenários e premissas.",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const r = await getRetirementOverview(ctx);
    if (!r.result) {
      return { tool: "status_aposentadoria", asOf: ctx.today, summary: "Plano não calculado", facts: [], estimates: [], assumptions: [], missing: [r.error ?? "Monte o plano de aposentadoria.", ...r.missing] };
    }
    const x = r.result;
    return {
      tool: "status_aposentadoria",
      asOf: ctx.today,
      summary: x.onTrack ? "No caminho do objetivo" : "Abaixo do objetivo",
      facts: [
        r.saved ? `Plano salvo${r.updatedAt ? ` em ${formatDateBR(r.updatedAt.toISOString().slice(0, 10))}` : ""}.` : "Plano ainda não salvo: valores sugeridos a partir do perfil.",
        `Aposentadoria aos ${x.input.retirementAge} anos (hoje ${x.input.currentAge}), renda desejada ${formatMoney(x.input.desiredMonthlyIncomeCents)}/mês em valores de hoje.`,
        `Aporte atual: ${formatMoney(x.input.monthlyContributionCents)}/mês; aporte necessário: ${formatMoney(x.requiredMonthlyContributionRealCents)}/mês.`,
      ],
      estimates: [
        `Capital necessário: ${formatMoney(x.requiredCapitalRealCents)} em valores de hoje (≈ ${formatMoney(x.requiredCapitalNominalCents)} nominais na data).`,
        `Patrimônio projetado: ${formatMoney(x.projectedWealthRealCents)} em valores de hoje (≈ ${formatMoney(x.projectedWealthNominalCents)} nominais).`,
        ...x.scenarios.map((s) => `Cenário ${s.label} (${(s.annualNominalReturn * 100).toFixed(1)}% a.a. nominal): renda sustentável de ${formatMoney(s.sustainableMonthlyIncomeRealCents)}/mês.`),
      ],
      assumptions: x.assumptions,
      missing: [...r.missing, ...(r.needsReview ? ["O plano tem mais de 12 meses: revise as premissas."] : [])],
    };
  },
});

export const statusReserva = tool({
  name: "status_reserva",
  description: "Situação da reserva de emergência: valor atual, meta, cobertura em meses, aporte recomendado e prazo.",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const e = await getEmergencyOverview(ctx);
    const v = e.evaluation;
    const missing: string[] = [];
    if (v.status === "not_configured") missing.push("Despesas essenciais mensais (registre despesas ou informe no briefing).");
    if (e.reserveAccounts.length === 0) missing.push("Nenhuma conta marcada como reserva de emergência.");
    return {
      tool: "status_reserva",
      asOf: ctx.today,
      summary: `Reserva: ${v.progressPct.toFixed(0)}% da meta`,
      facts: [
        `Valor atual: ${formatMoney(v.currentCents)} (cobre ${v.coverageMonths} mês(es) de despesas essenciais de ${formatMoney(v.monthlyEssentialCents)}).`,
        `Meta: ${v.targetMonths} meses = ${formatMoney(v.targetCents)}. Falta: ${formatMoney(v.gapCents)}.`,
        v.recommendedContributionCents > 0 ? `Aporte recomendado: ${formatMoney(v.recommendedContributionCents)}/mês${v.completionDate ? `, concluindo por volta de ${formatDateBR(v.completionDate)}` : ""}.` : "Reserva completa ou sem aporte definido.",
      ],
      estimates: [],
      assumptions: [`Sugestão de cobertura: ${e.recommendation.months} meses. ${e.recommendation.reasons.join(" ")}`, "Só contas marcadas como reserva entram no valor atual."],
      missing,
    };
  },
});

export const buscarMovimentacoes = tool({
  name: "buscar_movimentacoes",
  description: "Busca movimentações por texto e/ou mês. Retorna no máximo 20, mais recentes primeiro.",
  schema: z.object({ texto: z.string().max(80).nullish(), mes: z.string().regex(/^\d{4}-\d{2}$/).nullish() }),
  jsonSchema: { type: "object", properties: { texto: { type: ["string", "null"] }, mes: { type: ["string", "null"] } }, required: ["texto", "mes"], additionalProperties: false },
  async run(ctx, input) {
    const rows = await listTransactions(ctx, { search: input.texto ?? undefined, month: input.mes ?? undefined, limit: 20 });
    const kind: Record<string, string> = { income: "receita", expense: "despesa", refund: "estorno", transfer: "transferência", card_payment: "pagamento de fatura" };
    const status: Record<string, string> = { realized: "realizado", scheduled: "previsto", estimated: "estimado" };
    return {
      tool: "buscar_movimentacoes",
      asOf: ctx.today,
      period: input.mes ?? undefined,
      summary: `${rows.length} movimentação(ões)`,
      facts: rows.map((t) => `${formatDateBR(t.date)} — ${t.description}: ${formatMoney(t.amountCents)} (${kind[t.kind]}, ${status[t.status]}).`),
      estimates: [],
      assumptions: [],
      missing: rows.length === 0 ? ["Nenhuma movimentação encontrada com esse filtro."] : [],
    };
  },
});

export const memoriaUsuario = tool({
  name: "memoria_usuario",
  description: "Preferências, objetivos e decisões registrados pelo usuário (declarados) e padrões confirmados. Use para personalizar a resposta, nunca como fonte de valores.",
  schema: z.object({}),
  jsonSchema: empty,
  async run(ctx) {
    const items = await activeMemory(ctx);
    return {
      tool: "memoria_usuario",
      asOf: ctx.today,
      summary: `${items.length} item(ns) de memória`,
      facts: items.map((i) => `${i.source === "declared" ? "Declarado" : "Inferido e confirmado"}: ${i.content}`),
      estimates: [],
      assumptions: [],
      missing: [],
    };
  },
});

export const ALL_TOOLS: FinancialTool[] = [
  resumoFinanceiro,
  possoGastar,
  quantoPossoGastarHoje,
  gastoCategoria,
  statusMetas,
  calcularAporte,
  aporteDoMes,
  simularQuedaRenda,
  mudancasGastos,
  projecaoCaixa,
  prioridades,
  statusAposentadoria,
  statusReserva,
  buscarMovimentacoes,
  memoriaUsuario,
] as FinancialTool[];

export async function runTool(ctx: ServiceContext, name: string, rawInput: unknown): Promise<ToolOutput> {
  const t = ALL_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`Ferramenta desconhecida: ${name}`);
  const parsed = t.schema.safeParse(rawInput ?? {});
  if (!parsed.success) throw new Error(`Parâmetros inválidos para ${name}: ${parsed.error.issues[0]?.message ?? "erro"}`);
  return t.run(ctx, parsed.data);
}

