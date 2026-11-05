import { eq, and } from "drizzle-orm";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { decrypt, encrypt } from "../security/crypto";
import type { BankDataProvider } from "./provider";
import { DemoProvider } from "./providers/demo";
import { PluggyProvider } from "./providers/pluggy";

const overrides = new Map<string, BankDataProvider>();

/** Permite injetar fornecedores em testes. */
export function registerProvider(provider: BankDataProvider): void {
  overrides.set(provider.id, provider);
}

/** Fornecedor com as chaves do ambiente (ou nenhuma). Use `resolveProvider` quando houver pessoa. */
export function getProvider(id: string): BankDataProvider | null {
  const o = overrides.get(id);
  if (o) return o;
  if (id === "demo") return new DemoProvider();
  if (id === "pluggy") return new PluggyProvider();
  return null;
}

export interface StoredCredentials {
  clientIdHint: string;
  validatedAt: Date | null;
  updatedAt: Date;
}

/** Chaves próprias da pessoa (sem o segredo), para a interface mostrar o que está salvo. */
export async function getStoredCredentials(db: Database, userId: string, provider = "pluggy"): Promise<StoredCredentials | null> {
  const [row] = await db
    .select({ clientIdHint: s.providerCredentials.clientIdHint, validatedAt: s.providerCredentials.validatedAt, updatedAt: s.providerCredentials.updatedAt })
    .from(s.providerCredentials)
    .where(and(eq(s.providerCredentials.userId, userId), eq(s.providerCredentials.provider, provider)))
    .limit(1);
  return row ?? null;
}

/**
 * Fornecedor da pessoa: as chaves dela, cifradas no banco, têm prioridade; sem elas, as chaves
 * do ambiente (se houver). Cada pessoa usa o próprio plano gratuito da Pluggy, como os termos pedem.
 */
export async function resolveProvider(db: Database, userId: string, id: string): Promise<BankDataProvider | null> {
  const o = overrides.get(id);
  if (o) return o;
  if (id !== "pluggy") return getProvider(id);
  const [row] = await db.select().from(s.providerCredentials).where(and(eq(s.providerCredentials.userId, userId), eq(s.providerCredentials.provider, "pluggy"))).limit(1);
  if (!row) return new PluggyProvider();
  try {
    return new PluggyProvider(decrypt(row.clientIdEncrypted), decrypt(row.clientSecretEncrypted));
  } catch {
    return new PluggyProvider();
  }
}

/** Confere as chaves na Pluggy e só então grava, cifradas. O segredo nunca volta para o navegador. */
export async function saveCredentials(db: Database, userId: string, input: { clientId: string; clientSecret: string }, http?: typeof fetch): Promise<void> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const provider = new PluggyProvider(clientId, clientSecret, http);
  await provider.validateCredentials();
  const now = new Date();
  await db
    .insert(s.providerCredentials)
    .values({ userId, provider: "pluggy", clientIdEncrypted: encrypt(clientId), clientSecretEncrypted: encrypt(clientSecret), clientIdHint: clientId.slice(-4), validatedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [s.providerCredentials.userId, s.providerCredentials.provider],
      set: { clientIdEncrypted: encrypt(clientId), clientSecretEncrypted: encrypt(clientSecret), clientIdHint: clientId.slice(-4), validatedAt: now, updatedAt: now },
    });
}

export async function deleteCredentials(db: Database, userId: string, provider = "pluggy"): Promise<void> {
  await db.delete(s.providerCredentials).where(and(eq(s.providerCredentials.userId, userId), eq(s.providerCredentials.provider, provider)));
}

export function availableProviders(): Array<{ id: string; label: string; isDemo: boolean; configured: boolean }> {
  return ["demo", "pluggy"].map((id) => {
    const p = getProvider(id)!;
    return { id: p.id, label: p.label, isDemo: p.isDemo, configured: p.isConfigured() };
  });
}
