import type { MetadataRoute } from "next";

/** Permite instalar o Meu Banqueiro na tela de início (iPhone, iPad, Android e desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meu Banqueiro — seu dinheiro em boas mãos",
    short_name: "Banqueiro",
    description: "Gestão financeira pessoal: central financeira, metas, planejamento de vida e um mascote consultor.",
    lang: "pt-BR",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    background_color: "#0b1f3b",
    theme_color: "#0b1f3b",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Atalhos ao segurar o ícone do app (Android e computador; o iPhone ainda não mostra atalhos de sites).
    shortcuts: [
      { name: "Posso gastar?", short_name: "Posso gastar?", description: "Pergunte antes de comprar", url: "/posso-gastar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Novo lançamento", short_name: "Lançar", description: "Anotar um gasto ou uma entrada", url: "/movimentacoes?nova=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Agenda", short_name: "Agenda", description: "O que vence nos próximos dias", url: "/agenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
