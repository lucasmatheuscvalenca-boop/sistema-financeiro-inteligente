import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { BriefingForm } from "@/components/briefing/briefing-form";
import { DiagnosisView } from "@/components/briefing/diagnosis-view";
import { MascotArt } from "@/components/mascots/mascot-art";
import { MascotPicker } from "@/components/mascots/mascot-picker";
import { Card, CardBody } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { getMascot } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { getAppContext } from "@/server/auth/current";
import { getBriefing, initialDiagnosis } from "@/server/services/briefing";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/server/services/preferences";
import { autosaveBriefingAction, chooseMascotAction, finishOnboardingAction, saveBriefingAction, skipStepAction } from "./actions";

export const metadata: Metadata = { title: "Primeiros passos" };

/** As seis etapas internas aparecem como as quatro fases do fluxo do NEXO. */
const PHASES = [
  { label: "Cadastro", steps: [] as OnboardingStep[] },
  { label: "Escolha do mascote", steps: ["welcome", "mascot"] as OnboardingStep[] },
  { label: "Briefing financeiro", steps: ["personal", "financial", "life"] as OnboardingStep[] },
  { label: "Primeiro acesso", steps: ["diagnosis"] as OnboardingStep[] },
];

const BRIEFING_PART: Partial<Record<OnboardingStep, string>> = { personal: "Parte 1 de 3", financial: "Parte 2 de 3", life: "Parte 3 de 3" };

function Stepper({ step }: { step: OnboardingStep }) {
  const current = Math.max(1, PHASES.findIndex((p) => p.steps.includes(step)));
  return (
    <ol className="flex items-start" aria-label="Etapas do cadastro">
      {PHASES.map((p, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={p.label} className="flex flex-1 flex-col items-center gap-1.5 text-center last:flex-none sm:last:flex-1" aria-current={active ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : done || active ? "bg-petrol-500" : "bg-line")} />
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold transition",
                  done ? "border-petrol-500 bg-petrol-500 text-white" : active ? "border-petrol-500 bg-surface text-link ring-4 ring-petrol-500/15" : "border-line bg-surface text-muted",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === PHASES.length - 1 ? "invisible" : done ? "bg-petrol-500" : "bg-line")} />
            </div>
            <span className={cn("hidden text-xs sm:block", active ? "font-semibold text-ink" : "text-muted")}>{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const STEP_INTRO: Record<"personal" | "financial" | "life", { title: string; text: string }> = {
  personal: { title: "Conte um pouco sobre você", text: "Isso ajuda a ajustar recomendações como o tamanho ideal da sua reserva." },
  financial: { title: "Sua vida financeira hoje", text: "Valores aproximados já ajudam. Depois, seus lançamentos reais substituem essas estimativas." },
  life: { title: "Seus planos", text: "Objetivos viram metas com valor, prazo e progresso. Você decide o que entra." },
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ etapa?: string; bemvindo?: string }> }) {
  const app = await getAppContext();
  const params = await searchParams;
  const requested = (params.etapa ?? app.prefs.onboardingStep) as OnboardingStep;
  let step: OnboardingStep = ONBOARDING_STEPS.includes(requested) ? requested : "welcome";
  // A escolha do mascote é obrigatória antes do briefing.
  if (!app.mascotId && step !== "welcome") step = "mascot";
  if (app.prefs.onboardingCompletedAt && !params.etapa) redirect("/painel");
  const firstName = app.user.name.split(" ")[0] ?? app.user.name;
  const briefing = await getBriefing(app.ctx);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Logo />
          <div className="w-full md:max-w-xl">
            <Stepper step={step} />
            <p className="mt-1 text-center text-xs text-muted sm:hidden">
              {PHASES.find((p) => p.steps.includes(step))?.label}
              {BRIEFING_PART[step] ? ` · ${BRIEFING_PART[step]}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {step === "welcome" ? (
          <div className="mx-auto max-w-2xl animate-rise text-center">
            <div className="flex justify-center -space-x-4">
              {(["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"] as const).map((id) => (
                <MascotArt key={id} id={id} size={72} decorative className="rounded-full ring-4 ring-canvas" />
              ))}
            </div>
            <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">Olá, {firstName}! Vamos montar seu plano.</h1>
            <p className="mt-3 text-muted">
              Primeiro você escolhe quem vai acompanhar você. Depois, um briefing curto em três etapas. Dá para parar a qualquer momento e voltar depois — o progresso fica salvo.
            </p>
            <form action={skipStepAction} className="mt-8">
              <input type="hidden" name="to" value="mascot" />
              <button className={buttonClass("primary", "lg")}>
                Começar <ArrowRight className="size-4" />
              </button>
            </form>
          </div>
        ) : null}

        {step === "mascot" ? (
          <div className="animate-rise">
            <h1 className="text-2xl font-semibold sm:text-3xl">Escolha seu mascote</h1>
            <p className="mt-2 max-w-2xl text-muted">Seis personagens, cada um com um jeito de explicar. Experimente antes de confirmar — você pode trocar depois em Configurações sem perder nada.</p>
            <div className="mt-6">
              <MascotPicker action={chooseMascotAction} userName={firstName} current={app.mascotId} />
            </div>
          </div>
        ) : null}

        {(step === "personal" || step === "financial" || step === "life") && app.mascotId ? (
          <div className="grid animate-rise gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="flex items-start gap-3 lg:flex-col">
                <MascotArt id={app.mascotId} size={params.bemvindo ? 120 : 88} state={params.bemvindo ? "celebration" : "guidance"} />
                <div className="rounded-2xl rounded-tl-sm border border-line bg-surface p-4 text-sm shadow-sm">
                  {params.bemvindo ? voiceFor(app.mascotId).welcome(firstName) : `${getMascot(app.mascotId).name}: ${STEP_INTRO[step].text}`}
                </div>
              </div>
            </aside>
            <Card>
              <CardBody className="pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-link">Briefing financeiro · {BRIEFING_PART[step]}</p>
                <h1 className="mt-1 text-2xl font-semibold">{STEP_INTRO[step].title}</h1>
                <p className="mb-6 mt-1 text-sm text-muted">{STEP_INTRO[step].text}</p>
                <BriefingForm section={step} answers={(briefing.answers[step] as Record<string, unknown>) ?? {}} action={saveBriefingAction} autosave={autosaveBriefingAction} origin="onboarding" />
              </CardBody>
            </Card>
          </div>
        ) : null}

        {step === "diagnosis" && app.mascotId ? (
          <div className="animate-rise">
            <div className="mb-6 flex items-center gap-4">
              <MascotArt id={app.mascotId} size={96} state="analysis" />
              <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">Seu diagnóstico inicial</h1>
                <p className="mt-1 text-muted">{voiceFor(app.mascotId).opening("neutral")} Com base no que você informou:</p>
              </div>
            </div>
            <DiagnosisView diagnosis={await initialDiagnosis(app.ctx)} />
            <form action={finishOnboardingAction} className="mt-8 flex justify-end">
              <button className={buttonClass("petrol", "lg")}>
                Ir para meu painel <ArrowRight className="size-4" />
              </button>
            </form>
          </div>
        ) : null}
      </main>
    </div>
  );
}
