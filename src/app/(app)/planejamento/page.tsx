import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, ChartLine, ChevronRight, CircleHelp, Repeat, ShieldCheck, Sunset, Target, Trophy, Users } from "lucide-react";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/domain/money";
import { requireOnboarded } from "@/server/auth/current";
import { getEmergencyOverview } from "@/server/services/emergency";
import { listRecurrences } from "@/server/services/recurrences";
import { getRetirementOverview } from "@/server/services/retirement";
import { getFinancialSnapshot } from "@/server/services/snapshot";

export const metadata: Metadata = { title: "Planejamento" };

function Tile({ href, icon, title, children, tone = "teal" }: { href: string; icon: ReactNode; title: string; children: ReactNode; tone?: "teal" | "gold" | "navy" | "sky" }) {
  const tones = {
    teal: "bg-petrol-50 text-petrol-700 dark:bg-petrol-900/40 dark:text-petrol-200",
    gold: "bg-gold-50 text-gold-700 dark:bg-gold-700/30 dark:text-gold-200",
    navy: "bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-100",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  } as const;
  return (
    <Link href={href} className="card-hover group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
        <h2 className="flex-1 font-semibold">{title}</h2>
        <ChevronRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex-1 text-sm text-muted">{children}</div>
    </Link>
  );
}

export default async function PlanningPage() {
  const { ctx, mascotId } = await requireOnboarded();
  const [emergency, retirement, snap, recurrences] = await Promise.all([getEmergencyOverview(ctx), getRetirementOverview(ctx), getFinancialSnapshot(ctx), listRecurrences(ctx, { activeOnly: true })]);
  const ev = emergency.evaluation;
  const goals = snap.goals.filter((g) => g.goal.status === "active");
  const r = retirement.result;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planejamento de vida" title="Planejamento" description="Reserva, aposentadoria, previsão do mês e decisões de gasto — tudo com as mesmas regras e premissas explícitas." />
      <Card className="flex flex-col items-center gap-4 p-5 sm:flex-row">
        <MascotArt id={mascotId} state="guidance" size={88} />
        <div className="flex-1">
          <p className="font-semibold">Ordem sugerida</p>
          <p className="mt-1 text-sm text-muted">1. Contas em dia e saldo positivo · 2. Reserva de emergência no mínimo · 3. Metas por prioridade · 4. Aposentadoria com aporte constante. O mesmo dinheiro nunca é contado para duas metas.</p>
        </div>
        <Link href="/posso-gastar" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-sm transition hover:brightness-110">
          <CircleHelp className="size-4" /> Posso gastar?
        </Link>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile href="/reserva" icon={<ShieldCheck className="size-5" />} title="Reserva de emergência">
          {ev.targetCents > 0 ? (
            <>
              <p>
                {formatMoney(ev.currentCents)} de {formatMoney(ev.targetCents)} · cobre {ev.coverageMonths.toFixed(1).replace(".", ",")} mês(es) de despesas essenciais
              </p>
              <Progress className="mt-3" value={ev.progressPct} tone={ev.belowMinimum ? "warning" : "petrol"} label="Progresso da reserva" />
            </>
          ) : (
            <p>Informe suas despesas essenciais para calcular o tamanho ideal da reserva.</p>
          )}
        </Tile>
        <Tile href="/aposentadoria" icon={<Sunset className="size-5" />} title="Aposentadoria" tone="gold">
          {r ? (
            <p>
              {r.onTrack ? "No caminho com o aporte atual." : `Aporte necessário: ${formatMoney(r.requiredMonthlyContributionRealCents)}/mês (valores de hoje).`} Renda sustentável projetada: {formatMoney(r.sustainableMonthlyIncomeRealCents)}/mês.
              {!retirement.saved ? " Plano ainda não salvo (premissas iniciais)." : ""}
            </p>
          ) : (
            <p>{retirement.error ?? "Monte seu plano com idade, renda desejada e premissas."}</p>
          )}
        </Tile>
        <Tile href="/fluxo-de-caixa" icon={<ChartLine className="size-5" />} title="Fluxo de caixa" tone="sky">
          {snap.monthEnd ? (
            <p>
              Previsão de fechamento: {formatMoney(snap.monthEnd.confirmedCents)} só com confirmados.
              {snap.projection?.firstNegativeConfirmed ? " Há risco de saldo negativo no mês." : " Sem saldo negativo previsto."}
            </p>
          ) : (
            <p>Veja o saldo dia a dia, confirmado e com estimativas.</p>
          )}
        </Tile>
        <Tile href="/metas" icon={<Target className="size-5" />} title="Metas e projetos">
          <p>{goals.length ? `${goals.length} meta(s) ativa(s) · ${goals.filter((g) => g.diagnosis.health === "at_risk").length} em risco de atraso.` : "Nenhuma meta ativa. Crie viagens, bens, reserva ou independência financeira."}</p>
        </Tile>
        <Tile href="/recorrencias" icon={<Repeat className="size-5" />} title="Recorrências" tone="navy">
          <p>{recurrences.length ? `${recurrences.length} recorrência(s) ativa(s) entram nas previsões automaticamente.` : "Cadastre salário, aluguel e assinaturas para prever o mês."}</p>
        </Tile>
        <Tile href="/revisao" icon={<CalendarCheck className="size-5" />} title="Revisão financeira" tone="sky">
          <p>Checklist de cinco minutos para manter saldos, previstos, orçamento e metas em dia.</p>
        </Tile>
        <Tile href="/conquistas" icon={<Trophy className="size-5" />} title="Conquistas e desafios" tone="gold">
          <p>Missões da semana e desafios voluntários que premiam constância — nunca gastos.</p>
        </Tile>
        <Tile href="/compartilhamento" icon={<Users className="size-5" />} title="Compartilhamento" tone="navy">
          <p>Convide alguém para acompanhar uma meta específica, com acesso revogável.</p>
        </Tile>
      </div>
    </div>
  );
}
