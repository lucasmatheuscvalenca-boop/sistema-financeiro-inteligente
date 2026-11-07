import { merchantKey, prettyMerchant, type SubscriptionTx } from "./categorize";
import { addYears, diffDays, monthKey, type ISODate } from "./dates";
import type { Cents } from "./money";

/**
 * Despesas que vêm uma vez por ano (IPVA, IPTU, seguro, anuidade, assinatura anual, Natal) e
 * quanto separar por mês para elas não pegarem ninguém de surpresa.
 */

export interface AnnualCharge {
  key: string;
  name: string;
  amountCents: Cents;
  lastDate: ISODate;
  nextDate: ISODate;
  categoryId: string | null;
}

/**
 * Cobranças anuais no histórico: o mesmo estabelecimento cobrando com intervalo de 11 a 13 meses
 * (330 a 400 dias) e valor parecido (até 25% de diferença, por causa de reajustes).
 */
export function detectAnnualCharges(txs: readonly (SubscriptionTx & { categoryId?: string | null })[], today: ISODate): AnnualCharge[] {
  const groups = new Map<string, Array<SubscriptionTx & { categoryId?: string | null }>>();
  for (const t of txs) {
    if (t.amountCents <= 0) continue;
    const key = merchantKey(t.description);
    if (key) groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: AnnualCharge[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1]!;
    // Quem cobra todo mês não é anual: descarta se houver duas cobranças com menos de 300 dias entre si.
    let annual = false;
    let frequent = false;
    for (let i = 1; i < sorted.length; i++) {
      const gap = diffDays(sorted[i - 1]!.date, sorted[i]!.date);
      const a = sorted[i - 1]!.amountCents;
      const b = sorted[i]!.amountCents;
      if (gap < 300) frequent = true;
      if (gap >= 330 && gap <= 400 && Math.abs(a - b) <= Math.max(a, b) * 0.25) annual = true;
    }
    if (!annual || frequent) continue;
    // Ainda ativa: a última cobrança foi há no máximo 13 meses.
    if (diffDays(last.date, today) > 400) continue;
    out.push({ key, name: prettyMerchant(last.description), amountCents: last.amountCents, lastDate: last.date, nextDate: addYears(last.date, 1), categoryId: last.categoryId ?? null });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/** Meses inteiros para juntar antes do mês do vencimento (mínimo 1: vence neste mês, separa tudo agora). */
export function monthsToPrepare(today: ISODate, due: ISODate): number {
  const [ty, tm] = monthKey(today).split("-").map(Number) as [number, number];
  const [dy, dm] = monthKey(due).split("-").map(Number) as [number, number];
  return Math.max(1, (dy - ty) * 12 + (dm - tm));
}

export interface SetAsideItem {
  name: string;
  amountCents: Cents;
  nextDate: ISODate;
}

export type SetAsideLine<T extends SetAsideItem = SetAsideItem> = T & {
  months: number;
  /** Quanto separar por mês daqui até o vencimento. */
  monthlyCents: Cents;
  daysUntil: number;
};

export function setAsidePlan<T extends SetAsideItem>(items: readonly T[], today: ISODate): { lines: SetAsideLine<T>[]; monthlyCents: Cents; yearlyCents: Cents } {
  const lines = items
    .map((i) => {
      const months = monthsToPrepare(today, i.nextDate);
      return { ...i, months, monthlyCents: Math.ceil(i.amountCents / months), daysUntil: diffDays(today, i.nextDate) };
    })
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return { lines, monthlyCents: lines.reduce((s, l) => s + l.monthlyCents, 0), yearlyCents: lines.reduce((s, l) => s + l.amountCents, 0) };
}
