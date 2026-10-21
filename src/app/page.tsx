import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleHelp, Landmark, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { MascotArt } from "@/components/mascots/mascot-art";
import { ButtonLink } from "@/components/ui/button";
import { MASCOT_LIST } from "@/mascots/catalog";
import { getCurrentSession } from "@/server/auth/current";

export default async function Home() {
  if (await getCurrentSession()) redirect("/painel");
  const pillars = [
    { icon: <Landmark className="size-5" />, title: "Central financeira", text: "Contas, cartões, faturas, orçamento e fluxo de caixa sem dupla contagem." },
    { icon: <Target className="size-5" />, title: "Metas com prioridade", text: "Aporte necessário pelo calendário real e conflitos entre metas às claras." },
    { icon: <CircleHelp className="size-5" />, title: "Posso gastar?", text: "Resposta baseada em compromissos, metas e próximo recebimento — não só no saldo." },
    { icon: <Sparkles className="size-5" />, title: "Consultor com IA", text: "Explica cenários com números do motor de cálculo, nunca inventados." },
    { icon: <ShieldCheck className="size-5" />, title: "Privacidade", text: "Dados isolados por conta, exportação e exclusão quando você quiser." },
  ];
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex gap-2">
          <ButtonLink href="/entrar" variant="ghost">
            Entrar
          </ButtonLink>
          <ButtonLink href="/criar-conta">Criar conta</ButtonLink>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:py-20">
          <div className="animate-rise">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-petrol-600 dark:text-petrol-300">Consultor financeiro pessoal</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] sm:text-5xl">
              Entenda sua situação, decida melhor e transforme objetivos em <span className="text-petrol-600 dark:text-petrol-300">plano</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Sempre que abrir o Rumo você vai saber onde está, o que priorizar e quais ações melhoram seu futuro financeiro.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/criar-conta" size="lg">
                Começar agora <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/entrar" size="lg" variant="secondary">
                Já tenho conta
              </ButtonLink>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {MASCOT_LIST.map((m, i) => (
              <div key={m.id} className="flex flex-col items-center rounded-3xl border border-line bg-surface p-4 text-center shadow-[var(--shadow-card)]" style={{ animationDelay: `${i * 60}ms` }}>
                <MascotArt id={m.id} size={84} state={i === 1 ? "celebration" : i === 4 ? "guidance" : "neutral"} />
                <p className="mt-2 text-sm font-semibold">{m.name}</p>
                <p className="text-xs text-muted">{m.title}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-3xl border border-line bg-surface p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-petrol-50 text-petrol-700 dark:bg-petrol-900/50 dark:text-petrol-200">{p.icon}</span>
              <p className="mt-3 font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </section>
        <p className="mt-10 text-center text-xs text-muted">
          O Rumo é uma ferramenta de organização e planejamento. Projeções não são garantias e não constituem recomendação de investimento. <Link href="/privacidade" className="underline">Privacidade</Link>
        </p>
      </main>
    </div>
  );
}
