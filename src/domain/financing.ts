import { DecimalMath, decimalToCents, type Cents } from "./money";

/**
 * Simulador de financiamento: compara financiar um bem (casa, carro) com juntar o dinheiro
 * antes, pagando por mês o mesmo valor da primeira parcela. Cálculo em Decimal, arredondado
 * para centavos só nas parcelas. Não inclui seguros (MIP/DFI), TR nem tarifas: por isso a taxa
 * pedida é o CET anual informado pelo banco, que já soma esses custos.
 */

export type AmortizationSystem = "price" | "sac";

export interface FinancingInput {
  /** Valor do bem hoje. */
  priceCents: Cents;
  /** Entrada que você já tem guardada. */
  downPaymentCents: Cents;
  /** CET anual do financiamento (0,12 = 12% ao ano). */
  annualRate: number;
  /** Prazo em meses. */
  months: number;
  system: AmortizationSystem;
  /** Rendimento anual líquido da aplicação enquanto junta (0,10 = 10% ao ano). */
  savingsAnnualRate: number;
  /** Quanto o preço do bem muda por ano enquanto você junta (0,04 = sobe 4%; negativo = cai). */
  assetAnnualChange: number;
  /** Custo mensal enquanto espera (aluguel, transporte), opcional. */
  waitingMonthlyCostCents?: Cents;
}

export interface FinancingYear {
  year: number;
  /** Saldo devedor no fim do ano. */
  balanceCents: Cents;
  /** Total pago no ano (parcelas). */
  paidCents: Cents;
}

export interface FinancingResult {
  financedCents: Cents;
  firstInstallmentCents: Cents;
  lastInstallmentCents: Cents;
  /** Soma das parcelas. */
  installmentsTotalCents: Cents;
  interestCents: Cents;
  /** Entrada + parcelas. */
  totalPaidCents: Cents;
  years: FinancingYear[];
}

export interface SavingResult {
  /** Depósito mensal considerado (igual à primeira parcela do financiamento). */
  monthlyDepositCents: Cents;
  /** Meses até ter o valor do bem; null se não chega em 50 anos. */
  months: number | null;
  /** Preço do bem no mês da compra (com a valorização informada). */
  priceAtPurchaseCents: Cents | null;
  /** Entrada + depósitos feitos até a compra. */
  depositedCents: Cents | null;
  /** Rendimento da aplicação até a compra. */
  earningsCents: Cents | null;
  /** Aluguel/transporte pago enquanto espera. */
  waitingCostCents: Cents | null;
}

export interface FinancingComparison {
  financing: FinancingResult;
  saving: SavingResult;
  /** Quanto sai mais barato juntar antes (positivo) ou financiar (negativo), já com o custo da espera. */
  differenceCents: Cents | null;
}

export class FinancingError extends Error {}

const MAX_WAIT_MONTHS = 600;

export function validateFinancingInput(input: FinancingInput): string[] {
  const errors: string[] = [];
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) errors.push("Informe o valor do bem.");
  if (!Number.isSafeInteger(input.downPaymentCents) || input.downPaymentCents < 0) errors.push("A entrada não pode ser negativa.");
  if (input.downPaymentCents >= input.priceCents) errors.push("A entrada já cobre o valor do bem: não há o que financiar.");
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 420) errors.push("O prazo vai de 1 a 420 meses (35 anos).");
  if (!(input.annualRate >= 0 && input.annualRate <= 1)) errors.push("A taxa do financiamento vai de 0% a 100% ao ano.");
  if (!(input.savingsAnnualRate >= 0 && input.savingsAnnualRate <= 1)) errors.push("O rendimento da aplicação vai de 0% a 100% ao ano.");
  if (!(input.assetAnnualChange >= -0.5 && input.assetAnnualChange <= 0.5)) errors.push("A variação do preço do bem vai de −50% a 50% ao ano.");
  if (input.waitingMonthlyCostCents != null && (!Number.isSafeInteger(input.waitingMonthlyCostCents) || input.waitingMonthlyCostCents < 0)) errors.push("O custo mensal da espera não pode ser negativo.");
  return errors;
}

/** Taxa mensal equivalente a uma taxa anual efetiva. */
export function monthlyRateFromAnnual(annual: number) {
  return new DecimalMath(1).plus(annual).pow(new DecimalMath(1).div(12)).minus(1);
}

/** Tabela de amortização resumida por ano (Price: parcelas iguais; SAC: amortização constante). */
export function amortize(principalCents: Cents, annualRate: number, months: number, system: AmortizationSystem): FinancingResult {
  const i = monthlyRateFromAnnual(annualRate);
  let balance = new DecimalMath(principalCents).div(100);
  const pmt = i.isZero() ? balance.div(months) : balance.mul(i).div(new DecimalMath(1).minus(new DecimalMath(1).plus(i).pow(-months)));
  const amortSac = balance.div(months);
  const years: FinancingYear[] = [];
  let paidYear = 0;
  let total = 0;
  let first = 0;
  let last = 0;
  for (let k = 1; k <= months; k++) {
    const interest = balance.mul(i);
    let amort = system === "price" ? pmt.minus(interest) : amortSac;
    // A última parcela zera o saldo (absorve as diferenças de arredondamento).
    if (k === months) amort = balance;
    const installmentCents = decimalToCents(amort.plus(interest));
    balance = balance.minus(amort);
    if (k === 1) first = installmentCents;
    last = installmentCents;
    total += installmentCents;
    paidYear += installmentCents;
    if (k % 12 === 0 || k === months) {
      years.push({ year: Math.ceil(k / 12), balanceCents: Math.max(0, decimalToCents(balance)), paidCents: paidYear });
      paidYear = 0;
    }
  }
  return {
    financedCents: principalCents,
    firstInstallmentCents: first,
    lastInstallmentCents: last,
    installmentsTotalCents: total,
    interestCents: total - principalCents,
    totalPaidCents: total,
    years,
  };
}

/** Quantos meses depositando `monthlyDeposit` até a aplicação alcançar o preço (que também muda). */
export function monthsToSave(input: FinancingInput, monthlyDepositCents: Cents): SavingResult {
  const i = monthlyRateFromAnnual(input.savingsAnnualRate);
  const g = monthlyRateFromAnnual(input.assetAnnualChange);
  const deposit = new DecimalMath(monthlyDepositCents).div(100);
  let saved = new DecimalMath(input.downPaymentCents).div(100);
  let price = new DecimalMath(input.priceCents).div(100);
  let deposited = saved;
  const waiting = input.waitingMonthlyCostCents ?? 0;
  for (let n = 1; n <= MAX_WAIT_MONTHS; n++) {
    saved = saved.mul(new DecimalMath(1).plus(i)).plus(deposit);
    deposited = deposited.plus(deposit);
    price = price.mul(new DecimalMath(1).plus(g));
    if (saved.gte(price)) {
      // O último depósito pode ser menor: só o que falta para fechar o preço.
      const excess = saved.minus(price);
      const depositedCents = decimalToCents(deposited.minus(DecimalMath.min(excess, deposit)));
      const priceCents = decimalToCents(price);
      return {
        monthlyDepositCents,
        months: n,
        priceAtPurchaseCents: priceCents,
        depositedCents,
        earningsCents: priceCents - depositedCents,
        waitingCostCents: waiting * n,
      };
    }
  }
  return { monthlyDepositCents, months: null, priceAtPurchaseCents: null, depositedCents: null, earningsCents: null, waitingCostCents: null };
}

export function compareFinancing(input: FinancingInput): FinancingComparison {
  const errors = validateFinancingInput(input);
  if (errors.length) throw new FinancingError(errors.join(" "));
  const amort = amortize(input.priceCents - input.downPaymentCents, input.annualRate, input.months, input.system);
  const financing = { ...amort, totalPaidCents: input.downPaymentCents + amort.installmentsTotalCents };
  const saving = monthsToSave(input, financing.firstInstallmentCents);
  const differenceCents = saving.depositedCents === null ? null : financing.totalPaidCents - (saving.depositedCents + (saving.waitingCostCents ?? 0));
  return { financing, saving, differenceCents };
}
