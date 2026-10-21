import { formatDateBR, monthKey } from "@/domain/dates";
import type { SpendAnalysis } from "@/domain/can-i-spend";
import { parseMoney } from "@/domain/money";
import type { MascotId } from "@/mascots/catalog";
import { voiceFor, type Tone } from "@/mascots/voice";
import type { ServiceContext } from "../services/context";
import { nextMonthStart, runTool, type ToolOutput } from "./tools";

/**
 * Modo local: entende as perguntas mais comuns por regras, chama as ferramentas
 * determinísticas e monta a resposta com a voz do mascote. Não usa modelo de linguagem.
 */
export type Intent =
  | { kind: "can_i_spend"; amountCents: number; card: boolean; installments: number; category: string | null; description: string }
  | { kind: "category_budget"; category: string }
  | { kind: "free_to_spend" }
  | { kind: "monthly_contributions" }
  | { kind: "goal_saving"; goal: string | null; amountCents: number | null; targetDate: string | null }
  | { kind: "goal_risk" }
  | { kind: "income_drop"; pct: number }
  | { kind: "what_changed" }
  | { kind: "priorities" }
  | { kind: "retirement" }
  | { kind: "reserve" }
  | { kind: "cash_flow" }
  | { kind: "summary" }
  | { kind: "search"; text: string }
  | { kind: "help" };

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Extrai um valor em reais do texto ("R$ 600", "600 reais", "1.200,50", "2 mil"). */
export function extractAmount(text: string): number | null {
  const t = text.replace(/\s+/g, " ");
  const re = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?(\s*(?:reais|real|conto|contos|pila))?(\s*%)?/gi;
  let best: { cents: number; score: number } | null = null;
  for (const m of t.matchAll(re)) {
    if (m[5]) continue; // percentual
    const raw = m[2]!;
    const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12).toLowerCase();
    if (/^\s*(x|vezes|parcela|meses|anos|dias|de (janeiro|fevereiro|mar|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))/.test(after)) continue;
    let cents: number;
    try {
      cents = parseMoney(raw, "auto");
    } catch {
      continue;
    }
    if (m[3]) cents *= 1000;
    const score = (m[1] ? 3 : 0) + (m[4] ? 2 : 0) + (m[3] ? 1 : 0) + (raw.includes(",") ? 1 : 0);
    if (cents <= 0) continue;
    if (!best || score > best.score) best = { cents, score };
  }
  return best?.cents ?? null;
}

const MONTH_RE = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/;

const SPEND_TAIL =
  /\s+(neste|nesse|este|esse|hoje|amanh[ãa]|agora|no cart[ãa]o|no d[ée]bito|no cr[ée]dito|parcelad[oa]|[àa] vista|em \d+\s*(x|vezes|parcelas)|\d+\s*x)\b.*$/i;

/** “Posso gastar R$ 300 com um jantar neste sábado?” → “Jantar”. Usado para pré-preencher o lançamento. */
export function spendDescription(question: string): string {
  const q = question.replace(/[?!.]+\s*$/, "").trim();
  const clean = (s: string) => s.replace(SPEND_TAIL, "").replace(/^(um|uma|o|a|os|as|uns|umas)\s+/i, "").trim().slice(0, 60);
  const after = q.replace(/^.*?(R\$\s*)?\d[\d.,]*(\s*(mil|reais|k)\b)?/i, "");
  const m = /^\s*(?:com|comprar|em|no|na|num|numa|pra|para|de)\s+(.+)$/i.exec(after);
  let d = m && !/^\d/.test(m[1]!) ? clean(m[1]!) : "";
  if (!d) {
    const before = /\b(?:comprar|pagar|gastar com)\s+(.+?)\s+(?:de|por|que custa)\s+(?:R\$\s*)?\d/i.exec(q);
    d = before ? clean(before[1]!) : "";
  }
  return d ? d[0]!.toUpperCase() + d.slice(1) : "Despesa avaliada";
}

export function detectIntent(question: string, today: string): Intent {
  const q = norm(question);
  const amount = extractAmount(question);
  if (/\b(posso|consigo|da pra|da para|devo)\b.*\b(gastar|comprar|pagar|torrar)\b/.test(q) || /\bposso gastar\b/.test(q)) {
    const card = /\b(cartao|credito)\b/.test(q);
    const inst = /(\d+)\s*x\b|em (\d+) (vezes|parcelas)/.exec(q);
    const catMatch = /\bcom (lazer|restaurante|delivery|mercado|viagem|viagens|compras|roupa|roupas|transporte|saude|educacao|pets?|presentes?|assinaturas?)\b/.exec(q);
    if (amount) {
      return {
        kind: "can_i_spend",
        amountCents: amount,
        card,
        installments: inst ? Number(inst[1] ?? inst[2]) : 1,
        category: catMatch ? catMatch[1]! : /jantar|restaurante|passeio|cinema|show|bar\b/.test(q) ? "Lazer" : null,
        description: spendDescription(question),
      };
    }
  }
  const catBudget = /quanto (posso|ainda posso|consigo) gastar com ([a-z ]+?)(\s+ate|\s+no|\s+neste|\s+este|\s+esse|\?|$)/.exec(q);
  if (catBudget) return { kind: "category_budget", category: catBudget[2]!.trim() };
  if (/quanto (eu )?(posso|ainda posso|consigo|da pra|da para) gastar\b/.test(q) || /quanto (tenho|sobra|me sobra|resta) (livre|disponivel|para gastar|pra gastar)/.test(q)) return { kind: "free_to_spend" };
  if (/(renda|salario|receita).*(caisse|cair|caia|reduz|diminu|queda|baixasse)/.test(q) || /(queda|reducao) de \d+ ?%.*renda/.test(q)) {
    const pct = /(\d+(?:[.,]\d+)?)\s*(%|por cento)/.exec(q);
    return { kind: "income_drop", pct: pct ? Number(pct[1]!.replace(",", ".")) : 20 };
  }
  if (/quanto (preciso|devo|tenho que) (guardar|poupar|economizar|juntar|aportar)/.test(q) || /aporte necessario/.test(q)) {
    const month = MONTH_RE.exec(q);
    const goalWord = /(viajar|viagem|carro|casa|apartamento|imovel|casamento|curso|faculdade|intercambio)/.exec(q);
    if (month || goalWord || amount) {
      return {
        kind: "goal_saving",
        goal: goalWord ? goalWord[1]! : null,
        amountCents: amount,
        targetDate: month ? nextMonthStart(month[1]!, today) : null,
      };
    }
    return { kind: "monthly_contributions" };
  }
  if (/meta.*(risco|atras|nao vou|nao consigo)|(risco|atras).*meta/.test(q)) return { kind: "goal_risk" };
  if (/o que mudou|mudancas|gastos? (aumentaram|subiram|cresceram)|gastei mais|onde gastei|aumentou/.test(q)) return { kind: "what_changed" };
  if (/prioriz|prioridade|o que (devo|preciso) fazer|por onde comec/.test(q)) return { kind: "priorities" };
  if (/aposentad|aposentar|independencia financeira/.test(q)) return { kind: "retirement" };
  if (/reserva|emergencia|colchao/.test(q)) return { kind: "reserve" };
  if (/fluxo de caixa|saldo.*(negativo|fim do mes|vai faltar)|vai sobrar|vai faltar|fechar o mes/.test(q)) return { kind: "cash_flow" };
  if (/(procure|buscar|busque|mostre|quais foram|liste).*(gasto|movimenta|compra|lancamento)/.test(q)) {
    const term = /(?:com|de|no|na)\s+([a-z0-9]+)\s*$/.exec(q.replace(/[?!.]/g, ""));
    return { kind: "search", text: term ? term[1]! : "" };
  }
  if (/resumo|como (estou|esta|estao)|situacao|meu mes|minhas financas|visao geral/.test(q)) return { kind: "summary" };
  return { kind: "help" };
}

export interface AssistantAnswer {
  text: string;
  tone: Tone;
  tools: ToolOutput[];
  mode: "local" | "llm";
}

function toneForSpend(level: SpendAnalysis["level"]): Tone {
  return level === "green" ? "positive" : level === "yellow" ? "caution" : level === "red" ? "critical" : "unknown";
}

function toneFor(out: ToolOutput): Tone {
  if (out.tool === "posso_gastar") return toneForSpend((out.data as SpendAnalysis).level);
  const text = `${out.summary} ${out.facts.join(" ")}`.toLowerCase();
  if (out.facts.length === 0 && out.missing.length > 0) return "unknown";
  if (/negativo|importante|não cabe|descobert/.test(text)) return "critical";
  if (/risco|atenção|abaixo|excedido|cortar|conflito/.test(text)) return "caution";
  return "neutral";
}

export function composeAnswer(mascot: MascotId, outputs: ToolOutput[], extra?: { intro?: string }): { text: string; tone: Tone } {
  const voice = voiceFor(mascot);
  const tones = outputs.map(toneFor);
  const order: Tone[] = ["critical", "caution", "unknown", "neutral", "positive"];
  const tone = order.find((t) => tones.includes(t)) ?? "neutral";
  const lines: string[] = [voice.opening(tone)];
  if (extra?.intro) lines.push(extra.intro);
  for (const out of outputs) {
    lines.push("", `**${out.summary}**${out.period ? ` (${out.period})` : ""}`);
    for (const f of out.facts) lines.push(`• ${f}`);
    if (out.estimates.length) {
      lines.push("", "Estimativas e simulações (não são garantia):");
      for (const e of out.estimates) lines.push(`• ${e}`);
    }
    if (out.assumptions.length) {
      lines.push("", "Premissas:");
      for (const a of out.assumptions) lines.push(`• ${a}`);
    }
    if (out.missing.length) {
      lines.push("", "Para uma análise mais precisa:");
      for (const m of out.missing) lines.push(`• ${m}`);
    }
  }
  const asOf = outputs[0]?.asOf;
  if (asOf) lines.push("", `_Dados considerados até ${formatDateBR(asOf)}. Cálculos feitos pelo motor financeiro do NEXO._`);
  lines.push("", voice.closing(tone));
  return { text: lines.join("\n"), tone };
}

export const HELP_EXAMPLES = [
  "Posso gastar R$ 600 em um jantar e um passeio neste fim de semana?",
  "Quanto posso gastar hoje?",
  "Quanto posso gastar com lazer até o fim do mês?",
  "Quanto preciso aportar este mês?",
  "Qual meta corre maior risco de atraso?",
  "Como ficaria meu orçamento se minha renda caísse 20%?",
  "O que mudou na minha situação financeira?",
  "Quanto preciso guardar para viajar em março?",
  "O que devo priorizar hoje?",
  "Estou no caminho para atingir minha meta de aposentadoria?",
];

export async function answerLocally(ctx: ServiceContext, mascot: MascotId, question: string): Promise<AssistantAnswer> {
  const intent = detectIntent(question, ctx.today);
  const outputs: ToolOutput[] = [];
  const intro: string | undefined = undefined;
  switch (intent.kind) {
    case "can_i_spend":
      outputs.push(
        await runTool(ctx, "posso_gastar", {
          valor_centavos: intent.amountCents,
          descricao: intent.description,
          categoria: intent.category,
          forma_pagamento: intent.card ? "cartao" : "conta",
          cartao: null,
          parcelas: intent.installments,
        }),
      );
      break;
    case "free_to_spend":
      outputs.push(await runTool(ctx, "quanto_posso_gastar_hoje", {}));
      break;
    case "category_budget":
      outputs.push(await runTool(ctx, "quanto_posso_gastar_categoria", { categoria: intent.category }));
      break;
    case "monthly_contributions":
      outputs.push(await runTool(ctx, "aporte_do_mes", {}));
      break;
    case "goal_saving":
      outputs.push(await runTool(ctx, "calcular_aporte", { meta: intent.goal, valor_alvo_centavos: intent.amountCents, data_alvo: intent.targetDate, ja_guardado_centavos: null }));
      break;
    case "goal_risk":
      outputs.push(await runTool(ctx, "status_metas", {}));
      break;
    case "income_drop":
      outputs.push(await runTool(ctx, "simular_queda_renda", { percentual: intent.pct }));
      break;
    case "what_changed":
      outputs.push(await runTool(ctx, "mudancas_gastos", { mes: monthKey(ctx.today) }));
      outputs.push(await runTool(ctx, "resumo_financeiro", { mes: null }));
      break;
    case "priorities":
      outputs.push(await runTool(ctx, "prioridades", {}));
      break;
    case "retirement":
      outputs.push(await runTool(ctx, "status_aposentadoria", {}));
      break;
    case "reserve":
      outputs.push(await runTool(ctx, "status_reserva", {}));
      break;
    case "cash_flow":
      outputs.push(await runTool(ctx, "projecao_caixa", { dias: 30 }));
      break;
    case "search":
      outputs.push(await runTool(ctx, "buscar_movimentacoes", { texto: intent.text || null, mes: null }));
      break;
    case "summary":
      outputs.push(await runTool(ctx, "resumo_financeiro", { mes: null }));
      break;
    case "help": {
      const voice = voiceFor(mascot);
      return {
        text: [
          voice.opening("unknown"),
          "No modo local eu entendo perguntas como estas:",
          ...HELP_EXAMPLES.map((e) => `• ${e}`),
          "",
          "Para perguntas livres, configure uma chave de API de modelo de linguagem (veja a documentação). Os números continuam vindo do mesmo motor de cálculo.",
        ].join("\n"),
        tone: "unknown",
        tools: [],
        mode: "local",
      };
    }
  }
  const { text, tone } = composeAnswer(mascot, outputs, { intro });
  return { text, tone, tools: outputs, mode: "local" };
}
