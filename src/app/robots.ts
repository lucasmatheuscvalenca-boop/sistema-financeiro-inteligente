import type { MetadataRoute } from "next";

/** Só as páginas públicas podem ser indexadas; a área logada fica de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/termos", "/privacidade", "/entrar", "/criar-conta"], disallow: "/" },
  };
}
