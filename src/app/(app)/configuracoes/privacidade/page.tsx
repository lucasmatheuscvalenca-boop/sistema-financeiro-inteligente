import type { Metadata } from "next";
import Link from "next/link";
import { Download, Laptop, ShieldAlert } from "lucide-react";
import { changePasswordAction, deleteAccountAction, revokeOtherSessionsAction, revokeSessionAction } from "../../_actions/account";
import { deleteAllConversationsAction } from "../../_actions/intelligence";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Sessões ativas" icon={<Laptop className="size-4" />} description="Encerre o acesso de dispositivos que você não reconhece." />
        <CardBody>
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {deviceLabel(s.userAgent)} {s.id === sessionId ? <Badge tone="positive">esta sessão</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">
                    Último uso {formatDateTime(s.lastSeenAt, tz)} · expira {formatDateTime(s.expiresAt, tz)}
                  </p>
                </div>
                {s.id !== sessionId ? (
                  <InlineAction action={revokeSessionAction} hidden={{ id: s.id }}>
                    Encerrar
                  </InlineAction>
                ) : null}
              </li>
            ))}
          </ul>
          {sessions.length > 1 ? (
            <div className="mt-3">
              <InlineAction action={revokeOtherSessionsAction} variant="secondary">
                Encerrar todas as outras
              </InlineAction>
            </div>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Alterar senha" description="Ao alterar, as outras sessões são encerradas." />
        <CardBody>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="Senha atual" name="current">
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
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
      <Card>
        <CardHeader title="Seus dados" icon={<Download className="size-4" />} />
        <CardBody className="space-y-4 text-sm">
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
        </CardBody>
      </Card>
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
