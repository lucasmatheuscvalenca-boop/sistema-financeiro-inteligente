import type { Metadata } from "next";
import { plural } from "@/domain/text";
import Link from "next/link";
import { Download, ShieldAlert } from "lucide-react";
import { changePasswordAction, deleteAccountAction, revokeOtherSessionsAction, revokeSessionAction } from "../../_actions/account";
import { deleteAllConversationsAction } from "../../_actions/intelligence";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { ActionForm, Field, InlineAction, Input, SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { listSessions } from "@/server/auth/sessions";
import { listConversations } from "@/server/ai/assistant";

export const metadata: Metadata = { title: "Privacidade e segurança" };

function deviceLabel(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export default async function PrivacySettingsPage() {
  const { ctx, sessionId, prefs } = await requireOnboarded();
  const [sessions, conversations] = await Promise.all([listSessions(ctx.db, ctx.userId), listConversations(ctx)]);
  const tz = prefs.timezone;
  const current = sessions.find((x) => x.id === sessionId);
  // Mais recentes primeiro.
  const others = sessions.filter((x) => x.id !== sessionId).sort((x, y) => y.lastSeenAt.getTime() - x.lastSeenAt.getTime());
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Section title="Sessões ativas" description="Encerre o acesso de dispositivos que você não reconhece.">
        {others.length > 0 ? (
          <div className="mb-3">
            <InlineAction action={revokeOtherSessionsAction} variant="secondary">
              Encerrar todos os outros acessos
            </InlineAction>
          </div>
        ) : null}
        <ul className="divide-y divide-line">
          {current ? (
            <li className="py-2 text-sm">
              <p className="font-medium">
                {deviceLabel(current.userAgent)} <Badge tone="positive">esta sessão</Badge>
              </p>
              <p className="text-xs text-muted">
                Último uso {formatDateTime(current.lastSeenAt, tz)} · expira {formatDateTime(current.expiresAt, tz)}
              </p>
            </li>
          ) : null}
          {others.length > 0 ? (
            <li className="py-2 text-sm">
              {/* Cada login vira uma sessão: agrupadas, a lista não cresce sem fim na tela. */}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block font-medium">{plural(others.length, "outro acesso", "outros acessos")}</span>
                    <span className="block text-xs text-muted">
                      {[...new Set(others.map((x) => deviceLabel(x.userAgent)))].slice(0, 3).join(", ")} · o mais recente em {formatDateTime(others[0]!.lastSeenAt, tz)} · os antigos vencem sozinhos em 30 dias
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-link group-open:hidden">Ver lista</span>
                  <span className="hidden shrink-0 font-medium text-link group-open:inline">Esconder</span>
                </summary>
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {others.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium">{deviceLabel(x.userAgent)}</p>
                        <p className="text-xs text-muted">
                          Último uso {formatDateTime(x.lastSeenAt, tz)} · expira {formatDateTime(x.expiresAt, tz)}
                        </p>
                      </div>
                      <InlineAction action={revokeSessionAction} hidden={{ id: x.id }}>
                        Encerrar
                      </InlineAction>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ) : null}
        </ul>
      </Section>
      <Card>
        <CardHeader title="Alterar senha" description="Ao alterar, as outras sessões são encerradas." />
        <CardBody>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="Senha atual" name="current">
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nova senha" name="next" hint="Mínimo de 10 caracteres, com letras e números.">
                <Input name="next" type="password" autoComplete="new-password" required />
              </Field>
              <Field label="Confirmar nova senha" name="confirm">
                <Input name="confirm" type="password" autoComplete="new-password" required />
              </Field>
            </div>
            <SubmitButton variant="secondary">Alterar senha</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Section title="Seus dados">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Exportar tudo</p>
            <p className="text-muted">Arquivo JSON com perfil, contas, movimentações, metas, memória, conversas e histórico de conexões. Referências cifradas de conexões bancárias não são exportadas.</p>
            <a href="/api/exportar" className={buttonClass("secondary", "sm", "mt-2")} download>
              <Download className="size-4" /> Baixar meus dados
            </a>
          </div>
          <div>
            <p className="font-medium">Conversas com o assistente</p>
            <p className="text-muted">{conversations.length} conversa(s) guardada(s).</p>
            {conversations.length ? (
              <div className="mt-2">
                <InlineAction action={deleteAllConversationsAction} variant="secondary" confirm="Apagar todas as conversas com o assistente?">
                  Apagar conversas
                </InlineAction>
              </div>
            ) : null}
          </div>
          <div>
            <p className="font-medium">Memória do assistente</p>
            <Link href="/configuracoes/memoria" className="text-link underline">
              Revisar ou apagar o que o assistente lembra
            </Link>
          </div>
          <div>
            <p className="font-medium">Conexões bancárias</p>
            <Link href="/conexoes" className="text-link underline">
              Revogar consentimentos e apagar dados importados
            </Link>
          </div>
          <p className="text-xs text-muted">
            Saiba como tratamos seus dados no{" "}
            <Link href="/privacidade" className="underline">
              aviso de privacidade
            </Link>
            .
          </p>
        </div>
      </Section>
      <Card className="border-orange-200 dark:border-orange-900/60">
        <CardHeader title="Excluir conta" icon={<ShieldAlert className="size-4 text-negative" />} description="Apaga definitivamente a conta e todos os dados financeiros, metas, memória e conversas." />
        <CardBody>
          <Callout tone="warning">Exporte seus dados antes, se quiser guardar uma cópia. Esta ação não pode ser desfeita. Compartilhamentos que você criou deixam de existir.</Callout>
          <ActionForm action={deleteAccountAction} className="mt-4">
            <Field label="Senha" name="password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Digite EXCLUIR para confirmar" name="confirmText">
              <Input name="confirmText" autoComplete="off" required />
            </Field>
            <SubmitButton variant="danger" pendingLabel="Excluindo…">
              Excluir minha conta
            </SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
