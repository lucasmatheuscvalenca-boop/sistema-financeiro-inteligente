export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Visão geral",
    items: [
      { href: "/painel", label: "Painel", icon: "LayoutDashboard" },
      { href: "/posso-gastar", label: "Posso gastar?", icon: "CircleHelp" },
      { href: "/assistente", label: "Assistente", icon: "MessageCircle" },
    ],
  },
  {
    title: "Central financeira",
    items: [
      { href: "/movimentacoes", label: "Movimentações", icon: "ArrowLeftRight" },
      { href: "/contas", label: "Contas e cartões", icon: "Wallet" },
      { href: "/orcamento", label: "Orçamento", icon: "Scale" },
      { href: "/recorrencias", label: "Recorrências", icon: "Repeat" },
      { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: "ChartLine" },
      { href: "/importar", label: "Importar extrato", icon: "Upload" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/metas", label: "Metas e projetos", icon: "Target" },
      { href: "/reserva", label: "Reserva de emergência", icon: "ShieldCheck" },
      { href: "/patrimonio", label: "Patrimônio", icon: "Landmark" },
      { href: "/aposentadoria", label: "Aposentadoria", icon: "Sunset" },
    ],
  },
  {
    title: "Acompanhamento",
    items: [
      { href: "/alertas", label: "Alertas", icon: "Bell" },
      { href: "/revisao", label: "Revisão financeira", icon: "CalendarCheck" },
      { href: "/conquistas", label: "Conquistas", icon: "Trophy" },
    ],
  },
  {
    title: "Conta",
    items: [
      { href: "/conexoes", label: "Conexões bancárias", icon: "Link2" },
      { href: "/compartilhamento", label: "Compartilhamento", icon: "Users" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings" },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { href: "/painel", label: "Painel", icon: "LayoutDashboard" },
  { href: "/movimentacoes", label: "Lançar", icon: "ArrowLeftRight" },
  { href: "/posso-gastar", label: "Posso gastar?", icon: "CircleHelp" },
  { href: "/metas", label: "Metas", icon: "Target" },
  { href: "/assistente", label: "Assistente", icon: "MessageCircle" },
];
