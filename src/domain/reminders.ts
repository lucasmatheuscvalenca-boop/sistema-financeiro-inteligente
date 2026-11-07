import type { AlertCandidate } from "./alerts";
import { diffDays, formatDateBR, monthKey, type ISODate } from "./dates";
import { formatMoney, type Cents } from "./money";
import { plural } from "./text";

/**
 * Lembretes que não dependem de um problema: autorização do banco perto de vencer, fatura
 * fechando, despesa anual chegando, patrimônio desatualizado e o aporte no dia do salário.
 * Entram na mesma lista de avisos (e no mesmo limite diário) dos alertas financeiros.
 */

export interface ReminderInput {
  today: ISODate;
  consents?: ReadonlyArray<{ connectionId: string; bankName: string; expiresAt: ISODate }>;
  cardClosings?: ReadonlyArray<{ cardId: string; cardName: string; closingDate: ISODate }>;
  annualDue?: ReadonlyArray<{ key: string; name: string; amountCents: Cents; nextDate: ISODate; subscription: boolean }>;
  assets?: ReadonlyArray<{ valuedAt: ISODate }>;
  /** Receita que caiu nos últimos dias (o "dia do salário"). */
  incomeReceivedOn?: ISODate | null;
  goals?: ReadonlyArray<{ goalId: string; name: string; requiredPerPeriodCents: Cents | null; contributedThisMonthCents: Cents }>;
}

const when = (days: number) => (days <= 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`);

export function generateReminders(input: ReminderInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { today } = input;

  for (const c of input.consents ?? []) {
    const days = diffDays(today, c.expiresAt);
    if (days < 0 || days > 30) continue;
    out.push({
      type: "consent_expiring",
      severity: days <= 7 ? "important" : "attention",
      title: `A autorização do ${c.bankName} vence ${when(days)}`,
      cause: `O Open Finance pede para renovar a autorização a cada 12 meses. Ela vence em ${formatDateBR(c.expiresAt)}.`,
      impact: "Depois disso as movimentações desse banco param de chegar sozinhas.",
      action: "Renove a conexão em Conectar banco: leva um minuto, no app do banco.",
      href: "/conexoes",
      fingerprint: `consent:${c.connectionId}:${c.expiresAt}`,
    });
  }

  for (const c of input.cardClosings ?? []) {
    const days = diffDays(today, c.closingDate);
    if (days < 0 || days > 2) continue;
    out.push({
      type: "card_closing_soon",
      severity: "info",
      title: `A fatura do ${c.cardName} fecha ${when(days)}`,
      cause: `Compras a partir de ${formatDateBR(c.closingDate)} já entram na fatura seguinte.`,
      impact: "Se a compra pode esperar, deixá-la para o dia do fechamento dá quase 40 dias para pagar.",
      action: "Veja quanto das próximas faturas já está comprometido.",
      href: "/parcelas",
      fingerprint: `closing:${c.cardId}:${c.closingDate}`,
    });
  }

  for (const a of input.annualDue ?? []) {
    const days = diffDays(today, a.nextDate);
    if (days < 0 || days > 15) continue;
    out.push({
      type: "annual_due_soon",
      severity: "attention",
      title: a.subscription ? `${a.name} renova ${when(days)}` : `${a.name} vence ${when(days)}`,
      cause: `${formatMoney(a.amountCents)} em ${formatDateBR(a.nextDate)}, uma vez por ano.`,
      impact: a.subscription ? "Se não usa mais, cancele antes da renovação." : "Deixe o valor separado para o mês não apertar.",
      action: a.subscription ? "Confira no painel de assinaturas." : "Veja quanto separar em Despesas anuais.",
      href: a.subscription ? "/assinaturas" : "/despesas-anuais",
      fingerprint: `annual:${a.key}:${a.nextDate}`,
    });
  }

  if (input.assets && input.assets.length) {
    const newest = input.assets.map((a) => a.valuedAt).sort().at(-1)!;
    const days = diffDays(newest, today);
    if (days > 35) {
      out.push({
        type: "networth_update",
        severity: "info",
        title: "Hora de atualizar o patrimônio",
        cause: `Os valores de imóveis, veículos e investimentos foram atualizados há ${plural(days, "dia", "dias")}.`,
        impact: "Com valores antigos, o patrimônio e a evolução do ano ficam fora da realidade.",
        action: "Atualize os valores do mês: são poucos campos.",
        href: "/patrimonio",
        fingerprint: `networth:${monthKey(today)}`,
      });
    }
  }

  if (input.incomeReceivedOn && diffDays(input.incomeReceivedOn, today) <= 2) {
    for (const g of input.goals ?? []) {
      if (!g.requiredPerPeriodCents || g.contributedThisMonthCents >= g.requiredPerPeriodCents) continue;
      const missing = g.requiredPerPeriodCents - g.contributedThisMonthCents;
      out.push({
        type: "goal_payday",
        severity: "info",
        title: `O dinheiro entrou: hora de guardar para ${g.name}`,
        cause: `Faltam ${formatMoney(missing)} do aporte deste mês.`,
        impact: "Guardar logo que o salário cai evita que o dinheiro vá para outros gastos.",
        action: "Registre o aporte na meta.",
        href: `/metas/${g.goalId}`,
        fingerprint: `payday:${g.goalId}:${monthKey(today)}`,
      });
    }
  }

  return out;
}
