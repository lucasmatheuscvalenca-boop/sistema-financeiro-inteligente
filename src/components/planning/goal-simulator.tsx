"use client";

import { useMemo, useState } from "react";
import { addMonths, formatDateBR } from "@/domain/dates";
import { requiredContribution, simulateGoal } from "@/domain/goals";
import { parseMoney } from "@/domain/money";
import { centsToInput, formatMoney } from "@/lib/format";
import { SingleLineChart } from "@/components/charts/charts";
import { plural } from "@/domain/text";

interface Base {
  targetCents: number;
  currentCents: number;
  monthlyCents: number;
  contributionDay: number;
  annualReturnPct: number;
  targetDate: string | null;
  today: string;
}

function money(v: string, fallback: number): number {
  try {
    return v.trim() ? Math.max(0, parseMoney(v)) : fallback;
  } catch {
    return fallback;
  }
}

/** Simulações de meta no navegador, usando o mesmo motor determinístico do servidor. Nada é gravado. */
export function GoalSimulator({ base }: { base: Base }) {
  const [target, setTarget] = useState(centsToInput(base.targetCents));
  const [deadline, setDeadline] = useState(base.targetDate ?? "");
  const [monthly, setMonthly] = useState(centsToInput(base.monthlyCents));
  const [extra, setExtra] = useState("");
  const [ret, setRet] = useState(String(base.annualReturnPct || ""));
  const [pause, setPause] = useState("0");

  const r = useMemo(() => {
    const targetCents = money(target, base.targetCents);
    const monthlyCents = money(monthly, base.monthlyCents);
    const extraCents = money(extra, 0);
    const annual = Number(ret.replace(",", ".")) / 100 || 0;
    const common = { targetCents, contributionDay: base.contributionDay, startDate: base.today, targetDate: deadline || null };
    const baseSim = simulateGoal({ ...common, targetCents: base.targetCents, currentCents: base.currentCents, monthlyContributionCents: base.monthlyCents, annualReturnRate: base.annualReturnPct / 100, targetDate: base.targetDate });
    const scenario = simulateGoal({ ...common, currentCents: base.currentCents, monthlyContributionCents: monthlyCents, extraContributionCents: extraCents, annualReturnRate: annual, pauseMonths: Number(pause) || 0, maxMonths: 600 });
    const needed = deadline ? requiredContribution({ targetCents, currentCents: base.currentCents + extraCents, today: base.today, targetDate: deadline, contributionDay: base.contributionDay, annualReturnRate: annual }) : null;
    return { baseSim, scenario, needed, targetCents };
  }, [target, deadline, monthly, extra, ret, pause, base]);

  const series = r.scenario.series.filter((_, i, arr) => arr.length < 40 || i % Math.ceil(arr.length / 36) === 0 || i === arr.length - 1).map((p) => ({ data: `${p.date.slice(5, 7)}/${p.date.slice(2, 4)}`, saldo: p.balanceCents }));
  const delta = r.scenario.monthsToComplete !== null && r.baseSim.monthsToComplete !== null ? r.scenario.monthsToComplete - r.baseSim.monthsToComplete : null;

  const input = "h-9 w-full rounded-lg border border-field-line bg-field px-2.5 text-sm tabular-nums";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium">
          Valor-alvo (R$)
          <input className={input} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Prazo
          <input className={input} type="date" value={deadline} min={base.today} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Aporte mensal (R$)
          <input className={input} value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Aporte extraordinário hoje (R$)
          <input className={input} value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Rendimento hipotético (% a.a.)
          <input className={input} value={ret} onChange={(e) => setRet(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Pausar aportes por (meses)
          <input className={input} type="number" min={0} max={24} value={pause} onChange={(e) => setPause(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Conclusão no cenário</p>
          <p className="text-lg font-semibold">{r.scenario.completionDate ? formatDateBR(r.scenario.completionDate) : "Não conclui com esses valores"}</p>
          {delta !== null && delta !== 0 ? <p className={delta < 0 ? "text-xs text-positive" : "text-xs text-negative"}>{delta < 0 ? `${plural(-delta, "mês", "meses")} antes` : `${plural(delta, "mês", "meses")} depois`} do plano atual</p> : null}
        </div>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Aporte necessário para o prazo</p>
          <p className="text-lg font-semibold">{r.needed?.perPeriodCents != null ? `${formatMoney(r.needed.perPeriodCents)}/mês` : deadline ? "—" : "Defina um prazo"}</p>
          {r.needed && r.needed.perPeriodCents == null ? <p className="text-xs text-warning">{r.needed.explanation}</p> : null}
        </div>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Composição projetada</p>
          <p className="font-medium">
            Aportes {formatMoney(r.scenario.totalContributedCents)} · Rendimento {formatMoney(r.scenario.totalYieldCents)}
          </p>
          <p className="text-xs text-muted">Rendimento é hipotético e separado do valor já acumulado.</p>
        </div>
      </div>
      {series.length > 1 ? <SingleLineChart data={series} xKey="data" yKey="saldo" label="Saldo projetado da meta" xLabel="Mês" target={r.targetCents} targetLabel="Valor-alvo" /> : null}
      {r.scenario.completionDate && deadline && r.scenario.completionDate > deadline ? (
        <p className="text-sm text-warning">Neste cenário a meta termina depois do prazo. Alternativas: aumentar o aporte, estender o prazo para {formatDateBR(r.scenario.completionDate)} ou reduzir o valor-alvo.</p>
      ) : null}
      <p className="text-xs text-muted">Simulação no seu navegador com o mesmo motor de cálculo do servidor. Para aplicar, edite a meta. Projeções não são garantias. Referência: {formatDateBR(addMonths(base.today, 0))}.</p>
    </div>
  );
}
