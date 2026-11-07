import type { Metadata } from "next";
import { SignInForm } from "@/components/forms/AuthForms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  "nao-autorizado": "Esta conta não tem acesso a este escritório.",
  "link-invalido": "O link de confirmação é inválido ou expirou. Entre com e-mail e senha ou peça um novo link.",
};

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const erro = typeof params.erro === "string" ? ERRORS[params.erro] : undefined;
  const next = typeof params.next === "string" ? safeNext(params.next) : undefined;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Entrar no escritório</h1>
        <p className="text-sm text-muted">Sua equipe digital está esperando.</p>
      </div>
      {erro && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}
      <SignInForm next={next} />
    </div>
  );
}
