import type { MetadataRoute } from "next";

/** Permite instalar o NEXO na tela de início (iPhone, iPad, Android e desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXO — seu futuro em boas decisões",
    short_name: "NEXO",
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
  };
}
