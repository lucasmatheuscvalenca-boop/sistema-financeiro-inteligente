import { addDays, parts, dateWithClampedDay, type ISODate } from "@/domain/dates";
import { extractAmount } from "./local-engine";

/**
 * "Gastei 80 no mercado", "paguei 120 de luz ontem", "recebi 500 de freela": vira uma proposta
 * de lançamento que a pessoa confirma antes de gravar. Leitura determinística, sem modelo de
 * linguagem: o mesmo texto sempre dá a mesma proposta.
 */

export interface QuickEntry {
  kind: "expense" | "income";
  amountCents: number;
  description: string;
  date: ISODate;
  /** "no cartão", "no crédito": vai para o cartão. */
  card: boolean;
}

const EXPENSE_VERBS = /^(?:(?:eu|hoje|ontem|anteontem)\s+)*(gastei|paguei|comprei|torrei|lan[çc]a(?:r)?|lance|anota(?:r)?|anote|registra(?:r)?|registre)\b/i;
const INCOME_VERBS = /^(?:(?:eu|hoje|ontem|anteontem)\s+)*(recebi|ganhei|entrou|entraram|caiu|caíram|cairam)\b/i;
const QUESTION = /\?|^\s*(posso|quanto|quais|qual|onde|como|devo|consigo)\b|\b(gastei mais|quanto gastei|onde gastei)\b/i;

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function parseQuickEntry(text: string, today: ISODate): QuickEntry | null {
  const t = text.trim();
  if (!t || QUESTION.test(t)) return null;
  const expense = EXPENSE_VERBS.exec(t);
  const income = expense ? null : INCOME_VERBS.exec(t);
  if (!expense && !income) return null;
  const amountCents = extractAmount(t);
  if (!amountCents) return null;

  let date = today;
  if (/\banteontem\b/i.test(t)) date = addDays(today, -2);
  else if (/\bontem\b/i.test(t)) date = addDays(today, -1);
  else {
    const d = /\bdia (\d{1,2})\b/i.exec(t);
    if (d) {
      const day = Number(d[1]);
      const p = parts(today);
      if (day >= 1 && day <= 31) {
        const same = dateWithClampedDay(p.year, p.month, day);
        date = same <= today ? same : dateWithClampedDay(p.year, p.month - 1, day);
      }
    }
  }
  const card = /\b(no|com o|pelo)\s+(cart[ãa]o|cr[ée]dito)\b/i.test(t);

  let rest = t.replace(/[?!.]+$/, "").replace(expense ? EXPENSE_VERBS : INCOME_VERBS, " ");
  rest = rest
    .replace(/\b(anteontem|ontem|hoje|agora)\b/gi, " ")
    .replace(/\bdia \d{1,2}\b/gi, " ")
    .replace(/\b(no|na|com o|pelo|pela)\s+(cart[ãa]o|cr[ée]dito|d[ée]bito|pix|dinheiro)\b/gi, " ")
    .replace(/r\$\s*/gi, " ")
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g, " ")
    .replace(/\b(mil|reais|real|conto|contos|pila)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^((no|na|nos|nas|num|numa|em|de|do|da|dos|das|com|pra|para|pro|um|uma|uns|umas|o|a|os|as)\s+)+/i, "")
    .replace(/(\s+(de|do|da|por|no|na|em|com|pra|para))+$/i, "")
    .trim()
    .slice(0, 60);
  const description = cap(rest) || (expense ? "Despesa" : "Receita");
  return { kind: expense ? "expense" : "income", amountCents, description, date, card: !!expense && card };
}
