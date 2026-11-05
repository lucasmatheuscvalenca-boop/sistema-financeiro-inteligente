import { desc, eq } from "drizzle-orm";
import { projectCashFlow, type CashEvent } from "@/domain/cashflow";
import { addBusinessDays, endOfMonth, formatDateShort, monthKey, parts, weekdayName, type ISODate } from "@/domain/dates";
import type { HeroInsight } from "@/domain/daily-plan";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { categorizeUncategorized } from "./categorize";
import type { ServiceContext } from "./context";
import { getDashboard } from "./dashboard";
import { countUncategorized, getSpending, type SpendingOverview } from "./spending";
import { safetyMargin } from "./spend";

export interface CanSpend {
  cents: Cents;
  /** Até quando esse valor vale: o próximo recebimento confirmado ou o fim do mês. */
  untilDate: ISODate;
  untilLabel: string;
  /** O que já foi separado: compromissos até lá, margem e aportes. */
  reason: string;
  freeCents: Cents;
}

export interface UpcomingItem {
  date: ISODate;
  label: string;
  amountCents: Cents;
  kind: CashEvent["kind"];
  certainty: CashEvent["certainty"];
}

export interface Home {
  canSpend: CanSpend | null;
  spending: SpendingOverview;
  upcoming: UpcomingItem[];
  upcomingUntil: ISODate;
  tip: HeroInsight & { headlineTone: HeroInsight["tone"] };
  uncategorized: number;
  hasAccounts: boolean;
  /** Bancos conectados e última sincronização, para o "atualizado há 2 h". */
  banks: { connected: number; lastSyncAt: Date | null; stale: boolean };
  lastDataUpdate: ISODate | null;
}

/**
 * Início mínimo: um número (quanto pode gastar até o próximo recebimento), gastos do mês por
 * categoria, próximos sete dias úteis e uma dica calculada.
 */
export async function getHome(ctx: ServiceContext): Promise<Home> {
  // Lançamentos sem categoria (de extratos antigos ou do banco) ganham uma, uma vez por dia.
  await categorizeUncategorized(ctx);
  const month = monthKey(ctx.today);
  const [dash, spending, uncategorized, connections] = await Promise.all([
    getDashboard(ctx, month),
    getSpending(ctx, month),
    countUncategorized(ctx, month),
    ctx.db
      .select({ status: s.bankConnections.status, lastSyncAt: s.bankConnections.lastSyncAt, isDemo: s.bankConnections.isDemo })
      .from(s.bankConnections)
      .where(eq(s.bankConnections.userId, ctx.userId))
      .orderBy(desc(s.bankConnections.lastSyncAt)),
  ]);
  const { snap, hero } = dash;
  const cash = snap.cash;

  let canSpend: CanSpend | null = null;
  if (cash.hasSpendingAccounts) {
    const nextIncome = cash.events.find((e) => e.kind === "income" && e.certainty === "confirmed" && e.date > ctx.today);
    const untilDate = nextIncome ? nextIncome.date : endOfMonth(ctx.today);
    // Menor saldo confirmado até lá (já com os aportes planejados das metas), menos a margem de segurança.
    const projection = projectCashFlow({ startDate: ctx.today, endDate: untilDate, openingCents: cash.freeCents, events: cash.events, includeOptional: true });
    const margin = await safetyMargin(ctx);
    const committed = cash.events.filter((e) => e.date > ctx.today && e.date <= untilDate && e.amountCents < 0 && e.certainty === "confirmed").reduce((sum, e) => sum - e.amountCents, 0);
    const cents = Math.max(0, projection.lowestConfirmed.balanceCents - margin.cents);
    const { day } = parts(untilDate);
    canSpend = {
      cents,
      untilDate,
      untilLabel: nextIncome ? `até dia ${day} (${shortLabel(nextIncome.label)})` : "até o fim do mês",
      reason: committed > 0 ? "Já descontados os compromissos até lá, a margem de segurança e os aportes das metas." : "Sem compromissos até lá; margem de segurança e aportes das metas já separados.",
      freeCents: cash.freeCents,
    };
  }

  const upcomingUntil = addBusinessDays(ctx.today, 7);
  const upcoming: UpcomingItem[] = cash.events
    .filter((e) => e.date >= ctx.today && e.date <= upcomingUntil && !e.optional)
    .slice(0, 6)
    .map((e) => ({ date: e.date, label: e.label, amountCents: e.amountCents, kind: e.kind, certainty: e.certainty }));

  const real = connections.filter((c) => !c.isDemo && c.status !== "revoked");
  const lastSyncAt = real.find((c) => c.lastSyncAt)?.lastSyncAt ?? null;
  return {
    canSpend,
    spending,
    upcoming,
    upcomingUntil,
    tip: { ...hero, headlineTone: hero.tone },
    uncategorized,
    hasAccounts: snap.dataQuality.hasAccounts,
    banks: { connected: real.length, lastSyncAt, stale: snap.dataQuality.connectionStale },
    lastDataUpdate: snap.dataQuality.lastDataUpdate,
  };
}

/** "Salário (empresa XYZ)" → "salário"; "Comissão (média estimada)" → "comissão". */
function shortLabel(label: string): string {
  return label.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase().split(/\s+/).slice(0, 2).join(" ");
}

/** "quinta, 05/11" para a agenda. */
export function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return "hoje";
  const name = weekdayName(date).replace("-feira", "");
  return `${name}, ${formatDateShort(date)}`;
}
