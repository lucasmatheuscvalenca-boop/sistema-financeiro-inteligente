"use client";

import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, SubmitButton, Textarea, type FormAction } from "@/components/ui/form";

export function AssetForm({ action, today, defaults }: { action: FormAction; today: string; defaults?: { id: string; name: string; category: string; value: string; provenance: string; valuedAt: string; liquid: boolean; notes: string | null } }) {
  return (
    <ActionForm action={action} resetOnSuccess={!defaults}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" name="name" className="sm:col-span-2">
          <Input name="name" defaultValue={defaults?.name} placeholder="ex.: Apartamento, Tesouro IPCA 2035, Carro" required />
        </Field>
        <Field label="Categoria" name="category">
          <Select name="category" defaultValue={defaults?.category ?? "investment"}>
            <option value="investment">Investimento</option>
            <option value="real_estate">Imóvel</option>
            <option value="vehicle">Veículo</option>
            <option value="retirement">Previdência</option>
            <option value="receivable">Valor a receber</option>
            <option value="other">Outro bem</option>
          </Select>
        </Field>
        <Field label="Valor" name="value">
          <MoneyInput name="value" defaultValue={defaults?.value} required />
        </Field>
        <Field label="Procedência do valor" name="provenance" hint="Não inventamos cotações: o valor é o que você informar.">
          <Select name="provenance" defaultValue={defaults?.provenance ?? "informed"}>
            <option value="informed">Informado (valor de mercado/extrato)</option>
            <option value="estimated">Estimado (sem referência exata)</option>
            <option value="confirmed">Confirmado (documento oficial)</option>
          </Select>
        </Field>
        <Field label="Data do valor" name="valuedAt">
          <Input name="valuedAt" type="date" max={today} defaultValue={defaults?.valuedAt ?? today} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox name="liquid" label="Tem liquidez imediata (resgate em até 1 dia útil)" defaultChecked={defaults?.liquid} />
        </div>
        <Field label="Observações" name="notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={defaults?.notes ?? ""} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Salvar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DebtForm({ action, today, defaults }: { action: FormAction; today: string; defaults?: { id: string; name: string; category: string; outstanding: string; monthlyPayment: string; interestRateMonthly: string; remainingInstallments: string; provenance: string; valuedAt: string; notes: string | null } }) {
  return (
    <ActionForm action={action} resetOnSuccess={!defaults}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" name="name" className="sm:col-span-2">
          <Input name="name" defaultValue={defaults?.name} placeholder="ex.: Financiamento do carro" required />
        </Field>
        <Field label="Tipo" name="category">
          <Select name="category" defaultValue={defaults?.category ?? "loan"}>
            <option value="loan">Empréstimo</option>
            <option value="financing">Financiamento</option>
            <option value="mortgage">Financiamento imobiliário</option>
            <option value="other">Outra dívida</option>
          </Select>
        </Field>
        <Field label="Saldo devedor" name="outstanding">
          <MoneyInput name="outstanding" defaultValue={defaults?.outstanding} required />
        </Field>
        <Field label="Parcela mensal" name="monthlyPayment">
          <MoneyInput name="monthlyPayment" defaultValue={defaults?.monthlyPayment} />
        </Field>
        <Field label="Juros ao mês (%)" name="interestRateMonthly">
          <Input name="interestRateMonthly" inputMode="decimal" defaultValue={defaults?.interestRateMonthly} placeholder="ex.: 1,49" />
        </Field>
        <Field label="Parcelas restantes" name="remainingInstallments">
          <Input name="remainingInstallments" type="number" min={0} max={600} defaultValue={defaults?.remainingInstallments} />
        </Field>
        <Field label="Procedência" name="provenance">
          <Select name="provenance" defaultValue={defaults?.provenance ?? "informed"}>
            <option value="informed">Informado</option>
            <option value="confirmed">Confirmado (extrato do credor)</option>
            <option value="estimated">Estimado</option>
          </Select>
        </Field>
        <Field label="Data do saldo" name="valuedAt">
          <Input name="valuedAt" type="date" max={today} defaultValue={defaults?.valuedAt ?? today} />
        </Field>
        <Field label="Observações" name="notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={defaults?.notes ?? ""} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Salvar</SubmitButton>
      </div>
    </ActionForm>
  );
}
