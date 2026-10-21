import type { Metadata } from "next";
import Link from "next/link";
import { Eye, HandCoins, Users } from "lucide-react";
import { acceptShareAction, declineShareAction, inviteAction, revokeShareAction } from "../_actions/planning";
import { InviteForm } from "@/components/planning/invite-form";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { listGoals } from "@/server/services/goals";
import { listIncomingShares, listOutgoingShares } from "@/server/services/sharing";

export const metadata: Metadata = { title: "Compartilhamento" };

const STATUS: Record<string, [string, "positive" | "warning" | "neutral" | "info"]> = {
  pending: ["Aguardando aceite", "info"],
  accepted: ["Ativo", "positive"],
  declined: ["Recusado", "neutral"],
  revoked: ["Revogado", "neutral"],
  expired: ["Expirado", "warning"],
};

function PermissionLabel({ p }: { p: string }) {
  return p === "contribute" ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <HandCoins className="size-3.5" /> acompanha e registra aportes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Eye className="size-3.5" /> só acompanha
    </span>
  );
}

export default async function SharingPage({ searchParams }: { searchParams: Promise<{ meta?: string }> }) {
  const { ctx, prefs } = await requireOnboarded();
  const sp = await searchParams;
  const [goals, outgoing, incoming] = await Promise.all([listGoals(ctx), listOutgoingShares(ctx), listIncomingShares(ctx)]);
  const own = goals.filter((g) => g.access === "owner" && g.goal.status !== "archived");
  const pending = incoming.filter((i) => i.status === "pending");
  const accepted = incoming.filter((i) => i.status === "accepted");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Conta" title="Compartilhamento familiar" description="Opcional. Você compartilha metas específicas — nunca a conta inteira — e pode revogar a qualquer momento." />
      <Callout tone="info" title="O que a outra pessoa vê">
        Somente a meta compartilhada: nome, alvo, prazo, progresso e aportes dessa meta. Suas contas, movimentações, orçamento, memória do assistente e demais metas continuam privados.
      </Callout>
      {pending.length ? (
        <Card>
          <CardHeader title="Convites para você" icon={<Users className="size-4" />} />
          <CardBody className="space-y-3">
            {pending.map((i) => (
              <div key={i.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {i.ownerName} convidou você para a meta “{i.goalName}”
                  </p>
                  <PermissionLabel p={i.permission} />
                  <p className="text-xs text-muted">Expira em {formatDateTime(i.expiresAt, prefs.timezone)}</p>
                </div>
                <div className="flex gap-2">
                  <InlineAction action={acceptShareAction} hidden={{ shareId: i.id }} variant="petrol">
                    Aceitar
                  </InlineAction>
                  <InlineAction action={declineShareAction} hidden={{ id: i.id }}>
                    Recusar
                  </InlineAction>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Convidar alguém" description="O convite vale por 14 dias e só pode ser aceito pela conta com o e-mail informado." />
        <CardBody>
          {own.length === 0 ? (
            <EmptyState title="Você ainda não tem metas" description="Crie uma meta para poder compartilhá-la." action={<Link href="/metas/nova" className="text-sm font-medium text-petrol-600 underline dark:text-petrol-300">Criar meta</Link>} />
          ) : (
            <InviteForm action={inviteAction} goals={own.map((g) => ({ id: g.goal.id, name: g.goal.name }))} defaultGoalId={own.some((g) => g.goal.id === sp.meta) ? sp.meta : undefined} />
          )}
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Metas que você compartilhou" />
          <CardBody>
            {outgoing.length === 0 ? (
              <p className="text-sm text-muted">Nenhum compartilhamento.</p>
            ) : (
              <ul className="space-y-3">
                {outgoing.map((o) => {
                  const [label, tone] = STATUS[o.status] ?? [o.status, "neutral"];
                  return (
                    <li key={o.id} className="rounded-2xl border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/metas/${o.resourceId}`} className="font-medium hover:underline">
                          {o.goalName}
                        </Link>
                        <Badge tone={tone}>{label}</Badge>
                      </div>
                      <p className="mt-1 text-muted">{o.inviteeEmail}</p>
                      <PermissionLabel p={o.permission} />
                      {o.status === "pending" || o.status === "accepted" ? (
                        <div className="mt-2">
                          <InlineAction action={revokeShareAction} hidden={{ id: o.id }} confirm="Revogar o acesso? A pessoa deixa de ver a meta imediatamente.">
                            Revogar acesso
                          </InlineAction>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Metas compartilhadas com você" />
          <CardBody>
            {accepted.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma meta compartilhada com você.</p>
            ) : (
              <ul className="space-y-3">
                {accepted.map((i) => (
                  <li key={i.id} className="rounded-2xl border border-line p-3 text-sm">
                    <Link href={`/metas/${i.resourceId}`} className="font-medium hover:underline">
                      {i.goalName}
                    </Link>
                    <p className="text-muted">de {i.ownerName}</p>
                    <PermissionLabel p={i.permission} />
                    <div className="mt-2">
                      <InlineAction action={revokeShareAction} hidden={{ id: i.id }} confirm="Sair desta meta compartilhada?">
                        Sair do compartilhamento
                      </InlineAction>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
