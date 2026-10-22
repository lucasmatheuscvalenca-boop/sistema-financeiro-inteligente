import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { recommendedReserveMonths, type EmploymentStatus, type IncomeStability } from "@/domain/emergency";
import { percentOf, formatMoney, type Cents } from "@/domain/money";
import * as s from "../db/schema";
import { ValidationError } from "../errors";
import type { ServiceContext } from "./context";
import { parse } from "./common";

export const BRIEFING_SECTIONS = ["personal", "financial", "life"] as const;
export type BriefingSection = (typeof BRIEFING_SECTIONS)[number];

const money = z.number().int().min(0).max(100_000_000_000_00).nullish();
const text = (max = 500) => z.string().trim().max(max).nullish();

export const EMPLOYMENT_OPTIONS = ["clt", "public_servant", "self_employed", "business_owner", "freelancer", "unemployed", "retired", "student", "other"] as const;
export const EMPLOYMENT_LABEL: Record<(typeof EMPLOYMENT_OPTIONS)[number], string> = {
  clt: "Empregado(a) CLT",
  public_servant: "Servidor(a) público(a)",
  self_employed: "Autônomo(a)",
  business_owner: "Empresário(a)",
  freelancer: "Freelancer / PJ",
  unemployed: "Sem renda ativa no momento",
  retired: "Aposentado(a)",
  student: "Estudante",
  other: "Outro",
};
export const PRIORITY_OPTIONS = ["seguranca", "qualidade_de_vida", "patrimonio", "experiencias", "familia", "carreira", "independencia"] as const;
export const PRIORITY_LABEL: Record<(typeof PRIORITY_OPTIONS)[number], string> = {
  seguranca: "Segurança financeira",
  qualidade_de_vida: "Qualidade de vida",
  patrimonio: "Construir patrimônio",
  experiencias: "Viagens e experiências",
  familia: "Família",
  carreira: "Carreira e formação",
  independencia: "Independência financeira",
};

export const sectionSchemas = {
  personal: z.object({
    preferredName: text(60),
    birthYear: z.coerce.number().int().min(1900).max(2015).nullish(),
    ageRange: z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]).nullish(),
    country: z.string().trim().length(2).nullish(),
    currency: z.enum(["BRL", "USD", "EUR"]).nullish(),
    employmentStatus: z.enum(EMPLOYMENT_OPTIONS).nullish(),
    incomeType: z.enum(["fixed", "variable", "mixed"]).nullish(),
    household: z.enum(["single", "couple", "family", "shared", "other"]).nullish(),
    dependents: z.coerce.number().int().min(0).max(20).nullish(),
    personalGoals: text(),
    professionalGoals: text(),
  }),
  financial: z.object({
    monthlyNetIncomeCents: money,
    incomeSources: text(300),
    incomeFrequency: z.enum(["monthly", "biweekly", "weekly", "irregular"]).nullish(),
    essentialExpensesCents: money,
    variableExpensesCents: money,
    hasDebts: z.boolean().nullish(),
    debtsMonthlyCents: money,
    debtsTotalCents: money,
    bankAccountsCount: z.coerce.number().int().min(0).max(50).nullish(),
    creditCardsCount: z.coerce.number().int().min(0).max(50).nullish(),
    currentReserveCents: money,
    investmentsCents: money,
    otherAssetsCents: money,
    futureCommitments: text(),
  }),
  life: z.object({
    shortTermGoals: text(),
    mediumTermGoals: text(),
    longTermGoals: text(),
    desiredLifestyle: text(),
    plannedTrips: text(),
    plannedPurchases: text(),
    housing: z.enum(["own", "rent", "family", "financed", "other"]).nullish(),
    housingPlans: text(),
    education: text(),
    financialIndependence: z.boolean().nullish(),
    desiredRetirementAge: z.coerce.number().int().min(30).max(100).nullish(),
    desiredRetirementIncomeCents: money,
    priorities: z.array(z.enum(PRIORITY_OPTIONS)).max(7).nullish(),
    notes: text(1000),
  }),
} as const;

export type BriefingAnswers = {
  personal: z.output<(typeof sectionSchemas)["personal"]>;
  financial: z.output<(typeof sectionSchemas)["financial"]>;
  life: z.output<(typeof sectionSchemas)["life"]>;
};

export async function getBriefing(ctx: ServiceContext) {
  const rows = await ctx.db.select().from(s.briefingSections).where(eq(s.briefingSections.userId, ctx.userId));
  const answers: Partial<BriefingAnswers> = {};
  const completed: Record<BriefingSection, boolean> = { personal: false, financial: false, life: false };
  for (const r of rows) {
    const key = r.section as BriefingSection;
    (answers as Record<string, unknown>)[key] = r.answers;
    completed[key] = !!r.completedAt;
  }
  return { answers, completed };
}

/**
 * Salva uma etapa do briefing (parcial é permitido). Os campos estruturados alimentam o
 * perfil financeiro; objetivos declarados viram memória "declarada".
 */
export async function saveBriefingSection(ctx: ServiceContext, section: BriefingSection, raw: unknown, opts: { complete?: boolean } = {}): Promise<void> {
  if (!BRIEFING_SECTIONS.includes(section)) throw new ValidationError("Etapa inválida");
  const answers = parse(sectionSchemas[section], raw) as Record<string, unknown>;
  const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  await ctx.db
    .insert(s.briefingSections)
    .values({ userId: ctx.userId, section, answers: clean, completedAt: opts.complete ? new Date() : null })
    .onConflictDoUpdate({
      target: [s.briefingSections.userId, s.briefingSections.section],
      set: { answers: clean, ...(opts.complete ? { completedAt: new Date() } : {}) },
    });

  const profile: Partial<typeof s.financialProfiles.$inferInsert> = {};
  if (section === "personal") {
    const a = answers as BriefingAnswers["personal"];
    Object.assign(profile, {
      preferredName: a.preferredName ?? undefined,
      birthYear: a.birthYear ?? undefined,
      ageRange: a.ageRange ?? undefined,
      country: a.country ?? undefined,
      currency: a.currency ?? undefined,
      employmentStatus: a.employmentStatus ?? undefined,
      incomeType: a.incomeType ?? undefined,
      incomeStability: a.incomeType ? ({ fixed: "stable", variable: "variable", mixed: "mixed" } as const)[a.incomeType] : undefined,
      household: a.household ?? undefined,
      dependents: a.dependents ?? undefined,
    });
  } else if (section === "financial") {
    const a = answers as BriefingAnswers["financial"];
    Object.assign(profile, {
      monthlyNetIncomeCents: a.monthlyNetIncomeCents ?? undefined,
      incomeFrequency: a.incomeFrequency ?? undefined,
      essentialExpensesCents: a.essentialExpensesCents ?? undefined,
      variableExpensesCents: a.variableExpensesCents ?? undefined,
      hasDebts: a.hasDebts ?? undefined,
    });
  } else {
    const a = answers as BriefingAnswers["life"];
    Object.assign(profile, {
      desiredRetirementAge: a.desiredRetirementAge ?? undefined,
      desiredRetirementIncomeCents: a.desiredRetirementIncomeCents ?? undefined,
    });
    const goals: Array<[string, string | null | undefined]> = [
      ["Objetivo de curto prazo", a.shortTermGoals],
      ["Objetivo de médio prazo", a.mediumTermGoals],
      ["Objetivo de longo prazo", a.longTermGoals],
      ["Viagens planejadas", a.plannedTrips],
      ["Compras planejadas", a.plannedPurchases],
      ["Estilo de vida desejado", a.desiredLifestyle],
    ];
    for (const [label, value] of goals) {
      if (!value) continue;
      const content = `${label}: ${value}`.slice(0, 500);
      const [exists] = await ctx.db
        .select({ id: s.memoryItems.id })
        .from(s.memoryItems)
        .where(and(eq(s.memoryItems.userId, ctx.userId), eq(s.memoryItems.content, content)))
        .limit(1);
      if (!exists) {
        await ctx.db.insert(s.memoryItems).values({ userId: ctx.userId, kind: label.startsWith("Estilo") ? "preference" : "goal", content, source: "declared", status: "active", confirmedAt: new Date() });
      }
    }
  }
  const values = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length > 0) {
    await ctx.db.update(s.financialProfiles).set(values).where(eq(s.financialProfiles.userId, ctx.userId));
  }
}

export type IndicatorStatus = "good" | "attention" | "critical" | "unknown";

export interface Diagnosis {
  basedOn: "declared";
  indicators: Array<{ key: string; label: string; value: string; status: IndicatorStatus; explanation: string }>;
  marginCents: Cents | null;
  missing: string[];
  nextSteps: string[];
  assumptions: string[];
}

/**
 * Diagnóstico inicial a partir do que o usuário declarou no briefing. Não presume
 * valores ausentes: indicadores sem dado aparecem como "unknown" e entram na lista do que falta.
 */
export async function initialDiagnosis(ctx: ServiceContext): Promise<Diagnosis> {
  const { answers } = await getBriefing(ctx);
  const p = answers.personal ?? {};
  const f = answers.financial ?? {};
  const l = answers.life ?? {};
  const missing: string[] = [];
  const indicators: Diagnosis["indicators"] = [];
  const income = f.monthlyNetIncomeCents ?? null;
  const essential = f.essentialExpensesCents ?? null;
  const variable = f.variableExpensesCents ?? null;
  const debts = f.debtsMonthlyCents ?? (f.hasDebts === false ? 0 : null);
  if (income == null) missing.push("Renda líquida mensal");
  if (essential == null) missing.push("Despesas essenciais mensais");
  if (variable == null) missing.push("Despesas variáveis mensais");
  if (f.hasDebts == null) missing.push("Se você tem dívidas ou parcelas");
  if (f.currentReserveCents == null) missing.push("Valor da reserva disponível");
  if (!p.employmentStatus) missing.push("Situação profissional");
  if (!p.birthYear && !p.ageRange) missing.push("Idade ou faixa etária");
  if (!l.shortTermGoals && !l.mediumTermGoals && !l.longTermGoals) missing.push("Objetivos de curto, médio ou longo prazo");
  if (!l.desiredRetirementAge) missing.push("Idade desejada para aposentadoria");

  let margin: Cents | null = null;
  if (income != null && essential != null && variable != null) {
    margin = income - essential - variable - (debts ?? 0);
    const rate = income > 0 ? percentOf(margin, income) : 0;
    indicators.push({
      key: "margin",
      label: "Sobra mensal",
      value: `${formatMoney(margin)} (${rate.toFixed(0)}% da renda)`,
      status: margin < 0 ? "critical" : rate < 10 ? "attention" : "good",
      explanation:
        margin < 0
          ? "As despesas informadas superam a renda. O primeiro passo é equilibrar o mês."
          : rate < 10
            ? "A sobra existe, mas é pequena para formar reserva e metas no ritmo ideal."
            : "Há espaço para construir reserva e financiar metas.",
    });
  } else {
    indicators.push({ key: "margin", label: "Sobra mensal", value: "—", status: "unknown", explanation: "Informe renda e despesas para calcular." });
  }
  if (income != null && income > 0 && essential != null) {
    const share = percentOf(essential, income);
    indicators.push({
      key: "essential_share",
      label: "Peso das despesas essenciais",
      value: `${share.toFixed(0)}% da renda`,
      status: share > 70 ? "critical" : share > 55 ? "attention" : "good",
      explanation: "Quanto maior esse peso, menor a flexibilidade para imprevistos. É uma referência, não uma regra.",
    });
  }
  if (income != null && income > 0 && debts != null) {
    const share = percentOf(debts, income);
    indicators.push({
      key: "debt_share",
      label: "Comprometimento com dívidas",
      value: `${share.toFixed(0)}% da renda`,
      status: share > 30 ? "critical" : share > 15 ? "attention" : "good",
      explanation: "Parcelas acima de 30% da renda costumam apertar o orçamento.",
    });
  }
  const recommended = recommendedReserveMonths({
    employment: (p.employmentStatus as EmploymentStatus) ?? null,
    incomeStability: p.incomeType ? (({ fixed: "stable", variable: "variable", mixed: "mixed" } as const)[p.incomeType] as IncomeStability) : null,
    dependents: p.dependents ?? 0,
    hasDebts: f.hasDebts ?? false,
  });
  if (f.currentReserveCents != null && essential != null && essential > 0) {
    const coverage = f.currentReserveCents / essential;
    indicators.push({
      key: "reserve",
      label: "Cobertura da reserva",
      value: `${coverage.toFixed(1)} de ${recommended.months} meses sugeridos`,
      status: coverage >= recommended.months ? "good" : coverage >= 3 ? "attention" : "critical",
      explanation: recommended.reasons.join(" "),
    });
  } else {
    indicators.push({ key: "reserve", label: "Cobertura da reserva", value: "—", status: "unknown", explanation: "Informe a reserva disponível e as despesas essenciais." });
  }

  const nextSteps: string[] = [];
  if (margin != null && margin < 0) nextSteps.push("Registrar despesas por categoria e definir orçamentos para equilibrar o mês.");
  nextSteps.push("Cadastrar suas contas e cartões com os saldos atuais.");
  if (indicators.find((i) => i.key === "reserve")?.status !== "good") nextSteps.push("Configurar a reserva de emergência como primeira prioridade.");
  if (l.shortTermGoals || l.mediumTermGoals || l.plannedTrips || l.plannedPurchases) nextSteps.push("Transformar seus objetivos em metas com valor e prazo.");
  if (l.desiredRetirementAge) nextSteps.push("Montar o plano de aposentadoria com as premissas que você escolher.");
  if (missing.length > 0) nextSteps.push("Completar as informações que faltam no briefing (você pode voltar quando quiser).");

  return {
    basedOn: "declared",
    indicators,
    marginCents: margin,
    missing,
    nextSteps,
    assumptions: [
      "Este diagnóstico usa apenas os valores que você informou no briefing.",
      "Ao registrar movimentações reais, as análises passam a usar seus dados efetivos.",
    ],
  };
}
