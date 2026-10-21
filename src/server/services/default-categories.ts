/** Categorias criadas para cada nova conta. O usuário pode editar, arquivar ou criar outras. */
export interface DefaultCategory {
  name: string;
  kind: "income" | "expense";
  essential?: boolean;
  color: string;
  icon: string;
  children?: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Salário", kind: "income", color: "#0E7C7B", icon: "briefcase" },
  { name: "Comissões", kind: "income", color: "#14B8A6", icon: "trending-up" },
  { name: "Rendimentos", kind: "income", color: "#C9A227", icon: "piggy-bank" },
  { name: "Renda variável", kind: "income", color: "#2B6CB0", icon: "sparkles" },
  { name: "Ganhos extraordinários", kind: "income", color: "#7C3AED", icon: "gift" },
  { name: "Outras receitas", kind: "income", color: "#64748B", icon: "circle-plus" },
  { name: "Moradia", kind: "expense", essential: true, color: "#1E3A5F", icon: "home", children: ["Aluguel", "Condomínio", "Manutenção"] },
  { name: "Contas da casa", kind: "expense", essential: true, color: "#2B6CB0", icon: "plug", children: ["Energia", "Água", "Internet e telefone", "Gás"] },
  { name: "Mercado", kind: "expense", essential: true, color: "#0E7C7B", icon: "shopping-cart" },
  { name: "Transporte", kind: "expense", essential: true, color: "#475569", icon: "car", children: ["Combustível", "Aplicativos", "Transporte público", "Estacionamento"] },
  { name: "Saúde", kind: "expense", essential: true, color: "#DC2626", icon: "heart-pulse", children: ["Plano de saúde", "Farmácia", "Consultas"] },
  { name: "Educação", kind: "expense", essential: true, color: "#7C3AED", icon: "graduation-cap" },
  { name: "Impostos e taxas", kind: "expense", essential: true, color: "#64748B", icon: "landmark" },
  { name: "Restaurantes e delivery", kind: "expense", color: "#E07A2E", icon: "utensils" },
  { name: "Lazer", kind: "expense", color: "#14B8A6", icon: "party-popper" },
  { name: "Compras", kind: "expense", color: "#D9675A", icon: "shopping-bag" },
  { name: "Assinaturas", kind: "expense", color: "#5B4A7A", icon: "repeat" },
  { name: "Viagens", kind: "expense", color: "#0891B2", icon: "plane" },
  { name: "Cuidados pessoais", kind: "expense", color: "#DB2777", icon: "sparkle" },
  { name: "Pets", kind: "expense", color: "#9C6B48", icon: "paw-print" },
  { name: "Presentes e doações", kind: "expense", color: "#C9A227", icon: "gift" },
  { name: "Outras despesas", kind: "expense", color: "#94A3B8", icon: "circle-ellipsis" },
];
