import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { getCurrentSession } from "@/server/auth/current";
import { RESET_CODE_TTL_MINUTES } from "@/server/services/password-reset";
import { resetPasswordAction } from "../actions";
import { RESET_EMAIL_COOKIE } from "../reset-cookie";

export const metadata: Metadata = { title: "Criar nova senha" };

export default async function ResetPasswordPage() {
  if (await getCurrentSession()) redirect("/painel");
  const email = (await cookies()).get(RESET_EMAIL_COOKIE)?.value ?? "";
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold">Criar nova senha</h1>
      <p className="mt-2 text-muted">
        {email ? (
          <>
            Se <strong className="font-medium text-ink">{email}</strong> tem conta no Meu Banqueiro, enviamos para ele um código de 6 números. Confira também a caixa de spam.
          </>
        ) : (
          "Digite o e-mail da conta, o código de 6 números que chegou por e-mail e a nova senha."
        )}
      </p>
      <ActionForm action={resetPasswordAction} className="mt-8">
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <Field label="E-mail" name="email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
        )}
        <Field label="Código" name="code" hint={`Vale por ${RESET_CODE_TTL_MINUTES} minutos.`}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus={!!email} className="h-12 text-center text-xl tracking-[0.5em]" />
        </Field>
        <Field label="Nova senha" name="password" hint="Pelo menos 10 caracteres, com letras e números.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label="Repita a nova senha" name="confirm">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <SubmitButton className="w-full" size="lg" pendingLabel="Salvando…">
          Salvar nova senha e entrar
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Não chegou ou expirou?{" "}
        <Link href="/esqueci-senha" className="font-medium text-link underline-offset-4 hover:underline">
          Pedir outro código
        </Link>
      </p>
    </div>
  );
}
