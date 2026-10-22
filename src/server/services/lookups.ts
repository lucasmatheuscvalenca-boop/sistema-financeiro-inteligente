import { listAccountsWithBalances } from "./accounts";
import { listCategories, categoryLabel } from "./categories";
import type { ServiceContext } from "./context";
import { listCardsOverview } from "./cards";

/** Opções de formulário (contas, cartões e categorias com rótulo "Mãe › Filha"). */
export async function formLookups(ctx: ServiceContext) {
  const [accounts, cards, categories] = await Promise.all([listAccountsWithBalances(ctx), listCardsOverview(ctx), listCategories(ctx)]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose, balanceCents: a.balanceCents, source: a.source })),
    cards: cards.map((c) => ({ id: c.id, name: c.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind as "income" | "expense", label: categoryLabel(c, categories), essential: c.essential, parentId: c.parentId })),
    raw: { accounts, cards, categories },
  };
}
