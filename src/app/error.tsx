"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/** Erro inesperado numa página: mensagem amigável, sem detalhes técnicos. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Algo deu errado por aqui</h1>
        <p className="mt-2 text-muted">Não foi possível carregar esta tela agora. Seus dados não foram alterados. Tente de novo em instantes.</p>
        {digest ? <p className="mt-2 text-xs text-muted">Código para suporte: {digest}</p> : null}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
            Tentar de novo
          </button>
          <Link href="/" className={buttonClass("ghost")}>
            Página inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
