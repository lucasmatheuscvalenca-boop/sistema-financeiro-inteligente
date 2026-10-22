"use client";

import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton, Textarea, type FormAction } from "@/components/ui/form";

const KINDS: Array<[string, string]> = [
  ["travel", "Viagem"],
  ["vehicle", "Veículo"],
  ["home", "Moradia / imóvel"],
  ["wedding", "Casamento"],
  ["education", "Formação"],
  ["independence", "Independência financeira"],
  ["retirement", "Aposentadoria"],
  ["other", "Outro projeto"],
];

export interface GoalDefaults {
  id?: string;
  name?: string;
  description?: string | null;
  kind?: string;
  target?: string;
  targetDate?: string | null;
  priority?: number;
  plannedMonthly?: string;
  contributionDay?: number;
  expectedReturn?: string;
  holdingAccountId?: string | null;
}

export function GoalForm({ action, accounts, defaults = {}, today }: { action: FormAction; accounts: Array<{ id: string; name: string }>; defaults?: GoalDefaults; today: string }) {
  return (
    <ActionForm action={action}>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome do projeto" name="name" className="sm:col-span-2">
          <Input name="name" defaultValue={defaults.name} placeholder="ex.: Viagem para o Chile em março" required />
        </Field>
        <Field label="Tipo" name="kind">
          <Select name="kind" defaultValue={defaults.kind ?? "other"}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridade" name="priority" hint="1 = mais importante. Usada quando metas disputam o mesmo dinheiro.">
          <Select name="priority" defaultValue={String(defaults.priority ?? 3)}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p} {p === 1 ? "— essencial" : p === 5 ? "— desejável" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor-alvo" name="target">
          <MoneyInput name="target" defaultValue={defaults.target} required />
        </Field>
        <Field label="Data desejada" name="targetDate" hint="Deixe em branco se não houver prazo.">
          <Input name="targetDate" type="date" min={today} defaultValue={defaults.targetDate ?? ""} />
        </Field>
        <Field label="Aporte mensal planejado" name="plannedMonthly" hint="Opcional. Sem ele, usamos o aporte necessário para o prazo.">
          <MoneyInput name="plannedMonthly" defaultValue={defaults.plannedMonthly} />
        </Field>
        <Field label="Dia do aporte" name="contributionDay">
          <Input name="contributionDay" type="number" min={1} max={31} defaultValue={defaults.contributionDay ?? 5} />
        </Field>
        <Field label="Rendimento anual hipotético (%)" name="expectedReturn" hint="Opcional e não garantido. Ex.: 10 para 10% ao ano.">
          <Input name="expectedReturn" inputMode="decimal" defaultValue={defaults.expectedReturn} placeholder="0" />
        </Field>
        <Field label="Onde o dinheiro fica guardado" name="holdingAccountId" hint="Sem conta própria, o valor da meta é descontado do seu saldo livre.">
          <Select name="holdingAccountId" defaultValue={defaults.holdingAccountId ?? ""}>
            <option value="">Nas contas de gasto (reservado)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição" name="description" className="sm:col-span-2">
          <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="petrol">{defaults.id ? "Salvar meta" : "Criar meta"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
