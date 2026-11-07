import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Barra de comentários da Vercel, só nos deploys de teste.
const preview = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";

/**
 * Content-Security-Policy sem nonce (as páginas continuam podendo ser estáticas), mas restrita ao
 * próprio site. Exceções: a janela do Open Finance (script da Pluggy em cdn.pluggy.ai, que abre um
 * iframe da Pluggy), estilos e scripts em linha do Next e do tema, e eval só no desenvolvimento
 * (o React usa para mostrar erros do servidor).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.pluggy.ai${isDev ? " 'unsafe-eval'" : ""}${preview}`,
  "style-src 'self' 'unsafe-inline' https://cdn.pluggy.ai",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.pluggy.ai${preview}`,
  `frame-src https://*.pluggy.ai${preview}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Sem o selo de desenvolvimento sobre a barra inferior (atrapalhava a conferência visual no celular).
  devIndicators: false,
  serverExternalPackages: ["pg"],
  experimental: {
    // A importação aceita extratos de até 2 MB (texto enviado numa Server Action); o padrão é 1 MB.
    // Folga para os bytes do multipart e caracteres acentuados.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
