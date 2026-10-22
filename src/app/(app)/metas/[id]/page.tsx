import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, Flag, Pencil, PiggyBank, Plus, Share2 } from "lucide-react";
import { addContributionAction, deleteContributionAction, deleteGoalAction, goalStatusAction, updateGoalAction } from "../../_actions/planning";
import { GoalEvolutionChart } from "@/components/charts/charts";
import { ContributionForm } from "@/components/planning/contribution-form";
import { GoalCover } from "@/components/planning/goal-cover";
import { GoalForm } from "@/components/planning/goal-form";
import { GOAL_HEALTH, goalInsight, progressTone, suggestedMonthly, timeLeftLabel } from "@/components/planning/goal-health";
import { GoalSimulator } from "@/components/planning/goal-simulator";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { KeyValue, Money } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { formatDateBR, formatMonthKey, type MonthKey } from "@/domain/dates";
import { getMascot } from "@/mascots/catalog";
import { toneToState, voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { GOAL_KIND_LABEL, getGoal } from "@/server/services/goals";

export const metadata: Metadata = { title: "Meta" };

const KIND_LABEL = { deposit: "Aporte", withdrawal: "Resgate", yield: "Rendimento" } as Record<string, string>;
const monthOf = (date: string) => formatMonthKey(date.slice(0, 7) as MonthKey);

function Tile({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-link shadow-[var(--shadow-card)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

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
  const { goal, diagnosis: d, balances, access, evolution } = view;
  const owner = access === "owner";
  const accounts = owner ? await listAccountsWithBalances(ctx) : [];
  const h = GOAL_HEALTH[d.health];
  const monthly = d.basisMonthlyCents || d.required.perPeriodCents || 0;
  const suggested = suggestedMonthly(goal.plannedMonthlyCents, d);
  const insight = goalInsight(d, goal.targetDate);
  const voice = voiceFor(mascotId);
  const completion = d.projection?.completionDate ?? null;
  const canContribute = access !== "view" && goal.status !== "archived";

  const contributionDialog = canContribute ? (
    <Dialog trigger={<><Plus className="size-4" /> Adicionar aporte</>} title={`Registrar em ${goal.name}`} variant="petrol" description="Aportes, resgates e rendimentos atualizam a projeção na hora.">
      <ContributionForm action={addContributionAction} goalId={goal.id} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} today={ctx.today} isOwner={owner} hasHolding={!!goal.holdingAccountId} />
    </Dialog>
  ) : null;

  const history =
    view.contributions.length === 0 ? (
      <p className="text-sm text-muted">Nenhum movimento registrado ainda.</p>
    ) : (
      <ul className="divide-y divide-line text-sm">
        {view.contributions.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="w-24 text-muted tabular-nums">{formatDateBR(c.date)}</span>
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
    );

  const evolutionTab = (
    <div className="space-y-3">
      <GoalEvolutionChart data={evolution} targetCents={goal.targetCents} completionMonth={completion && d.remainingCents > 0 ? completion.slice(0, 7) : null} />
      <p className="text-sm text-muted">
        {d.remainingCents <= 0
          ? "Objetivo alcançado."
          : completion
            ? <>Projeção de conclusão: <span className="font-medium text-ink">{monthOf(completion)}</span>, considerando <Money cents={d.basisMonthlyCents} tone="none" /> por mês ({d.basis === "planned" ? "aporte planejado" : "média dos últimos 3 meses"}){goal.expectedAnnualReturnBps ? ` e rendimento hipotético de ${(goal.expectedAnnualReturnBps / 100).toLocaleString("pt-BR")}% ao ano` : ", sem rendimento"}.</>
            : "Sem aportes planejados ou recentes, não há projeção de conclusão. Defina um aporte mensal ou registre aportes."}
      </p>
    </div>
  );

  const detailsTab = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            ["Prioridade", String(goal.priority)],
          ]}
        />
      </div>
      <p className="text-sm text-muted">{d.required.explanation}</p>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Histórico de movimentos</h3>
        {history}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link href="/metas" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink">
        <ChevronLeft className="size-4" /> Metas
      </Link>

      {sp.nova ? (
        <Callout tone="positive" title="Meta criada">
          <span className="inline-flex items-center gap-2">
            <MascotArt id={mascotId} state="guidance" size={36} decorative /> {voice.opening("positive")} Registre aportes aqui sempre que guardar dinheiro para este projeto.
          </span>
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="relative h-40 sm:h-52">
              <GoalCover kind={goal.kind} className="h-full w-full" title={`Ilustração: ${GOAL_KIND_LABEL[goal.kind as keyof typeof GOAL_KIND_LABEL]}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950/75 via-navy-950/10 to-transparent" />
              <Badge tone={h.tone} className="absolute right-4 top-4 bg-surface shadow-sm dark:bg-surface">
                {h.label}
              </Badge>
              <div className="absolute inset-x-5 bottom-4 text-white">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/80">{GOAL_KIND_LABEL[goal.kind as keyof typeof GOAL_KIND_LABEL]}</p>
                <h1 className="text-2xl font-bold drop-shadow sm:text-3xl">{goal.name}</h1>
                <p className="text-sm text-white/85">{goal.targetDate ? monthOf(goal.targetDate) : "Sem prazo definido"}</p>
              </div>
            </div>
            <CardBody className="space-y-5 pt-5">
              {goal.description ? <p className="text-sm text-muted">{goal.description}</p> : null}
              <div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-2xl font-bold tabular-nums sm:text-3xl">
                    <Money cents={balances.balanceCents} tone="none" /> <span className="block text-sm font-normal text-muted sm:inline">de <Money cents={goal.targetCents} tone="none" /></span>
                  </p>
                  <p className="text-lg font-bold tabular-nums text-link">{Math.floor(d.progressPct)}%</p>
                </div>
                <Progress className="mt-3" value={d.progressPct} tone={progressTone(d.health)} label="Progresso da meta" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile icon={<CalendarClock className="size-4" />} label="Faltam" value={timeLeftLabel(d.remainingCents, ctx.today, goal.targetDate)} />
                <Tile icon={<PiggyBank className="size-4" />} label="Aporte mensal sugerido" value={suggested ? <Money cents={suggested} tone="none" /> : "—"} />
                <Tile className="col-span-2 sm:col-span-1" icon={<Flag className="size-4" />} label="Conclusão projetada" value={d.remainingCents <= 0 ? "Atingida" : completion ? monthOf(completion) : "Sem projeção"} />
              </div>
              <div className="flex flex-wrap gap-2">
                {contributionDialog}
                {owner ? (
                  <>
                    <Dialog trigger={<><Pencil className="size-4" /> Editar</>} title="Editar meta" variant="outline">
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
                    <ButtonLink href={`/compartilhamento?meta=${goal.id}`} variant="ghost">
                      <Share2 className="size-4" /> Compartilhar
                    </ButtonLink>
                  </>
                ) : (
                  <Badge tone="info">{access === "contribute" ? "Compartilhada: você pode aportar" : "Compartilhada: somente visualização"}</Badge>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="pt-2">
              <Tabs
                label="Seções da meta"
                tabs={[
                  { id: "evolucao", label: "Evolução", content: evolutionTab },
                  ...(owner && d.remainingCents > 0
                    ? [
                        {
                          id: "simulacoes",
                          label: "Simulações",
                          content: (
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
                          ),
                        },
                      ]
                    : []),
                  { id: "detalhes", label: "Detalhes", content: detailsTab },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-end gap-3 bg-hero px-5 pt-4">
              <MascotArt id={mascotId} state={d.health === "completed" ? "celebration" : toneToState(insight.tone)} size={96} animate />
              <div className="pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-link">{getMascot(mascotId).name}</p>
                <p className="text-sm font-semibold">{d.health === "completed" ? voice.celebrate(goal.name) : voice.headline(insight.tone)}</p>
              </div>
            </div>
            <CardBody className="pt-4 text-sm">
              <p>{insight.text}</p>
              {d.remainingCents > 0 && owner ? (
                <p className="mt-3 text-xs text-muted">
                  Quer testar outro valor ou prazo? Use a aba <span className="font-medium text-ink">Simulações</span>: nada é gravado até você editar a meta.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {owner ? (
            <Card>
              <CardHeader title="Situação da meta" description="Pausar mantém o histórico e tira a meta do plano de aportes." />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {goal.status === "active" ? (
                    <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "paused" }} variant="secondary">
                      Pausar aportes
                    </InlineAction>
                  ) : goal.status !== "completed" ? (
                    <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "active" }} variant="secondary">
                      Reativar
                    </InlineAction>
                  ) : null}
                  {d.remainingCents <= 0 && goal.status !== "completed" ? (
                    <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "completed" }} variant="gold">
                      Marcar como concluída
                    </InlineAction>
                  ) : null}
                  {goal.status !== "archived" ? (
                    <InlineAction action={goalStatusAction} hidden={{ id: goal.id, status: "archived" }} confirm="Arquivar esta meta? O histórico continua disponível.">
                      Arquivar
                    </InlineAction>
                  ) : null}
                  <InlineAction action={deleteGoalAction} hidden={{ id: goal.id }} confirm="Excluir a meta e todo o histórico de aportes? Esta ação não pode ser desfeita.">
                    Excluir
                  </InlineAction>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
