import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { deleteRecurrenceAction, materializeOccurrenceAction, saveRecurrenceAction, toggleRecurrenceAction } from "../_actions/finance";
import { RecurrenceForm } from "@/components/finance/recurrence-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { addDays, formatDateBR, startOfMonth } from "@/domain/dates";
import { describeFrequency, nextOccurrence, type Frequency } from "@/domain/recurrence";
import { requireOnboarded } from "@/server/auth/current";
import { formLookups } from "@/server/services/lookups";
import { listRecurrences, pendingOccurrences } from "@/server/services/recurrences";

export const metadata: Metadata = { title: "Recorrências" };

export default async function RecurrencesPage() {
  const { ctx } = await requireOnboarded();
  const [rules, lookups] = await Promise.all([listRecurrences(ctx), formLookups(ctx)]);
  const pending = await pendingOccurrences(ctx, startOfMonth(ctx.today), addDays(ctx.today, 30), rules);
  const overdue = pending.filter((o) => o.date <= ctx.today);
  const upcoming = pending.filter((o) => o.date > ctx.today);
  const accName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const cardName = new Map(lookups.cards.map((c) => [c.id, c.name]));
  const form = <RecurrenceForm action={saveRecurrenceAction} accounts={lookups.accounts} cards={lookups.cards} categories={lookups.categories} today={ctx.today} />;
  const kindLabel = { income: "Receita", expense: "Despesa", transfer: "Transferência" } as Record<string, string>;
  const signed = (kind: string, cents: number) => (kind === "income" ? cents : kind === "expense" ? -cents : 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central financeira" title="Recorrências" description="Salário, aluguel, assinaturas e contas fixas. As próximas ocorrências entram automaticamente no fluxo de caixa." actions={<Dialog trigger={<><Plus className="size-4" /> Nova recorrência</>} title="Nova recorrência">{form}</Dialog>} />

      {overdue.length ? (
        <Card>
          <CardHeader title="Ocorrências deste mês aguardando confirmação" description="Confirme quando acontecerem — assim o saldo fica certo e a mesma ocorrência nunca é lançada duas vezes." />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {overdue.map((o) => (
                <li key={`${o.recurrence.id}-${o.date}`} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{o.recurrence.description}</span> <span className="text-muted">· {formatDateBR(o.date)}</span>
                  </span>
                  <Money cents={signed(o.recurrence.kind, o.amountCents)} signed />
                  <InlineAction action={materializeOccurrenceAction} hidden={{ recurrenceId: o.recurrence.id, occurrenceDate: o.date }} variant="secondary">
                    {o.recurrence.kind === "income" ? "Recebi" : "Paguei"}
                  </InlineAction>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState title="Nenhuma recorrência" description="Cadastre receitas e despesas que se repetem para ter previsões confiáveis." action={<Dialog trigger={<><Plus className="size-4" /> Nova recorrência</>} title="Nova recorrência">{form}</Dialog>} />
      ) : (
        <Card>
          <CardHeader title="Regras" />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Frequência</th>
                  <th className="py-2 font-medium">Onde</th>
                  <th className="py-2 font-medium">Próxima</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rules.map((r) => {
                  const next = r.active ? nextOccurrence({ startDate: r.startDate, frequency: r.frequency as Frequency, interval: r.interval, dayOfMonth: r.dayOfMonth, endDate: r.endDate, count: r.count }, ctx.today) : null;
                  return (
                    <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                      <td className="py-2.5">
                        <p className="font-medium">{r.description}</p>
                        <p className="text-xs text-muted">
                          {kindLabel[r.kind]} {r.certainty === "estimated" ? <Badge tone="warning">estimada</Badge> : null} {!r.active ? <Badge>pausada</Badge> : null}
                        </p>
                      </td>
                      <td className="py-2.5 text-muted">{describeFrequency(r.frequency as Frequency, r.interval)}</td>
                      <td className="py-2.5 text-muted">{r.cardId ? `Cartão ${cardName.get(r.cardId) ?? ""}` : r.kind === "transfer" ? `${accName.get(r.accountId ?? "") ?? ""} → ${accName.get(r.toAccountId ?? "") ?? ""}` : accName.get(r.accountId ?? "")}</td>
                      <td className="py-2.5 text-muted">{next ? formatDateBR(next) : "—"}</td>
                      <td className="py-2.5 text-right">
                        <Money cents={signed(r.kind, r.amountCents)} signed />
                      </td>
                      <td className="py-2.5 text-right">
                        <InlineAction action={toggleRecurrenceAction} hidden={{ id: r.id, active: String(!r.active) }}>
                          {r.active ? "Pausar" : "Retomar"}
                        </InlineAction>
                        <InlineAction action={deleteRecurrenceAction} hidden={{ id: r.id }} confirm="Excluir a regra? Lançamentos já registrados continuam.">
                          Excluir
                        </InlineAction>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {upcoming.length ? (
        <Card>
          <CardHeader title="Próximos 30 dias" />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {upcoming.map((o) => (
                <li key={`${o.recurrence.id}-${o.date}`} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {formatDateBR(o.date)} · {o.recurrence.description} {o.certainty === "estimated" ? <Badge tone="warning">estimada</Badge> : null}
                  </span>
                  <Money cents={signed(o.recurrence.kind, o.amountCents)} signed />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
