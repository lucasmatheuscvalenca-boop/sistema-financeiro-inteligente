import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, FileSearch, Target, Wallet } from "lucide-react";
import { MAIN_NAV, MORE_SECTIONS } from "@/components/app/nav-config";
import { SearchBox } from "@/components/app/search-box";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { formatDateShort } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { listGoals } from "@/server/services/goals";
import { listTransactions } from "@/server/services/transactions";

export const metadata: Metadata = { title: "Busca" };

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireOnboarded();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const term = norm(q);
  const [txs, goals, accounts] = q.length >= 2 ? await Promise.all([listTransactions(ctx, { search: q, limit: 30 }), listGoals(ctx, { includeShared: true }), listAccountsWithBalances(ctx)]) : [[], [], []];
  const goalHits = goals.filter((g) => norm(g.goal.name).includes(term));
  const accountHits = accounts.filter((a) => norm(a.name).includes(term) || norm(a.institution ?? "").includes(term));
  const pages = q.length >= 2 ? [...MAIN_NAV, ...MORE_SECTIONS.flatMap((s) => s.items)].filter((p, i, all) => all.findIndex((x) => x.href === p.href) === i && norm(p.label).includes(term)) : [];
  const nothing = q.length >= 2 && !txs.length && !goalHits.length && !accountHits.length && !pages.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Busca" description="Transações, metas, contas e telas do NEXO." />
      <SearchBox defaultValue={q} className="max-w-xl" />
      {q.length < 2 ? <p className="text-sm text-muted">Digite pelo menos 2 caracteres.</p> : null}
      {nothing ? <EmptyState title={`Nada encontrado para “${q}”`} description="Tente outra palavra, como parte da descrição de um lançamento ou o nome de uma meta." /> : null}
      {pages.length ? (
        <div className="flex flex-wrap gap-2">
          {pages.map((p) => (
            <Link key={p.href} href={p.href} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-petrol-400">
              {p.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {txs.length ? (
          <Card>
            <CardHeader title="Transações" icon={<ArrowLeftRight className="size-4" />} description={`${txs.length} resultado(s) mais recentes`} />
            <CardBody>
              <ul className="divide-y divide-line text-sm">
                {txs.map((t) => (
                  <li key={t.id}>
                    <Link href={`/movimentacoes/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.description}</span>
                        <span className="text-xs text-muted">{formatDateShort(t.date)}</span>
                      </span>
                      <Money cents={t.kind === "income" || t.kind === "refund" ? t.amountCents : t.kind === "expense" ? -t.amountCents : t.amountCents} signed={t.kind === "income" || t.kind === "refund"} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
        <div className="space-y-6">
          {goalHits.length ? (
            <Card>
              <CardHeader title="Metas" icon={<Target className="size-4" />} />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {goalHits.map((g) => (
                    <li key={g.goal.id}>
                      <Link href={`/metas/${g.goal.id}`} className="flex justify-between gap-2 hover:underline">
                        <span>{g.goal.name}</span>
                        <span className="text-muted">{Math.floor(g.diagnosis.progressPct)}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          {accountHits.length ? (
            <Card>
              <CardHeader title="Contas" icon={<Wallet className="size-4" />} />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {accountHits.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <Link href="/contas" className="hover:underline">
                        {a.name}
                      </Link>
                      <Money cents={a.balanceCents} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
      {q.length >= 2 && !nothing ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <FileSearch className="size-3.5" /> A busca considera a descrição das transações e o nome de metas e contas.
        </p>
      ) : null}
    </div>
  );
}
