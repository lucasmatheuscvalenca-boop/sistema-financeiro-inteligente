import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Share2 } from "lucide-react";
import { addContributionAction, deleteContributionAction, deleteGoalAction, goalStatusAction, updateGoalAction } from "../../_actions/planning";
import { ContributionForm } from "@/components/planning/contribution-form";
import { GoalForm } from "@/components/planning/goal-form";
import { GOAL_HEALTH } from "@/components/planning/goal-health";
import { GoalSimulator } from "@/components/planning/goal-simulator";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { KeyValue, Money, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDateBR } from "@/domain/dates";
import { voiceFor } from "@/mascots/voice";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { GOAL_KIND_LABEL, getGoal } from "@/server/services/goals";

export const metadata: Metadata = { title: "Meta" };

const KIND_LABEL = { deposit: "Aporte", withdrawal: "Resgate", yield: "Rendimento" } as Record<string, string>;

export default async function GoalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const { ctx, mascotId } = await requireOnboarded();
  const { id } = await params;
  const sp = await searchParams;
  let view;
  try {
    view = await getGoal(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { goal, diagnosis: d, balances, access } = view;
  const owner = access === "owner";
  const accounts = owner ? await listAccountsWithBalances(ctx) : [];
  const h = GOAL_HEALTH[d.health];
  const monthly = d.basisMonthlyCents || d.required.perPeriodCents || 0;
  return (
    <div className="space-y-6">
      <Link href="/metas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Metas
      </Link>
      <PageHeader
        eyebrow={GOAL_KIND_LABEL[goal.kind as keyof typeof GOAL_KIND_LABEL]}
        title={goal.name}
        description={goal.description ?? undefined}
        actions={
          owner ? (
            <>
              <ButtonLink href={`/compartilhamento?meta=${goal.id}`} variant="secondary">
                <Share2 className="size-4" /> Compartilhar
              </ButtonLink>
              <Dialog trigger={<><Pencil className="size-4" /> Editar</>} title="Editar meta" variant="secondary">
                <GoalForm
                  action={updateGoalAction}
                  today={ctx.today}
                  accounts={accounts.filter((a) => a.purpose !== "spending").map((a) => ({ id: a.id, name: a.name }))}
                  defaults={{
                    id: goal.id,
                    name: goal.name,
                    description: goal.description,
                    kind: goal.kind,
                    target: centsToInput(goal.targetCents),
                    targetDate: goal.targetDate,
                    priority: goal.priority,
                    plannedMonthly: centsToInput(goal.plannedMonthlyCents),
                    contributionDay: goal.contributionDay,
                    expectedReturn: goal.expectedAnnualReturnBps ? String(goal.expectedAnnualReturnBps / 100).replace(".", ",") : "",
                    holdingAccountId: goal.holdingAccountId,
                  }}
                />
              </Dialog>
            </>
          ) : (
            <Badge tone="info">{access === "contribute" ? "Compartilhada: você pode aportar" : "Compartilhada: somente visualização"}</Badge>
          )
        }
      />

      {sp.nova ? (
        <Callout tone="positive" title="Meta criada">
          <span className="inline-flex items-center gap-2">
            <MascotArt id={mascotId} state="guidance" size={36} decorative /> {voiceFor(mascotId).opening("positive")} Registre aportes aqui sempre que guardar dinheiro para este projeto.
          </span>
        </Callout>
      ) : null}
      {d.health === "completed" ? (
        <Callout tone="positive" title="Meta atingida!">
          <span className="inline-flex items-center gap-2">
            <MascotArt id={mascotId} state="celebration" size={44} decorative /> {voiceFor(mascotId).celebrate(goal.name)}
          </span>
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Acumulado</p>
                <p className="text-3xl font-semibold tabular-nums">
                  <Money cents={balances.balanceCents} />
                </p>
                <p className="text-sm text-muted">
                  de <Money cents={goal.targetCents} tone="none" /> · faltam <Money cents={d.remainingCents} tone="none" />
                </p>
              </div>
              <Badge tone={h.tone}>{h.label}</Badge>
            </div>
            <Progress className="mt-4" value={d.progressPct} tone={d.health === "completed" ? "gold" : d.health === "at_risk" || d.health === "overdue" ? "warning" : "petrol"} label="Progresso da meta" />
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <KeyValue items={[["Aportes", <Money key="a" cents={balances.contributedCents} tone="none" />], ["Resgates", <Money key="r" cents={-balances.withdrawnCents} tone="none" />], ["Rendimentos", <Money key="y" cents={balances.yieldCents} tone="none" />]]} />
              <KeyValue
                items={[
                  ["Prazo", goal.targetDate ? formatDateBR(goal.targetDate) : "Sem prazo"],
                  ["Aporte necessário", d.required.perPeriodCents !== null ? <Money key="n" cents={d.required.perPeriodCents} tone="none" /> : "—"],
                  ["Aportes restantes", d.required.periods ? `${d.required.periods} (dia ${goal.contributionDay})` : "—"],
                ]}
              />
              <KeyValue
                items={[
                  ["Base da projeção", d.basis === "planned" ? "Aporte planejado" : d.basis === "average" ? "Média 3 meses" : "Sem aportes"],
                  ["Aporte considerado", <Money key="m" cents={d.basisMonthlyCents} tone="none" />],
                  ["Conclusão projetada", d.projection?.completionDate ? formatDateBR(d.projection.completionDate) : "—"],
                ]}
              />
            </div>
            <p className="mt-4 text-sm text-muted">{d.required.explanation}</p>
            {owner ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {goal.status === "active" ? (
                  <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "paused" }} variant="secondary">
                    Pausar aportes
                  </InlineAction>
                ) : (
                  <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "active" }} variant="secondary">
                    Reativar
                  </InlineAction>
                )}
                {d.health === "completed" && goal.status !== "completed" ? (
                  <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "completed" }} variant="gold">
                    Marcar como concluída
                  </InlineAction>
                ) : null}
                <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "archived" }} confirm="Arquivar esta meta?">
                  Arquivar
                </InlineAction>
                <InlineAction action={deleteGoalAction} hidden={{ id: goal.id }} confirm="Excluir a meta e todo o histórico de aportes? Esta ação não pode ser desfeita.">
                  Excluir
                </InlineAction>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={access === "view" ? "Aportes" : "Registrar movimento"} />
          <CardBody>
            {access !== "view" ? (
              <ContributionForm action={addContributionAction} goalId={goal.id} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} today={ctx.today} isOwner={owner} hasHolding={!!goal.holdingAccountId} />
            ) : (
              <p className="text-sm text-muted">Você pode acompanhar esta meta, mas não registrar aportes.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {owner && d.remainingCents > 0 ? (
        <Card>
          <CardHeader title="Simulações" description="Altere valor, prazo, aporte, aporte extra, rendimento hipotético ou pausa e veja o efeito na conclusão." />
          <CardBody>
            <GoalSimulator
              base={{
                targetCents: goal.targetCents,
                currentCents: balances.balanceCents,
                monthlyCents: monthly,
                contributionDay: goal.contributionDay,
                annualReturnPct: goal.expectedAnnualReturnBps ? goal.expectedAnnualReturnBps / 100 : 0,
                targetDate: goal.targetDate,
                today: ctx.today,
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Histórico de progresso" />
        <CardBody>
          {view.contributions.length === 0 ? (
            <p className="text-sm text-muted">Nenhum movimento registrado.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {view.contributions.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-24 text-muted">{formatDateBR(c.date)}</span>
                  <span className="min-w-0 flex-1">
                    {KIND_LABEL[c.kind]}
                    {c.contributorName && c.contributorUserId !== goal.userId ? <span className="text-muted"> · por {c.contributorName}</span> : null}
                    {c.note ? <span className="text-muted"> · {c.note}</span> : null}
                  </span>
                  <Money cents={c.kind === "withdrawal" ? -c.amountCents : c.amountCents} signed />
                  {owner || c.contributorUserId === ctx.userId ? (
                    <InlineAction action={deleteContributionAction} hidden={{ id: c.id }} confirm="Excluir este registro?">
                      Excluir
                    </InlineAction>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
