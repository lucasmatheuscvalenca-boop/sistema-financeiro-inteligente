import type { Metadata } from "next";
import { chooseMascotAction } from "@/app/onboarding/actions";
import { MascotArt } from "@/components/mascots/mascot-art";
import { MascotPicker } from "@/components/mascots/mascot-picker";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getMascot, MASCOT_STATES, MASCOT_STATE_LABEL } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { mascotHistory } from "@/server/services/preferences";

export const metadata: Metadata = { title: "Meu mascote" };

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
      <Card>
        <CardHeader title={`${mascot.name} — ${mascot.title}`} description={mascot.shortDescription} />
        <CardBody>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {MASCOT_STATES.map((st) => (
              <figure key={st} className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 p-2">
                <MascotArt id={mascotId} state={st} size={72} decorative />
                <figcaption className="text-center text-[11px] text-muted">{MASCOT_STATE_LABEL[st]}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-sm">
            <span className="font-medium">Foco de comunicação:</span> {mascot.communicationFocus}
          </p>
          <p className="mt-1 text-sm italic text-muted">“{mascot.catchphrase}”</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Trocar de mascote" description="A troca muda apenas o personagem e o tom das mensagens. Os cálculos, os dados e as recomendações continuam os mesmos." />
        <CardBody>
          <MascotPicker action={chooseMascotAction} current={mascotId} userName={user.name} confirmLabel="Trocar para este mascote" origin="configuracoes" />
        </CardBody>
      </Card>
      {history.length > 1 ? (
        <Card>
          <CardHeader title="Histórico de escolhas" />
          <CardBody>
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.selectedAt.toISOString()} className="flex justify-between gap-2">
                  <span>{getMascot(h.mascotId as typeof mascotId).name}</span>
                  <span className="text-muted">{formatDateTime(h.selectedAt, prefs.timezone)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
