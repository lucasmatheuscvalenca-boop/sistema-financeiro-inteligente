import type { BankDataProvider } from "./provider";
import { DemoProvider } from "./providers/demo";
import { PluggyProvider } from "./providers/pluggy";

const overrides = new Map<string, BankDataProvider>();

/** Permite injetar fornecedores em testes. */
export function registerProvider(provider: BankDataProvider): void {
  overrides.set(provider.id, provider);
}

export function getProvider(id: string): BankDataProvider | null {
  const o = overrides.get(id);
  if (o) return o;
  if (id === "demo") return new DemoProvider();
  if (id === "pluggy") return new PluggyProvider();
  return null;
}

export function availableProviders(): Array<{ id: string; label: string; isDemo: boolean; configured: boolean }> {
  return ["demo", "pluggy"].map((id) => {
    const p = getProvider(id)!;
    return { id: p.id, label: p.label, isDemo: p.isDemo, configured: p.isConfigured() };
  });
}
