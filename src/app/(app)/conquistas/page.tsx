import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Flame, Lock, Medal, Plus } from "lucide-react";
import { abandonChallengeAction, checkInChallengeAction, createChallengeAction } from "../_actions/intelligence";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { addDays, formatDateBR } from "@/domain/dates";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { getGamification, markAchievementsSeen } from "@/server/services/gamification";

export const metadata: Metadata = { title: "Conquistas" };

export default async function AchievementsPage() {
  const { ctx, mascotId } = await requireOnboarded();
  const g = await getGamification(ctx);
  const fresh = g.achievements.filter((a) => a.isNew);
  if (fresh.length) await markAchievementsSeen(ctx);
  const unlocked = g.achievements.filter((a) => a.unlockedAt);
  const groups = [...new Set(g.achievements.map((a) => a.group))];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Acompanhamento" title="Conquistas e missões" description="Uma gamificação discreta que premia constância e boas decisões — nunca gastos, crédito ou risco." />
      {fresh.length ? (
        <Card className="flex items-center gap-4 p-5">
          <MascotArt id={mascotId} state="celebration" size={80} />
          <div>
            <p className="font-semibold">{voiceFor(mascotId).celebrate(fresh.map((f) => f.title).join(", "))}</p>
            <p className="text-sm text-muted">{fresh.map((f) => f.description).join(" ")}</p>
          </div>
        </Card>
      ) : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Stat icon={<Medal className="size-3.5" />} label="Conquistas" value={`${unlocked.length}/${g.achievements.length}`} />
        </Card>
        <Card className="p-4">
          <Stat icon={<Flame className="size-3.5" />} label="Revisões seguidas" value={`${g.streakWeeks} sem.`} />
        </Card>
        <Card className="p-4">
          <Stat label="Missões da semana" value={`${g.missions.filter((m) => m.done).length}/${g.missions.length}`} />
        </Card>
        <Card className="p-4">
          <Stat label="Desafios concluídos" value={g.stats.challengesCompleted} />
        </Card>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Missões da semana" description="Pequenas ações que mantêm seu plano em dia." />
          <CardBody className="space-y-2">
            {g.missions.map((m) => (
              <Link key={m.code} href={m.href} className={cn("flex items-start gap-3 rounded-2xl border p-3 text-sm transition hover:bg-surface-2", m.done ? "border-petrol-200 dark:border-petrol-800" : "border-line")}>
                <CircleCheck className={cn("mt-0.5 size-5 shrink-0", m.done ? "text-positive" : "text-line")} />
                <span>
                  <span className="block font-medium">{m.title}</span>
                  <span className="text-muted">{m.description}</span>
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Desafios voluntários de economia"
            description="Você define o desafio; faça check-in nos dias em que cumprir."
            action={
              <Dialog trigger={<><Plus className="size-4" /> Novo</>} title="Novo desafio" variant="secondary" size="sm">
                <ActionForm action={createChallengeAction} resetOnSuccess>
                  <Field label="Desafio" name="title">
                    <Input name="title" placeholder="ex.: 30 dias sem delivery" required />
                  </Field>
                  <Field label="Descrição" name="description">
                    <Input name="description" placeholder="opcional" />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="Check-ins" name="targetCheckIns">
                      <Input name="targetCheckIns" type="number" min={1} max={366} defaultValue={30} />
                    </Field>
                    <Field label="Início" name="startDate">
                      <Input name="startDate" type="date" defaultValue={ctx.today} />
                    </Field>
                    <Field label="Fim" name="endDate">
                      <Input name="endDate" type="date" defaultValue={addDays(ctx.today, 30)} />
                    </Field>
                  </div>
                  <SubmitButton variant="petrol">Criar desafio</SubmitButton>
                </ActionForm>
              </Dialog>
            }
          />
          <CardBody className="space-y-3">
            {g.challenges.length === 0 ? <p className="text-sm text-muted">Nenhum desafio. Sugestões: “semana sem compras por impulso”, “levar marmita 3x por semana”.</p> : null}
            {g.challenges.map((c) => (
              <div key={c.id} className="rounded-2xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.title}</span>
                  <Badge tone={c.status === "completed" ? "gold" : c.status === "abandoned" ? "neutral" : "info"}>{c.status === "completed" ? "Concluído" : c.status === "abandoned" ? "Encerrado" : `${c.progress.daysLeft} dia(s) restantes`}</Badge>
                </div>
                <Progress className="mt-2" size="sm" value={c.progress.pct} tone={c.status === "completed" ? "gold" : "petrol"} label={c.title} />
                <p className="mt-1 text-xs text-muted">
                  {c.progress.checkIns}/{c.progress.targetCheckIns} check-ins · até {formatDateBR(c.endDate)}
                </p>
                {c.status === "active" ? (
                  <div className="mt-2 flex gap-2">
                    {!c.checkedInToday ? (
                      <InlineAction action={checkInChallengeAction} hidden={{ id: c.id }} variant="secondary">
                        Cumpri hoje
                      </InlineAction>
                    ) : (
                      <span className="text-xs text-positive">Check-in de hoje feito</span>
                    )}
                    <InlineAction action={abandonChallengeAction} hidden={{ id: c.id }} confirm="Encerrar este desafio? Tudo bem mudar de planos.">
                      Encerrar
                    </InlineAction>
                  </div>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      {groups.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted first-letter:uppercase">{group}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.achievements
              .filter((a) => a.group === group)
              .map((a) => (
                <Card key={a.code} className={cn("p-4", !a.unlockedAt && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("grid size-10 place-items-center rounded-xl", a.unlockedAt ? "bg-gold-100 text-gold-700 dark:bg-gold-700/30 dark:text-gold-200" : "bg-surface-2 text-muted")}>{a.unlockedAt ? <Medal className="size-5" /> : <Lock className="size-4" />}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted">{a.description}</p>
                    </div>
                  </div>
                  {a.unlockedAt ? <p className="mt-2 text-xs text-muted">Desde {formatDateBR(a.unlockedAt.toISOString().slice(0, 10))}</p> : null}
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
