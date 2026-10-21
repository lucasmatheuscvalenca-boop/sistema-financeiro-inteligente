"use client";

import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton, type FormAction } from "@/components/ui/form";

export interface RetirementDefaults {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  desiredMonthlyIncome: string;
  otherMonthlyIncome: string;
  currentWealth: string;
  monthlyContribution: string;
  annualInflation: string;
  annualNominalReturn: string;
  annualNominalReturnRetirement: string;
  safetyMargin: string;
  mode: string;
}

export function RetirementForm({ action, defaults }: { action: FormAction; defaults: RetirementDefaults }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Idade atual" name="currentAge">
          <Input name="currentAge" type="number" min={14} max={99} defaultValue={defaults.currentAge} />
        </Field>
        <Field label="Idade para se aposentar" name="retirementAge">
          <Input name="retirementAge" type="number" min={15} max={100} defaultValue={defaults.retirementAge} />
        </Field>
        <Field label="Horizonte do plano (idade)" name="lifeExpectancy" hint="Até quando a renda precisa durar.">
          <Input name="lifeExpectancy" type="number" min={16} max={120} defaultValue={defaults.lifeExpectancy} />
        </Field>
        <Field label="Modo" name="mode">
          <Select name="mode" defaultValue={defaults.mode}>
            <option value="consume">Usar o capital até o horizonte</option>
            <option value="perpetuity">Viver só de renda (preservar o capital)</option>
          </Select>
        </Field>
        <Field label="Renda mensal desejada (valores de hoje)" name="desiredMonthlyIncome">
          <MoneyInput name="desiredMonthlyIncome" defaultValue={defaults.desiredMonthlyIncome} required />
        </Field>
        <Field label="Outras rendas na aposentadoria" name="otherMonthlyIncome" hint="INSS, aluguéis etc., em valores de hoje.">
          <MoneyInput name="otherMonthlyIncome" defaultValue={defaults.otherMonthlyIncome} />
        </Field>
        <Field label="Patrimônio investido hoje" name="currentWealth">
          <MoneyInput name="currentWealth" defaultValue={defaults.currentWealth} />
        </Field>
        <Field label="Aporte mensal" name="monthlyContribution" hint="Corrigido pela inflação a cada ano.">
          <MoneyInput name="monthlyContribution" defaultValue={defaults.monthlyContribution} />
        </Field>
        <Field label="Inflação estimada (% a.a.)" name="annualInflation">
          <Input name="annualInflation" inputMode="decimal" defaultValue={defaults.annualInflation} />
        </Field>
        <Field label="Retorno nominal esperado (% a.a.)" name="annualNominalReturn" hint="Premissa sua. Não é garantia.">
          <Input name="annualNominalReturn" inputMode="decimal" defaultValue={defaults.annualNominalReturn} />
        </Field>
        <Field label="Retorno nominal na aposentadoria (% a.a.)" name="annualNominalReturnRetirement" hint="Vazio = 1 p.p. abaixo do retorno da acumulação.">
          <Input name="annualNominalReturnRetirement" inputMode="decimal" defaultValue={defaults.annualNominalReturnRetirement} />
        </Field>
        <Field label="Margem de segurança (%)" name="safetyMargin">
          <Input name="safetyMargin" inputMode="decimal" defaultValue={defaults.safetyMargin} />
        </Field>
      </div>
      <SubmitButton variant="petrol" className="w-full">
        Salvar e recalcular
      </SubmitButton>
    </ActionForm>
  );
}
