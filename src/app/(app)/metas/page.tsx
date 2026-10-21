import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Scale, Users } from "lucide-react";
import { GOAL_HEALTH } from "@/components/planning/goal-health";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { ProgressRing } from "@/components/ui/progress";
import { formatDateBR } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { GOAL_KIND_LABEL, goalAllocationPlan, listGoals, type GoalView } from "@/server/services/goals";
import { voiceFor } from "@/mascots/voice";

export const metadata: Metadata = { title: "Metas e projetos" };

function GoalCard({ g }: { g: GoalView }) {
  const d = g.diagnosis;
  const h = GOAL_HEALTH[d.health];
  return (
    <Link href={`/metas/${g.goal.id}`} className="group block">
      <Card className="h-full p-4 transition group-hover:-translate-y-0.5">
        <div className="flex items-start gap-4">
          <ProgressRing value={d.progressPct} tone={d.health === "completed" ? "gold" : d.health === "at_risk" || d.health === "overdue" ? "warning" : "petrol"} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{g.goal.name}</p>
            <p className="text-xs text-muted">
              {GOAL_KIND_LABEL[g.goal.kind as keyof typeof GOAL_KIND_LABEL]} · prioridade {g.goal.priority}
              {g.access !== "owner" ? " · compartilhada com você" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={h.tone}>{h.label}</Badge>
              {g.goal.status === "paused" ? <Badge>Pausada</Badge> : null}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted">Acumulado</p>
            <p className="font-semibold tabular-nums">
              <Money cents={g.balances.balanceCents} /> <span className="text-xs font-normal text-muted">de <Money cents={g.goal.targetCents} tone="none" /></span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">{d.required.perPeriodCents !== null && d.remainingCents > 0 ? "Aporte necessário" : "Prazo"}</p>
            <p className="font-semibold tabular-nums">
              {d.required.perPeriodCents !== null && d.remainingCents > 0 ? <><Money cents={d.required.perPeriodCents} />/mês</> : g.goal.targetDate ? formatDateBR(g.goal.targetDate) : "—"}
            </p>
          </div>
        </div>
        {d.projection?.completionDate && d.remainingCents > 0 ? <p className="mt-2 text-xs text-muted">No ritmo atual, conclui em {formatDateBR(d.projection.completionDate)}.</p> : null}
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
            <GoalCard key={g.goal.id} g={g} />
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
            <Users className="size-5 text-petrol-600" /> Compartilhadas com você
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shared.map((g) => (
              <GoalCard key={g.goal.id} g={g} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
