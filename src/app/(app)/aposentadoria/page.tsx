import type { Metadata } from "next";
import { saveRetirementAction } from "../_actions/planning";
import { ScenarioChart } from "@/components/charts/charts";
import { RetirementForm } from "@/components/planning/retirement-form";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KeyValue, Money, PageHeader, Stat } from "@/components/ui/misc";
import { formatDateBR } from "@/domain/dates";
import { planRetirement } from "@/domain/retirement";
import { voiceFor } from "@/mascots/voice";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { getRetirementOverview, retirementRevisions } from "@/server/services/retirement";

export const metadata: Metadata = { title: "Aposentadoria" };

const pctStr = (v: number) => (v * 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");

export default async function RetirementPage() {
  const { ctx, mascotId } = await requireOnboarded();
  const [o, revisions] = await Promise.all([getRetirementOverview(ctx), retirementRevisions(ctx)]);
  const x = o.result;
  const i = o.input;
  const chart = x
    ? (() => {
        const shift = (delta: number) =>
          planRetirement({ ...i, annualNominalReturn: i.annualNominalReturn + delta, annualNominalReturnRetirement: i.annualNominalReturnRetirement != null ? i.annualNominalReturnRetirement + delta : null }).series;
        const cons = shift(-0.02);
        const opt = shift(0.02);
        return x.series.map((p, idx) => ({ age: p.age, base: p.wealthRealCents, conservative: cons[idx]?.wealthRealCents ?? 0, optimistic: opt[idx]?.wealthRealCents ?? 0 }));
      })()
    : [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planejamento de vida" title="Aposentadoria e independência" description="Cenários em valores reais (poder de compra de hoje), com o equivalente nominal. As taxas são premissas suas — nada aqui é garantia." />
      {!o.saved ? (
        <Callout tone="info" title="Plano ainda não salvo">
          Os valores abaixo são sugestões a partir do seu perfil. Revise as premissas e salve para acompanhar.
          {o.missing.length ? <> Falta: {o.missing.join(" ")}</> : null}
        </Callout>
      ) : null}
      {o.needsReview ? <Callout tone="warning" title="Premissas com mais de 12 meses">Renda, despesas, inflação e retorno esperado podem ter mudado. Revise e recalcule.</Callout> : null}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {o.error ? <Callout tone="negative">{o.error}</Callout> : null}
          {x ? (
            <>
              <Card>
                <CardBody className="pt-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <MascotArt id={mascotId} size={80} state={x.onTrack ? "celebration" : "guidance"} />
                    <div className="min-w-0 flex-1">
                      <Badge tone={x.onTrack ? "positive" : "warning"}>{x.onTrack ? "No caminho do objetivo" : "Abaixo do objetivo com as premissas atuais"}</Badge>
                      <p className="mt-2 text-sm text-muted">{voiceFor(mascotId).opening(x.onTrack ? "positive" : "caution")}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="Capital necessário" value={<Money cents={x.requiredCapitalRealCents} />} hint={<>≈ <Money cents={x.requiredCapitalNominalCents} tone="none" /> nominais aos {i.retirementAge}</>} />
                    <Stat label="Patrimônio projetado" value={<Money cents={x.projectedWealthRealCents} />} hint={<>≈ <Money cents={x.projectedWealthNominalCents} tone="none" /> nominais</>} />
                    <Stat label={x.gapRealCents > 0 ? "Falta" : "Sobra"} value={<Money cents={Math.abs(x.gapRealCents)} />} hint="em valores de hoje" />
                    <Stat label="Aporte mensal necessário" value={<Money cents={x.requiredMonthlyContributionRealCents} />} hint={<>hoje: <Money cents={i.monthlyContributionCents} tone="none" />/mês</>} />
                  </div>
                  <p className="mt-4 text-sm">
                    Com o plano atual, a renda sustentável estimada é de <strong><Money cents={x.sustainableMonthlyIncomeRealCents} tone="none" />/mês</strong> (valores de hoje, já somando outras rendas), para um objetivo de <Money cents={i.desiredMonthlyIncomeCents} tone="none" />.
                  </p>
                  {x.warnings.map((w) => (
                    <p key={w} className="mt-2 text-sm text-warning">
                      {w}
                    </p>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Evolução patrimonial por cenário" description="Valores reais. Conservador e otimista: retorno nominal 2 p.p. abaixo e acima da sua premissa." />
                <CardBody>
                  <ScenarioChart data={chart} retirementAge={i.retirementAge} />
                </CardBody>
              </Card>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader title="Cenários" />
                  <CardBody>
                    <ul className="space-y-3 text-sm">
                      {x.scenarios.map((s) => (
                        <li key={s.key} className="rounded-xl border border-line p-3">
                          <p className="flex justify-between font-medium">
                            {s.label} <Badge tone={s.onTrack ? "positive" : "warning"}>{s.onTrack ? "atinge" : "não atinge"}</Badge>
                          </p>
                          <p className="text-xs text-muted">
                            {pctStr(s.annualNominalReturn)}% a.a. nominal ({pctStr(s.realReturn)}% real) · patrimônio <Money cents={s.projectedWealthRealCents} tone="none" /> · renda <Money cents={s.sustainableMonthlyIncomeRealCents} tone="none" />/mês · aporte necessário <Money cents={s.requiredMonthlyContributionRealCents} tone="none" />
                          </p>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Sensibilidade" description="Como o aporte necessário muda com cada premissa." />
                  <CardBody>
                    <KeyValue
                      items={x.sensitivity.map((s) => [
                        s.label,
                        <span key={s.label}>
                          <Money cents={s.requiredMonthlyContributionRealCents} tone="none" /> <span className={s.deltaContributionCents > 0 ? "text-negative" : "text-positive"}>({s.deltaContributionCents > 0 ? "+" : "−"}<Money cents={Math.abs(s.deltaContributionCents)} tone="none" />)</span>
                        </span>,
                      ])}
                    />
                  </CardBody>
                </Card>
              </div>
              {x.costOfWaiting.length ? (
                <Card>
                  <CardHeader title="Começar antes ou depois" description="Aporte mensal necessário se você começar a aportar daqui a alguns anos." />
                  <CardBody>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-petrol-50 p-3 text-sm dark:bg-petrol-900/40">
                        <p className="text-muted">Começando agora</p>
                        <p className="text-lg font-semibold">
                          <Money cents={x.requiredMonthlyContributionRealCents} />
                        </p>
                      </div>
                      {x.costOfWaiting.map((c) => (
                        <div key={c.delayYears} className="rounded-2xl bg-surface-2 p-3 text-sm">
                          <p className="text-muted">Daqui a {c.delayYears} ano(s)</p>
                          <p className="text-lg font-semibold">
                            <Money cents={c.requiredMonthlyContributionRealCents} />
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              ) : null}
              <Card>
                <CardHeader title="Premissas" />
                <CardBody>
                  <ul className="space-y-1 text-sm text-muted">
                    {x.assumptions.map((a) => (
                      <li key={a}>• {a}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Premissas do plano" description="Atualize sempre que renda, despesas, patrimônio ou objetivos mudarem." />
            <CardBody>
              <RetirementForm
                action={saveRetirementAction}
                defaults={{
                  currentAge: i.currentAge,
                  retirementAge: i.retirementAge,
                  lifeExpectancy: i.lifeExpectancy,
                  desiredMonthlyIncome: centsToInput(i.desiredMonthlyIncomeCents),
                  otherMonthlyIncome: centsToInput(i.otherMonthlyIncomeCents),
                  currentWealth: centsToInput(i.currentWealthCents),
                  monthlyContribution: centsToInput(i.monthlyContributionCents),
                  annualInflation: pctStr(i.annualInflation),
                  annualNominalReturn: pctStr(i.annualNominalReturn),
                  annualNominalReturnRetirement: i.annualNominalReturnRetirement != null ? pctStr(i.annualNominalReturnRetirement) : "",
                  safetyMargin: pctStr(i.safetyMarginPct),
                  mode: i.mode ?? "consume",
                }}
              />
            </CardBody>
          </Card>
          {revisions.length ? (
            <Card>
              <CardHeader title="Revisões do plano" />
              <CardBody>
                <ul className="space-y-1.5 text-xs text-muted">
                  {revisions.slice(0, 8).map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span>{formatDateBR(r.createdAt.toISOString().slice(0, 10))}</span>
                      <span>{(r.summary as { onTrack?: boolean }).onTrack ? "no caminho" : "abaixo do objetivo"}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
