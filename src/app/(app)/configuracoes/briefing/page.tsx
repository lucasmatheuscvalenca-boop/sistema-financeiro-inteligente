import type { Metadata } from "next";
import Link from "next/link";
import { autosaveBriefingAction, saveBriefingAction } from "@/app/onboarding/actions";
import { BriefingForm } from "@/components/briefing/briefing-form";
import { DiagnosisView } from "@/components/briefing/diagnosis-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { BRIEFING_SECTIONS, getBriefing, initialDiagnosis, type BriefingSection } from "@/server/services/briefing";

export const metadata: Metadata = { title: "Meu perfil financeiro" };

const LABEL: Record<BriefingSection, string> = { personal: "Sobre você", financial: "Situação financeira", life: "Planos de vida" };

export default async function BriefingSettingsPage({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  const section: BriefingSection = (BRIEFING_SECTIONS as readonly string[]).includes(sp.etapa ?? "") ? (sp.etapa as BriefingSection) : "personal";
  const [briefing, diagnosis] = await Promise.all([getBriefing(ctx), initialDiagnosis(ctx)]);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Estas respostas alimentam o diagnóstico e o contexto do assistente. Responder é opcional; o que faltar aparece como “informação ausente”, sem suposições.</p>
      <div className="flex flex-wrap gap-2">
        {BRIEFING_SECTIONS.map((s) => (
          <Link key={s} href={`/configuracoes/briefing?etapa=${s}`} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-sm", s === section ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted")}>
            {LABEL[s]}
            {briefing.completed[s] ? <Badge tone="positive">ok</Badge> : <Badge>parcial</Badge>}
          </Link>
        ))}
      </div>
      <Card>
        <CardBody className="pt-5">
          <BriefingForm key={section} section={section} answers={(briefing.answers[section] as Record<string, unknown>) ?? {}} action={saveBriefingAction} autosave={autosaveBriefingAction} origin="configuracoes" />
        </CardBody>
      </Card>
      <section>
        <h2 className="mb-3 font-semibold">Diagnóstico atual</h2>
        <DiagnosisView diagnosis={diagnosis} />
      </section>
    </div>
  );
}
