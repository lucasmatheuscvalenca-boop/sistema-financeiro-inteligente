import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { saveEmergencyAction } from "../_actions/planning";
import { SingleLineChart } from "@/components/charts/charts";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Input, MoneyInput, SubmitButton } from "@/components/ui/form";
import { Money, PageHeader, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDateBR, formatMonthShort } from "@/domain/dates";
import { voiceFor } from "@/mascots/voice";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { getEmergencyOverview } from "@/server/services/emergency";

export const metadata: Metadata = { title: "Reserva de emergência" };


export default async function ReservePage() {
  const { ctx, mascotId } = await requireOnboarded();
  const e = await getEmergencyOverview(ctx);
  const v = e.evaluation;
  const state = v.status === "complete" ? "celebration" : v.belowMinimum ? "attention" : v.status === "not_configured" ? "analysis" : "guidance";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planejamento" title="Reserva de emergência" description="Separada das metas de consumo. Só conta dinheiro de resgate imediato em contas marcadas como reserva." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="pt-5">
            <div className="flex flex-wrap items-center gap-5">
              <MascotArt id={mascotId} state={state} size={88} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">Valor atual</p>
                <p className="text-3xl font-semibold tabular-nums">
                  <Money cents={v.currentCents} />
                </p>
                <p className="text-sm text-muted">
                  Meta: {v.targetMonths} meses de despesas essenciais = <Money cents={v.targetCents} tone="none" />
                </p>
              </div>
              <Badge tone={v.status === "complete" ? "gold" : v.belowMinimum ? "warning" : "info"}>
                {v.status === "complete" ? "Completa" : v.status === "not_configured" ? "Faltam dados" : `${v.coverageMonths.toFixed(1).replace(".", ",")} mês(es) de cobertura`}
              </Badge>
            </div>
            <Progress className="mt-5" value={v.progressPct} tone={v.status === "complete" ? "gold" : v.belowMinimum ? "warning" : "petrol"} label="Progresso da reserva" />
            <p className="mt-1 text-xs text-muted">{v.progressPct.toFixed(0)}% concluído</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Stat label="Despesas essenciais/mês" value={<Money cents={v.monthlyEssentialCents} />} hint={{ override: "Valor informado por você", average: "Média dos últimos 3 meses", profile: "Valor do briefing", none: "Sem dados" }[e.essentialSource]} />
              <Stat label="Aporte recomendado" value={v.recommendedContributionCents ? <><Money cents={v.recommendedContributionCents} />/mês</> : "—"} hint={e.capacityCents > 0 ? <>Limitado à capacidade mensal (<Money cents={e.capacityCents} tone="none" />)</> : undefined} />
              <Stat label="Prazo estimado" value={v.completionDate ? formatDateBR(v.completionDate) : v.status === "complete" ? "Concluída" : "—"} hint={v.monthsToComplete ? `${v.monthsToComplete} mês(es)` : undefined} />
            </div>
            {v.belowMinimum ? (
              <Callout tone="warning" className="mt-5" title="Abaixo do mínimo recomendado">
                {voiceFor(mascotId).opening("caution")} Enquanto a reserva cobrir menos de {e.settings.minimumMonths} meses, ela tem prioridade sobre metas de consumo no plano de aportes.
              </Callout>
            ) : null}
            {e.reserveAccounts.length === 0 ? (
              <Callout tone="info" className="mt-5" title="Nenhuma conta marcada como reserva">
                Marque a conta onde a reserva fica (poupança, CDB de liquidez diária etc.) com a finalidade “Reserva de emergência” em <Link href="/contas" className="underline">Contas</Link>.
              </Callout>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Configuração" icon={<ShieldCheck className="size-4" />} />
          <CardBody>
            <p className="mb-3 text-sm text-muted">
              Sugestão para você: <strong>{e.recommendation.months} meses</strong>. {e.recommendation.reasons.join(" ")}
            </p>
            <ActionForm action={saveEmergencyAction}>
              <Field label="Cobertura desejada (meses)" name="targetMonths">
                <Input name="targetMonths" type="number" min={1} max={36} defaultValue={e.settings.targetMonths} />
              </Field>
              <Field label="Despesas essenciais/mês (opcional)" name="essentialOverride" hint="Deixe vazio para usar a média dos seus lançamentos essenciais.">
                <MoneyInput name="essentialOverride" defaultValue={centsToInput(e.settings.monthlyEssentialOverrideCents)} />
              </Field>
              <Field label="Completar em (meses)" name="desiredMonthsToComplete">
                <Input name="desiredMonthsToComplete" type="number" min={1} max={120} defaultValue={e.settings.desiredMonthsToComplete} />
              </Field>
              <Field label="Mínimo de segurança (meses)" name="minimumMonths">
                <Input name="minimumMonths" type="number" min={1} max={12} defaultValue={e.settings.minimumMonths} />
              </Field>
              <SubmitButton variant="petrol" className="w-full">
                Salvar
              </SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cenários de contribuição" description="Quanto tempo leva para completar com diferentes aportes mensais." />
          <CardBody>
            {v.gapCents <= 0 ? (
              <p className="text-sm text-muted">A reserva já atingiu a meta configurada.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {v.scenarios.map((s) => (
                  <li key={s.monthlyContributionCents} className="flex justify-between py-2">
                    <span>
                      <Money cents={s.monthlyContributionCents} tone="none" />
                      /mês
                    </span>
                    <span className="text-muted">{s.monthsToComplete ? `${s.monthsToComplete} meses · ${formatDateBR(s.completionDate!)}` : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolução da reserva" description="Saldo das contas de reserva no fim de cada mês." />
          <CardBody>
            <SingleLineChart data={e.history.map((h) => ({ mes: formatMonthShort(h.month), saldo: h.balanceCents }))} xKey="mes" yKey="saldo" label="Reserva de emergência" xLabel="Mês" target={v.targetCents || undefined} targetLabel="Meta" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
