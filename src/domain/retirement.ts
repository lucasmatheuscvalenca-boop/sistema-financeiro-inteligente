import Decimal from "decimal.js";
import { DecimalMath, type Cents } from "./money";
import { formatDecimal } from "./text";

/**
 * Planejamento de aposentadoria em termos REAIS (poder de compra de hoje). Os valores
 * nominais são obtidos aplicando a inflação estimada. Todas as taxas são premissas
 * informadas pelo usuário; nada aqui é garantia de resultado.
 *
 * Fórmulas (taxa mensal real i):
 *   Patrimônio futuro  FV = W·(1+i)^n + C·((1+i)^n − 1)/i
 *   Capital necessário (consumo até a idade-horizonte) PV = R·(1 − (1+j)^−m)/j
 *   Capital necessário (viver de renda)               PV = R/j
 *   Aporte necessário  C* = (PV − W·(1+i)^n)·i/((1+i)^n − 1)
 */

export type RetirementMode = "consume" | "perpetuity";

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  /** Idade-horizonte do plano (até quando a renda deve durar). */
  lifeExpectancy: number;
  /** Renda mensal desejada em valores de hoje. */
  desiredMonthlyIncomeCents: Cents;
  /** Outras rendas na aposentadoria em valores de hoje (ex.: INSS, aluguéis). */
  otherMonthlyIncomeCents: Cents;
  currentWealthCents: Cents;
  /** Aporte mensal em valores de hoje (corrigido pela inflação ao longo do tempo). */
  monthlyContributionCents: Cents;
  annualInflation: number;
  annualNominalReturn: number;
  /** Retorno nominal na fase de usufruto (padrão: o mesmo da acumulação − 1 p.p.). */
  annualNominalReturnRetirement?: number | null;
  /** Margem de segurança sobre a renda desejada (ex.: 0.1 = +10%). */
  safetyMarginPct: number;
  mode?: RetirementMode;
}

export class RetirementError extends Error {}

export function validateRetirementInput(input: RetirementInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.currentAge) || input.currentAge < 14 || input.currentAge > 100) errors.push("Idade atual inválida.");
  if (input.retirementAge <= input.currentAge) errors.push("A idade de aposentadoria precisa ser maior que a idade atual.");
  if (input.retirementAge > 100) errors.push("Idade de aposentadoria acima de 100 anos.");
  if (input.lifeExpectancy <= input.retirementAge) errors.push("A idade-horizonte precisa ser maior que a idade de aposentadoria.");
  if (input.lifeExpectancy > 120) errors.push("Idade-horizonte acima de 120 anos.");
  for (const [label, v] of [
    ["Inflação", input.annualInflation],
    ["Retorno", input.annualNominalReturn],
  ] as const) {
    if (!Number.isFinite(v) || v <= -0.5 || v > 1) errors.push(`${label} fora do intervalo aceito (−50% a 100% ao ano).`);
  }
  if (input.safetyMarginPct < 0 || input.safetyMarginPct > 1) errors.push("Margem de segurança deve estar entre 0% e 100%.");
  if (input.desiredMonthlyIncomeCents <= 0) errors.push("Informe a renda mensal desejada.");
  if (input.currentWealthCents < 0 || input.monthlyContributionCents < 0 || input.otherMonthlyIncomeCents < 0) {
    errors.push("Valores não podem ser negativos.");
  }
  return errors;
}

export function realAnnualRate(nominal: Decimal.Value, inflation: Decimal.Value): Decimal {
  return new DecimalMath(nominal).plus(1).div(new DecimalMath(inflation).plus(1)).minus(1);
}

function monthly(annual: Decimal): Decimal {
  return annual.plus(1).pow(new DecimalMath(1).div(12)).minus(1);
}

function fvLump(pv: Decimal.Value, i: Decimal, n: number): Decimal {
  return new DecimalMath(pv).mul(i.plus(1).pow(n));
}

function fvAnnuity(pmt: Decimal.Value, i: Decimal, n: number): Decimal {
  if (i.isZero()) return new DecimalMath(pmt).mul(n);
  return new DecimalMath(pmt).mul(i.plus(1).pow(n).minus(1).div(i));
}

function pvAnnuity(pmt: Decimal.Value, j: Decimal, m: number): Decimal {
  if (j.isZero()) return new DecimalMath(pmt).mul(m);
  return new DecimalMath(pmt).mul(new DecimalMath(1).minus(j.plus(1).pow(-m)).div(j));
}

function pmtFromPv(pv: Decimal.Value, j: Decimal, m: number): Decimal {
  if (m <= 0) return new DecimalMath(0);
  if (j.isZero()) return new DecimalMath(pv).div(m);
  return new DecimalMath(pv).mul(j).div(new DecimalMath(1).minus(j.plus(1).pow(-m)));
}

function toCents(d: Decimal): Cents {
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

export interface RetirementCore {
  realReturnAccumulation: number;
  realReturnRetirement: number;
  monthsToRetirement: number;
  monthsInRetirement: number;
  /** Renda mensal que precisa vir do patrimônio (desejada + margem − outras rendas). */
  monthlyNeedRealCents: Cents;
  requiredCapitalRealCents: Cents;
  projectedWealthRealCents: Cents;
  gapRealCents: Cents;
  requiredMonthlyContributionRealCents: Cents;
  sustainableMonthlyIncomeRealCents: Cents;
  onTrack: boolean;
  inflationFactorAtRetirement: number;
  modeUsed: RetirementMode;
}

function core(input: RetirementInput): RetirementCore {
  const rA = realAnnualRate(input.annualNominalReturn, input.annualInflation);
  const nominalRet = input.annualNominalReturnRetirement ?? input.annualNominalReturn - 0.01;
  const rR = realAnnualRate(nominalRet, input.annualInflation);
  const i = monthly(rA);
  const j = monthly(rR);
  const n = Math.round((input.retirementAge - input.currentAge) * 12);
  const m = Math.round((input.lifeExpectancy - input.retirementAge) * 12);
  const need = Decimal.max(
    0,
    new DecimalMath(input.desiredMonthlyIncomeCents).mul(1 + input.safetyMarginPct).minus(input.otherMonthlyIncomeCents),
  );
  let mode: RetirementMode = input.mode ?? "consume";
  if (mode === "perpetuity" && j.lte(0)) mode = "consume";
  const required = mode === "perpetuity" ? need.div(j) : pvAnnuity(need, j, m);
  const projected = fvLump(input.currentWealthCents, i, n).plus(fvAnnuity(input.monthlyContributionCents, i, n));
  const growth = fvLump(input.currentWealthCents, i, n);
  const factor = fvAnnuity(1, i, n);
  const requiredContribution = Decimal.max(0, required.minus(growth).div(factor));
  const sustainable =
    (mode === "perpetuity" ? projected.mul(j) : pmtFromPv(projected, j, m)).plus(input.otherMonthlyIncomeCents);
  const inflationFactor = new DecimalMath(1 + input.annualInflation).pow(input.retirementAge - input.currentAge);
  return {
    realReturnAccumulation: rA.toDecimalPlaces(6).toNumber(),
    realReturnRetirement: rR.toDecimalPlaces(6).toNumber(),
    monthsToRetirement: n,
    monthsInRetirement: m,
    monthlyNeedRealCents: toCents(need),
    requiredCapitalRealCents: toCents(required),
    projectedWealthRealCents: toCents(projected),
    gapRealCents: toCents(required.minus(projected)),
    requiredMonthlyContributionRealCents: toCents(requiredContribution.toDecimalPlaces(0, Decimal.ROUND_UP)),
    sustainableMonthlyIncomeRealCents: toCents(sustainable),
    onTrack: projected.gte(required),
    inflationFactorAtRetirement: inflationFactor.toDecimalPlaces(6).toNumber(),
    modeUsed: mode,
  };
}

export interface RetirementYearPoint {
  age: number;
  phase: "accumulation" | "retirement";
  wealthRealCents: Cents;
  wealthNominalCents: Cents;
}

export interface RetirementScenario {
  key: "conservative" | "base" | "optimistic";
  label: string;
  annualNominalReturn: number;
  realReturn: number;
  projectedWealthRealCents: Cents;
  sustainableMonthlyIncomeRealCents: Cents;
  requiredMonthlyContributionRealCents: Cents;
  onTrack: boolean;
}

export interface RetirementPlanResult extends RetirementCore {
  input: RetirementInput;
  requiredCapitalNominalCents: Cents;
  projectedWealthNominalCents: Cents;
  /** Idade em que o patrimônio se esgota com as retiradas planejadas (null = não se esgota no horizonte). */
  depletionAge: number | null;
  series: RetirementYearPoint[];
  scenarios: RetirementScenario[];
  sensitivity: Array<{ label: string; projectedWealthRealCents: Cents; requiredMonthlyContributionRealCents: Cents; deltaContributionCents: Cents }>;
  costOfWaiting: Array<{ delayYears: number; requiredMonthlyContributionRealCents: Cents }>;
  assumptions: string[];
  warnings: string[];
}

function series(input: RetirementInput, c: RetirementCore): { points: RetirementYearPoint[]; depletionAge: number | null } {
  const i = monthly(new DecimalMath(c.realReturnAccumulation));
  const j = monthly(new DecimalMath(c.realReturnRetirement));
  const points: RetirementYearPoint[] = [];
  let wealth = new DecimalMath(input.currentWealthCents);
  let depletionAge: number | null = null;
  const totalYears = Math.ceil(input.lifeExpectancy - input.currentAge);
  const inflation = new DecimalMath(1 + input.annualInflation);
  for (let y = 0; y <= totalYears; y++) {
    const age = input.currentAge + y;
    const retired = age >= input.retirementAge;
    points.push({
      age,
      phase: retired ? "retirement" : "accumulation",
      wealthRealCents: toCents(Decimal.max(0, wealth)),
      wealthNominalCents: toCents(Decimal.max(0, wealth).mul(inflation.pow(y))),
    });
    if (y === totalYears) break;
    for (let mth = 0; mth < 12; mth++) {
      const monthAge = age + mth / 12;
      if (monthAge < input.retirementAge) {
        wealth = wealth.mul(i.plus(1)).plus(input.monthlyContributionCents);
      } else {
        wealth = wealth.mul(j.plus(1)).minus(c.monthlyNeedRealCents);
        if (wealth.lte(0) && depletionAge === null) depletionAge = Math.floor(monthAge);
      }
    }
  }
  return { points, depletionAge };
}

export function planRetirement(input: RetirementInput): RetirementPlanResult {
  const errors = validateRetirementInput(input);
  if (errors.length > 0) throw new RetirementError(errors.join(" "));
  const base = core(input);
  const nominalFactor = new DecimalMath(base.inflationFactorAtRetirement);
  const { points, depletionAge } = series(input, base);

  const scenarioDefs: Array<[RetirementScenario["key"], string, number]> = [
    ["conservative", "Conservador", input.annualNominalReturn - 0.02],
    ["base", "Intermediário", input.annualNominalReturn],
    ["optimistic", "Otimista", input.annualNominalReturn + 0.02],
  ];
  const scenarios = scenarioDefs.map<RetirementScenario>(([key, label, nominal]) => {
    const r = core({ ...input, annualNominalReturn: nominal, annualNominalReturnRetirement: input.annualNominalReturnRetirement != null ? input.annualNominalReturnRetirement + (nominal - input.annualNominalReturn) : null });
    return {
      key,
      label,
      annualNominalReturn: nominal,
      realReturn: r.realReturnAccumulation,
      projectedWealthRealCents: r.projectedWealthRealCents,
      sustainableMonthlyIncomeRealCents: r.sustainableMonthlyIncomeRealCents,
      requiredMonthlyContributionRealCents: r.requiredMonthlyContributionRealCents,
      onTrack: r.onTrack,
    };
  });

  const variants: Array<[string, Partial<RetirementInput>]> = [
    ["Retorno 1 p.p. menor", { annualNominalReturn: input.annualNominalReturn - 0.01 }],
    ["Retorno 1 p.p. maior", { annualNominalReturn: input.annualNominalReturn + 0.01 }],
    ["Inflação 1 p.p. maior", { annualInflation: input.annualInflation + 0.01 }],
    ["Aposentar 3 anos depois", { retirementAge: input.retirementAge + 3 }],
    ["Aportar 20% a mais", { monthlyContributionCents: Math.round(input.monthlyContributionCents * 1.2) }],
  ];
  if (input.retirementAge - 3 > input.currentAge) variants.splice(3, 0, ["Aposentar 3 anos antes", { retirementAge: input.retirementAge - 3 }]);
  const sensitivity = variants
    .filter(([, v]) => validateRetirementInput({ ...input, ...v }).length === 0)
    .map(([label, v]) => {
      const r = core({ ...input, ...v });
      return {
        label,
        projectedWealthRealCents: r.projectedWealthRealCents,
        requiredMonthlyContributionRealCents: r.requiredMonthlyContributionRealCents,
        deltaContributionCents: r.requiredMonthlyContributionRealCents - base.requiredMonthlyContributionRealCents,
      };
    });

  const costOfWaiting = [1, 3, 5]
    .filter((d) => input.currentAge + d < input.retirementAge)
    .map((delayYears) => {
      // Durante a espera o patrimônio atual rende, mas não há aportes.
      const grown = toCents(fvLump(input.currentWealthCents, monthly(new DecimalMath(base.realReturnAccumulation)), delayYears * 12));
      const r = core({ ...input, currentAge: input.currentAge + delayYears, currentWealthCents: grown });
      return { delayYears, requiredMonthlyContributionRealCents: r.requiredMonthlyContributionRealCents };
    });

  const warnings: string[] = [];
  if (base.realReturnAccumulation > 0.08) warnings.push("O retorno real acima de 8% ao ano é uma premissa otimista para horizontes longos.");
  if (base.realReturnAccumulation <= 0) warnings.push("Com retorno real zero ou negativo, o patrimônio perde poder de compra.");
  if (input.mode === "perpetuity" && base.modeUsed === "consume") {
    warnings.push("Com retorno real não positivo não é possível viver só de renda; o cálculo usou consumo do capital.");
  }
  if (depletionAge !== null && depletionAge < input.lifeExpectancy) {
    warnings.push(`Com o plano atual, o patrimônio se esgotaria por volta dos ${depletionAge} anos.`);
  }

  const assumptions = [
    `Inflação estimada de ${formatDecimal(input.annualInflation * 100, 2)}% ao ano.`,
    `Retorno nominal de ${formatDecimal(input.annualNominalReturn * 100, 2)}% ao ano na acumulação (real de ${formatDecimal(base.realReturnAccumulation * 100, 2)}%).`,
    `Retorno real de ${formatDecimal(base.realReturnRetirement * 100, 2)}% ao ano durante a aposentadoria.`,
    "Aportes corrigidos pela inflação todos os anos (valores em poder de compra de hoje).",
    `Margem de segurança de ${(input.safetyMarginPct * 100).toFixed(0)}% sobre a renda desejada.`,
    base.modeUsed === "perpetuity"
      ? "Modo viver de renda: o capital é preservado."
      : `Modo consumo: o capital é usado até os ${input.lifeExpectancy} anos.`,
    "Impostos, taxas e variações de mercado não foram modelados. Projeções não são garantias.",
  ];

  return {
    ...base,
    input,
    requiredCapitalNominalCents: toCents(new DecimalMath(base.requiredCapitalRealCents).mul(nominalFactor)),
    projectedWealthNominalCents: toCents(new DecimalMath(base.projectedWealthRealCents).mul(nominalFactor)),
    depletionAge,
    series: points,
    scenarios,
    sensitivity,
    costOfWaiting,
    assumptions,
    warnings,
  };
}
