"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatMonthShort } from "@/domain/dates";
import { CHART, compactMoney, money } from "./chart-utils";

interface Series {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <svg width="18" height="8">
            <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipBox({ active, payload, label, series, formatLabel }: TooltipContentProps<number, string> & { series: Series[]; formatLabel?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-semibold text-ink">{formatLabel ? formatLabel(String(label)) : label}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted">
            <span className="inline-block size-2 rounded-full" style={{ background: s?.color }} />
            {s?.label ?? p.name}: <span className="font-medium tabular-nums text-ink">{money(Number(p.value))}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Tabela equivalente ao gráfico (acessibilidade e leitura precisa). */
function DataTable({ rows, xKey, xLabel, series, format }: { rows: Array<Record<string, number | string>>; xKey: string; xLabel: string; series: Series[]; format?: (x: string) => string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted hover:text-ink">Ver dados em tabela</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              <th className="px-3 py-1.5 font-medium">{xLabel}</th>
              {series.map((s) => (
                <th key={s.key} className="px-3 py-1.5 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-1">{format ? format(String(r[xKey])) : r[xKey]}</td>
                {series.map((s) => (
                  <td key={s.key} className="px-3 py-1 text-right tabular-nums">
                    {r[s.key] == null || r[s.key] === "" ? "—" : money(Number(r[s.key]))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Frame({ children, height, label }: { children: ReactNode; height: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

const axisProps = { stroke: CHART.axis, fontSize: 11, tickLine: false, axisLine: false } as const;

/** Escala "redonda" de 0 até cobrir o máximo, em 3 a 5 passos de 1, 2, 2,5 ou 5 × 10^n. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step);
}

export function IncomeExpenseChart({ data }: { data: Array<{ month: string; income: number; expense: number }> }) {
  const series: Series[] = [
    { key: "income", label: "Receitas", color: CHART.c1 },
    { key: "expense", label: "Despesas", color: CHART.c3 },
  ];
  return (
    <div>
      <Legend series={series} />
      <Frame height={220} label="Receitas e despesas realizadas por mês">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} />} />
          <Bar dataKey="income" fill={CHART.c1} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expense" fill={CHART.c3} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </Frame>
      <DataTable rows={data} xKey="month" xLabel="Mês" series={series} />
    </div>
  );
}

export function CashFlowChart({ data, showEstimated }: { data: Array<{ date: string; confirmed: number; withEstimated: number }>; showEstimated: boolean }) {
  const series: Series[] = [{ key: "confirmed", label: "Só valores confirmados", color: CHART.c1 }];
  if (showEstimated) series.push({ key: "withEstimated", label: "Incluindo estimativas", color: CHART.c3, dashed: true });
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return (
    <div>
      <Legend series={series} />
      <Frame height={260} label="Projeção diária do saldo livre">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={fmt} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps} />
          <ReferenceLine y={0} stroke={CHART.negative} strokeWidth={1} />
          <Tooltip content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} formatLabel={fmt} />} />
          <Area type="stepAfter" dataKey="confirmed" stroke={CHART.c1} strokeWidth={2} fill={CHART.c1} fillOpacity={0.1} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }} />
          {showEstimated ? <Area type="stepAfter" dataKey="withEstimated" stroke={CHART.c3} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }} /> : null}
        </AreaChart>
      </Frame>
      <DataTable rows={data.filter((_, i) => i % 3 === 0 || i === data.length - 1)} xKey="date" xLabel="Data" series={series} format={fmt} />
    </div>
  );
}

export function SingleLineChart({ data, xKey, yKey, label, xLabel, target, targetLabel }: { data: Array<Record<string, number | string>>; xKey: string; yKey: string; label: string; xLabel: string; target?: number; targetLabel?: string }) {
  const series: Series[] = [{ key: yKey, label, color: CHART.c1 }];
  return (
    <div>
      <Frame height={220} label={label}>
        <LineChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey={xKey} minTickGap={20} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps} />
          {target != null ? <ReferenceLine y={target} stroke={CHART.c2} strokeWidth={1.5} strokeDasharray="4 4" label={{ value: targetLabel ?? "Meta", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} /> : null}
          <Tooltip content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} />} />
          <Line type="monotone" dataKey={yKey} stroke={CHART.c1} strokeWidth={2} dot={data.length <= 12 ? { r: 4, strokeWidth: 2, stroke: CHART.surface, fill: CHART.c1 } : false} activeDot={{ r: 5, strokeWidth: 2, stroke: CHART.surface }} />
        </LineChart>
      </Frame>
      <DataTable rows={data} xKey={xKey} xLabel={xLabel} series={series} />
    </div>
  );
}

export function ScenarioChart({ data, retirementAge }: { data: Array<{ age: number; base: number; conservative: number; optimistic: number }>; retirementAge: number }) {
  const series: Series[] = [
    { key: "base", label: "Intermediário", color: CHART.c1 },
    { key: "optimistic", label: "Otimista", color: CHART.c2 },
    { key: "conservative", label: "Conservador", color: CHART.c3, dashed: true },
  ];
  return (
    <div>
      <Legend series={series} />
      <Frame height={280} label="Evolução patrimonial projetada por cenário, em valores de hoje">
        <LineChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="age" tickFormatter={(a) => `${a} anos`} minTickGap={28} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={76} {...axisProps} />
          <ReferenceLine x={retirementAge} stroke={CHART.axis} strokeDasharray="3 3" label={{ value: "Aposentadoria", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} formatLabel={(l) => `${l} anos`} />} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }} />
          ))}
        </LineChart>
      </Frame>
      <DataTable rows={data.filter((r) => r.age % 5 === 0)} xKey="age" xLabel="Idade" series={series} />
    </div>
  );
}

/**
 * Evolução de uma meta: barras com o saldo real de cada mês e linha tracejada com a projeção
 * até a conclusão, marcada por um ponto. A linha do objetivo fica como referência.
 */
export function GoalEvolutionChart({
  data,
  targetCents,
  completionMonth,
}: {
  data: Array<{ month: string; actualCents: number | null; projectedCents: number | null }>;
  targetCents: number;
  completionMonth: string | null;
}) {
  const series: Series[] = [
    { key: "actualCents", label: "Acumulado", color: CHART.c1 },
    { key: "projectedCents", label: "Projeção", color: CHART.c2, dashed: true },
  ];
  const hasProjection = data.some((d) => d.projectedCents !== null && d.actualCents === null);
  const shown = hasProjection ? series : series.slice(0, 1);
  const end = completionMonth ? data.find((d) => d.month === completionMonth) : undefined;
  const ticks = niceTicks(Math.max(targetCents, ...data.map((d) => Math.max(d.actualCents ?? 0, d.projectedCents ?? 0))));
  return (
    <div>
      <Legend series={shown} />
      <Frame height={240} label={`Evolução da meta${completionMonth ? `, conclusão projetada em ${formatMonthShort(completionMonth)}` : ""}`}>
        <ComposedChart data={data} margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} minTickGap={16} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} domain={[0, ticks[ticks.length - 1] ?? 0]} ticks={ticks} interval={0} {...axisProps} />
          <ReferenceLine y={targetCents} stroke={CHART.axis} strokeOpacity={0.6} strokeDasharray="3 3" label={{ value: "Objetivo", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={shown} formatLabel={formatMonthShort} />} />
          <Bar dataKey="actualCents" fill={CHART.c1} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive />
          {hasProjection ? (
            <Line type="monotone" dataKey="projectedCents" stroke={CHART.c2} strokeWidth={2} strokeDasharray="5 4" connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }} />
          ) : null}
          {end && end.projectedCents !== null ? (
            <ReferenceDot
              x={end.month}
              y={end.projectedCents}
              r={5}
              fill={CHART.c2}
              stroke={CHART.surface}
              strokeWidth={2}
              label={{ value: "Conclusão", position: "top", offset: 10, fill: "var(--ink)", fontSize: 11, fontWeight: 600 }}
            />
          ) : null}
        </ComposedChart>
      </Frame>
      <DataTable rows={data.map((d) => ({ month: d.month, actualCents: d.actualCents ?? "", projectedCents: d.projectedCents ?? "" })) as Array<Record<string, number | string>>} xKey="month" xLabel="Mês" series={shown} format={formatMonthShort} />
    </div>
  );
}
