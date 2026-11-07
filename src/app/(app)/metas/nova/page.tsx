import type { Metadata } from "next";
import { createGoalAction } from "../../_actions/planning";
import { GoalForm } from "@/components/planning/goal-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboarded } from "@/server/auth/current";
import { listAccountsWithBalances } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Nova meta" };

const KINDS = new Set(["travel", "vehicle", "home", "wedding", "education", "independence", "retirement", "other"]);

/** Aceita valores sugeridos na URL (ex.: vindos do simulador de financiamento). */
export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ nome?: string; tipo?: string; valor?: string; mensal?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  const money = (v?: string) => (v && /^\d{1,12}(,\d{1,2})?$/.test(v) ? v : undefined);
  const defaults = { name: sp.nome?.slice(0, 80), kind: sp.tipo && KINDS.has(sp.tipo) ? sp.tipo : undefined, target: money(sp.valor), plannedMonthly: money(sp.mensal) };
  const accounts = await listAccountsWithBalances(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova meta" description="Valor, prazo e prioridade. O aporte necessário é calculado pelo número real de datas de aporte até o prazo." />
      <Card>
        <CardBody className="pt-5">
          <GoalForm action={createGoalAction} accounts={accounts.filter((a) => a.purpose !== "spending").map((a) => ({ id: a.id, name: a.name }))} today={ctx.today} defaults={defaults} />
        </CardBody>
      </Card>
    </div>
  );
}
