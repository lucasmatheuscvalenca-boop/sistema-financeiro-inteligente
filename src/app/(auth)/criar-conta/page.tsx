import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Checkbox, Field, Input, SubmitButton } from "@/components/ui/form";
import { getCurrentSession } from "@/server/auth/current";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/painel");
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold">Crie sua conta</h1>
      <p className="mt-2 text-muted">Cada conta tem dados, metas, memória e mascote próprios. Leva menos de um minuto.</p>
      <ActionForm action={registerAction} className="mt-8">
        <Field label="Como você quer ser chamado(a)?" name="name">
          <Input name="name" autoComplete="given-name" required />
        </Field>
        <Field label="E-mail" name="email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" name="password" hint="Pelo menos 10 caracteres, com letras e números.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Checkbox
          name="consent"
          label={
            <>
              Li e aceito os termos de uso e a{" "}
              <Link href="/privacidade" className="underline" target="_blank">
                política de privacidade
              </Link>
              . Meus dados financeiros serão usados apenas para as análises do app.
            </>
          }
        />
        <SubmitButton className="w-full" size="lg" pendingLabel="Criando conta…">
          Criar conta e começar
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-petrol-600 underline-offset-4 hover:underline dark:text-petrol-300">
          Entrar
        </Link>
      </p>
    </div>
  );
}
