export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Rotas que também ativam este item (subpáginas agrupadas). */
  match?: string[];
}

/**
 * As cinco abas: as três perguntas do dia a dia (quanto posso gastar, com o que gastei, o que
 * vence) ficam em Início; Gastos e Lançamentos detalham; Metas junta os planos; Mais guarda o resto.
 */
export const MAIN_NAV: NavItem[] = [
  { href: "/painel", label: "Início", icon: "House", match: ["/agenda"] },
  { href: "/gastos", label: "Gastos", icon: "ChartPie", match: ["/relatorios", "/orcamento", "/assinaturas", "/despesas-anuais"] },
  { href: "/movimentacoes", label: "Lançamentos", icon: "List", match: ["/recorrencias", "/importar"] },
  { href: "/metas", label: "Metas", icon: "Target", match: ["/planejamento", "/reserva", "/aposentadoria", "/compartilhamento", "/financiamento"] },
];

/** Barra lateral do computador: as abas acima e, embaixo, o que fica em "Mais". */
export const SIDEBAR_MORE: NavItem[] = [
  { href: "/contas", label: "Bancos e cartões", icon: "Landmark", match: ["/cartoes", "/conexoes", "/parcelas"] },
  { href: "/assistente", label: "Assistente", icon: "Sparkles" },
  { href: "/patrimonio", label: "Patrimônio", icon: "ChartCandlestick" },
  { href: "/alertas", label: "Notificações", icon: "Bell" },
  { href: "/configuracoes", label: "Configurações", icon: "Settings" },
];

/** Barra inferior no celular (a quinta posição é o botão "Mais"). */
export const MOBILE_TABS: NavItem[] = MAIN_NAV;

/**
 * O menu "Mais" do celular: só o que não cabe nas quatro abas. Agenda vive em Início; reserva e
 * aposentadoria, em Metas.
 */
export const MORE_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Dinheiro",
    items: [
      { href: "/contas", label: "Bancos e cartões", icon: "Landmark" },
      { href: "/conexoes", label: "Conectar banco", icon: "Link2" },
      { href: "/importar", label: "Importar extrato", icon: "Upload" },
      { href: "/parcelas", label: "Parcelas", icon: "CalendarRange" },
      { href: "/orcamento", label: "Orçamento", icon: "Gauge" },
      { href: "/assinaturas", label: "Assinaturas", icon: "Tv" },
      { href: "/despesas-anuais", label: "Despesas anuais", icon: "CalendarDays" },
      { href: "/recorrencias", label: "Recorrências", icon: "Repeat" },
      { href: "/patrimonio", label: "Patrimônio", icon: "ChartCandlestick" },
    ],
  },
  {
    title: "Planejar",
    items: [
      { href: "/posso-gastar", label: "Posso gastar?", icon: "CircleHelp" },
      { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: "ChartLine" },
      { href: "/relatorios", label: "Relatórios", icon: "FileChartColumn" },
      { href: "/financiamento", label: "Financiar ou juntar?", icon: "KeyRound" },
      { href: "/imposto-de-renda", label: "Imposto de Renda", icon: "FileText" },
      { href: "/revisao", label: "Revisão", icon: "CalendarCheck" },
      { href: "/conquistas", label: "Conquistas", icon: "Trophy" },
      { href: "/retrospectiva", label: "Retrospectiva", icon: "PartyPopper" },
      { href: "/compartilhamento", label: "Compartilhar", icon: "Users" },
    ],
  },
  {
    title: "Conta",
    items: [
      { href: "/assistente", label: "Assistente", icon: "Sparkles" },
      { href: "/alertas", label: "Notificações", icon: "Bell" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings" },
    ],
  },
];

export function isActivePath(pathname: string, item: NavItem): boolean {
  const hit = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return hit(item.href) || (item.match ?? []).some(hit);
}
