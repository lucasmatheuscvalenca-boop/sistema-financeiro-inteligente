import type { BudgetLineResult } from "./budget";
import { diffDays, formatDateBR, parts, type ISODate } from "./dates";
import type { ReserveEvaluation } from "./emergency";
import type { GoalHealth } from "./goals";
import { formatMoney, percentOf, type Cents } from "./money";

export type AlertSeverity = "info" | "attention" | "important";

export type AlertType =
  | "negative_balance_risk"
  | "bill_due_soon"
  | "invoice_due_soon"
  | "budget_warning"
  | "budget_exceeded"
  | "budget_projected_exceed"
  | "unusual_spending"
  | "goal_at_risk"
  | "goal_overdue"
  | "contribution_missed"
  | "recurring_increase"
  | "reserve_below_minimum"
  | "review_premises"
  | "stale_data";

export interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  /** Causa: o que aconteceu. */
  cause: string;
  /** Impacto potencial. */
  impact: string;
  /** Ação sugerida. */
  action: string;
  href: string;
  /** Identificador estável para não repetir o mesmo alerta. */
  fingerprint: string;
  data?: Record<string, unknown>;
}

export interface AlertSnapshot {
  today: ISODate;
  availableCents: Cents;
  cashFlow?: { firstNegativeConfirmed: ISODate | null; lowestBalanceCents: Cents; lowestDate: ISODate } | null;
  budgetLines?: readonly BudgetLineResult[];
  categorySpending?: ReadonlyArray<{ categoryId: string; name: string; currentCents: Cents; averageCents: Cents }>;
  goals?: ReadonlyArray<{
    goalId: string;
    name: string;
    health: GoalHealth;
    requiredPerPeriodCents: Cents | null;
    contributedThisMonthCents: Cents;
    contributionDay: number;
  }>;
  recurringChanges?: ReadonlyArray<{ id: string; name: string; previousCents: Cents; currentCents: Cents }>;
  reserve?: ReserveEvaluation | null;
  upcomingBills?: ReadonlyArray<{ id: string; date: ISODate; label: string; amountCents: Cents }>;
  invoices?: ReadonlyArray<{ id: string; cardName: string; dueDate: ISODate; outstandingCents: Cents }>;
  retirementPlanUpdatedAt?: ISODate | null;
  lastDataUpdate?: ISODate | null;
  staleConnections?: ReadonlyArray<{ id: string; name: string; lastSyncAt: ISODate | null }>;
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { important: 0, attention: 1, info: 2 };

export function generateAlerts(s: AlertSnapshot): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const month = s.today.slice(0, 7);

  if (s.cashFlow?.firstNegativeConfirmed) {
    out.push({
      type: "negative_balance_risk",
      severity: "important",
      title: "Risco de saldo negativo",
      cause: `Com os compromissos registrados, o saldo das contas disponíveis fica negativo em ${formatDateBR(s.cashFlow.firstNegativeConfirmed)}.`,
      impact: `O ponto mais baixo projetado é ${formatMoney(s.cashFlow.lowestBalanceCents)} em ${formatDateBR(s.cashFlow.lowestDate)}, o que pode gerar juros de cheque especial ou contas em atraso.`,
      action: "Revise despesas não essenciais, adie compras ou antecipe recebimentos antes dessa data.",
      href: "/fluxo-de-caixa",
      fingerprint: `negative_balance_risk:${s.cashFlow.firstNegativeConfirmed}`,
    });
  }

  let billsTotal = 0;
  for (const bill of s.upcomingBills ?? []) {
    const days = diffDays(s.today, bill.date);
    if (days < 0 || days > 3) continue;
    billsTotal += bill.amountCents;
    const short = billsTotal > s.availableCents;
    out.push({
      type: "bill_due_soon",
      severity: short ? "important" : "info",
      title: `${bill.label} vence ${days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`}`,
      cause: `Compromisso de ${formatMoney(bill.amountCents)} com vencimento em ${formatDateBR(bill.date)}.`,
      impact: short ? "O saldo disponível hoje não cobre todos os compromissos dos próximos dias." : "Pagar em dia evita multa e juros.",
      action: short ? "Transfira recursos para a conta de pagamento ou renegocie o vencimento." : "Confirme o pagamento quando ele acontecer.",
      href: "/movimentacoes?status=scheduled",
      fingerprint: `bill_due_soon:${bill.id}:${bill.date}`,
    });
  }

  for (const inv of s.invoices ?? []) {
    const days = diffDays(s.today, inv.dueDate);
    if (days < 0 || days > 5 || inv.outstandingCents <= 0) continue;
    const short = inv.outstandingCents > s.availableCents;
    out.push({
      type: "invoice_due_soon",
      severity: short ? "important" : "attention",
      title: `Fatura do ${inv.cardName} vence em ${formatDateBR(inv.dueDate)}`,
      cause: `Valor em aberto: ${formatMoney(inv.outstandingCents)}.`,
      impact: short
        ? "O saldo disponível não cobre a fatura inteira. Pagar só o mínimo gera juros do rotativo, que estão entre os mais altos do mercado."
        : "Atrasar a fatura gera juros e multa.",
      action: "Registre o pagamento da fatura assim que pagar.",
      href: "/contas",
      fingerprint: `invoice_due_soon:${inv.id}`,
    });
  }

  for (const line of s.budgetLines ?? []) {
    if (line.status === "exceeded") {
      out.push({
        type: "budget_exceeded",
        severity: "attention",
        title: `Orçamento de ${line.categoryName} excedido`,
        cause: `Comprometido ${formatMoney(line.committedCents)} de um limite de ${formatMoney(line.limitCents)}.`,
        impact: `${formatMoney(-line.remainingCents)} acima do planejado, o que reduz a margem para metas.`,
        action: "Reduza gastos nesta categoria até o fim do mês ou remaneje de outra categoria com folga.",
        href: "/orcamento",
        fingerprint: `budget_exceeded:${line.categoryId}:${month}`,
      });
    } else if (line.status === "warning") {
      out.push({
        type: "budget_warning",
        severity: "info",
        title: `${line.categoryName} chegou a ${line.usedPct.toFixed(0)}% do orçamento`,
        cause: `Restam ${formatMoney(line.remainingCents)} para o mês.`,
        impact: `O alerta foi configurado para ${line.alertThresholdPct}% do limite.`,
        action: "Acompanhe os próximos gastos desta categoria.",
        href: "/orcamento",
        fingerprint: `budget_warning:${line.categoryId}:${month}`,
      });
    } else if (line.projectedStatus === "exceeded") {
      out.push({
        type: "budget_projected_exceed",
        severity: "info",
        title: `No ritmo atual, ${line.categoryName} vai passar do limite`,
        cause: `Projeção de fechamento: ${formatMoney(line.projectedCents)} para um limite de ${formatMoney(line.limitCents)}.`,
        impact: "A projeção usa o ritmo diário de gastos até agora.",
        action: "Diminua o ritmo de gastos nesta categoria.",
        href: "/orcamento",
        fingerprint: `budget_projected_exceed:${line.categoryId}:${month}`,
      });
    }
  }

  for (const c of s.categorySpending ?? []) {
    if (c.averageCents <= 0) continue;
    if (c.currentCents > c.averageCents * 1.5 && c.currentCents - c.averageCents >= 10_000) {
      out.push({
        type: "unusual_spending",
        severity: "attention",
        title: `Gastos com ${c.name} acima do seu padrão`,
        cause: `Neste mês: ${formatMoney(c.currentCents)}. Média dos 3 meses anteriores: ${formatMoney(c.averageCents)} (+${(percentOf(c.currentCents, c.averageCents) - 100).toFixed(0)}%).`,
        impact: "Um aumento persistente reduz o que sobra para metas e reserva.",
        action: "Veja as movimentações da categoria e identifique o que mudou.",
        href: `/movimentacoes?categoria=${c.categoryId}`,
        fingerprint: `unusual_spending:${c.categoryId}:${month}`,
      });
    }
  }

  const day = parts(s.today).day;
  for (const g of s.goals ?? []) {
    if (g.health === "overdue") {
      out.push({
        type: "goal_overdue",
        severity: "attention",
        title: `O prazo da meta "${g.name}" passou`,
        cause: "A data desejada chegou e o valor-alvo não foi atingido.",
        impact: "Sem um novo prazo, o sistema não consegue calcular o aporte necessário.",
        action: "Defina uma nova data, ajuste o valor-alvo ou conclua a meta.",
        href: `/metas/${g.goalId}`,
        fingerprint: `goal_overdue:${g.goalId}`,
      });
    } else if (g.health === "at_risk") {
      out.push({
        type: "goal_at_risk",
        severity: "attention",
        title: `Meta "${g.name}" em risco de atraso`,
        cause: "No ritmo atual de aportes, a meta termina depois da data desejada.",
        impact:
          g.requiredPerPeriodCents !== null
            ? `Para cumprir o prazo seria preciso aportar ${formatMoney(g.requiredPerPeriodCents)} por mês.`
            : "O prazo atual pode não ser alcançável.",
        action: "Simule aumentar o aporte, estender o prazo ou ajustar o valor.",
        href: `/metas/${g.goalId}`,
        fingerprint: `goal_at_risk:${g.goalId}:${month}`,
      });
    }
    if (
      (g.health === "on_track" || g.health === "at_risk") &&
      g.requiredPerPeriodCents &&
      day > g.contributionDay + 3 &&
      g.contributedThisMonthCents < g.requiredPerPeriodCents
    ) {
      out.push({
        type: "contribution_missed",
        severity: "info",
        title: `Aporte de ${g.name} pendente neste mês`,
        cause: `O aporte estava previsto para o dia ${g.contributionDay}. Aportado no mês: ${formatMoney(g.contributedThisMonthCents)}.`,
        impact: `Faltam ${formatMoney(g.requiredPerPeriodCents - g.contributedThisMonthCents)} para manter o plano.`,
        action: "Registre o aporte se já foi feito, ou faça quando possível.",
        href: `/metas/${g.goalId}`,
        fingerprint: `contribution_missed:${g.goalId}:${month}`,
      });
    }
  }

  for (const r of s.recurringChanges ?? []) {
    if (r.previousCents <= 0 || r.currentCents <= r.previousCents * 1.05) continue;
    out.push({
      type: "recurring_increase",
      severity: "attention",
      title: `${r.name} ficou mais cara`,
      cause: `Passou de ${formatMoney(r.previousCents)} para ${formatMoney(r.currentCents)} (+${(percentOf(r.currentCents, r.previousCents) - 100).toFixed(0)}%).`,
      impact: `Diferença anual estimada: ${formatMoney((r.currentCents - r.previousCents) * 12)}.`,
      action: "Verifique se o reajuste está correto ou se vale renegociar ou trocar o serviço.",
      href: "/recorrencias",
      fingerprint: `recurring_increase:${r.id}:${r.currentCents}`,
    });
  }

  if (s.reserve && s.reserve.status !== "not_configured" && s.reserve.belowMinimum) {
    out.push({
      type: "reserve_below_minimum",
      severity: s.reserve.coverageMonths < 1 ? "important" : "attention",
      title: "Reserva de emergência abaixo do mínimo",
      cause: `A reserva cobre ${s.reserve.coverageMonths.toFixed(1).replace(".", ",")} mês(es) de despesas essenciais${s.reserve.currentCents === 0 ? " (nenhum valor em contas marcadas como reserva)" : ""}.`,
      impact: "Um imprevisto pode obrigar você a usar crédito caro ou interromper metas.",
      action:
        s.reserve.recommendedContributionCents > 0
          ? `Priorize aportes de ${formatMoney(s.reserve.recommendedContributionCents)} por mês na reserva.`
          : "Defina um aporte mensal para a reserva.",
      href: "/reserva",
      fingerprint: `reserve_below_minimum:${month}`,
    });
  }

  if (s.retirementPlanUpdatedAt && diffDays(s.retirementPlanUpdatedAt, s.today) > 365) {
    out.push({
      type: "review_premises",
      severity: "info",
      title: "Hora de revisar seu plano de aposentadoria",
      cause: `As premissas foram atualizadas pela última vez em ${formatDateBR(s.retirementPlanUpdatedAt)}.`,
      impact: "Renda, despesas, inflação e retorno esperado podem ter mudado.",
      action: "Revise as premissas e recalcule o plano.",
      href: "/aposentadoria",
      fingerprint: `review_premises:retirement:${s.today.slice(0, 4)}`,
    });
  }

  if (s.lastDataUpdate && diffDays(s.lastDataUpdate, s.today) > 7) {
    out.push({
      type: "stale_data",
      severity: "info",
      title: "Seus dados podem estar desatualizados",
      cause: `O último lançamento registrado é de ${formatDateBR(s.lastDataUpdate)}.`,
      impact: "Análises e alertas ficam menos precisos sem lançamentos recentes.",
      action: "Registre ou importe as movimentações recentes.",
      href: "/movimentacoes",
      fingerprint: `stale_data:${s.lastDataUpdate}`,
    });
  }
  for (const c of s.staleConnections ?? []) {
    out.push({
      type: "stale_data",
      severity: "attention",
      title: `Conexão ${c.name} sem sincronizar`,
      cause: c.lastSyncAt ? `Última sincronização em ${formatDateBR(c.lastSyncAt)}.` : "A conexão ainda não sincronizou.",
      impact: "Saldos e movimentações desta instituição podem estar desatualizados.",
      action: "Sincronize novamente ou verifique o consentimento.",
      href: "/conexoes",
      fingerprint: `stale_connection:${c.id}:${c.lastSyncAt ?? "never"}`,
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Limita a quantidade de alertas novos por dia para evitar excesso de notificações. */
export function throttleAlerts(alerts: readonly AlertCandidate[], maxPerDay: number): AlertCandidate[] {
  const important = alerts.filter((a) => a.severity === "important");
  const rest = alerts.filter((a) => a.severity !== "important");
  return [...important, ...rest.slice(0, Math.max(0, maxPerDay - important.length))];
}
