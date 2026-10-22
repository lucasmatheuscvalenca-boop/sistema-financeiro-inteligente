"use client";

import { useRef, useState, useTransition } from "react";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, SubmitButton, Textarea, type FormAction } from "@/components/ui/form";
import { summarizeIncome, type IncomeKind } from "@/domain/income";
import { formatMoney, parseMoney } from "@/domain/money";
import { cn } from "@/lib/cn";
import { centsToInput } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";

type Answers = Record<string, unknown>;
type Section = "personal" | "financial" | "life";

const EMPLOYMENT: Array<[string, string]> = [
  ["clt", "Empregado(a) CLT"],
  ["public_servant", "Servidor(a) público(a)"],
  ["self_employed", "Autônomo(a)"],
  ["business_owner", "Empresário(a)"],
  ["freelancer", "Freelancer / PJ"],
  ["unemployed", "Sem renda ativa no momento"],
  ["retired", "Aposentado(a)"],
  ["student", "Estudante"],
  ["other", "Outro"],
];
const PRIORITIES: Array<[string, string]> = [
  ["seguranca", "Segurança financeira"],
  ["qualidade_de_vida", "Qualidade de vida"],
  ["patrimonio", "Construir patrimônio"],
  ["experiencias", "Viagens e experiências"],
  ["familia", "Família"],
  ["carreira", "Carreira e formação"],
  ["independencia", "Independência financeira"],
];

function s(a: Answers, k: string): string {
  const v = a[k];
  return v == null ? "" : String(v);
}
function m(a: Answers, k: string): string {
  const v = a[k];
  return typeof v === "number" ? centsToInput(v) : "";
}
function yn(a: Answers, k: string): string {
  return a[k] === true ? "sim" : a[k] === false ? "nao" : "";
}

export function BriefingForm({
  section,
  answers,
  action,
  autosave,
  origin,
  incomeTypeHint,
}: {
  section: Section;
  answers: Answers;
  action: FormAction;
  autosave: (section: Section, fd: FormData) => Promise<ActionState>;
  origin: "onboarding" | "configuracoes";
  /** Tipo de renda escolhido na etapa pessoal, para a etapa financeira já abrir nos campos certos. */
  incomeTypeHint?: string | null;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function scheduleAutosave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = formRef.current?.closest("form");
      if (!form) return;
      const fd = new FormData(form);
      startTransition(async () => {
        const r = await autosave(section, fd);
        if (r.ok) setSaved(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      });
    }, 1500);
  }

  const priorities = Array.isArray(answers.priorities) ? (answers.priorities as string[]) : [];

  return (
    <ActionForm action={action}>
      <div ref={formRef} onChange={scheduleAutosave} className="space-y-4">
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="origem" value={origin} />
        {section === "personal" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Como prefere ser chamado(a)?" name="preferredName">
              <Input name="preferredName" defaultValue={s(answers, "preferredName")} />
            </Field>
            <Field label="Ano de nascimento" name="birthYear" hint="Ou escolha só a faixa etária ao lado.">
              <Input name="birthYear" inputMode="numeric" placeholder="ex.: 1994" defaultValue={s(answers, "birthYear")} />
            </Field>
            <Field label="Faixa etária" name="ageRange">
              <Select name="ageRange" defaultValue={s(answers, "ageRange")}>
                <option value="">Prefiro não informar</option>
                {["18-24", "25-34", "35-44", "45-54", "55-64", "65+"].map((r) => (
                  <option key={r} value={r}>
                    {r} anos
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Situação profissional" name="employmentStatus">
              <Select name="employmentStatus" defaultValue={s(answers, "employmentStatus")}>
                <option value="">Selecione</option>
                {EMPLOYMENT.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de renda" name="incomeType">
              <Select name="incomeType" defaultValue={s(answers, "incomeType")}>
                <option value="">Selecione</option>
                <option value="fixed">Fixa (salário estável)</option>
                <option value="variable">Variável (comissões, freelas)</option>
                <option value="mixed">Mista</option>
              </Select>
            </Field>
            <Field label="Composição familiar" name="household">
              <Select name="household" defaultValue={s(answers, "household")}>
                <option value="">Selecione</option>
                <option value="single">Moro sozinho(a)</option>
                <option value="couple">Casal</option>
                <option value="family">Família com filhos</option>
                <option value="shared">Divido moradia</option>
                <option value="other">Outro</option>
              </Select>
            </Field>
            <Field label="Dependentes financeiros" name="dependents">
              <Input name="dependents" inputMode="numeric" defaultValue={s(answers, "dependents")} placeholder="0" />
            </Field>
            <Field label="País e moeda" name="currency">
              <Select name="currency" defaultValue={s(answers, "currency") || "BRL"}>
                <option value="BRL">Brasil — Real (R$)</option>
                <option value="USD">Dólar (US$)</option>
                <option value="EUR">Euro (€)</option>
              </Select>
            </Field>
            <Field label="Objetivos pessoais" name="personalGoals" className="sm:col-span-2">
              <Textarea name="personalGoals" defaultValue={s(answers, "personalGoals")} placeholder="O que é importante para você nos próximos anos?" />
            </Field>
            <Field label="Objetivos profissionais" name="professionalGoals" className="sm:col-span-2">
              <Textarea name="professionalGoals" defaultValue={s(answers, "professionalGoals")} />
            </Field>
          </div>
        ) : null}

        {section === "financial" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <IncomeFields answers={answers} hint={incomeTypeHint} onKindChange={scheduleAutosave} />
            <Field label="Fontes de renda" name="incomeSources" className="sm:col-span-2">
              <Input name="incomeSources" defaultValue={s(answers, "incomeSources")} placeholder="ex.: salário, comissões, aluguel" />
            </Field>
            <Field label="Despesas essenciais por mês" name="essentialExpenses" hint="Moradia, contas, mercado, saúde, transporte.">
              <MoneyInput name="essentialExpenses" defaultValue={m(answers, "essentialExpensesCents")} />
            </Field>
            <Field label="Despesas variáveis por mês" name="variableExpenses" hint="Lazer, restaurantes, compras.">
              <MoneyInput name="variableExpenses" defaultValue={m(answers, "variableExpensesCents")} />
            </Field>
            <Field label="Tem dívidas ou parcelas?" name="hasDebts">
              <Select name="hasDebts" defaultValue={yn(answers, "hasDebts")}>
                <option value="">Selecione</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </Select>
            </Field>
            <Field label="Parcelas por mês (dívidas)" name="debtsMonthly">
              <MoneyInput name="debtsMonthly" defaultValue={m(answers, "debtsMonthlyCents")} />
            </Field>
            <Field label="Saldo total das dívidas" name="debtsTotal">
              <MoneyInput name="debtsTotal" defaultValue={m(answers, "debtsTotalCents")} />
            </Field>
            <Field label="Reserva disponível hoje" name="currentReserve" hint="Dinheiro guardado para emergências, com resgate imediato.">
              <MoneyInput name="currentReserve" defaultValue={m(answers, "currentReserveCents")} />
            </Field>
            <Field label="Investimentos" name="investments">
              <MoneyInput name="investments" defaultValue={m(answers, "investmentsCents")} />
            </Field>
            <Field label="Outros bens (imóveis, veículos)" name="otherAssets">
              <MoneyInput name="otherAssets" defaultValue={m(answers, "otherAssetsCents")} />
            </Field>
            <Field label="Contas bancárias" name="bankAccountsCount">
              <Input name="bankAccountsCount" inputMode="numeric" defaultValue={s(answers, "bankAccountsCount")} />
            </Field>
            <Field label="Cartões de crédito" name="creditCardsCount">
              <Input name="creditCardsCount" inputMode="numeric" defaultValue={s(answers, "creditCardsCount")} />
            </Field>
            <Field label="Compromissos futuros" name="futureCommitments" className="sm:col-span-2">
              <Textarea name="futureCommitments" defaultValue={s(answers, "futureCommitments")} placeholder="ex.: IPVA em janeiro, matrícula da faculdade em fevereiro" />
            </Field>
          </div>
        ) : null}

        {section === "life" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Objetivos de curto prazo (até 1 ano)" name="shortTermGoals" className="sm:col-span-2">
              <Textarea name="shortTermGoals" defaultValue={s(answers, "shortTermGoals")} placeholder="ex.: viagem em março, trocar o celular" />
            </Field>
            <Field label="Médio prazo (1 a 5 anos)" name="mediumTermGoals">
              <Textarea name="mediumTermGoals" defaultValue={s(answers, "mediumTermGoals")} />
            </Field>
            <Field label="Longo prazo (mais de 5 anos)" name="longTermGoals">
              <Textarea name="longTermGoals" defaultValue={s(answers, "longTermGoals")} />
            </Field>
            <Field label="Viagens e projetos pessoais" name="plannedTrips">
              <Input name="plannedTrips" defaultValue={s(answers, "plannedTrips")} />
            </Field>
            <Field label="Compra de bens" name="plannedPurchases">
              <Input name="plannedPurchases" defaultValue={s(answers, "plannedPurchases")} placeholder="ex.: carro, apartamento" />
            </Field>
            <Field label="Moradia" name="housing">
              <Select name="housing" defaultValue={s(answers, "housing")}>
                <option value="">Selecione</option>
                <option value="own">Própria quitada</option>
                <option value="financed">Própria financiada</option>
                <option value="rent">Aluguel</option>
                <option value="family">Com a família</option>
                <option value="other">Outro</option>
              </Select>
            </Field>
            <Field label="Planos de moradia" name="housingPlans">
              <Input name="housingPlans" defaultValue={s(answers, "housingPlans")} />
            </Field>
            <Field label="Formação profissional" name="education" className="sm:col-span-2">
              <Input name="education" defaultValue={s(answers, "education")} placeholder="ex.: pós-graduação em 2027" />
            </Field>
            <Field label="Busca independência financeira?" name="financialIndependence">
              <Select name="financialIndependence" defaultValue={yn(answers, "financialIndependence")}>
                <option value="">Selecione</option>
                <option value="sim">Sim</option>
                <option value="nao">Não por enquanto</option>
              </Select>
            </Field>
            <Field label="Idade desejada para se aposentar" name="desiredRetirementAge">
              <Input name="desiredRetirementAge" inputMode="numeric" defaultValue={s(answers, "desiredRetirementAge")} />
            </Field>
            <Field label="Renda mensal desejada no futuro (valores de hoje)" name="desiredRetirementIncome" className="sm:col-span-2">
              <MoneyInput name="desiredRetirementIncome" defaultValue={m(answers, "desiredRetirementIncomeCents")} />
            </Field>
            <Field label="Estilo de vida desejado" name="desiredLifestyle" className="sm:col-span-2">
              <Textarea name="desiredLifestyle" defaultValue={s(answers, "desiredLifestyle")} />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Prioridades</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRIORITIES.map(([v, l]) => (
                  <Checkbox key={v} name="priorities" value={v} label={l} defaultChecked={priorities.includes(v)} />
                ))}
              </div>
            </fieldset>
            <Field label="Algo mais que devemos saber?" name="notes" className="sm:col-span-2">
              <Textarea name="notes" defaultValue={s(answers, "notes")} />
            </Field>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted" aria-live="polite">
          {saved ? `Rascunho salvo automaticamente às ${saved}.` : "Seu progresso é salvo automaticamente. Todos os campos são opcionais."}
        </p>
        <div className="flex flex-wrap gap-2">
          {origin === "onboarding" ? (
            <button type="submit" name="intent" value="later" className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-surface-2">
              Terminar depois
            </button>
          ) : null}
          <SubmitButton variant="petrol">{origin === "onboarding" ? "Salvar e continuar" : "Salvar"}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}

const INCOME_KINDS: Array<{ value: IncomeKind; label: string; hint: string }> = [
  { value: "fixed", label: "Fixa", hint: "Salário estável" },
  { value: "mixed", label: "Mista", hint: "Fixo + comissão" },
  { value: "variable", label: "Variável", hint: "Só comissão ou freelas" },
];

function cents(form: HTMLElement | null, name: string): number | null {
  const v = form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.trim();
  if (!v) return null;
  try {
    return parseMoney(v, "auto");
  } catch {
    return null;
  }
}

/**
 * Renda conforme o jeito de receber. Na mista, pergunta a parte fixa e a média da comissão
 * (com mês fraco e forte): o fixo é garantido; a comissão entra como estimativa.
 */
function IncomeFields({ answers, hint, onKindChange }: { answers: Answers; hint?: string | null; onKindChange: () => void }) {
  const initial = (s(answers, "incomeType") || hint || "") as IncomeKind | "";
  const [kind, setKind] = useState<IncomeKind | "">(initial);
  const box = useRef<HTMLDivElement>(null);
  const read = () => ({
    kind: kind || null,
    netMonthlyCents: cents(box.current, "monthlyNetIncome"),
    fixedCents: cents(box.current, "fixedIncome"),
    variableAvgCents: cents(box.current, "commissionAvg"),
    variableLowCents: cents(box.current, "commissionLow"),
    variableHighCents: cents(box.current, "commissionHigh"),
  });
  const [summary, setSummary] = useState(() =>
    summarizeIncome({
      kind: initial || null,
      netMonthlyCents: answers.monthlyNetIncomeCents as number | null,
      fixedCents: answers.fixedIncomeCents as number | null,
      variableAvgCents: answers.commissionAvgCents as number | null,
      variableLowCents: answers.commissionLowCents as number | null,
      variableHighCents: answers.commissionHighCents as number | null,
    }),
  );
  const variableLabel = kind === "mixed" ? "comissão" : "renda variável";
  const frequency = (
    <Field label="Frequência de recebimento" name="incomeFrequency">
      <Select name="incomeFrequency" defaultValue={s(answers, "incomeFrequency")}>
        <option value="">Selecione</option>
        <option value="monthly">Mensal</option>
        <option value="biweekly">Quinzenal</option>
        <option value="weekly">Semanal</option>
        <option value="irregular">Irregular</option>
      </Select>
    </Field>
  );
  return (
    <div ref={box} onInput={() => setSummary(summarizeIncome(read()))} className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
      <input type="hidden" name="incomeType" value={kind} />
      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Como você recebe?</p>
        <div role="radiogroup" aria-label="Como você recebe" className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {INCOME_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => {
                setKind(k.value);
                onKindChange();
                setSummary(summarizeIncome({ ...read(), kind: k.value }));
              }}
              className={cn("rounded-lg px-2 py-2 text-center transition", kind === k.value ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}
            >
              <span className="block text-sm font-semibold">{k.label}</span>
              <span className="block text-[11px] text-muted">{k.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {kind === "mixed" || kind === "variable" ? (
        <>
          {kind === "mixed" ? (
            <>
              <Field label="Parte fixa (salário líquido)" name="fixedIncome" hint="O que entra todo mês, com certeza.">
                <MoneyInput name="fixedIncome" defaultValue={m(answers, "fixedIncomeCents")} />
              </Field>
              <Field label="Dia em que o fixo cai" name="fixedIncomeDay">
                <Input name="fixedIncomeDay" type="number" inputMode="numeric" min={1} max={31} placeholder="ex.: 5" defaultValue={s(answers, "fixedIncomeDay")} />
              </Field>
            </>
          ) : null}
          <Field label={kind === "mixed" ? "Média da comissão por mês" : "Renda média por mês"} name="commissionAvg" hint="Média dos últimos 3 a 6 meses, já líquida.">
            <MoneyInput name="commissionAvg" defaultValue={m(answers, "commissionAvgCents")} />
          </Field>
          <Field label={kind === "mixed" ? "Dia em que a comissão costuma cair" : "Dia em que costuma receber"} name="commissionDay">
            <Input name="commissionDay" type="number" inputMode="numeric" min={1} max={31} placeholder="ex.: 20" defaultValue={s(answers, "commissionDay")} />
          </Field>
          <Field label="Num mês fraco" name="commissionLow" hint={`O menor valor de ${variableLabel} dos últimos meses.`}>
            <MoneyInput name="commissionLow" defaultValue={m(answers, "commissionLowCents")} />
          </Field>
          <Field label="Num mês forte" name="commissionHigh" hint="O maior valor recente (opcional).">
            <MoneyInput name="commissionHigh" defaultValue={m(answers, "commissionHighCents")} />
          </Field>
          {kind === "variable" ? frequency : null}
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4 text-sm sm:col-span-2" aria-live="polite">
            {summary.totalCents != null ? (
              <>
                <p>
                  Renda média: <span className="font-semibold tabular-nums">{formatMoney(summary.totalCents)}</span> por mês
                  {summary.kind === "mixed" && summary.guaranteedCents != null && summary.estimatedCents != null ? (
                    <span className="text-muted">
                      {" "}
                      ({formatMoney(summary.guaranteedCents)} fixos + {formatMoney(summary.estimatedCents)} de comissão)
                    </span>
                  ) : null}
                </p>
                {summary.lowMonthCents != null ? (
                  <p className="mt-1 text-muted">
                    Num mês fraco: <span className="font-medium tabular-nums text-ink">{formatMoney(summary.lowMonthCents)}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted">Preencha os valores para ver sua renda média e o cenário de um mês fraco.</p>
            )}
            <p className="mt-2 text-xs text-muted">O NEXO planeja o mês pelo que é garantido. A {variableLabel} entra nas projeções como estimativa e só vira dinheiro disponível quando cai na conta.</p>
          </div>
        </>
      ) : (
        <>
          <Field label="Renda líquida mensal" name="monthlyNetIncome" hint="O que cai na conta, já descontados impostos.">
            <MoneyInput name="monthlyNetIncome" defaultValue={m(answers, "monthlyNetIncomeCents")} />
          </Field>
          {kind === "fixed" ? (
            <Field label="Dia do recebimento" name="fixedIncomeDay">
              <Input name="fixedIncomeDay" type="number" inputMode="numeric" min={1} max={31} placeholder="ex.: 5" defaultValue={s(answers, "fixedIncomeDay")} />
            </Field>
          ) : null}
          {frequency}
        </>
      )}
    </div>
  );
}
