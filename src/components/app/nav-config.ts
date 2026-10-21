export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Rotas que também ativam este item (subpáginas agrupadas). */
  match?: string[];
}

/** Navegação principal (barra lateral), na ordem da referência visual. */
export const MAIN_NAV: NavItem[] = [
  { href: "/painel", label: "Início", icon: "House" },
  { href: "/contas", label: "Contas", icon: "Wallet", match: ["/conexoes", "/importar"] },
  { href: "/movimentacoes", label: "Transações", icon: "ArrowLeftRight", match: ["/recorrencias"] },
  { href: "/cartoes", label: "Cartões", icon: "CreditCard" },
  { href: "/orcamento", label: "Orçamento", icon: "Gauge" },
  { href: "/metas", label: "Metas", icon: "Target", match: ["/compartilhamento"] },
  { href: "/patrimonio", label: "Investimentos", icon: "ChartCandlestick" },
  { href: "/planejamento", label: "Planejamento", icon: "CalendarRange", match: ["/reserva", "/aposentadoria", "/fluxo-de-caixa", "/posso-gastar", "/revisao", "/conquistas"] },
  { href: "/assistente", label: "IA Financeira", icon: "Sparkles" },
  { href: "/relatorios", label: "Relatórios", icon: "FileChartColumn" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/alertas", label: "Notificações", icon: "Bell" },
  { href: "/configuracoes", label: "Configurações", icon: "Settings" },
];

/** Barra inferior no celular (as demais telas ficam em “Mais”). */
export const MOBILE_TABS: NavItem[] = [
  { href: "/painel", label: "Início", icon: "House" },
  { href: "/movimentacoes", label: "Transações", icon: "ArrowLeftRight" },
  { href: "/metas", label: "Metas", icon: "Target" },
  { href: "/assistente", label: "IA", icon: "Sparkles" },
];

/** Tudo o que existe, agrupado, para o menu “Mais” do celular. */
export const MORE_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Dinheiro",
    items: [
      { href: "/contas", label: "Contas", icon: "Wallet" },
      { href: "/cartoes", label: "Cartões", icon: "CreditCard" },
      { href: "/orcamento", label: "Orçamento", icon: "Gauge" },
      { href: "/recorrencias", label: "Recorrências", icon: "Repeat" },
      { href: "/importar", label: "Importar extrato", icon: "Upload" },
      { href: "/conexoes", label: "Conexões bancárias", icon: "Link2" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/posso-gastar", label: "Posso gastar?", icon: "CircleHelp" },
      { href: "/planejamento", label: "Planejamento", icon: "CalendarRange" },
      { href: "/reserva", label: "Reserva", icon: "ShieldCheck" },
      { href: "/aposentadoria", label: "Aposentadoria", icon: "Sunset" },
      { href: "/patrimonio", label: "Investimentos", icon: "ChartCandlestick" },
      { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: "ChartLine" },
    ],
  },
  {
    title: "Acompanhamento",
    items: [
      { href: "/relatorios", label: "Relatórios", icon: "FileChartColumn" },
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
