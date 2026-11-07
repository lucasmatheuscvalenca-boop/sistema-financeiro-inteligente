import "@fontsource-variable/inter";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/700.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "MY OFFICE AI", template: "%s · MY OFFICE AI" },
  description: "Seu escritório digital com agentes de IA — universos pessoal e empresarial.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#060b17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Ler o cabeçalho torna todas as páginas dinâmicas — necessário para o nonce da CSP chegar aos scripts.
  await headers();
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
