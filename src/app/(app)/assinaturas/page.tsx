import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDateBR } from "@/domain/dates";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { getSubscriptionsPanel } from "@/server/services/yearly";

export const metadata: Metadata = { title: "Assinaturas" };

/** Painel de assinaturas: quanto custam no mês e no ano, e quais renovam em breve. */
export default async function SubscriptionsPage() {
  const { ctx } = await requireOnboarded();
  const p = await getSubscriptionsPanel(ctx);
  const count = p.monthly.length + p.annual.length;
  const biggest = p.monthly[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Assinaturas"
        description="Streaming, aplicativos, academia e planos anuais, achados nas suas cobranças. O total por ano mostra o peso real de cada uma; as anuais avisam antes de renovar."
        actions={
          <Link href="/gastos" className="text-sm font-medium text-link hover:underline">
            Ver gastos
          </Link>
        }
      />
      {count === 0 ? (
        <EmptyState title="Nenhuma assinatura encontrada" description="Assinaturas aparecem aqui quando a mesma cobrança se repete todo mês (ou todo ano) com valor parecido. Conecte um banco ou importe extratos de alguns meses." />
      ) : (
        <>
          <StatStrip columns={3}>
            <Stat label="Por mês" value={<Money cents={p.monthlyTotalCents} tone="none" />} hint={plural(p.monthly.length, "assinatura mensal", "assinaturas mensais")} />
            <Stat label="Por ano" value={<Money cents={p.yearlyTotalCents} tone="none" />} hint="Mensais × 12 + anuais" />
            <Stat label="Anuais" value={String(p.annual.length)} hint={p.annual[0] ? `próxima em ${formatDateBR(p.annual[0].nextDate)}` : "nenhuma encontrada"} />
          </StatStrip>

          <Section title="Mensais" description="Da mais cara para a mais barata, com o custo em um ano.">
            {p.monthly.length ? (
              <ul className="divide-y divide-line">
                {p.monthly.map((m) => (
                  <li key={m.key} className="flex items-baseline gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block text-xs text-muted">todo dia {m.day}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold">
                        <Money cents={m.amountCents} tone="none" />
                        /mês
                      </span>
                      <span className="block text-xs text-muted">
                        <Money cents={m.yearlyCents} tone="none" /> no ano
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma assinatura mensal nos últimos meses.</p>
            )}
            {biggest ? (
              <p className="mt-3 text-xs text-muted">
                Cancelar {biggest.name} economizaria <Money cents={biggest.yearlyCents} tone="none" /> por ano.
              </p>
            ) : null}
          </Section>

          <Section title="Anuais" description="Renovam uma vez por ano. Se não usa mais, cancele antes da data.">
            {p.annual.length ? (
              <ul className="divide-y divide-line">
                {p.annual.map((a) => (
                  <li key={a.key} className="flex items-baseline gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{a.name}</span>
                        {a.daysUntil <= 30 ? <Badge tone="warning">{a.daysUntil <= 0 ? "renova hoje" : `renova em ${plural(a.daysUntil, "dia", "dias")}`}</Badge> : null}
                      </span>
                      <span className="block text-xs text-muted">renova em {formatDateBR(a.nextDate)}</span>
                    </span>
                    <Money cents={a.amountCents} tone="none" className="shrink-0 text-sm font-semibold" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Nenhuma assinatura anual encontrada. Se você tem uma, cadastre em{" "}
                <Link href="/despesas-anuais" className="text-link hover:underline">
                  Despesas anuais
                </Link>{" "}
                para ser avisado antes da renovação.
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
