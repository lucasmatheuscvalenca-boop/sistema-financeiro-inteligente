import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui/callout";
import { Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { PrintButton } from "@/components/ui/print-button";
import { Section } from "@/components/ui/section";
import { formatDateBR, formatDateShort } from "@/domain/dates";
import { ASSET_CATEGORY_LABEL, LIABILITY_CATEGORY_LABEL } from "@/domain/net-worth";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { ACCOUNT_TYPE_LABEL } from "@/server/services/accounts";
import { getTaxHelp, type TaxExpenseLine } from "@/server/services/tax";

export const metadata: Metadata = { title: "Imposto de Renda" };

function Maybe({ cents }: { cents: number | null }) {
  return cents === null ? <span className="text-muted">—</span> : <Money cents={cents} tone="none" />;
}

function ExpenseList({ lines, empty }: { lines: TaxExpenseLine[]; empty: string }) {
  if (!lines.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-link">Ver os {lines.length} lançamentos</summary>
      <ul className="mt-2 divide-y divide-line text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex items-baseline gap-3 py-2">
            <span className="w-12 shrink-0 tabular-nums text-muted">{formatDateShort(l.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.description}</span>
              {l.category ? <span className="block text-xs text-muted">{l.category}</span> : null}
            </span>
            <Money cents={l.cents} tone="none" className="shrink-0" />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Ajuda para a declaração: saldos em 31/12, rendimentos, bens, dívidas e despesas de saúde e educação. */
export default async function TaxPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  const thisYear = Number(ctx.today.slice(0, 4));
  const years = [thisYear - 1, thisYear, thisYear - 2];
  const year = years.includes(Number(sp.ano)) ? Number(sp.ano) : thisYear - 1;
  const t = await getTaxHelp(ctx, year);
  const partial = year === thisYear;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Imposto de Renda"
        description={`Os números que a declaração pede, tirados do que está no Meu Banqueiro: saldos em 31/12, rendimentos, bens, dívidas e gastos com saúde e educação. Serve para conferir e copiar; quem faz a declaração é o programa da Receita.`}
        actions={<PrintButton />}
      />
      <nav aria-label="Ano-calendário" className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        <span className="text-muted">Ano-calendário</span>
        {[...years].sort((a, b) => b - a).map((y) => (
          <Link key={y} href={`/imposto-de-renda?ano=${y}`} aria-current={y === year ? "page" : undefined} className={cn("rounded-full border px-3 py-1", y === year ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted hover:bg-surface-2")}>
            {y}
            {y === thisYear ? " (em andamento)" : ""}
          </Link>
        ))}
      </nav>
      {partial ? <Callout tone="info">O ano de {year} ainda não terminou: a coluna do ano mostra os saldos e valores de hoje.</Callout> : null}

      <StatStrip columns={3}>
        <Stat label={`Rendimentos em ${year}`} value={<Money cents={t.income.totalCents} tone="none" />} />
        <Stat label="Saúde" value={<Money cents={t.health.totalCents} tone="none" />} hint={`${t.health.lines.length} lançamentos`} />
        <Stat label="Educação" value={<Money cents={t.education.totalCents} tone="none" />} hint={`${t.education.lines.length} lançamentos`} />
      </StatStrip>

      <Section title="Bens e direitos: contas" description="Saldo de cada conta no último dia de cada ano, como a ficha Bens e Direitos pede.">
        {t.accounts.length ? (
          <div className="scroll-hint">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Conta</th>
                  <th className="py-1.5 text-right font-medium">31/12/{year - 1}</th>
                  <th className="py-1.5 text-right font-medium">{partial ? "Hoje" : `31/12/${year}`}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">
                      {a.name}
                      <span className="block text-xs text-muted">{[ACCOUNT_TYPE_LABEL[a.type as keyof typeof ACCOUNT_TYPE_LABEL] ?? a.type, a.institution].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <Maybe cents={a.previousCents} />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <Maybe cents={a.currentCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhuma conta existia em {year}.</p>
        )}
        <p className="mt-2 text-xs text-muted">“—” quando a conta ainda não existia no Meu Banqueiro naquela data. Confira com o informe de rendimentos do banco, que é o documento oficial.</p>
      </Section>

      <Section title="Bens e direitos: outros bens" description="Imóveis, veículos, investimentos e previdência cadastrados em Patrimônio, pelo último valor informado até cada data.">
        {t.assets.length ? (
          <ul className="divide-y divide-line text-sm">
            <li className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 pb-1.5 text-xs text-muted">
              <span>Bem</span>
              <span className="text-right">31/12/{year - 1}</span>
              <span className="text-right">{partial ? "Hoje" : `31/12/${year}`}</span>
            </li>
            {t.assets.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-baseline gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{a.name}</span>
                  <span className="block text-xs text-muted">{ASSET_CATEGORY_LABEL[a.category as keyof typeof ASSET_CATEGORY_LABEL] ?? a.category}</span>
                </span>
                <span className="text-right tabular-nums">
                  <Maybe cents={a.previousCents} />
                </span>
                <span className="text-right tabular-nums">
                  <Maybe cents={a.currentCents} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nenhum bem cadastrado.{" "}
            <Link href="/patrimonio" className="text-link hover:underline">
              Cadastrar em Patrimônio
            </Link>
          </p>
        )}
        <p className="mt-2 text-xs text-muted">Na declaração, imóveis e veículos entram pelo valor de compra (mais reformas), não pelo valor de mercado.</p>
      </Section>

      <Section title="Rendimentos recebidos" description={`Entradas realizadas em ${year}, por categoria e por quem pagou (como aparece no extrato).`}>
        {t.income.groups.length ? (
          <ul className="space-y-4">
            {t.income.groups.map((g) => (
              <li key={g.name}>
                <p className="flex justify-between gap-3 border-b border-line pb-1 text-sm font-medium">
                  <span>{g.name}</span>
                  <Money cents={g.cents} tone="none" />
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {g.sources.map((src) => (
                    <li key={src.name} className="flex justify-between gap-3">
                      <span className="truncate">{src.name}</span>
                      <Money cents={src.cents} tone="none" className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhuma receita lançada em {year}.</p>
        )}
        <p className="mt-2 text-xs text-muted">O valor líquido que caiu na conta não é o rendimento tributável: use o informe de rendimentos da empresa ou do banco, que traz o bruto e o imposto retido.</p>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Saúde" description={<>Total: <Money cents={t.health.totalCents} tone="none" />. Consultas, exames, plano e dentista são dedutíveis, sem limite; farmácia normalmente não é.</>}>
          <ExpenseList lines={t.health.lines} empty={`Nenhum gasto em Saúde em ${year}.`} />
        </Section>
        <Section title="Educação" description={<>Total: <Money cents={t.education.totalCents} tone="none" />. Escola e faculdade são dedutíveis até um limite anual por pessoa; cursos livres e material, não.</>}>
          <ExpenseList lines={t.education.lines} empty={`Nenhum gasto em Educação em ${year}.`} />
        </Section>
      </div>

      <Section title="Dívidas e ônus" description="Valor atual de cada dívida cadastrada. A declaração pede o saldo em 31/12: confira no extrato do credor.">
        {t.debts.length ? (
          <ul className="divide-y divide-line text-sm">
            {t.debts.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  {d.name}
                  <span className="block text-xs text-muted">
                    {LIABILITY_CATEGORY_LABEL[d.category as keyof typeof LIABILITY_CATEGORY_LABEL] ?? d.category} · atualizado em {formatDateBR(d.valuedAt)}
                  </span>
                </span>
                <Money cents={d.outstandingCents} tone="none" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhuma dívida cadastrada.</p>
        )}
      </Section>

      <p className="text-xs text-muted">Cada pessoa vê aqui só os próprios dados: no casal, cada um abre na própria conta. Guarde os recibos de saúde e educação; a Receita pode pedir.</p>
    </div>
  );
}
