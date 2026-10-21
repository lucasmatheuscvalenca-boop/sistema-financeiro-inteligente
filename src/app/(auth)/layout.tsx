import Link from "next/link";
import type { ReactNode } from "react";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-petrol-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-gold-500/15 blur-3xl" aria-hidden />
        <Link href="/" className="relative">
          <Logo inverted />
        </Link>
        <div className="relative">
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Seu dinheiro com <span className="text-gold-300">rumo</span>: decisões claras hoje, liberdade amanhã.
          </p>
          <p className="mt-4 max-w-md text-navy-100">Central financeira, metas, reserva, aposentadoria e um consultor que entende seus números — com o personagem que combina com você.</p>
          <div className="mt-8 flex gap-3">
            {(["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"] as const).map((id, i) => (
              <MascotArt key={id} id={id} size={64} state={i % 2 ? "neutral" : "guidance"} decorative />
            ))}
          </div>
        </div>
        <p className="relative text-xs text-navy-200">Seus dados financeiros são privados e isolados por conta.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
