import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/callout";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { getCurrentSession } from "@/server/auth/current";
import { emailConfigured } from "@/server/email/mailer";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage() {
  if (await getCurrentSession()) redirect("/painel");
  const active = emailConfigured();
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold">Esqueci minha senha</h1>
      <p className="mt-2 text-muted">Informe o e-mail da sua conta. Vamos enviar um código de 6 números para você criar uma senha nova.</p>
      {active ? (
        <ActionForm action={forgotPasswordAction} className="mt-8">
          <Field label="E-mail" name="email">
            <Input name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingLabel="Enviando…">
            Enviar código
          </SubmitButton>
        </ActionForm>
      ) : (
        <Callout className="mt-8" title="Recuperação por e-mail indisponível">
          O envio de e-mails ainda não foi configurado neste app. Peça a quem administra o Meu Banqueiro para ativar a recuperação de senha.
        </Callout>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Lembrou a senha?{" "}
        <Link href="/entrar" className="font-medium text-link underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
