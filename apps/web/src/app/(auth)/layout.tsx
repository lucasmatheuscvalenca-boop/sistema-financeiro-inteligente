import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="office-floor grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="pixel-frame bg-navy-850 p-6 sm:p-8">{children}</div>
        <p className="text-center text-xs text-faint">
          Universos pessoal e empresarial isolados no banco de dados.
        </p>
      </div>
    </main>
  );
}
