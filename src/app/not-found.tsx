import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Logo />
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-link">Erro 404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-muted">O endereço pode ter mudado, ou este conteúdo não pertence à sua conta.</p>
        <Link href="/painel" className={buttonClass("primary", "md", "mt-6")}>
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
