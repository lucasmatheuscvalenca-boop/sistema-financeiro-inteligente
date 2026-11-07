import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus } from "lucide-react";
import { copyBudgetsAction, deleteBudgetAction, saveBudgetAction } from "../_actions/finance";
import { BudgetSimulator } from "@/components/finance/budget-simulator";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Progress } from "@/components/ui/progress";
import { addMonthsToKey, assertMonthKey, formatMonthKey, monthKey } from "@/domain/dates";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { getBudgetEvaluation, previousMonthWithBudgets } from "@/server/services/budgets";
import { formLookups } from "@/server/services/lookups";
import { estimateMonthlyBasis } from "@/server/services/planning";

export const metadata: Metadata = { title: "Orçamento" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  let month = monthKey(ctx.today);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {}
  const [evaluation, lookups, basis, prevWithBudgets] = await Promise.all([getBudgetEvaluation(ctx, month), formLookups(ctx), estimateMonthlyBasis(ctx), previousMonthWithBudgets(ctx, month)]);
  const expenseCats = lookups.categories.filter((c) => c.kind === "expense");
  const budgetIdByCat = new Map(evaluation.budgets.map((b) => [b.categoryId, b.id]));
  const addForm = (
    <ActionForm action={saveBudgetAction} resetOnSuccess>
      <input type="hidden" name="month" value={month} />
      <Field label="Categoria" name="categoryId">
        <Select name="categoryId" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {expenseCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Limite mensal" name="limit">
          <MoneyInput name="limit" required />
        </Field>
        <Field label="Avisar ao atingir (%)" name="alertThresholdPct">
          <Input name="alertThresholdPct" type="number" min={1} max={100} defaultValue={80} />
        </Field>
      </div>
      <p className="text-xs text-muted">O limite de uma categoria inclui os gastos das subcategorias dela.</p>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Salvar limite</SubmitButton>
      </div>
    </ActionForm>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Orçamento" description="Planejado versus realizado, com alerta configurável e projeção de fechamento pelo ritmo de gastos." actions={<Dialog trigger={<><Plus className="size-4" /> Definir limite</>} title="Limite por categoria">{addForm}</Dialog>} />

      <div className="flex items-center gap-1">
        <Link aria-label="Mês anterior" href={`/orcamento?mes=${addMonthsToKey(month, -1)}`} className="rounded-lg p-2 hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="min-w-40 text-center font-semibold first-letter:uppercase">{formatMonthKey(month)}</span>
        <Link aria-label="Próximo mês" href={`/orcamento?mes=${addMonthsToKey(month, 1)}`} className="rounded-lg p-2 hover:bg-surface-2">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      {evaluation.lines.length === 0 ? (
        <EmptyState
          title="Nenhum limite definido para este mês"
          description="Comece pelas categorias em que você mais gasta. Você pode copiar os limites de um mês anterior."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {prevWithBudgets ? (
                <InlineAction action={copyBudgetsAction} hidden={{ from: prevWithBudgets, to: month }} variant="secondary" size="md">
                  <Copy className="size-4" /> Copiar de {formatMonthKey(prevWithBudgets)}
                </InlineAction>
              ) : null}
              <Dialog trigger={<><Plus className="size-4" /> Definir limite</>} title="Limite por categoria">
                {addForm}
              </Dialog>
            </div>
          }
        />
      ) : (
        <>
          <StatStrip>
            <Stat label="Planejado" value={<Money cents={evaluation.totals.limitCents} />} />
            <Stat label="Realizado" value={<Money cents={evaluation.totals.spentCents} />} hint={`${Math.round(evaluation.elapsedFraction * 100)}% do mês transcorrido`} />
            <Stat label="Disponível" value={<Money cents={evaluation.totals.remainingCents} />} hint="Limite − realizado − previsto" />
            <Stat label="Projeção de fechamento" value={<Money cents={evaluation.totals.projectedCents} />} hint="Pelo ritmo diário de gastos" />
          </StatStrip>
          {evaluation.unbudgetedSpentCents > 0 ? (
            <Callout tone="info">
              <Money cents={evaluation.unbudgetedSpentCents} tone="none" /> foram gastos em categorias sem limite definido neste mês.
            </Callout>
          ) : null}
          <Section title="Limites por categoria">
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {evaluation.lines.map((l) => {
                const tone = l.status === "exceeded" ? "negative" : l.status === "warning" || l.projectedStatus === "exceeded" ? "warning" : "petrol";
                return (
                  <li key={l.categoryId} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.categoryName}</p>
                        {l.status !== "ok" ? <Badge tone={l.status === "exceeded" ? "negative" : "warning"}>{l.status === "exceeded" ? "Excedido" : `Acima de ${l.alertThresholdPct}%`}</Badge> : null}
                      </div>
                      <Dialog trigger={<Pencil className="size-4" />} triggerLabel={`Editar o limite de ${l.categoryName}`} variant="ghost" size="sm" title={`Limite de ${l.categoryName}`} description={formatMonthKey(month)}>
                        <ActionForm action={saveBudgetAction}>
                          <input type="hidden" name="categoryId" value={l.categoryId} />
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="alertThresholdPct" value={l.alertThresholdPct} />
                          <Field label="Limite do mês" name="limit">
                            <MoneyInput name="limit" defaultValue={centsToInput(l.limitCents)} required />
                          </Field>
                          <SubmitButton>Salvar limite</SubmitButton>
                        </ActionForm>
                        <div className="mt-4 border-t border-line pt-4">
                          <InlineAction action={deleteBudgetAction} hidden={{ id: budgetIdByCat.get(l.categoryId)! }} confirm="Remover este limite?">
                            Remover limite
                          </InlineAction>
                        </div>
                      </Dialog>
                    </div>
                    <p className="mt-2 text-sm">
                      <Money cents={l.spentCents} tone="none" className="text-lg" /> <span className="text-muted">de <Money cents={l.limitCents} tone="none" /></span>
                    </p>
                    <Progress className="mt-2" value={l.usedPct} tone={tone} label={`Uso do limite de ${l.categoryName}`} />
                    <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
                      <span>
                        Restam <Money cents={l.remainingCents} />
                        {l.scheduledCents > 0 ? (
                          <>
                            {" "}
                            · <Money cents={l.scheduledCents} tone="none" /> previsto
                          </>
                        ) : null}
                      </span>
                      <span className={l.projectedStatus === "exceeded" ? "text-warning" : undefined}>
                        {l.projectedStatus === "exceeded" ? "No ritmo atual passa do limite: " : "Projeção "}
                        <Money cents={l.projectedCents} tone="none" />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Simular ajustes" description="Teste novos limites e veja o efeito na margem mensal antes de salvar.">
              <BudgetSimulator evaluation={evaluation} plannedIncomeCents={basis.incomeCents} />
              {basis.incomeSource === "none" ? <p className="mt-2 text-xs text-warning">Renda mensal desconhecida: cadastre receitas recorrentes ou informe no briefing para uma margem realista.</p> : null}
          </Section>
        </>
      )}
    </div>
  );
}
