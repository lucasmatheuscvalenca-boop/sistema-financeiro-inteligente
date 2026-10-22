import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";
import { recordReviewAction } from "../_actions/intelligence";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, Field, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Money, PageHeader, Stat } from "@/components/ui/misc";
import { formatDateBR } from "@/domain/dates";
import { reviewStreakWeeks } from "@/domain/gamification";
import { voiceFor, type Tone } from "@/mascots/voice";
import { requireOnboarded } from "@/server/auth/current";
import { listAlerts } from "@/server/services/alerts";
import { listReviews } from "@/server/services/gamification";
import { getFinancialSnapshot } from "@/server/services/snapshot";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Revisão financeira" };

export default async function ReviewPage() {
  const { ctx, mascotId, prefs } = await requireOnboarded();
  const [snap, alerts, reviews] = await Promise.all([getFinancialSnapshot(ctx), listAlerts(ctx), listReviews(ctx)]);
  const streak = reviewStreakWeeks(reviews.map((r) => r.reviewDate), ctx.today);
  const tone: Tone = alerts.some((a) => a.severity === "important") ? "critical" : alerts.length ? "caution" : "positive";
  const voice = voiceFor(mascotId);
  const pendingGoals = snap.goals.filter((g) => g.goal.status === "active" && (g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents ?? 0) > g.diagnosis.contributedThisMonthCents);
  const items = [
    { key: "saldos", label: "Conferi os saldos das contas com os do banco", detail: snap.dataQuality.lastDataUpdate ? `Último lançamento em ${formatDateBR(snap.dataQuality.lastDataUpdate)}.` : "Nenhum lançamento ainda.", href: "/contas" },
    { key: "pendencias", label: "Confirmei ou ajustei lançamentos previstos que já passaram", detail: `${snap.overdue.length} pendente(s).`, href: "/movimentacoes?status=scheduled" },
    { key: "orcamento", label: "Olhei o orçamento do mês", detail: snap.budget.lines.length ? `${snap.budget.totals.usedPct.toFixed(0)}% comprometido; ${plural(snap.budget.lines.filter((l) => l.status === "exceeded").length, "categoria", "categorias")} acima do limite.` : "Sem orçamento definido.", href: "/orcamento" },
    { key: "metas", label: "Fiz ou programei os aportes das metas", detail: pendingGoals.length ? `Aportes pendentes em: ${pendingGoals.map((g) => g.goal.name).join(", ")}.` : "Nenhum aporte pendente.", href: "/metas" },
    { key: "alertas", label: "Li os alertas e decidi o que fazer", detail: `${alerts.length} alerta(s) ativo(s).`, href: "/alertas" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Acompanhamento" title="Revisão financeira" description="Cinco minutos para manter tudo em dia. A frequência sugerida é configurável e não gera excesso de notificações." />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardBody className="pt-5">
            <div className="mb-5 flex items-center gap-4">
              <MascotArt id={mascotId} state={tone === "positive" ? "guidance" : tone === "critical" ? "alert" : "attention"} size={80} />
              <div>
                <p className="font-semibold">{voice.headline(tone)}</p>
                <p className="text-sm text-muted">
                  Saldo livre hoje: <Money cents={snap.totals.freeCents} tone="none" />
                  {snap.monthEnd ? <> · previsão para o fim do mês: <Money cents={snap.monthEnd.confirmedCents} tone="none" /></> : null}
                </p>
              </div>
            </div>
            <ActionForm action={recordReviewAction} resetOnSuccess>
              <Field label="Tipo de revisão" name="period">
                <Select name="period" defaultValue={prefs.reviewFrequency}>
                  <option value="daily">Diária (rápida)</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal (fechamento)</option>
                </Select>
              </Field>
              <ul className="space-y-3">
                {items.map((i) => (
                  <li key={i.key} className="rounded-2xl border border-line p-3">
                    <Checkbox name={i.key} label={<span className="font-medium">{i.label}</span>} />
                    <p className="ml-6 mt-1 text-xs text-muted">
                      {i.detail}{" "}
                      <Link href={i.href} className="text-link underline">
                        abrir
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
              <Field label="Anotações (opcional)" name="notes">
                <Textarea name="notes" rows={2} placeholder="Decisões, ajustes, lembretes para a próxima revisão" />
              </Field>
              <SubmitButton variant="petrol">Concluir revisão</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <Stat icon={<Flame className="size-3.5 text-gold-500" />} label="Sequência de revisões semanais" value={`${streak} semana(s)`} hint="A semana atual ainda conta enquanto não termina." />
          </Card>
          <Card>
            <CardHeader title="Revisões recentes" />
            <CardBody>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma revisão registrada.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {reviews.slice(0, 10).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>{formatDateBR(r.reviewDate)}</span>
                      <Badge>{{ daily: "diária", weekly: "semanal", monthly: "mensal" }[r.period as "daily"]}</Badge>
                      <span className="text-xs text-muted">{Object.values(r.checklist).filter(Boolean).length}/5 itens</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
