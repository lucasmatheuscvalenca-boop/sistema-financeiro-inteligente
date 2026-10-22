import type { ReactNode } from "react";

/** Recriado a cada navegação: entrada discreta do conteúdo (desativada com movimento reduzido). */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
