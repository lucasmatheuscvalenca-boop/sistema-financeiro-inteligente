import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CircleHelp, Scale, Target, TrendingDown } from "lucide-react";
import { saveTransactionAction } from "../_actions/finance";
import { TransactionForm } from "@/components/finance/transaction-form";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { KeyValue, Money, PageHeader } from "@/components/ui/misc";
import { VERDICT_TITLE, type SpendAnalysis } from "@/domain/can-i-spend";
import { formatDateBR } from "@/domain/dates";
import { parseMoney } from "@/domain/money";
import { voiceFor, toneToState, type Tone } from "@/mascots/voice";
import { centsToInput } from "@/lib/format";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { formLookups } from "@/server/services/lookups";
import { evaluateSpend } from "@/server/services/spend";

export const metadata: Metadata = { title: "Posso gastar?" };

const LEVEL_TONE: Record<SpendAnalysis["level"], Tone> = { green: "positive", yellow: "caution", red: "critical", gray: "unknown" };
const LEVEL_STYLE: Record<SpendAnalysis["level"], string> = {
  green: "from-petrol-600 to-petrol-500",
  yellow: "from-amber-600 to-amber-500",
  red: "from-orange-700 to-orange-600",
  gray: "from-navy-700 to-navy-600",
};

function tryMoney(v?: string): number | null {
  if (!v) return null;
  try {
    const c = parseMoney(v);
    return c > 0 ? c : null;
  } catch {
    return null;
  }
}

export default async function CanISpendPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx, mascotId } = await requireOnboarded();
  const sp = await searchParams;
  const lookups = await formLookups(ctx);
  const amount = tryMoney(sp.valor);
  let analysis: (SpendAnalysis & { categoryName: string | null }) | null = null;
  let error: string | null = null;
  if (sp.valor !== undefined) {
    if (!amount) error = "Informe um valor maior que zero, no formato 600 ou 1.250,90.";
    else {
      try {
        analysis = await evaluateSpend(ctx, {
          amountCents: amount,
          description: sp.descricao || undefined,
          categoryId: sp.categoria || undefined,
          method: sp.forma === "cartao" ? "card" : "account",
          cardId: sp.forma === "cartao" ? sp.cartao || lookups.cards[0]?.id : undefined,
          installments: Number(sp.parcelas) || 1,
          date: sp.data || undefined,
          cheaperAlternativeCents: tryMoney(sp.alternativa) ?? undefined,
        });
      } catch (e) {
        error = e instanceof AppError ? e.message : "Não foi possível analisar agora.";
      }
    }
  }
  const voice = voiceFor(mascotId);
  const tone = analysis ? LEVEL_TONE[analysis.level] : "neutral";
  const expenseCats = lookups.categories.filter((c) => c.kind === "expense");
  const input = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Decisão" title="Posso gastar?" description="Uma avaliação que considera seu caixa até o próximo recebimento, contas e faturas futuras, orçamento, metas, reserva e margem de segurança — não só o saldo de hoje." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="self-start">
          <CardHeader title="O que você quer gastar?" icon={<CircleHelp className="size-4" />} />
          <CardBody>
            <form action="/posso-gastar" className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                Valor
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">R$</span>
                  <input name="valor" defaultValue={sp.valor} inputMode="decimal" placeholder="600,00" required className={cn(input, "pl-9 text-lg font-semibold tabular-nums")} />
                </span>
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Descrição
                <input name="descricao" defaultValue={sp.descricao} placeholder="ex.: jantar e passeio no fim de semana" className={input} />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Categoria
                <select name="categoria" defaultValue={sp.categoria ?? ""} className={input}>
                  <option value="">Não sei / sem categoria</option>
                  {expenseCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5 text-sm font-medium">
                  Como vai pagar
                  <select name="forma" defaultValue={sp.forma ?? "conta"} className={input}>
                    <option value="conta">Débito / Pix / dinheiro</option>
                    {lookups.cards.length ? <option value="cartao">Cartão de crédito</option> : null}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  Quando
                  <input name="data" type="date" min={ctx.today} defaultValue={sp.data ?? ctx.today} className={input} />
                </label>
              </div>
              {lookups.cards.length ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5 text-sm font-medium">
                    Cartão
                    <select name="cartao" defaultValue={sp.cartao ?? ""} className={input}>
                      {lookups.cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Parcelas
                    <input name="parcelas" type="number" min={1} max={24} defaultValue={sp.parcelas ?? "1"} className={input} />
                  </label>
                </div>
              ) : null}
              <label className="block space-y-1.5 text-sm font-medium">
                Alternativa mais barata (opcional)
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">R$</span>
                  <input name="alternativa" defaultValue={sp.alternativa} inputMode="decimal" placeholder="Padrão: metade do valor" className={cn(input, "pl-9")} />
                </span>
              </label>
              <button className={buttonClass("primary", "lg", "w-full")}>Analisar</button>
              <p className="text-xs text-muted">Nada é gravado nem bloqueado. As opções sugeridas são simulações até você confirmar.</p>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {error ? <Callout tone="negative">{error}</Callout> : null}
          {!analysis && !error ? (
            <Card className="p-8">
              <div className="flex flex-col items-center text-center">
                <MascotArt id={mascotId} state="guidance" size={120} />
                <p className="mt-4 max-w-md text-muted">{voice.opening("neutral")} Informe o valor ao lado. Exemplo: “Posso gastar R$ 600 em um jantar e um passeio neste fim de semana?”</p>
              </div>
            </Card>
          ) : null}
          {analysis ? (
            <>
              <section className={cn("rounded-[var(--radius-card)] bg-gradient-to-br p-5 text-white shadow-[var(--shadow-card)] sm:p-6", LEVEL_STYLE[analysis.level])} aria-live="polite">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <MascotArt id={mascotId} state={toneToState(tone)} size={96} className="rounded-full bg-white/10" />
                  <div>
                    <p className="text-sm text-white/85">{voice.opening(tone)}</p>
                    <h2 className="mt-1 text-2xl font-semibold" data-testid="veredito">
                      {analysis.title}
                    </h2>
                    <p className="mt-1 text-sm text-white/85">
                      <Money cents={analysis.amountCents} tone="none" />
                      {sp.descricao ? ` · ${sp.descricao}` : ""} · análise de {formatDateBR(analysis.horizon.start)} a {formatDateBR(analysis.horizon.end)}
                    </p>
                  </div>
                </div>
              </section>

              {analysis.after ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <TrendingDown className="size-3.5" /> Quanto sobra depois
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      <Money cents={analysis.after.leftoverAfterMarginCents} />
                    </p>
                    <p className="text-xs text-muted">
                      livre além da margem de <Money cents={analysis.safetyMarginCents} tone="none" />
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <CalendarClock className="size-3.5" /> Ponto mais baixo do saldo
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      <Money cents={analysis.after.lowestBalanceCents} />
                    </p>
                    <p className="text-xs text-muted">em {formatDateBR(analysis.after.lowestDate)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Scale className="size-3.5" /> Valor máximo seguro
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      <Money cents={analysis.maxSafeAmountCents} />
                    </p>
                    <p className="text-xs text-muted">sem afetar contas, metas, margem e orçamento</p>
                  </Card>
                </div>
              ) : null}

              <Card>
                <CardHeader title="Por que esse resultado" />
                <CardBody className="space-y-4 text-sm">
                  <ul className="space-y-1.5">
                    {analysis.facts.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                    {analysis.horizon.nextIncomeDate ? <li>• Período analisado: {analysis.horizon.reason}.</li> : null}
                  </ul>
                  {analysis.affectedCommitments.length ? (
                    <div>
                      <p className="font-semibold">Compromissos que ficariam descobertos</p>
                      <ul className="mt-1 space-y-1">
                        {analysis.affectedCommitments.map((c, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span>
                              {formatDateBR(c.date)} · {c.label}
                            </span>
                            <span className="tabular-nums">
                              <Money cents={-c.amountCents} /> → saldo <Money cents={c.balanceAfterCents} />
                            </span>
                          </li>
                        ))}
                      </ul>
                      {analysis.commitmentShortfallCents ? (
                        <p className="mt-1 text-negative">
                          Mesmo sem nenhum aporte em metas, faltariam <Money cents={analysis.commitmentShortfallCents} tone="none" />.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {analysis.goalsAtRisk.length ? (
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Target className="size-4" /> Metas que podem atrasar
                      </p>
                      <ul className="mt-1 space-y-1">
                        {analysis.goalsAtRisk.map((g) => (
                          <li key={g.goalId}>
                            <Link href={`/metas/${g.goalId}`} className="underline">
                              {g.name}
                            </Link>
                            : aportar <Money cents={g.reductionCents} tone="none" /> a menos neste período
                            {g.delayMonths ? `, atraso estimado de ${g.delayMonths} ${g.delayMonths === 1 ? "mês" : "meses"}` : ""}.
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {analysis.budget ? (
                    <KeyValue
                      items={[
                        [`Orçamento de ${analysis.budget.categoryName}`, <Money key="l" cents={analysis.budget.limitCents} tone="none" />],
                        ["Já comprometido", <Money key="c" cents={analysis.budget.committedCents} tone="none" />],
                        ["Restaria depois", <Money key="r" cents={analysis.budget.remainingAfterCents} />],
                      ]}
                    />
                  ) : null}
                  {analysis.card ? (
                    <p className="text-muted">
                      No cartão {analysis.card.cardName} ({analysis.card.installments}x), o dinheiro sai da conta no vencimento: {analysis.card.dueDates.map(formatDateBR).join(", ")}. Limite disponível: <Money cents={analysis.card.availableLimitCents} tone="none" />.
                    </p>
                  ) : null}
                </CardBody>
              </Card>

              {analysis.options.length ? (
                <Card>
                  <CardHeader title="Opções (simulações)" description="Nada muda até você confirmar uma ação." />
                  <CardBody className="grid gap-3 md:grid-cols-2">
                    {analysis.options.map((o, idx) => (
                      <div key={idx} className="rounded-2xl border border-line p-4 text-sm">
                        <p className="font-semibold">{o.label}</p>
                        <p className="mt-1 text-muted">{o.detail}</p>
                        <div className="mt-3">
                          {o.id === "buy" ? (
                            <Dialog trigger={<>Registrar a despesa</>} title="Registrar despesa" variant="secondary" size="sm" description="Confirme os dados. Só agora algo será gravado.">
                              <TransactionForm
                                action={saveTransactionAction}
                                accounts={lookups.accounts}
                                cards={lookups.cards}
                                categories={lookups.categories}
                                today={ctx.today}
                                defaults={{ kind: "expense", amount: centsToInput(analysis.amountCents), description: sp.descricao || "Despesa avaliada", categoryId: sp.categoria ?? null, cardId: sp.forma === "cartao" ? (sp.cartao ?? lookups.cards[0]?.id ?? null) : null, date: sp.data ?? ctx.today }}
                              />
                            </Dialog>
                          ) : o.id === "reduce" ? (
                            <Link className={buttonClass("ghost", "sm")} href={`/posso-gastar?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as Array<[string, string]>), valor: centsToInput(o.label.includes("até") ? analysis.maxSafeAmountCents : (analysis.alternatives.cheaper?.amountCents ?? analysis.maxSafeAmountCents)) })}`}>
                              Analisar este valor <ArrowRight className="size-3.5" />
                            </Link>
                          ) : o.id === "postpone" && analysis.alternatives.postpone ? (
                            <Link className={buttonClass("ghost", "sm")} href={`/posso-gastar?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as Array<[string, string]>), data: analysis.alternatives.postpone.date })}`}>
                              Ver análise nessa data <ArrowRight className="size-3.5" />
                            </Link>
                          ) : o.id === "adjust_goal" ? (
                            <Link className={buttonClass("ghost", "sm")} href={`/metas/${analysis.goalsAtRisk[0]?.goalId ?? ""}`}>
                              Abrir a meta e simular <ArrowRight className="size-3.5" />
                            </Link>
                          ) : o.id === "review_budget" ? (
                            <Link className={buttonClass("ghost", "sm")} href="/orcamento">
                              Rever orçamento <ArrowRight className="size-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              ) : null}

              {analysis.alternatives.cheaper ? (
                <Callout tone="info" title={`Alternativa de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(analysis.alternatives.cheaper.amountCents / 100)}`}>
                  {VERDICT_TITLE[analysis.alternatives.cheaper.verdict]}
                  {analysis.alternatives.cheaper.leftoverAfterMarginCents !== null ? <>, sobrando <Money cents={analysis.alternatives.cheaper.leftoverAfterMarginCents} tone="none" /> além da margem.</> : "."}
                </Callout>
              ) : null}

              {analysis.caveats.length ? (
                <Callout tone="warning" title="Limitações desta análise">
                  <ul className="space-y-0.5">
                    {analysis.caveats.map((c) => (
                      <li key={c}>• {c}</li>
                    ))}
                  </ul>
                </Callout>
              ) : null}
              <details className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <summary className="cursor-pointer font-medium">Premissas do cálculo</summary>
                <ul className="mt-2 space-y-1 text-muted">
                  {analysis.assumptions.map((a) => (
                    <li key={a}>• {a}</li>
                  ))}
                </ul>
              </details>
              <p className="text-sm text-muted">
                {voice.closing(tone)}{" "}
                <Link href={`/assistente?pergunta=${encodeURIComponent(`Posso gastar ${sp.valor} ${sp.descricao ? `em ${sp.descricao}` : ""}?`)}`} className="text-petrol-600 underline dark:text-petrol-300">
                  Conversar com o assistente sobre isso
                </Link>
                <Badge className="ml-2">dados até {formatDateBR(analysis.asOf)}</Badge>
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
