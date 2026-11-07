import type { Metadata } from "next";
import { saveNotificationSettingsAction, subscribePushAction, testPushAction, unsubscribePushAction } from "../../_actions/notifications";
import { PushSetup } from "@/components/app/push-setup";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { formatDateBR } from "@/domain/dates";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { emailConfigured } from "@/server/email/mailer";
import { vapidKeys } from "@/server/notifications/push";
import { getNotificationSettings, nextSummaryDate } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notificações" };

/** Onde os avisos chegam: no celular (notificação), por e-mail e o resumo da semana. */
export default async function NotificationsPage() {
  const { ctx, user } = await requireOnboarded();
  const [settings, keys] = await Promise.all([getNotificationSettings(ctx), vapidKeys(ctx.db)]);
  const email = emailConfigured();
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Section title="Neste aparelho" description="Fatura vencendo, orçamento estourando, saldo negativo previsto, autorização do banco perto de vencer: os avisos importantes chegam como notificação, no máximo três por dia.">
        <PushSetup publicKey={keys.publicKey} subscribe={subscribePushAction} unsubscribe={unsubscribePushAction} test={testPushAction} />
        <p className="mt-3 text-xs text-muted">
          {settings.devices ? `${plural(settings.devices, "aparelho recebe", "aparelhos recebem")} as notificações desta conta.` : "Nenhum aparelho recebe as notificações desta conta ainda."} Ative em cada celular ou computador que quiser.
        </p>
      </Section>
      <Section title="O que você quer receber">
        <ActionForm action={saveNotificationSettingsAction}>
          <Checkbox name="notifyPush" defaultChecked={settings.notifyPush} label="Avisos importantes e de atenção como notificação nos aparelhos ativados" />
          <Checkbox name="notifyEmail" defaultChecked={settings.notifyEmail} label={`Avisos importantes também por e-mail (${user.email})`} />
          <Checkbox name="weeklySummary" defaultChecked={settings.weeklySummary} label={`Resumo da semana por e-mail, às segundas de manhã (o próximo: ${formatDateBR(nextSummaryDate(ctx.today))})`} />
          {!email ? <p className="text-xs text-warning">O envio de e-mails ainda não está configurado no servidor: os e-mails começam a sair quando estiver.</p> : null}
          <SubmitButton variant="petrol">Salvar preferências</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
