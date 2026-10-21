import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { getCurrentSession } from "@/server/auth/current";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  if (await getCurrentSession()) redirect("/painel");
  const { para } = await searchParams;
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold">Bem-vindo de volta</h1>
      <p className="mt-2 text-muted">Entre para ver sua situação financeira e suas prioridades de hoje.</p>
      <ActionForm action={loginAction} className="mt-8">
        <input type="hidden" name="para" value={para ?? ""} />
        <Field label="E-mail" name="email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" name="password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" size="lg" pendingLabel="Entrando…">
          Entrar
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="font-medium text-petrol-600 underline-offset-4 hover:underline dark:text-petrol-300">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
