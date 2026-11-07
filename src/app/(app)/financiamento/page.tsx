import type { Metadata } from "next";
import { FinancingSimulator } from "@/components/planning/financing-simulator";
import { PlanTabs } from "@/components/planning/plan-tabs";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboarded } from "@/server/auth/current";

export const metadata: Metadata = { title: "Financiar ou juntar?" };

export default async function FinancingPage() {
  const { ctx } = await requireOnboarded();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financiar ou juntar?"
        description="Compare financiar uma casa ou um carro com juntar o dinheiro antes, guardando por mês o mesmo valor da parcela. Mostra quando você compraria, quanto paga de juros e quanto a espera custa."
      />
      <PlanTabs current="financiamento" />
      <FinancingSimulator today={ctx.today} savingsRatePct="10" />
    </div>
  );
}
