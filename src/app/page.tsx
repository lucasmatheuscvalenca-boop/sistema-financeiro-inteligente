import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleHelp, Landmark, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Silk } from "@/components/app/silk";
import { MascotArt } from "@/components/mascots/mascot-art";
import { ButtonLink } from "@/components/ui/button";
import { BANKER, MASCOT_STATE_LABEL } from "@/mascots/catalog";
import { getCurrentSession } from "@/server/auth/current";

const PILLARS = [
  { icon: Landmark, title: "Central financeira", text: "Contas, cartões, faturas, orçamento e fluxo de caixa sem dupla contagem." },
  { icon: Target, title: "Metas com prioridade", text: "Aporte necessário pelo calendário real e conflitos entre metas às claras." },
  { icon: CircleHelp, title: "Posso gastar?", text: "Resposta baseada em compromissos, metas e próximo recebimento, não só no saldo." },
  { icon: Sparkles, title: "Assistente", text: "Explica cenários com números do motor de cálculo, nunca inventados." },
  { icon: ShieldCheck, title: "Privacidade", text: "Dados isolados por conta, exportação e exclusão quando você quiser." },
];

const FLOW = ["Crie sua conta", "Conheça O Banqueiro", "Responda o briefing", "Receba seu plano de hoje"];

/** Prévia ilustrativa do Início (valores de exemplo, apenas decorativa). */
function ProductPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="grid grid-cols-[64px_minmax(0,1fr)]">
          <div className="silk relative flex flex-col items-center gap-3 py-4">
            <span className="font-display text-sm font-semibold text-gold-300">B</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={i === 0 ? "h-1.5 w-7 rounded-sm bg-leaf-300/70" : "h-1.5 w-7 rounded-sm bg-white/15"} />
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="relative overflow-hidden rounded-lg bg-hero p-3 text-hero-ink">
              <Silk />
              <p className="relative text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-300">Pode gastar até o fim do mês</p>
              <p className="relative mt-1 font-display text-2xl font-semibold">R$ 2.480,00</p>
              <div className="relative mt-2 h-1 w-3/4 rounded-sm bg-white/15">
                <span className="block h-full w-[46%] rounded-sm bg-leaf-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-[10px]">
              <div>
                <p className="border-b border-ink/70 pb-1 font-display text-[11px] font-medium text-ink">Gastos do mês</p>
                {[
                  ["Mercado", "R$ 497"],
                  ["Transporte", "R$ 188"],
                  ["Lazer", "R$ 120"],
                ].map(([k, v]) => (
                  <p key={k} className="flex justify-between border-b border-line py-1 text-muted">
                    <span>{k}</span>
                    <span className="font-semibold text-ink">{v}</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="border-b border-ink/70 pb-1 font-display text-[11px] font-medium text-ink">Próximos 7 dias</p>
                {[
                  ["Fatura", "R$ 1.470"],
                  ["Aluguel", "R$ 2.200"],
                  ["Luz", "R$ 380"],
                ].map(([k, v]) => (
                  <p key={k} className="flex justify-between border-b border-line py-1 text-muted">
                    <span>{k}</span>
                    <span className="font-semibold text-negative">−{v}</span>
                  </p>
                ))}
              </div>
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
          <ButtonLink href="/criar-conta" className="hidden sm:inline-flex">
            Criar conta
          </ButtonLink>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {deleted ? (
          <p role="status" className="border-l-[3px] border-l-accent bg-surface px-4 py-3 text-sm">
            Sua conta e todos os dados associados foram excluídos.
          </p>
        ) : null}
        <section className="grid grid-cols-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-16">
          <div className="animate-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-link">Consultor financeiro pessoal</p>
            <h1 className="mt-4 text-[40px] leading-[1.08] sm:text-[54px]">
              Entenda sua situação, decida melhor e transforme objetivos em <span className="text-link">plano</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Sempre que abrir o Meu Banqueiro você vai saber onde está, o que priorizar hoje e quais ações aproximam seus objetivos.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/criar-conta" size="lg">
                Começar agora <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/entrar" size="lg" variant="outline">
                Já tenho conta
              </ButtonLink>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="banqueiro" className="grid gap-8 border-t border-ink/80 pt-8 dark:border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <h2 id="banqueiro" className="text-[28px]">Conheça O Banqueiro</h2>
            <p className="mt-2 text-muted">Seu consultor financeiro pessoal. Ele lê seus números todos os dias, explica com calma o que está acontecendo e indica a próxima ação, com a expressão certa para cada momento.</p>
            <p className="mt-3 border-l-2 border-gold-400 pl-3 italic text-muted">“{BANKER.catchphrase}”</p>
          </div>
          <ul className="grid grid-cols-3 gap-4">
            {(["guidance", "analysis", "celebration"] as const).map((st) => (
              <li key={st} className="flex flex-col items-center text-center">
                <MascotArt state={st} size={120} decorative />
                <p className="mt-2 text-xs font-medium text-muted">{MASCOT_STATE_LABEL[st]}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 grid gap-x-8 gap-y-6 border-t border-ink/80 pt-8 dark:border-line sm:grid-cols-2 lg:grid-cols-5">
          {PILLARS.map((p) => (
            <div key={p.title}>
              <p.icon className="size-5 text-link" strokeWidth={1.7} />
              <p className="mt-3 font-display text-[18px] font-medium">{p.title}</p>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="como" className="relative mt-12 overflow-hidden rounded-xl bg-hero p-6 text-hero-ink sm:p-8">
          <Silk />
          <h2 id="como" className="relative text-[24px]">Como funciona</h2>
          <ol className="relative mt-5 grid gap-4 sm:grid-cols-4">
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold-300/60 font-display text-sm font-semibold text-gold-300">{i + 1}</span>
                <span className="text-sm text-hero-ink/90">{f}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          O Meu Banqueiro é uma ferramenta de organização e planejamento. Projeções não são garantias e não constituem recomendação de investimento.{" "}
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
