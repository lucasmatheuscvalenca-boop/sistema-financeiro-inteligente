import Decimal from "decimal.js";

/**
 * Valores monetários são sempre inteiros em centavos (unidade mínima da moeda).
 * Nunca usamos ponto flutuante para guardar ou somar dinheiro. Cálculos com juros
 * usam Decimal e só arredondam para centavos no resultado final.
 */
export type Cents = number;

export const DecimalMath = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export class MoneyError extends Error {}

export function assertCents(value: number, label = "valor"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} precisa ser um número inteiro de centavos`);
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return assertCents(total, "soma");
}

/** Converte um Decimal (em reais) para centavos com arredondamento bancário. */
export function decimalToCents(value: Decimal.Value, rounding: Decimal.Rounding = Decimal.ROUND_HALF_EVEN): Cents {
  const d = new DecimalMath(value).mul(100).toDecimalPlaces(0, rounding);
  return assertCents(d.toNumber());
}

export function centsToDecimal(cents: Cents): Decimal {
  return new DecimalMath(cents).div(100);
}

/** Centavos -> string decimal "1234.56" (útil para inputs e exportação). */
export function centsToDecimalString(cents: Cents): string {
  return centsToDecimal(cents).toFixed(2);
}

export type DecimalSeparator = "," | "." | "auto";

/**
 * Interpreta valores digitados ou importados:
 * "R$ 1.234,56", "-1.234,56", "1234,56", "1234.56", "1,234.56", "(12,30)".
 * Em modo "auto" com só pontos, "1.234" é tratado como milhar (padrão brasileiro).
 */
export function parseMoney(input: string | number, decimalSeparator: DecimalSeparator = "auto"): Cents {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyError("Valor inválido");
    return decimalToCents(new DecimalMath(input.toString()));
  }
  let s = input.trim();
  if (!s) throw new MoneyError("Valor vazio");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|BRL|\s/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) throw new MoneyError(`Valor inválido: "${input}"`);

  let sep: "," | "." | null = null;
  if (decimalSeparator !== "auto") {
    sep = decimalSeparator;
  } else {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) sep = lastComma > lastDot ? "," : ".";
    else if (lastComma >= 0) sep = ",";
    else if (lastDot >= 0) {
      const decimals = s.length - lastDot - 1;
      const dotCount = s.split(".").length - 1;
      sep = dotCount === 1 && decimals !== 3 ? "." : null;
    }
  }

  let normalized: string;
  if (sep === ",") normalized = s.replace(/\./g, "").replace(",", ".");
  else if (sep === ".") normalized = s.replace(/,/g, "");
  else normalized = s.replace(/[.,]/g, "");

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") {
    throw new MoneyError(`Valor inválido: "${input}"`);
  }
  const cents = decimalToCents(new DecimalMath(normalized));
  return negative ? -cents : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: Cents, currency = "BRL", locale = "pt-BR"): string {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency });
    formatters.set(key, f);
  }
  return f.format(centsToDecimal(cents).toNumber());
}

/**
 * Divide um total em N parcelas inteiras. A diferença de arredondamento fica na
 * primeira parcela (prática comum no varejo brasileiro): 100,00 / 3 = 33,34 + 33,33 + 33,33.
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  assertCents(total, "total");
  if (!Number.isInteger(parts) || parts < 1) throw new MoneyError("Número de parcelas inválido");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (i === 0 ? base + remainder : base));
}

/** Percentual (0–100+) com uma casa decimal; retorna 0 quando o total é zero. */
export function percentOf(part: Cents, whole: Cents): number {
  if (whole === 0) return 0;
  return new DecimalMath(part).div(whole).mul(100).toDecimalPlaces(1).toNumber();
}

/** Multiplica centavos por uma fração (ex.: 0.2 = 20%) arredondando para centavos. */
export function scaleCents(cents: Cents, factor: Decimal.Value, rounding: Decimal.Rounding = Decimal.ROUND_HALF_EVEN): Cents {
  return assertCents(new DecimalMath(cents).mul(factor).toDecimalPlaces(0, rounding).toNumber());
}

export function minCents(...values: Cents[]): Cents {
  return Math.min(...values);
}

export function maxCents(...values: Cents[]): Cents {
  return Math.max(...values);
}
