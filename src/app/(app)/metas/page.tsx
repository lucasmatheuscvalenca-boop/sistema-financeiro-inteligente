import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, ShieldCheck, Sunset, Users } from "lucide-react";
import { GOAL_HEALTH, progressTone, suggestedMonthly, timeLeftLabel } from "@/components/planning/goal-health";
import { PlanTabs } from "@/components/planning/plan-tabs";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { GoalCover } from "@/components/planning/goal-cover";
import { formatDateBR, formatMonthKey, type ISODate, type MonthKey } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { getEmergencyOverview } from "@/server/services/emergency";
import { GOAL_KIND_LABEL, goalAllocationPlan, listGoals, type GoalView } from "@/server/services/goals";
import { getRetirementOverview } from "@/server/services/retirement";
import { voiceFor } from "@/mascots/voice";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Metas" };

/** Atalho para um plano de longo prazo, com o essencial em uma linha. */
function PlanTile({ href, icon, title, badge, children }: { href: string; icon: React.ReactNode; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-start gap-3 border-t border-line py-4 transition hover:bg-surface-2/40 lg:border-t-0 lg:first:border-l-0 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:pl-6">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-leaf-50 text-forest-700 dark:bg-forest-800 dark:text-leaf-200">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{title}</p>
          {badge}
        </div>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
      <ChevronRight className="mt-2 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function GoalCard({ g, today }: { g: GoalView; today: string }) {
  const d = g.diagnosis;
  const h = GOAL_HEALTH[d.health];
  const suggested = suggestedMonthly(g.goal.plannedMonthlyCents, d);
  return (
    <Link href={`/metas/${g.goal.id}`} className="group block">
      <Card className="card-hover h-full overflow-hidden">
        {/* Proporção fixa: a ilustração aparece inteira em qualquer largura de coluna. */}
        <div className="relative aspect-[2/1] max-h-48 w-full">
          <GoalCover kind={g.goal.kind} className="h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-navy-950/75 to-transparent" />
          <Badge tone={h.tone} className="absolute right-3 top-3 bg-surface dark:bg-surface">
            {h.label}
          </Badge>
          <p className="absolute inset-x-4 bottom-2 truncate text-base font-semibold text-white drop-shadow">{g.goal.name}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted">
            {GOAL_KIND_LABEL[g.goal.kind as keyof typeof GOAL_KIND_LABEL]}
            {g.goal.targetDate ? ` · ${formatMonthKey(g.goal.targetDate.slice(0, 7) as MonthKey)}` : " · sem prazo"} · prioridade {g.goal.priority}
            {g.access !== "owner" ? " · compartilhada com você" : ""}
          </p>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className="text-lg font-bold tabular-nums">
              <Money cents={g.balances.balanceCents} tone="none" /> <span className="text-xs font-normal text-muted">de <Money cents={g.goal.targetCents} tone="none" /></span>
            </p>
            <p className="text-sm font-semibold tabular-nums">{Math.floor(d.progressPct)}%</p>
          </div>
          <Progress className="mt-2" value={d.progressPct} tone={progressTone(d.health)} label={`Progresso de ${g.goal.name}`} />
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <dt className="text-[11px] text-muted">Faltam</dt>
              <dd className="text-sm font-semibold">{timeLeftLabel(d.remainingCents, today as ISODate, g.goal.targetDate)}</dd>
            </div>
            <div className="border-l border-line pl-3">
              <dt className="text-[11px] text-muted">Aporte mensal sugerido</dt>
              <dd className="text-sm font-semibold tabular-nums">{suggested ? <Money cents={suggested} tone="none" /> : "—"}</dd>
            </div>
          </dl>
          {d.projection?.completionDate && d.remainingCents > 0 ? <p className="mt-2 text-xs text-muted">Projeção de conclusão: {formatMonthKey(d.projection.completionDate.slice(0, 7) as MonthKey)}.</p> : null}
        </div>
      </Card>
    </Link>
  );
}

export default async function GoalsPage() {
  const { ctx, mascotId } = await requireOnboarded();
  const [goals, plan, emergency, retirement] = await Promise.all([listGoals(ctx, { includeShared: true }), goalAllocationPlan(ctx), getEmergencyOverview(ctx), getRetirementOverview(ctx)]);
  const ev = emergency.evaluation;
  const r = retirement.result;
  const own = goals.filter((g) => g.access === "owner");
  const shared = goals.filter((g) => g.access !== "owner");
  const completed = own.filter((g) => g.diagnosis.health === "completed");
  const a = plan.allocation;
  return (
    <div className="space-y-6">
      <PageHeader title="Metas" description="Suas metas, a reserva de emergência e a aposentadoria no mesmo lugar. O mesmo dinheiro nunca conta duas vezes." actions={<ButtonLink href="/metas/nova"><Plus className="size-4" /> Nova meta</ButtonLink>} />
      <PlanTabs current="metas" />
      {completed.length ? (
        <Callout tone="positive" title="Conquista!">
          <span className="inline-flex items-center gap-2">
            <MascotArt id={mascotId} state="celebration" size={36} decorative />
            {voiceFor(mascotId).celebrate(completed.map((g) => g.goal.name).join(", "))}
          </span>
        </Callout>
      ) : null}
      {own.length === 0 ? (
        <EmptyState art={<MascotArt id={mascotId} state="guidance" size={96} />} title="Nenhuma meta ainda" description={voiceFor(mascotId).emptyState("metas")} action={<ButtonLink href="/metas/nova"><Plus className="size-4" /> Criar primeira meta</ButtonLink>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {own.map((g) => (
            <GoalCard key={g.goal.id} g={g} today={ctx.today} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 border-t border-ink/80 dark:border-line lg:grid-cols-2 lg:gap-6">
        <PlanTile href="/reserva" icon={<ShieldCheck className="size-5" />} title="Reserva de emergência" badge={ev.status === "complete" ? <Badge tone="gold">Completa</Badge> : ev.belowMinimum && ev.targetCents > 0 ? <Badge tone="warning">Abaixo do mínimo</Badge> : null}>
          {ev.targetCents > 0 ? (
            <>
              <Money cents={ev.currentCents} tone="none" className="font-medium text-ink" /> de <Money cents={ev.targetCents} tone="none" /> · cobre {plural(ev.coverageMonths, "mês", "meses")} de despesas essenciais
              <Progress className="mt-2" value={ev.progressPct} tone={ev.status === "complete" ? "gold" : ev.belowMinimum ? "warning" : "petrol"} size="sm" label="Progresso da reserva" />
            </>
          ) : (
            "Quanto guardar para imprevistos. Informe suas despesas essenciais e o Meu Banqueiro calcula."
          )}
        </PlanTile>
        <PlanTile href="/aposentadoria" icon={<Sunset className="size-5" />} title="Aposentadoria" badge={r ? <Badge tone={r.onTrack ? "positive" : "warning"}>{r.onTrack ? "No caminho" : "Falta aporte"}</Badge> : null}>
          {r ? (
            <>
              {r.onTrack ? "O aporte atual chega lá." : <>Aporte necessário: <Money cents={r.requiredMonthlyContributionRealCents} tone="none" className="font-medium text-ink" />/mês.</>} Renda projetada: <Money cents={r.sustainableMonthlyIncomeRealCents} tone="none" />/mês{retirement.saved ? "" : " (plano ainda não salvo)"}.
            </>
          ) : (
            "Com que idade parar e com quanto por mês. Monte o plano com as suas premissas."
          )}
        </PlanTile>
      </div>

      {own.some((g) => g.goal.status === "active") ? (
        <Section title="Priorização dos aportes" description={<>Capacidade mensal estimada: <Money cents={plan.capacityCents} tone="none" className="font-medium text-ink" />. Reserva abaixo do mínimo vem primeiro; depois prioridade e prazo.</>}>
          <div className="space-y-3">
            <ul className="divide-y divide-line text-sm">
              {a.allocations.map((x) => (
                <li key={x.goalId} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 w-5 shrink-0 font-display text-sm text-muted">{x.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{x.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      precisa <Money cents={x.requiredCents} tone="none" /> · recebe <Money cents={x.allocatedCents} tone="none" className="font-semibold text-ink" />
                    </p>
                  </div>
                  {x.fullyFunded ? <Badge tone="positive" className="shrink-0">coberta</Badge> : <Badge tone="warning" className="shrink-0">faltam <Money cents={x.shortfallCents} tone="none" /></Badge>}
                </li>
              ))}
            </ul>
            {a.hasConflict ? (
              <Callout tone="warning" title={a.conflicts[0]?.message}>
                <ul className="mt-1 space-y-1">
                  {a.alternatives.map((alt) => (
                    <li key={alt.goalId}>
                      {alt.name}:{" "}
                      {alt.newCompletionDate ? (
                        <>
                          com o valor disponível, concluiria por volta de {formatDateBR(alt.newCompletionDate)}
                          {alt.reachableByDeadlineCents !== null ? <>; no prazo atual seria possível juntar cerca de <Money cents={alt.reachableByDeadlineCents} tone="none" /> do que falta</> : null}.
                        </>
                      ) : (
                        "não sobra capacidade para esta meta agora — considere estender o prazo, reduzir o valor ou mudar a prioridade."
                      )}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <p className="text-sm text-positive">A capacidade mensal cobre todos os aportes necessários. Sobram <Money cents={a.unallocatedCents} tone="none" />.</p>
            )}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Premissas da capacidade mensal</summary>
              <ul className="mt-1 space-y-0.5">
                {plan.capacityPremises.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </details>
          </div>
        </Section>
      ) : null}

      {shared.length ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-link" /> Compartilhadas com você
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shared.map((g) => (
              <GoalCard key={g.goal.id} g={g} today={ctx.today} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
