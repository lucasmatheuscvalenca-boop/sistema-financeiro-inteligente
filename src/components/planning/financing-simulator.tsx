"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Car, House } from "lucide-react";
import { addMonths, formatMonthKey, monthKey } from "@/domain/dates";
import { compareFinancing, validateFinancingInput, type AmortizationSystem, type FinancingInput } from "@/domain/financing";
import { parseMoney } from "@/domain/money";
import { plural } from "@/domain/text";
import { centsToInput, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

type Kind = "home" | "vehicle";

/** Premissas iniciais por tipo de bem; tudo pode ser alterado. */
const PRESETS: Record<Kind, { price: number; down: number; rate: string; months: string; system: AmortizationSystem; change: string; waiting: number }> = {
  home: { price: 40_000_000, down: 8_000_000, rate: "11,5", months: "360", system: "sac", change: "4", waiting: 180_000 },
  vehicle: { price: 9_000_000, down: 2_000_000, rate: "22", months: "48", system: "price", change: "3", waiting: 0 },
};

function money(v: string): number {
  try {
    return v.trim() ? Math.max(0, parseMoney(v)) : 0;
  } catch {
    return Number.NaN;
  }
}

const pct = (v: string) => Number(v.replace(",", ".")) / 100;

/** Valor para o campo com separador de milhar ("400.000,00"), mais fácil de conferir. */
const show = (cents: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export function FinancingSimulator({ today, savingsRatePct }: { today: string; savingsRatePct: string }) {
  const [kind, setKind] = useState<Kind>("home");
  const [price, setPrice] = useState(show(PRESETS.home.price));
  const [down, setDown] = useState(show(PRESETS.home.down));
  const [rate, setRate] = useState(PRESETS.home.rate);
  const [months, setMonths] = useState(PRESETS.home.months);
  const [system, setSystem] = useState<AmortizationSystem>(PRESETS.home.system);
  const [savings, setSavings] = useState(savingsRatePct);
  const [change, setChange] = useState(PRESETS.home.change);
  const [waiting, setWaiting] = useState(show(PRESETS.home.waiting));

  function choose(k: Kind) {
    const p = PRESETS[k];
    setKind(k);
    setPrice(show(p.price));
    setDown(show(p.down));
    setRate(p.rate);
    setMonths(p.months);
    setSystem(p.system);
    setChange(p.change);
    setWaiting(show(p.waiting));
  }

  const r = useMemo(() => {
    const input: FinancingInput = {
      priceCents: money(price),
      downPaymentCents: money(down),
      annualRate: pct(rate),
      months: Number(months),
      system,
      savingsAnnualRate: pct(savings),
      assetAnnualChange: pct(change),
      waitingMonthlyCostCents: money(waiting),
    };
    const errors = validateFinancingInput(input);
    if (errors.length) return { ok: false as const, errors };
    return { ok: true as const, input, ...compareFinancing(input) };
  }, [price, down, rate, months, system, savings, change, waiting]);

  const field = "h-10 w-full rounded-lg border border-field-line bg-field px-3 text-sm tabular-nums";
  const label = "space-y-1.5 text-sm font-medium";
  const purchase = r.ok && r.saving.months !== null ? formatMonthKey(monthKey(addMonths(today, r.saving.months))) : null;
  const goalHref =
    r.ok
      ? `/metas/nova?${new URLSearchParams({ nome: kind === "home" ? "Entrada da casa" : "Carro à vista", tipo: kind, valor: centsToInput(r.saving.priceAtPurchaseCents ?? r.input.priceCents), mensal: centsToInput(r.saving.monthlyDepositCents) })}`
      : "/metas/nova";

  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="O que você quer comprar" className="inline-flex rounded-lg bg-surface-2 p-1">
        {(["home", "vehicle"] as const).map((k) => {
          const Icon = k === "home" ? House : Car;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => choose(k)}
              className={cn("flex items-center gap-2 rounded-md px-4 py-2 text-sm transition", kind === k ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-ink")}
            >
              <Icon className="size-4" /> {k === "home" ? "Casa ou apartamento" : "Carro"}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Valor do bem (R$)
          <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          Entrada que você já tem (R$)
          <input className={field} value={down} onChange={(e) => setDown(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          CET do banco (% ao ano)
          <input className={field} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          Prazo (meses)
          <input className={field} type="number" min={1} max={420} value={months} onChange={(e) => setMonths(e.target.value)} />
        </label>
        <label className={label}>
          Sistema
          <select className={field} value={system} onChange={(e) => setSystem(e.target.value as AmortizationSystem)}>
            <option value="sac">SAC (parcela cai)</option>
            <option value="price">Price (parcela fixa)</option>
          </select>
        </label>
        <label className={label}>
          Rendimento se juntar (% ao ano)
          <input className={field} value={savings} onChange={(e) => setSavings(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          Preço do bem sobe (% ao ano)
          <input className={field} value={change} onChange={(e) => setChange(e.target.value)} inputMode="decimal" />
        </label>
        <label className={label}>
          {kind === "home" ? "Aluguel enquanto junta (R$/mês)" : "Transporte enquanto junta (R$/mês)"}
          <input className={field} value={waiting} onChange={(e) => setWaiting(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>
      </div>

      {!r.ok ? (
        <p role="alert" className="text-sm text-negative">
          {r.errors.join(" ")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section aria-labelledby="fin-financiar" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 id="fin-financiar" className="text-lg">
                Financiar agora
              </h2>
              <p className="mt-1 text-sm text-muted">Você usa o bem desde já e paga {plural(r.input.months, "parcela", "parcelas")}.</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{system === "sac" ? "Primeira parcela" : "Parcela"}</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(r.financing.firstInstallmentCents)}</dd>
                </div>
                {system === "sac" ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Última parcela</dt>
                    <dd className="tabular-nums">{formatMoney(r.financing.lastInstallmentCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Juros pagos ao banco</dt>
                  <dd className="tabular-nums text-negative">{formatMoney(r.financing.interestCents)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-medium">
                  <dt>Total pago (entrada + parcelas)</dt>
                  <dd className="tabular-nums">{formatMoney(r.financing.totalPaidCents)}</dd>
                </div>
              </dl>
            </section>
            <section aria-labelledby="fin-juntar" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 id="fin-juntar" className="text-lg">
                Juntar antes e comprar à vista
              </h2>
              <p className="mt-1 text-sm text-muted">Guardando {formatMoney(r.saving.monthlyDepositCents)} por mês, o mesmo valor da primeira parcela.</p>
              {r.saving.months === null ? (
                <p className="mt-4 text-sm text-warning">Com essas premissas o preço do bem sobe mais rápido do que a aplicação cresce: juntar não alcança em 50 anos.</p>
              ) : (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Compra em</dt>
                    <dd className="font-semibold first-letter:uppercase">
                      {purchase} ({plural(r.saving.months, "mês", "meses")})
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Preço do bem na época</dt>
                    <dd className="tabular-nums">{formatMoney(r.saving.priceAtPurchaseCents!)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Rendimento da aplicação</dt>
                    <dd className="tabular-nums text-positive">{formatMoney(r.saving.earningsCents!)}</dd>
                  </div>
                  {r.saving.waitingCostCents ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{kind === "home" ? "Aluguel pago na espera" : "Transporte pago na espera"}</dt>
                      <dd className="tabular-nums">{formatMoney(r.saving.waitingCostCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-line pt-2 font-medium">
                    <dt>Total que sai do seu bolso</dt>
                    <dd className="tabular-nums">{formatMoney(r.saving.depositedCents! + (r.saving.waitingCostCents ?? 0))}</dd>
                  </div>
                </dl>
              )}
            </section>
          </div>

          {r.differenceCents !== null ? (
            <div className="border-l-[3px] border-l-accent bg-surface px-4 py-3 text-sm">
              <p className="font-semibold">
                {r.differenceCents > 0
                  ? `Juntar antes sai ${formatMoney(r.differenceCents)} mais barato, mas você espera ${plural(r.saving.months!, "mês", "meses")}.`
                  : `Financiar sai ${formatMoney(-r.differenceCents)} mais barato com essas premissas${r.saving.waitingCostCents ? ", por causa do custo da espera" : ""}.`}
              </p>
              <p className="mt-1 text-muted">
                Uma regra prática: quanto maior a diferença entre o CET e o rendimento da aplicação, mais caro fica financiar. Amortizar parcelas antes do prazo reduz os juros.
              </p>
              {r.differenceCents > 0 ? (
                <Link href={goalHref} className={cn(buttonClass("secondary"), "mt-3")}>
                  Prefiro juntar: criar a meta
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted">
        Simulação no seu navegador; nada é gravado. Use o CET (custo efetivo total) que o banco informa, que já inclui seguros e tarifas. Valores nominais; o rendimento e a variação de preço são premissas suas, não garantias.
      </p>
    </div>
  );
}
