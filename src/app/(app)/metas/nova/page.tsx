import type { Metadata } from "next";
import { createGoalAction } from "../../_actions/planning";
import { GoalForm } from "@/components/planning/goal-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboarded } from "@/server/auth/current";
import { listAccountsWithBalances } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Nova meta" };

export default async function NewGoalPage() {
  const { ctx } = await requireOnboarded();
  const accounts = await listAccountsWithBalances(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Planejamento" title="Nova meta" description="Valor, prazo e prioridade. O aporte necessário é calculado pelo número real de datas de aporte até o prazo." />
      <Card>
        <CardBody className="pt-5">
          <GoalForm action={createGoalAction} accounts={accounts.filter((a) => a.purpose !== "spending").map((a) => ({ id: a.id, name: a.name }))} today={ctx.today} />
        </CardBody>
      </Card>
    </div>
  );
}
