import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { copyBudgetsAction, deleteBudgetAction, saveBudgetAction } from "../_actions/finance";
import { BudgetSimulator } from "@/components/finance/budget-simulator";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat } from "@/components/ui/misc";
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
      <PageHeader eyebrow="Central financeira" title="Orçamento" description="Planejado versus realizado, com alerta configurável e projeção de fechamento pelo ritmo de gastos." actions={<Dialog trigger={<><Plus className="size-4" /> Definir limite</>} title="Limite por categoria">{addForm}</Dialog>} />

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
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <Stat label="Planejado" value={<Money cents={evaluation.totals.limitCents} />} />
            </Card>
            <Card className="p-4">
              <Stat label="Realizado" value={<Money cents={evaluation.totals.spentCents} />} hint={`${Math.round(evaluation.elapsedFraction * 100)}% do mês transcorrido`} />
            </Card>
            <Card className="p-4">
              <Stat label="Disponível" value={<Money cents={evaluation.totals.remainingCents} />} hint="Limite − realizado − previsto" />
            </Card>
            <Card className="p-4">
              <Stat label="Projeção de fechamento" value={<Money cents={evaluation.totals.projectedCents} />} hint="Pelo ritmo diário de gastos" />
            </Card>
          </section>
          {evaluation.unbudgetedSpentCents > 0 ? (
            <Callout tone="info">
              <Money cents={evaluation.unbudgetedSpentCents} tone="none" /> foram gastos em categorias sem limite definido neste mês.
            </Callout>
          ) : null}
          <Card>
            <CardHeader title="Limites por categoria" />
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 font-medium">Categoria</th>
                    <th className="py-2 font-medium">Uso</th>
                    <th className="py-2 text-right font-medium">Realizado</th>
                    <th className="py-2 text-right font-medium">Previsto</th>
                    <th className="py-2 text-right font-medium">Restante</th>
                    <th className="py-2 text-right font-medium">Projeção</th>
                    <th className="py-2 text-right font-medium">Limite</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {evaluation.lines.map((l) => (
                    <tr key={l.categoryId}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{l.categoryName}</p>
                        {l.status !== "ok" ? <Badge tone={l.status === "exceeded" ? "negative" : "warning"}>{l.status === "exceeded" ? "Excedido" : `Acima de ${l.alertThresholdPct}%`}</Badge> : l.projectedStatus === "exceeded" ? <Badge tone="warning">Ritmo acima do limite</Badge> : null}
                      </td>
                      <td className="w-40 py-2.5 pr-3">
                        <Progress size="sm" value={l.usedPct} tone={l.status === "exceeded" ? "negative" : l.status === "warning" ? "warning" : "petrol"} label={l.categoryName} />
                        <span className="text-xs text-muted">{l.usedPct.toFixed(0)}%</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Money cents={l.spentCents} tone="none" />
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">
                        <Money cents={l.scheduledCents} tone="none" />
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Money cents={l.remainingCents} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">
                        <Money cents={l.projectedCents} tone="none" />
                      </td>
                      <td className="py-2.5 text-right">
                        <ActionForm action={saveBudgetAction} className="flex items-center justify-end gap-1 space-y-0" showSuccess={false}>
                          <input type="hidden" name="categoryId" value={l.categoryId} />
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="alertThresholdPct" value={l.alertThresholdPct} />
                          <input name="limit" defaultValue={centsToInput(l.limitCents)} aria-label={`Limite de ${l.categoryName}`} className="h-8 w-28 rounded-lg border border-line bg-surface px-2 text-right text-sm tabular-nums" />
                          <SubmitButton size="sm" variant="ghost">
                            Salvar
                          </SubmitButton>
                        </ActionForm>
                      </td>
                      <td className="py-2.5 pl-1 text-right">
                        <InlineAction action={deleteBudgetAction} hidden={{ id: budgetIdByCat.get(l.categoryId)! }} confirm="Remover este limite?">
                          Remover
                        </InlineAction>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Simular ajustes" description="Teste novos limites e veja o efeito na margem mensal antes de salvar." />
            <CardBody>
              <BudgetSimulator evaluation={evaluation} plannedIncomeCents={basis.incomeCents} />
              {basis.incomeSource === "none" ? <p className="mt-2 text-xs text-warning">Renda mensal desconhecida: cadastre receitas recorrentes ou informe no briefing para uma margem realista.</p> : null}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
