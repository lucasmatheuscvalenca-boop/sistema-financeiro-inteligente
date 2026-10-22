import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleHelp, Landmark, ShieldCheck, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { MascotArt } from "@/components/mascots/mascot-art";
import { GoalCover } from "@/components/planning/goal-cover";
import { ButtonLink } from "@/components/ui/button";
import { MASCOT_LIST } from "@/mascots/catalog";
import { getCurrentSession } from "@/server/auth/current";

const PILLARS = [
  { icon: Landmark, title: "Central financeira", text: "Contas, cartões, faturas, orçamento e fluxo de caixa sem dupla contagem." },
  { icon: Target, title: "Metas com prioridade", text: "Aporte necessário pelo calendário real e conflitos entre metas às claras." },
  { icon: CircleHelp, title: "Posso gastar?", text: "Resposta baseada em compromissos, metas e próximo recebimento — não só no saldo." },
  { icon: Sparkles, title: "IA financeira", text: "Explica cenários com números do motor de cálculo, nunca inventados." },
  { icon: ShieldCheck, title: "Privacidade", text: "Dados isolados por conta, exportação e exclusão quando você quiser." },
];

const FLOW = ["Crie sua conta", "Escolha seu mascote", "Responda o briefing", "Receba seu plano de hoje"];

/** Prévia ilustrativa do painel (valores de exemplo, apenas decorativa). */
function ProductPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-petrol-500/15 via-transparent to-gold-500/15 blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="grid grid-cols-[72px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-3 bg-sidebar py-4">
            <span className="text-[10px] font-bold tracking-widest text-white">NEXO</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={i === 0 ? "h-2 w-8 rounded-full bg-petrol-400" : "h-2 w-8 rounded-full bg-white/15"} />
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-end gap-3 rounded-2xl bg-hero px-3 pt-2">
              <MascotArt id="lince" size={64} state="guidance" decorative />
              <div className="mb-3 rounded-xl bg-surface px-3 py-2 text-[11px] shadow-sm">
                <p className="font-semibold text-ink">Você está no caminho certo!</p>
                <p className="text-muted">A viagem fica pronta em julho.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Wallet, label: "Saldo livre", value: "R$ 4.280", tone: "text-positive" },
                { icon: TrendingUp, label: "Receitas", value: "R$ 8.900", tone: "text-link" },
                { icon: Target, label: "Metas", value: "56%", tone: "text-gold-600 dark:text-gold-300" },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-line p-2">
                  <k.icon className={`size-3.5 ${k.tone}`} />
                  <p className="mt-1 text-[10px] text-muted">{k.label}</p>
                  <p className="text-xs font-bold text-ink">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-line p-2">
              <GoalCover kind="travel" className="h-10 w-14 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-ink">Viagem dos sonhos</p>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="progress-grow h-full w-[56%] rounded-full bg-petrol-500" />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-link">56%</span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">Ilustração com valores de exemplo</p>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ "conta-excluida"?: string }> }) {
  if (await getCurrentSession()) redirect("/painel");
  const deleted = !!(await searchParams)["conta-excluida"];
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo tagline />
        <div className="flex gap-2">
          <ButtonLink href="/entrar" variant="ghost">
            Entrar
          </ButtonLink>
          <ButtonLink href="/criar-conta" variant="petrol" className="hidden sm:inline-flex">
            Criar conta
          </ButtonLink>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {deleted ? (
          <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-sm">
            Sua conta e todos os dados associados foram excluídos.
          </p>
        ) : null}
        <section className="grid items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-16">
          <div className="animate-rise">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-link">Consultor financeiro pessoal</p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Entenda sua situação, decida melhor e transforme objetivos em <span className="text-link">plano</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Sempre que abrir o NEXO você vai saber onde está, o que priorizar hoje e quais ações aproximam seus objetivos.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/criar-conta" size="lg" variant="petrol">
                Começar agora <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/entrar" size="lg" variant="outline">
                Já tenho conta
              </ButtonLink>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="mascotes" className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-8">
          <h2 id="mascotes" className="text-2xl font-bold tracking-tight">Escolha quem acompanha você</h2>
          <p className="mt-1 text-muted">Seis personagens, seis jeitos de explicar. Os cálculos são os mesmos para todos.</p>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {MASCOT_LIST.map((m) => (
              <li key={m.id} className="card-hover flex flex-col items-center rounded-2xl border border-line bg-surface-2/50 px-2 pb-4 pt-3 text-center">
                <MascotArt id={m.id} size={104} decorative />
                <p className="mt-2 font-semibold">{m.name}</p>
                <p className="text-xs text-muted">{m.title}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PILLARS.map((p) => (
            <div key={p.title} className="card-hover rounded-3xl border border-line bg-surface p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-petrol-50 text-petrol-700 dark:bg-petrol-900/50 dark:text-petrol-200">
                <p.icon className="size-5" />
              </span>
              <p className="mt-3 font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="como" className="mt-10 rounded-3xl bg-navy-900 p-6 text-white sm:p-8 dark:bg-surface-2">
          <h2 id="como" className="text-xl font-bold">Como funciona</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-4">
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-petrol-500 text-sm font-bold text-white">{i + 1}</span>
                <span className="text-sm text-white/90 dark:text-ink">{f}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          O NEXO é uma ferramenta de organização e planejamento. Projeções não são garantias e não constituem recomendação de investimento.{" "}
          <Link href="/termos" className="underline">
            Termos de uso
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>
        </p>
      </main>
    </div>
  );
}
