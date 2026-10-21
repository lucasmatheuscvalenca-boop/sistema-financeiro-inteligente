import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Scale, Users } from "lucide-react";
import { GOAL_HEALTH, progressTone, suggestedMonthly, timeLeftLabel } from "@/components/planning/goal-health";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { GoalCover } from "@/components/planning/goal-cover";
import { formatDateBR, formatMonthKey, type ISODate, type MonthKey } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { GOAL_KIND_LABEL, goalAllocationPlan, listGoals, type GoalView } from "@/server/services/goals";
import { voiceFor } from "@/mascots/voice";

export const metadata: Metadata = { title: "Metas e projetos" };

function GoalCard({ g, today }: { g: GoalView; today: string }) {
  const d = g.diagnosis;
  const h = GOAL_HEALTH[d.health];
  const suggested = suggestedMonthly(g.goal.plannedMonthlyCents, d);
  return (
    <Link href={`/metas/${g.goal.id}`} className="group block">
      <Card className="card-hover h-full overflow-hidden">
        <div className="relative h-32">
          <GoalCover kind={g.goal.kind} className="h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-navy-950/70 to-transparent" />
          <div className="absolute bottom-2 left-4 right-4 flex items-end justify-between gap-2 text-white">
            <p className="truncate text-base font-semibold drop-shadow">{g.goal.name}</p>
            <Badge tone={h.tone} className="shrink-0 bg-surface shadow-sm dark:bg-surface">{h.label}</Badge>
          </div>
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
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-muted">Faltam</p>
              <p className="text-sm font-semibold">{timeLeftLabel(d.remainingCents, today as ISODate, g.goal.targetDate)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-muted">Aporte mensal sugerido</p>
              <p className="text-sm font-semibold tabular-nums">{suggested ? <Money cents={suggested} tone="none" /> : "—"}</p>
            </div>
          </div>
          {d.projection?.completionDate && d.remainingCents > 0 ? <p className="mt-2 text-xs text-muted">Projeção de conclusão: {formatMonthKey(d.projection.completionDate.slice(0, 7) as MonthKey)}.</p> : null}
        </div>
      </Card>
    </Link>
  );
}

export default async function GoalsPage() {
  const { ctx, mascotId } = await requireOnboarded();
  const [goals, plan] = await Promise.all([listGoals(ctx, { includeShared: true }), goalAllocationPlan(ctx)]);
  const own = goals.filter((g) => g.access === "owner");
  const shared = goals.filter((g) => g.access !== "owner");
  const completed = own.filter((g) => g.diagnosis.health === "completed");
  const a = plan.allocation;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planejamento" title="Metas e projetos" description="Aporte necessário pelo calendário real, projeção de conclusão e priorização sem usar o mesmo dinheiro duas vezes." actions={<ButtonLink href="/metas/nova"><Plus className="size-4" /> Nova meta</ButtonLink>} />
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {own.map((g) => (
            <GoalCard key={g.goal.id} g={g} today={ctx.today} />
          ))}
        </div>
      )}

      {own.some((g) => g.goal.status === "active") ? (
        <Card>
          <CardHeader title="Priorização dos aportes" icon={<Scale className="size-4" />} description={<>Capacidade mensal estimada: <Money cents={plan.capacityCents} tone="none" className="font-medium text-ink" />. Reserva abaixo do mínimo vem primeiro; depois prioridade e prazo.</>} />
          <CardBody className="space-y-3">
            <ul className="divide-y divide-line text-sm">
              {a.allocations.map((x) => (
                <li key={x.goalId} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-xs font-semibold">{x.rank}</span>
                  <span className="min-w-32 flex-1 font-medium">{x.name}</span>
                  <span className="text-muted">
                    precisa <Money cents={x.requiredCents} tone="none" />
                  </span>
                  <span>
                    recebe <Money cents={x.allocatedCents} tone="none" className="font-semibold" />
                  </span>
                  {x.fullyFunded ? <Badge tone="positive">coberta</Badge> : <Badge tone="warning">faltam <Money cents={x.shortfallCents} tone="none" /></Badge>}
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
          </CardBody>
        </Card>
      ) : null}

      {shared.length ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-link" /> Compartilhadas com você
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shared.map((g) => (
              <GoalCard key={g.goal.id} g={g} today={ctx.today} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
