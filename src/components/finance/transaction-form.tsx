"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, SubmitButton, Textarea, type FormAction } from "@/components/ui/form";
import type { CategoryOption, Option, TransactionDefaults } from "./types";

type Kind = "expense" | "income" | "transfer" | "refund";

const KINDS: Array<[Kind, string]> = [
  ["expense", "Despesa"],
  ["income", "Receita"],
  ["transfer", "Transferência"],
  ["refund", "Estorno"],
];

export function TransactionForm({
  action,
  accounts,
  cards,
  categories,
  today,
  defaults = {},
  onDone,
}: {
  action: FormAction;
  accounts: Option[];
  cards: Option[];
  categories: CategoryOption[];
  today: string;
  defaults?: TransactionDefaults;
  onDone?: () => void;
}) {
  const editing = !!defaults.id;
  const [kind, setKind] = useState<Kind>(defaults.kind ?? "expense");
  const [method, setMethod] = useState<"account" | "card">(defaults.cardId ? "card" : "account");
  const [status, setStatus] = useState(defaults.status ?? "");
  const cats = categories.filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  const usesCardOption = (kind === "expense" || kind === "refund") && cards.length > 0;
  const noAccounts = accounts.length === 0 && cards.length === 0;

  return (
    <ActionForm action={action} resetOnSuccess={!editing} onResult={(s) => s.ok && onDone?.()}>
      {editing ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="method" value={usesCardOption ? method : "account"} />
      {!editing ? (
        <div role="tablist" aria-label="Tipo de movimentação" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-lg px-2 py-1.5 text-xs font-medium sm:text-sm", kind === k ? "bg-surface text-ink shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {noAccounts ? <p className="text-sm text-warning">Cadastre uma conta ou cartão antes de lançar movimentações.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor" name="amount">
          <MoneyInput name="amount" defaultValue={defaults.amount} required autoFocus={!editing} />
        </Field>
        <Field label="Data" name="date">
          <Input name="date" type="date" defaultValue={defaults.date ?? today} required />
        </Field>
        <Field label="Descrição" name="description" className="sm:col-span-2">
          <Input name="description" defaultValue={defaults.description} placeholder={kind === "income" ? "ex.: Salário" : kind === "transfer" ? "ex.: Guardar na poupança" : "ex.: Mercado"} required maxLength={140} />
        </Field>
        {usesCardOption ? (
          <Field label="Pagamento" name="method">
            <Select name="_method" value={method} onChange={(e) => setMethod(e.target.value as "account" | "card")}>
              <option value="account">Conta / dinheiro / Pix / débito</option>
              <option value="card">Cartão de crédito</option>
            </Select>
          </Field>
        ) : null}
        {usesCardOption && method === "card" ? (
          <Field label="Cartão" name="cardId">
            <Select name="cardId" defaultValue={defaults.cardId ?? ""} required>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={kind === "transfer" ? "Da conta" : kind === "income" ? "Na conta" : "Conta"} name="accountId">
            <Select name="accountId" defaultValue={defaults.accountId ?? ""} required>
              <option value="" disabled>
                Selecione
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind === "transfer" ? (
          <Field label="Para a conta" name="toAccountId" hint="Transferências entre suas contas não contam como receita nem despesa.">
            <Select name="toAccountId" defaultValue={defaults.toAccountId ?? ""} required>
              <option value="" disabled>
                Selecione
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Categoria" name="categoryId">
            <Select name="categoryId" defaultValue={defaults.categoryId ?? ""}>
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind !== "transfer" && kind !== "refund" ? (
          <Field label="Situação" name="status" hint={status === "estimated" ? "Estimativas (ex.: comissão esperada) não entram no saldo disponível até serem confirmadas." : "Datas futuras ficam como previstas automaticamente."}>
            <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="">Automática pela data</option>
              <option value="realized">Realizada</option>
              <option value="scheduled">Prevista (confirmada)</option>
              <option value="estimated">Estimada (não confirmada)</option>
            </Select>
          </Field>
        ) : null}
        {kind === "income" ? (
          <Field label="Tipo de receita" name="incomeType">
            <Select name="incomeType" defaultValue={defaults.incomeType ?? ""}>
              <option value="">Não informar</option>
              <option value="salary">Renda fixa / salário</option>
              <option value="commission">Comissão</option>
              <option value="yield">Rendimento</option>
              <option value="variable">Receita variável</option>
              <option value="extraordinary">Ganho extraordinário</option>
              <option value="other">Outra</option>
            </Select>
          </Field>
        ) : null}
        {kind === "expense" ? (
          <>
            {!editing ? (
              <Field label="Parcelas" name="installments" hint={method === "card" ? "Cada parcela cai na fatura do mês correspondente." : "Gera uma parcela por mês."}>
                <Input name="installments" type="number" min={1} max={120} defaultValue={1} />
              </Field>
            ) : null}
            <Field label="Natureza" name="expenseNature">
              <Select name="expenseNature" defaultValue={defaults.expenseNature ?? ""}>
                <option value="">Não informar</option>
                <option value="fixed">Fixa</option>
                <option value="variable">Variável</option>
                <option value="extraordinary">Extraordinária</option>
              </Select>
            </Field>
            <div className="flex items-end pb-2 sm:col-span-2">
              <Checkbox name="essential" label="Despesa essencial (entra no cálculo da reserva de emergência)" defaultChecked={defaults.essential ?? undefined} />
            </div>
          </>
        ) : null}
        <Field label="Observações" name="notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={defaults.notes ?? ""} rows={2} maxLength={1000} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">{editing ? "Salvar alterações" : "Registrar"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
