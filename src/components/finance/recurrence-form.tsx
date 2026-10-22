"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton, type FormAction } from "@/components/ui/form";
import type { CategoryOption, Option } from "./types";

export function RecurrenceForm({ action, accounts, cards, categories, today }: { action: FormAction; accounts: Option[]; cards: Option[]; categories: CategoryOption[]; today: string }) {
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [method, setMethod] = useState<"account" | "card">("account");
  const cats = categories.filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  return (
    <ActionForm action={action} resetOnSuccess>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="method" value={kind === "expense" ? method : "account"} />
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["expense", "Despesa"],
            ["income", "Receita"],
            ["transfer", "Transferência"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("rounded-lg py-1.5 text-sm font-medium", kind === k ? "bg-surface shadow-sm" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Descrição" name="description" className="sm:col-span-2">
          <Input name="description" required placeholder={kind === "income" ? "ex.: Salário" : "ex.: Aluguel"} />
        </Field>
        <Field label="Valor de cada ocorrência" name="amount">
          <MoneyInput name="amount" required />
        </Field>
        <Field label="Frequência" name="frequency">
          <Select name="frequency" defaultValue="monthly">
            <option value="monthly">Mensal</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="yearly">Anual</option>
          </Select>
        </Field>
        <Field label="Primeira ocorrência" name="startDate" hint="Nas mensais, o dia desta data se repete (ajustado em meses curtos).">
          <Input name="startDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Termina em (opcional)" name="endDate">
          <Input name="endDate" type="date" />
        </Field>
        {kind === "expense" && cards.length ? (
          <Field label="Pagamento" name="_method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as "account" | "card")}>
              <option value="account">Conta</option>
              <option value="card">Cartão de crédito</option>
            </Select>
          </Field>
        ) : null}
        {kind === "expense" && method === "card" ? (
          <Field label="Cartão" name="cardId">
            <Select name="cardId" required>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={kind === "transfer" ? "Da conta" : "Conta"} name="accountId">
            <Select name="accountId" required defaultValue="">
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
          <Field label="Para a conta" name="toAccountId">
            <Select name="toAccountId" required defaultValue="">
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
            <Select name="categoryId" defaultValue="">
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind !== "transfer" ? (
          <Field label="Certeza" name="certainty" hint="Estimadas (ex.: comissão) não entram nas projeções confirmadas.">
            <Select name="certainty" defaultValue="scheduled">
              <option value="scheduled">Confirmada (ex.: salário, aluguel)</option>
              <option value="estimated">Estimada (ex.: comissão variável)</option>
            </Select>
          </Field>
        ) : null}
        {kind === "income" ? (
          <Field label="Tipo de receita" name="incomeType">
            <Select name="incomeType" defaultValue="salary">
              <option value="salary">Renda fixa / salário</option>
              <option value="commission">Comissão</option>
              <option value="yield">Rendimento</option>
              <option value="variable">Receita variável</option>
              <option value="other">Outra</option>
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">Criar recorrência</SubmitButton>
      </div>
    </ActionForm>
  );
}
