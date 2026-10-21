"use client";

import { useState } from "react";
import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton, type FormAction } from "@/components/ui/form";

const TYPES: Array<[string, string]> = [
  ["checking", "Conta corrente"],
  ["savings", "Poupança"],
  ["cash", "Dinheiro"],
  ["wallet", "Carteira digital"],
  ["investment", "Investimento"],
  ["other", "Outra"],
];
const DEFAULT_PURPOSE: Record<string, string> = { checking: "spending", cash: "spending", wallet: "spending", other: "spending", savings: "reserve", investment: "investment" };

export function AccountForm({ action, today, defaults }: { action: FormAction; today: string; defaults?: { id: string; name: string; type: string; purpose: string; institution: string | null; initialBalance: string; initialBalanceDate: string | null } }) {
  const [type, setType] = useState(defaults?.type ?? "checking");
  const [purpose, setPurpose] = useState(defaults?.purpose ?? DEFAULT_PURPOSE.checking!);
  return (
    <ActionForm action={action} resetOnSuccess={!defaults}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" name="name" className="sm:col-span-2">
          <Input name="name" defaultValue={defaults?.name} placeholder="ex.: Conta principal" required />
        </Field>
        <Field label="Tipo" name="type">
          <Select
            name="type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              if (!defaults) setPurpose(DEFAULT_PURPOSE[e.target.value] ?? "spending");
            }}
          >
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Finalidade" name="purpose" hint="Só contas “disponíveis para gastos” entram no saldo livre; só contas de reserva contam na reserva de emergência.">
          <Select name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="spending">Disponível para gastos</option>
            <option value="reserve">Reserva de emergência</option>
            <option value="goals">Dinheiro de metas</option>
            <option value="investment">Investimento de longo prazo</option>
          </Select>
        </Field>
        <Field label="Instituição" name="institution">
          <Input name="institution" defaultValue={defaults?.institution ?? ""} placeholder="opcional" />
        </Field>
        <Field label="Saldo inicial" name="initialBalance" hint="Pode ser negativo (cheque especial).">
          <MoneyInput name="initialBalance" defaultValue={defaults?.initialBalance ?? ""} />
        </Field>
        <Field label="Data do saldo inicial" name="initialBalanceDate" hint="Saldo no início deste dia. Lançamentos anteriores ficam no histórico sem alterar o saldo." className="sm:col-span-2">
          <Input name="initialBalanceDate" type="date" defaultValue={defaults?.initialBalanceDate ?? today} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">{defaults ? "Salvar" : "Criar conta"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AdjustBalanceForm({ action, id, current }: { action: FormAction; id: string; current: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted">Informe o saldo real de hoje (do app do banco). O sistema recalcula o saldo inicial, sem criar lançamentos fictícios.</p>
      <Field label="Saldo real hoje" name="actual">
        <MoneyInput name="actual" defaultValue={current} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Ajustar saldo</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CardForm({ action, accounts, defaults }: { action: FormAction; accounts: Array<{ id: string; name: string }>; defaults?: { id: string; name: string; brand: string | null; limit: string; closingDay: number; dueDay: number; defaultPaymentAccountId: string | null } }) {
  return (
    <ActionForm action={action} resetOnSuccess={!defaults}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" name="name">
          <Input name="name" defaultValue={defaults?.name} placeholder="ex.: Cartão Visa" required />
        </Field>
        <Field label="Bandeira" name="brand">
          <Input name="brand" defaultValue={defaults?.brand ?? ""} placeholder="opcional" />
        </Field>
        <Field label="Limite" name="limit">
          <MoneyInput name="limit" defaultValue={defaults?.limit} required />
        </Field>
        <Field label="Conta de pagamento" name="defaultPaymentAccountId">
          <Select name="defaultPaymentAccountId" defaultValue={defaults?.defaultPaymentAccountId ?? ""}>
            <option value="">Não definir</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dia de fechamento" name="closingDay" hint="Compras neste dia ou depois vão para a fatura seguinte.">
          <Input name="closingDay" type="number" min={1} max={31} defaultValue={defaults?.closingDay ?? 25} required />
        </Field>
        <Field label="Dia de vencimento" name="dueDay">
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={defaults?.dueDay ?? 5} required />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">{defaults ? "Salvar" : "Cadastrar cartão"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PayInvoiceForm({ action, invoiceId, accounts, amount, date, defaultAccountId }: { action: FormAction; invoiceId: string; accounts: Array<{ id: string; name: string }>; amount: string; date: string; defaultAccountId?: string | null }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-sm text-muted">O pagamento tira o dinheiro da conta, mas não é contado como despesa: as compras já foram contadas na data em que foram feitas.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conta pagadora" name="accountId">
          <Select name="accountId" defaultValue={defaultAccountId ?? accounts[0]?.id} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor" name="amount">
          <MoneyInput name="amount" defaultValue={amount} required />
        </Field>
        <Field label="Data" name="date" hint="Datas futuras ficam como pagamento agendado.">
          <Input name="date" type="date" defaultValue={date} required />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Registrar pagamento</SubmitButton>
      </div>
    </ActionForm>
  );
}
