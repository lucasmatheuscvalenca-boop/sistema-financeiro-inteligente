"use client";

import Link from "next/link";
import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { signInAction, signUpAction } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Notice state={state} />
      <SubmitButton className="w-full" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Primeira vez?{" "}
        <Link href="/cadastro" className="font-medium text-signal underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialActionState);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Notice state={state} />
        <Link href="/entrar" className="block text-center text-sm font-medium text-signal hover:underline">
          Ir para a entrada
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Como quer ser chamado" name="displayName" autoComplete="name" required maxLength={80} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="Mínimo de 10 caracteres."
      />
      <Notice state={state} />
      <SubmitButton className="w-full" pendingLabel="Criando…">
        Criar conta
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-signal underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
