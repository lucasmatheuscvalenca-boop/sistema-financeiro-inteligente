import { addDays, diffDays, parts, type ISODate } from "./dates";
import { plural } from "./text";

/**
 * Gamificação adulta: recompensa constância e boas decisões (revisões, aportes,
 * orçamento cumprido, reserva). Nunca recompensa gastos, crédito ou risco.
 */
export type AchievementCode =
  | "briefing_complete"
  | "first_account"
  | "first_budget"
  | "first_goal"
  | "first_contribution"
  | "goal_25"
  | "goal_50"
  | "goal_75"
  | "goal_completed"
  | "reserve_1m"
  | "reserve_3m"
  | "reserve_full"
  | "review_streak_4"
  | "review_streak_12"
  | "budget_kept_month"
  | "first_import"
  | "retirement_plan"
  | "challenge_completed";

export interface AchievementDef {
  code: AchievementCode;
  title: string;
  description: string;
  group: "fundação" | "metas" | "reserva" | "constância" | "planejamento";
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: "briefing_complete", title: "Ponto de partida", description: "Concluiu o briefing financeiro.", group: "fundação" },
  { code: "first_account", title: "Primeira conta", description: "Cadastrou a primeira conta.", group: "fundação" },
  { code: "first_budget", title: "Plano do mês", description: "Definiu o primeiro orçamento por categoria.", group: "fundação" },
  { code: "first_import", title: "Tudo em dia", description: "Importou movimentações de um extrato.", group: "fundação" },
  { code: "first_goal", title: "Primeiro projeto", description: "Criou a primeira meta.", group: "metas" },
  { code: "first_contribution", title: "Primeiro aporte", description: "Registrou o primeiro aporte em uma meta.", group: "metas" },
  { code: "goal_25", title: "Um quarto do caminho", description: "Uma meta chegou a 25%.", group: "metas" },
  { code: "goal_50", title: "Meio caminho", description: "Uma meta chegou a 50%.", group: "metas" },
  { code: "goal_75", title: "Reta final", description: "Uma meta chegou a 75%.", group: "metas" },
  { code: "goal_completed", title: "Meta conquistada", description: "Concluiu uma meta.", group: "metas" },
  { code: "reserve_1m", title: "Primeiro colchão", description: "A reserva cobre 1 mês de despesas essenciais.", group: "reserva" },
  { code: "reserve_3m", title: "Colchão firme", description: "A reserva cobre 3 meses de despesas essenciais.", group: "reserva" },
  { code: "reserve_full", title: "Reserva completa", description: "A reserva atingiu a cobertura que você definiu.", group: "reserva" },
  { code: "review_streak_4", title: "Ritmo de revisão", description: "Fez revisões em 4 semanas seguidas.", group: "constância" },
  { code: "review_streak_12", title: "Hábito consolidado", description: "Fez revisões em 12 semanas seguidas.", group: "constância" },
  { code: "budget_kept_month", title: "Mês no plano", description: "Fechou um mês com todos os orçamentos dentro do limite.", group: "constância" },
  { code: "retirement_plan", title: "Olhar de longo prazo", description: "Montou o plano de aposentadoria.", group: "planejamento" },
  { code: "challenge_completed", title: "Desafio cumprido", description: "Concluiu um desafio voluntário de economia.", group: "constância" },
];

export interface GamificationStats {
  briefingComplete: boolean;
  accounts: number;
  budgets: number;
  goals: number;
  contributions: number;
  maxGoalProgressPct: number;
  goalsCompleted: number;
  reserveCoverageMonths: number;
  reserveComplete: boolean;
  reviewStreakWeeks: number;
  budgetKeptLastMonth: boolean;
  imports: number;
  hasRetirementPlan: boolean;
  challengesCompleted: number;
}

export function evaluateAchievements(s: GamificationStats): AchievementCode[] {
  const codes: AchievementCode[] = [];
  if (s.briefingComplete) codes.push("briefing_complete");
  if (s.accounts > 0) codes.push("first_account");
  if (s.budgets > 0) codes.push("first_budget");
  if (s.imports > 0) codes.push("first_import");
  if (s.goals > 0) codes.push("first_goal");
  if (s.contributions > 0) codes.push("first_contribution");
  if (s.maxGoalProgressPct >= 25) codes.push("goal_25");
  if (s.maxGoalProgressPct >= 50) codes.push("goal_50");
  if (s.maxGoalProgressPct >= 75) codes.push("goal_75");
  if (s.goalsCompleted > 0) codes.push("goal_completed");
  if (s.reserveCoverageMonths >= 1) codes.push("reserve_1m");
  if (s.reserveCoverageMonths >= 3) codes.push("reserve_3m");
  if (s.reserveComplete) codes.push("reserve_full");
  if (s.reviewStreakWeeks >= 4) codes.push("review_streak_4");
  if (s.reviewStreakWeeks >= 12) codes.push("review_streak_12");
  if (s.budgetKeptLastMonth) codes.push("budget_kept_month");
  if (s.hasRetirementPlan) codes.push("retirement_plan");
  if (s.challengesCompleted > 0) codes.push("challenge_completed");
  return codes;
}

/** Segunda-feira da semana de uma data. */
export function weekStart(date: ISODate): ISODate {
  const { year, month, day } = parts(date);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
}

/**
 * Sequência de semanas consecutivas com pelo menos uma revisão. A semana atual sem
 * revisão ainda não quebra a sequência (o usuário ainda pode revisar).
 */
export function reviewStreakWeeks(reviewDates: readonly ISODate[], today: ISODate): number {
  const weeks = new Set(reviewDates.map(weekStart));
  let cursor = weekStart(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export interface MissionContext {
  today: ISODate;
  reviewedThisWeek: boolean;
  uncategorizedCount: number;
  contributionsThisWeek: number;
  activeGoals: number;
  budgets: number;
  pendingScheduledPast: number;
  activeChallenges: number;
}

export interface Mission {
  code: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
}

/** Missões da semana: no máximo 3, escolhidas deterministicamente pelo contexto. */
export function weeklyMissions(ctx: MissionContext): Mission[] {
  const missions: Mission[] = [
    {
      code: "weekly_review",
      title: "Revisão da semana",
      description: "Confira saldos, compromissos e metas em poucos minutos.",
      done: ctx.reviewedThisWeek,
      href: "/revisao",
    },
  ];
  if (ctx.pendingScheduledPast > 0) {
    missions.push({
      code: "confirm_past",
      title: "Confirmar lançamentos vencidos",
      description: `${ctx.pendingScheduledPast} lançamento(s) previsto(s) já passaram da data. Confirme ou ajuste.`,
      done: false,
      href: "/movimentacoes?status=scheduled",
    });
  } else if (ctx.uncategorizedCount > 0) {
    missions.push({
      code: "categorize",
      title: "Categorizar movimentações",
      description: `${plural(ctx.uncategorizedCount, "movimentação", "movimentações")} sem categoria.`,
      done: false,
      href: "/movimentacoes?categoria=sem",
    });
  } else {
    missions.push({
      code: "categorize",
      title: "Movimentações organizadas",
      description: "Todas as movimentações têm categoria.",
      done: true,
      href: "/movimentacoes",
    });
  }
  if (ctx.activeGoals > 0) {
    missions.push({
      code: "contribute",
      title: "Aporte da semana",
      description: "Registre um aporte em qualquer meta, de qualquer valor.",
      done: ctx.contributionsThisWeek > 0,
      href: "/metas",
    });
  } else if (ctx.budgets === 0) {
    missions.push({
      code: "create_budget",
      title: "Definir um orçamento",
      description: "Escolha uma categoria e defina um limite mensal.",
      done: false,
      href: "/orcamento",
    });
  } else {
    missions.push({
      code: "create_goal",
      title: "Criar um projeto",
      description: "Transforme um objetivo em meta com valor e prazo.",
      done: false,
      href: "/metas/nova",
    });
  }
  return missions.slice(0, 3);
}

export interface ChallengeProgress {
  checkIns: number;
  targetCheckIns: number;
  pct: number;
  completed: boolean;
  daysLeft: number;
}

export function challengeProgress(input: { checkIns: number; targetCheckIns: number; endDate: ISODate; today: ISODate }): ChallengeProgress {
  const pct = input.targetCheckIns > 0 ? Math.min(100, Math.round((input.checkIns / input.targetCheckIns) * 100)) : 0;
  return {
    checkIns: input.checkIns,
    targetCheckIns: input.targetCheckIns,
    pct,
    completed: input.checkIns >= input.targetCheckIns,
    daysLeft: Math.max(0, diffDays(input.today, input.endDate)),
  };
}
