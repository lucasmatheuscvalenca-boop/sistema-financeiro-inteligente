import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { saveAnnualExpenseAction } from "../_actions/yearly";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDateBR } from "@/domain/dates";
import { plural } from "@/domain/text";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { formLookups } from "@/server/services/lookups";
import { getAnnualExpenses } from "@/server/services/yearly";

export const metadata: Metadata = { title: "Despesas anuais" };

const PRESETS = ["IPVA", "IPTU", "Seguro do carro", "Seguro residencial", "Natal e presentes", "Material escolar", "Anuidade do cartão", "Licenciamento do carro"];

export default async function AnnualExpensesPage() {
  const { ctx } = await requireOnboarded();
  const [data, lookups] = await Promise.all([getAnnualExpenses(ctx), formLookups(ctx)]);
  const accounts = lookups.accounts;
  const spending = accounts.filter((a) => a.purpose === "spending");
  const defaultAccount = (spending[0] ?? accounts[0])?.id ?? "";
  const expenseCats = lookups.categories.filter((c) => c.kind === "expense");

  const form = (
    <ActionForm action={saveAnnualExpenseAction} resetOnSuccess>
      <Field label="O que é" name="name" hint="Ex.: IPVA, IPTU, seguro, Natal.">
        <Input name="name" list="despesas-anuais-sugestoes" required maxLength={140} />
      </Field>
      <datalist id="despesas-anuais-sugestoes">
        {PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valor aproximado" name="amount">
          <MoneyInput name="amount" required />
        </Field>
        <Field label="Próximo pagamento" name="date">
          <Input name="date" type="date" min={ctx.today} required />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Sai da conta" name="accountId">
          <Select name="accountId" defaultValue={defaultAccount} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Categoria" name="categoryId">
          <Select name="categoryId" defaultValue="">
            <option value="">Sem categoria</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton>Adicionar</SubmitButton>
      </div>
    </ActionForm>
  );

  const goalHref = `/metas/nova?${new URLSearchParams({ nome: "Despesas anuais", tipo: "other", valor: centsToInput(data.yearlyCents), mensal: centsToInput(data.monthlyCents) })}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Despesas anuais"
        description="IPVA, IPTU, seguro, anuidade e Natal vêm uma vez por ano. Aqui cada uma vira quanto separar por mês até a data, para não pesar no mês em que vence. Entram as que você cadastra e as que o Banqueiro acha no histórico."
        actions={
          <Dialog trigger={<><Plus className="size-4" /> Adicionar despesa anual</>} title="Despesa anual">
            {form}
          </Dialog>
        }
      />

      {data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma despesa anual por enquanto"
          description="Cadastre o IPVA, o IPTU, o seguro ou o Natal. Quando houver um ano de histórico, as cobranças que se repetem uma vez por ano aparecem aqui sozinhas."
          action={
            <Dialog trigger={<><Plus className="size-4" /> Adicionar despesa anual</>} title="Despesa anual">
              {form}
            </Dialog>
          }
        />
      ) : (
        <>
          <StatStrip columns={3}>
            <Stat label="Separe por mês" value={<Money cents={data.monthlyCents} tone="none" />} hint="Somando todas, até cada vencimento" />
            <Stat label="Total no ano" value={<Money cents={data.yearlyCents} tone="none" />} />
            <Stat label="Próxima" value={data.items[0]!.name} hint={`${formatDateBR(data.items[0]!.nextDate)} · ${plural(Math.max(0, data.items[0]!.daysUntil), "dia", "dias")}`} />
          </StatStrip>

          <Section title="Uma por uma" description="Quanto mais perto do vencimento, maior a parte de cada mês.">
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{i.name}</span>
                      {i.origin === "historico" ? <Badge tone="neutral">achada no histórico</Badge> : null}
                      {i.daysUntil <= 30 ? <Badge tone="warning">{i.daysUntil <= 0 ? "vence hoje" : `em ${plural(i.daysUntil, "dia", "dias")}`}</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatDateBR(i.nextDate)} · <Money cents={i.amountCents} tone="none" />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold">
                      <Money cents={i.monthlyCents} tone="none" />
                      /mês
                    </span>
                    <span className="block text-xs text-muted">{i.months === 1 ? "separe tudo neste mês" : `por ${i.months} meses`}</span>
                  </span>
                  {i.origin === "historico" && defaultAccount ? (
                    <InlineAction action={saveAnnualExpenseAction} hidden={{ name: i.name, amount: centsToInput(i.amountCents), date: i.nextDate, accountId: defaultAccount }} variant="secondary">
                      Acompanhar
                    </InlineAction>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              As cadastradas aparecem na agenda e no fluxo de caixa. Para mudar ou parar de acompanhar, use{" "}
              <Link href="/recorrencias" className="text-link hover:underline">
                Recorrências
              </Link>
              .
            </p>
          </Section>

          <div className="border-l-[3px] border-l-accent bg-surface px-4 py-3 text-sm">
            <p className="font-semibold">Quer deixar isso guardado à parte?</p>
            <p className="mt-1 text-muted">Uma meta &quot;Despesas anuais&quot; com aporte de <Money cents={data.monthlyCents} tone="none" /> por mês junta o dinheiro numa conta separada.</p>
            <Link href={goalHref} className={`${buttonClass("secondary")} mt-3`}>
              Criar a meta
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
