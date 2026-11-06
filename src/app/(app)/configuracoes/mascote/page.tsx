import type { Metadata } from "next";
import { MascotArt } from "@/components/mascots/mascot-art";
import { MeetBanker } from "@/components/mascots/meet-banker";
import { Section } from "@/components/ui/section";
import { MASCOT_STATE_LABEL, type MascotState } from "@/mascots/catalog";
import { requireOnboarded } from "@/server/auth/current";

export const metadata: Metadata = { title: "Seu banqueiro" };

const STATE_ORDER: MascotState[] = ["neutral", "analysis", "guidance", "celebration", "attention", "alert"];

export default async function MascotSettingsPage() {
  const { user } = await requireOnboarded();
  return (
    <div className="space-y-8">
      <MeetBanker userName={user.name} />
      <Section title="Expressões do Banqueiro" description="A expressão acompanha o contexto: análise ao calcular, orientação em dicas, comemoração em conquistas, atenção e alerta em riscos.">
        <ul className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {STATE_ORDER.map((st) => (
            <li key={st} className="flex flex-col items-center gap-2 py-2">
              <MascotArt state={st} size={96} decorative />
              <p className="text-center text-xs font-medium">{MASCOT_STATE_LABEL[st]}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
