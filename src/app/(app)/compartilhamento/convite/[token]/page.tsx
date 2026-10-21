import type { Metadata } from "next";
import Link from "next/link";
import { acceptShareAction } from "../../../_actions/planning";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Card } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/form";
import { requireOnboarded } from "@/server/auth/current";

export const metadata: Metadata = { title: "Convite para meta compartilhada" };

/**
 * Página aberta pelo link do convite. Não revela nada sobre a meta antes do aceite:
 * a validação (e-mail da conta, validade, status) acontece na ação de aceitar.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { mascotId, user } = await requireOnboarded();
  return (
    <div className="mx-auto max-w-lg py-8">
      <Card className="p-6 text-center">
        <MascotArt id={mascotId} state="guidance" size={96} className="mx-auto" />
        <h1 className="mt-4 text-xl font-semibold">Você recebeu um convite</h1>
        <p className="mt-2 text-sm text-muted">
          Alguém quer acompanhar uma meta com você. O convite só funciona para a conta com o e-mail convidado (você está como <strong>{user.email}</strong>). Ao aceitar, você vê apenas essa meta — e quem convidou não vê nada seu.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <InlineAction action={acceptShareAction} hidden={{ token }} variant="petrol" size="md">
            Aceitar convite
          </InlineAction>
          <Link href="/compartilhamento" className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-surface-2">
            Agora não
          </Link>
        </div>
      </Card>
    </div>
  );
}
