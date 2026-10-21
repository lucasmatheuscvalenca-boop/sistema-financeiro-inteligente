import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { THEME_COOKIE } from "@/server/auth/current";

export const metadata: Metadata = {
  title: { default: "NEXO — seu futuro em boas decisões", template: "%s · NEXO" },
  description: "Gestão financeira pessoal com inteligência, clareza e propósito: central financeira, metas, planejamento de vida e um mascote consultor que entende seus números.",
  applicationName: "NEXO",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1626" },
  ],
};

const SYSTEM_THEME_SCRIPT = "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value ?? "system";
  return (
    <html lang="pt-BR" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>{theme === "system" ? <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} /> : null}</head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
