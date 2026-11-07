import "server-only";
import { parseAllowedEmails } from "@myoffice/core";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.url("SUPABASE_URL precisa ser a URL do projeto Supabase."),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "SUPABASE_PUBLISHABLE_KEY ausente."),
  SUPABASE_DB_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "SUPABASE_DB_URL precisa ser uma URL postgres://…"),
  MYOFFICE_ALLOWED_EMAILS: z.string().optional(),
  SITE_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
});

export interface ServerEnv {
  supabaseUrl: string;
  supabaseKey: string;
  dbUrl: string;
  allowedEmails: string[];
  siteUrl?: string;
}

let cached: ServerEnv | undefined;

/** Lido na primeira requisição (não no build) e validado; falha cedo com mensagem clara. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    // Nome antigo do Supabase aceito como reserva.
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    MYOFFICE_ALLOWED_EMAILS: process.env.MYOFFICE_ALLOWED_EMAILS,
    SITE_URL: process.env.SITE_URL,
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração do MY OFFICE AI incompleta — ${detail}. Veja apps/web/.env.example.`);
  }
  const e = parsed.data;
  cached = {
    supabaseUrl: e.SUPABASE_URL.replace(/\/+$/, ""),
    supabaseKey: e.SUPABASE_PUBLISHABLE_KEY,
    dbUrl: e.SUPABASE_DB_URL,
    allowedEmails: parseAllowedEmails(e.MYOFFICE_ALLOWED_EMAILS),
    siteUrl: e.SITE_URL?.replace(/\/+$/, ""),
  };
  return cached;
}
