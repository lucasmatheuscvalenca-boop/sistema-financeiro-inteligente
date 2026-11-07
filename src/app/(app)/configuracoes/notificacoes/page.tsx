import type { Metadata } from "next";
import { linkTelegramAction, saveNotificationSettingsAction, subscribePushAction, testPushAction, unlinkTelegramAction, unsubscribePushAction } from "../../_actions/notifications";
import { TelegramConnect } from "@/components/app/telegram-connect";
import { InlineAction } from "@/components/ui/form";
import { SITE_URL } from "@/lib/site";
import { ensureWebhook } from "@/server/integrations/telegram";
import { getTelegramStatus } from "@/server/services/telegram";
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
  const [settings, keys, telegram] = await Promise.all([getNotificationSettings(ctx), vapidKeys(ctx.db), getTelegramStatus(ctx)]);
  // Com o token configurado, garante que o bot entrega as mensagens neste endereço.
  if (telegram.configured) await ensureWebhook(`${SITE_URL}/api/telegram`);
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
      <Section title="Telegram" description='Registrar gastos por mensagem: escreva "gastei 80 no mercado" para o bot, confira e toque em Confirmar.' className="lg:col-span-2">
        {!telegram.configured ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted">O bot ainda não foi criado. Quem administra o Meu Banqueiro faz isto uma vez (é grátis):</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                No Telegram, abra o <strong>@BotFather</strong>, envie <code>/newbot</code> e escolha um nome (ex.: Meu Banqueiro) e um usuário terminado em &quot;bot&quot;.
              </li>
              <li>Copie o token que ele devolve. Não envie esse token para ninguém.</li>
              <li>
                Na Vercel, em Settings › Environment Variables, crie <code>TELEGRAM_BOT_TOKEN</code> com o token e faça um novo deploy.
              </li>
              <li>Volte aqui: o botão para conectar aparece e o bot passa a responder sozinho.</li>
            </ol>
          </div>
        ) : telegram.linked ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-positive">Telegram conectado{telegram.botUsername ? ` (@${telegram.botUsername})` : ""}.</span>
            <InlineAction action={unlinkTelegramAction} confirm="Desconectar o Telegram? O bot deixa de registrar seus gastos.">
              Desconectar
            </InlineAction>
          </div>
        ) : (
          <TelegramConnect action={linkTelegramAction} />
        )}
      </Section>
    </div>
  );
}
