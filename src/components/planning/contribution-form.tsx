"use client";

import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton, type FormAction } from "@/components/ui/form";

export function ContributionForm({ action, goalId, accounts, today, isOwner, hasHolding }: { action: FormAction; goalId: string; accounts: Array<{ id: string; name: string }>; today: string; isOwner: boolean; hasHolding: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <input type="hidden" name="goalId" value={goalId} />
      <div className="grid gap-4 sm:grid-cols-2">
        {isOwner ? (
          <Field label="Tipo" name="kind">
            <Select name="kind" defaultValue="deposit">
              <option value="deposit">Aporte</option>
              <option value="withdrawal">Resgate</option>
              <option value="yield">Rendimento recebido</option>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="kind" value="deposit" />
        )}
        <Field label="Valor" name="amount">
          <MoneyInput name="amount" required />
        </Field>
        <Field label="Data" name="date">
          <Input name="date" type="date" max={today} defaultValue={today} required />
        </Field>
        {isOwner ? (
          <Field label="Saiu da conta (opcional)" name="sourceAccountId" hint={hasHolding ? "Gera uma transferência para a conta da meta (não é despesa)." : "A meta não tem conta própria: o valor fica reservado no saldo."}>
            <Select name="sourceAccountId" defaultValue="">
              <option value="">Não movimentar contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Observação" name="note" className="sm:col-span-2">
          <Input name="note" maxLength={200} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Registrar</SubmitButton>
      </div>
    </ActionForm>
  );
}
