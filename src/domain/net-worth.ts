import { percentOf, type Cents } from "./money";

/**
 * Procedência de cada valor do patrimônio:
 * - confirmed: calculado a partir de lançamentos/saldos registrados ou sincronizados;
 * - informed: valor de mercado informado pelo usuário;
 * - estimated: estimativa do usuário sem referência de mercado;
 * - projected: valor futuro calculado (nunca entra no patrimônio atual).
 */
export type Provenance = "confirmed" | "informed" | "estimated" | "projected";

export type AssetCategory = "cash" | "investment" | "real_estate" | "vehicle" | "retirement" | "receivable" | "other";
export type LiabilityCategory = "credit_card" | "loan" | "financing" | "mortgage" | "other";

export interface NetWorthItem {
  id: string;
  name: string;
  side: "asset" | "liability";
  category: AssetCategory | LiabilityCategory;
  valueCents: Cents;
  provenance: Provenance;
  liquid?: boolean;
}

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  cash: "Contas e dinheiro",
  investment: "Investimentos",
  real_estate: "Imóveis",
  vehicle: "Veículos",
  retirement: "Previdência",
  receivable: "Valores a receber",
  other: "Outros bens",
};

export const LIABILITY_CATEGORY_LABEL: Record<LiabilityCategory, string> = {
  credit_card: "Faturas de cartão",
  loan: "Empréstimos",
  financing: "Financiamentos",
  mortgage: "Financiamento imobiliário",
  other: "Outras dívidas",
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  confirmed: "Confirmado",
  informed: "Informado",
  estimated: "Estimado",
  projected: "Projetado",
};

export interface NetWorthSummary {
  assetsCents: Cents;
  liabilitiesCents: Cents;
  netWorthCents: Cents;
  liquidAssetsCents: Cents;
  byCategory: Array<{ side: "asset" | "liability"; category: string; label: string; valueCents: Cents; sharePct: number }>;
  byProvenance: Record<Exclude<Provenance, "projected">, Cents>;
  /** Parte do patrimônio líquido baseada em estimativas (para comunicar incerteza). */
  estimatedSharePct: number;
}

export function computeNetWorth(items: readonly NetWorthItem[]): NetWorthSummary {
  let assets = 0;
  let liabilities = 0;
  let liquid = 0;
  const byProvenance = { confirmed: 0, informed: 0, estimated: 0 };
  const cat = new Map<string, { side: "asset" | "liability"; category: string; valueCents: Cents }>();
  for (const item of items) {
    if (item.provenance === "projected") continue;
    const value = Math.max(0, item.valueCents);
    if (item.side === "asset") {
      assets += value;
      if (item.liquid) liquid += value;
      byProvenance[item.provenance] += value;
    } else {
      liabilities += value;
    }
    const key = `${item.side}:${item.category}`;
    const entry = cat.get(key) ?? { side: item.side, category: item.category, valueCents: 0 };
    entry.valueCents += value;
    cat.set(key, entry);
  }
  const byCategory = [...cat.values()]
    .map((c) => ({
      ...c,
      label:
        c.side === "asset"
          ? ASSET_CATEGORY_LABEL[c.category as AssetCategory]
          : LIABILITY_CATEGORY_LABEL[c.category as LiabilityCategory],
      sharePct: percentOf(c.valueCents, c.side === "asset" ? assets : liabilities),
    }))
    .sort((a, b) => b.valueCents - a.valueCents);
  return {
    assetsCents: assets,
    liabilitiesCents: liabilities,
    netWorthCents: assets - liabilities,
    liquidAssetsCents: liquid,
    byCategory,
    byProvenance,
    estimatedSharePct: percentOf(byProvenance.estimated, assets),
  };
}
