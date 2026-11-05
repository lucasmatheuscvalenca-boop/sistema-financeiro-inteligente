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
  { href: "/gastos", label: "Gastos", icon: "ChartPie", match: ["/relatorios", "/orcamento"] },
  { href: "/movimentacoes", label: "Lançamentos", icon: "List", match: ["/recorrencias", "/importar"] },
  { href: "/metas", label: "Metas", icon: "Target", match: ["/planejamento", "/reserva", "/aposentadoria", "/compartilhamento"] },
];

/** Barra lateral do computador: as abas acima e, embaixo, o que fica em "Mais". */
export const SIDEBAR_MORE: NavItem[] = [
  { href: "/contas", label: "Bancos e cartões", icon: "Landmark", match: ["/cartoes", "/conexoes"] },
  { href: "/assistente", label: "Assistente", icon: "Sparkles" },
  { href: "/patrimonio", label: "Patrimônio", icon: "ChartCandlestick" },
  { href: "/alertas", label: "Notificações", icon: "Bell" },
  { href: "/configuracoes", label: "Configurações", icon: "Settings" },
];

/** Barra inferior no celular (a quinta posição é o botão "Mais"). */
export const MOBILE_TABS: NavItem[] = MAIN_NAV;

/** Tudo o que existe, agrupado, para o menu "Mais" do celular. */
export const MORE_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Dinheiro",
    items: [
      { href: "/contas", label: "Bancos e cartões", icon: "Landmark" },
      { href: "/conexoes", label: "Conectar banco", icon: "Link2" },
      { href: "/importar", label: "Importar extrato", icon: "Upload" },
      { href: "/orcamento", label: "Orçamento", icon: "Gauge" },
      { href: "/recorrencias", label: "Recorrências", icon: "Repeat" },
      { href: "/agenda", label: "Agenda", icon: "CalendarDays" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/posso-gastar", label: "Posso gastar?", icon: "CircleHelp" },
      { href: "/reserva", label: "Reserva", icon: "ShieldCheck" },
      { href: "/aposentadoria", label: "Aposentadoria", icon: "Sunset" },
      { href: "/patrimonio", label: "Patrimônio", icon: "ChartCandlestick" },
      { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: "ChartLine" },
      { href: "/relatorios", label: "Relatórios", icon: "FileChartColumn" },
    ],
  },
  {
    title: "Acompanhamento",
    items: [
      { href: "/assistente", label: "Assistente", icon: "Sparkles" },
      { href: "/alertas", label: "Notificações", icon: "Bell" },
      { href: "/revisao", label: "Revisão", icon: "CalendarCheck" },
      { href: "/conquistas", label: "Conquistas", icon: "Trophy" },
      { href: "/compartilhamento", label: "Compartilhar", icon: "Users" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings" },
    ],
  },
];

export function isActivePath(pathname: string, item: NavItem): boolean {
  const hit = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return hit(item.href) || (item.match ?? []).some(hit);
}
