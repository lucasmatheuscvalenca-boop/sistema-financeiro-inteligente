import { formatMoney } from "@/domain/money";
import { centsToInput } from "@/lib/format";

/**
 * Próximos passos sugeridos abaixo de cada resposta do assistente. São derivados apenas dos
 * resultados das ferramentas determinísticas (nunca do texto do modelo) e só levam a telas
 * ou novas perguntas: nenhuma ação grava dados sem o usuário confirmar no formulário.
 */
export interface ChatAction {
  label: string;
  kind: "link" | "ask";
  href?: string;
  prompt?: string;
}

interface ToolResult {
  tool: string;
  data?: unknown;
}

interface SpendData {
  amountCents: number;
  level: "green" | "yellow" | "red" | "gray";
  maxSafeAmountCents: number;
  goalsAtRisk?: Array<{ goalId: string; name: string }>;
  budget?: { categoryId: string; categoryName: string; exceeded: boolean } | null;
  request?: { description: string | null; categoryId: string | null };
}

const LINKS: Record<string, ChatAction> = {
  quanto_posso_gastar_hoje: { label: "Ver fluxo de caixa", kind: "link", href: "/fluxo-de-caixa" },
  projecao_caixa: { label: "Ver fluxo de caixa", kind: "link", href: "/fluxo-de-caixa" },
  quanto_posso_gastar_categoria: { label: "Ver orçamento", kind: "link", href: "/orcamento" },
  aporte_do_mes: { label: "Ver metas", kind: "link", href: "/metas" },
  simular_queda_renda: { label: "Ver reserva de emergência", kind: "link", href: "/reserva" },
  mudancas_gastos: { label: "Ver relatórios", kind: "link", href: "/relatorios" },
  prioridades: { label: "Ver plano de hoje", kind: "link", href: "/painel" },
  status_aposentadoria: { label: "Abrir aposentadoria", kind: "link", href: "/aposentadoria" },
  status_reserva: { label: "Abrir reserva", kind: "link", href: "/reserva" },
  resumo_financeiro: { label: "Ver relatórios", kind: "link", href: "/relatorios" },
  buscar_movimentacoes: { label: "Ver transações", kind: "link", href: "/movimentacoes" },
  memoria_usuario: { label: "Revisar memória", kind: "link", href: "/configuracoes/memoria" },
};

function spendActions(d: SpendData): ChatAction[] {
  const desc = d.request?.description?.trim() || null;
  const cat = d.request?.categoryId ?? d.budget?.categoryId ?? null;
  const qs = new URLSearchParams({ nova: "1", valor: centsToInput(d.amountCents) });
  if (desc) qs.set("descricao", desc);
  if (cat) qs.set("cat", cat);
  const register: ChatAction = { label: d.level === "green" ? "Registrar despesa" : "Adicionar mesmo assim", kind: "link", href: `/movimentacoes?${qs}` };
  const out: ChatAction[] = [];
  if (d.level !== "green" && d.maxSafeAmountCents > 0 && d.maxSafeAmountCents < d.amountCents) {
    out.push({ label: "Simular valor menor", kind: "ask", prompt: `Posso gastar ${formatMoney(d.maxSafeAmountCents).replace(/\s/g, " ")}${desc ? ` com ${desc}` : ""}?` });
  }
  const goal = d.goalsAtRisk?.[0];
  if (goal) out.push({ label: "Ver impacto na meta", kind: "link", href: `/metas/${goal.goalId}` });
  if (d.budget) out.push({ label: "Ajustar orçamento", kind: "link", href: "/orcamento" });
  return d.level === "green" ? [register, ...out] : [...out, register];
}

export function chatActions(outputs: readonly ToolResult[]): ChatAction[] {
  const actions: ChatAction[] = [];
  for (const o of outputs) {
    const d = (o.data ?? null) as Record<string, unknown> | null;
    if (o.tool === "posso_gastar" && d && typeof d.amountCents === "number") {
      actions.push(...spendActions(d as unknown as SpendData));
    } else if (o.tool === "status_metas" && d) {
      const goals = (d.goals as Array<{ id: string; name: string; health: string }> | undefined) ?? [];
      const risky = goals.find((g) => g.health === "at_risk" || g.health === "overdue");
      if (risky) {
        actions.push({ label: `Abrir ${risky.name}`, kind: "link", href: `/metas/${risky.id}` });
        actions.push({ label: "Quanto guardar por mês?", kind: "ask", prompt: `Quanto preciso guardar por mês para ${risky.name}?` });
      }
      actions.push(goals.length ? { label: "Ver metas", kind: "link", href: "/metas" } : { label: "Criar meta", kind: "link", href: "/metas/nova" });
    } else if (o.tool === "calcular_aporte") {
      const id = d?.goalId as string | null | undefined;
      actions.push(id ? { label: "Abrir meta", kind: "link", href: `/metas/${id}` } : { label: "Criar meta", kind: "link", href: "/metas/nova" });
    } else if (LINKS[o.tool]) {
      actions.push(LINKS[o.tool]!);
    }
  }
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = a.href ?? a.prompt ?? a.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}
