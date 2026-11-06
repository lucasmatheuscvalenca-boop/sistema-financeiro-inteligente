import type { Metadata } from "next";
import { chooseMascotAction } from "@/app/onboarding/actions";
import { MascotArt } from "@/components/mascots/mascot-art";
import { MascotPicker } from "@/components/mascots/mascot-picker";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { getMascot, MASCOT_STATE_LABEL, type MascotState } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { mascotHistory } from "@/server/services/preferences";

export const metadata: Metadata = { title: "Meu mascote" };

const STATE_ORDER: MascotState[] = ["neutral", "analysis", "celebration", "attention", "alert", "guidance"];

export default async function MascotSettingsPage({ searchParams }: { searchParams: Promise<{ trocado?: string }> }) {
  const { ctx, user, mascotId, prefs } = await requireOnboarded();
  const sp = await searchParams;
  const mascot = getMascot(mascotId);
  const history = await mascotHistory(ctx);
  return (
    <div className="space-y-6">
      {sp.trocado ? (
        <Callout tone="positive" title={`Agora quem acompanha você é ${mascot.name}`}>
          {voiceFor(mascotId).welcome(user.name)} Seus dados, metas e históricos continuam exatamente como estavam.
        </Callout>
      ) : null}
      <div className="border-b border-line pb-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div className="flex justify-center rounded-lg bg-hero px-6 pt-4">
            <MascotArt id={mascotId} state="neutral" size={150} priority animate />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-link">Seu mascote</p>
            <h2 className="text-[28px]">
              {mascot.name} <span className="font-normal text-muted">· {mascot.title}</span>
            </h2>
            <p className="mt-1 text-xs text-muted">{mascot.personality.join(" · ")}</p>
            <p className="mt-3 text-sm">{mascot.shortDescription}</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">Foco de comunicação:</span> {mascot.communicationFocus}
            </p>
            <p className="mt-2 border-l-2 border-gold-400 pl-3 text-sm italic text-muted">“{mascot.catchphrase}”</p>
          </div>
        </div>
      </div>
      <Section title="Estados do mascote" description="A expressão acompanha o contexto: análise ao calcular, orientação em dicas, celebração em conquistas, atenção e alerta em riscos.">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
            {STATE_ORDER.map((st) => (
              <figure key={st} className="flex flex-col items-center gap-2 py-2">
                <MascotArt id={mascotId} state={st} size={96} decorative />
                <figcaption className="text-center text-xs font-medium">{MASCOT_STATE_LABEL[st]}</figcaption>
              </figure>
            ))}
          </div>
      </Section>
      <Section title="Trocar de mascote" description="A troca muda apenas o personagem e o tom das mensagens. Os cálculos, os dados e as recomendações continuam os mesmos.">
          <MascotPicker action={chooseMascotAction} current={mascotId} userName={user.name} confirmLabel="Trocar para este mascote" origin="configuracoes" withTabBar />
      </Section>
      {history.length > 1 ? (
        <Section title="Histórico de escolhas">
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.selectedAt.toISOString()} className="flex justify-between gap-2">
                  <span>{getMascot(h.mascotId as typeof mascotId).name}</span>
                  <span className="text-muted">{formatDateTime(h.selectedAt, prefs.timezone)}</span>
                </li>
              ))}
            </ul>
        </Section>
      ) : null}
    </div>
  );
}
