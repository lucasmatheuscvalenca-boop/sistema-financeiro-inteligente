import type { Metadata } from "next";
import { SignUpForm } from "@/components/forms/AuthForms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Criar seu escritório</h1>
        <p className="text-sm text-muted">
          Ao criar a conta, seu universo pessoal é montado com 8 categorias iniciais. A primeira empresa vem em seguida.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}
