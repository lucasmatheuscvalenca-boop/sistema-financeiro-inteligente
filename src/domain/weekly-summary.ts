import { formatDateShort, type ISODate } from "./dates";
import { formatMoney, type Cents } from "./money";

/**
 * Resumo semanal por e-mail: o que saiu na semana, comparado com a anterior, onde mais foi o
 * dinheiro, o que vence nos próximos 7 dias e quanto dá para gastar. Texto curto, sem anexos.
 */

export interface WeeklySummaryInput {
  name: string;
  weekStart: ISODate;
  weekEnd: ISODate;
  spentCents: Cents;
  previousSpentCents: Cents;
  topCategories: Array<{ name: string; cents: Cents }>;
  upcoming: Array<{ date: ISODate; label: string; amountCents: Cents }>;
  freeToSpendCents: Cents | null;
  goals: Array<{ name: string; progressPct: number }>;
  appUrl: string;
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function weeklySummaryEmail(d: WeeklySummaryInput): { subject: string; text: string; html: string } {
  const first = d.name.split(" ")[0] || "Olá";
  const diff = d.spentCents - d.previousSpentCents;
  const compare =
    d.previousSpentCents > 0
      ? diff === 0
        ? "o mesmo que na semana anterior"
        : `${formatMoney(Math.abs(diff))} ${diff < 0 ? "a menos" : "a mais"} que na semana anterior`
      : null;
  const period = `${formatDateShort(d.weekStart)} a ${formatDateShort(d.weekEnd)}`;
  const subject = `Sua semana: ${formatMoney(d.spentCents)} em gastos (${period})`;
  const lines: string[] = [`${first}, seu resumo da semana de ${period}.`, "", `Gastos: ${formatMoney(d.spentCents)}${compare ? `, ${compare}` : ""}.`];
  if (d.topCategories.length) lines.push(`Onde mais foi: ${d.topCategories.map((c) => `${c.name} (${formatMoney(c.cents)})`).join(", ")}.`);
  if (d.freeToSpendCents !== null) lines.push(`Livre para gastar até o fim do mês: ${formatMoney(d.freeToSpendCents)}.`);
  if (d.upcoming.length) {
    lines.push("", "Nos próximos 7 dias:");
    for (const u of d.upcoming) lines.push(`- ${formatDateShort(u.date)}: ${u.label}, ${formatMoney(Math.abs(u.amountCents))}`);
  }
  if (d.goals.length) {
    lines.push("", "Metas:");
    for (const g of d.goals) lines.push(`- ${g.name}: ${Math.round(g.progressPct)}%`);
  }
  lines.push("", `Abrir o Meu Banqueiro: ${d.appUrl}/painel`, "Para não receber mais, desligue o resumo semanal em Configurações › Notificações.");
  const text = lines.join("\n");

  const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#55615c;font-size:14px">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:bold">${escapeHtml(value)}</td></tr>`;
  const list = (items: string[]) => `<ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.6">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#0f1f1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6dfcf;border-radius:12px">
<tr><td style="background:#0b3a30;border-radius:12px 12px 0 0;padding:20px 28px;color:#ffffff;font-size:20px">Meu Banqueiro · sua semana</td></tr>
<tr><td style="padding:24px 28px">
<p style="margin:0 0 4px;font-size:16px">${escapeHtml(first)}, seu resumo de ${escapeHtml(period)}.</p>
<p style="margin:12px 0 0;font-size:30px;font-weight:bold;color:#0b3a30">${escapeHtml(formatMoney(d.spentCents))}</p>
<p style="margin:2px 0 16px;font-size:14px;color:#55615c">em gastos${compare ? `, ${escapeHtml(compare)}` : ""}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${d.freeToSpendCents !== null ? row("Livre até o fim do mês", formatMoney(d.freeToSpendCents)) : ""}
${d.topCategories.map((c) => row(c.name, formatMoney(c.cents))).join("")}
</table>
${d.upcoming.length ? `<p style="margin:18px 0 0;font-size:14px;font-weight:bold">Nos próximos 7 dias</p>${list(d.upcoming.map((u) => `${formatDateShort(u.date)}: ${u.label}, ${formatMoney(Math.abs(u.amountCents))}`))}` : ""}
${d.goals.length ? `<p style="margin:18px 0 0;font-size:14px;font-weight:bold">Metas</p>${list(d.goals.map((g) => `${g.name}: ${Math.round(g.progressPct)}%`))}` : ""}
<p style="margin:24px 0 0"><a href="${escapeHtml(d.appUrl)}/painel" style="display:inline-block;background:#0f7a4a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Abrir o Meu Banqueiro</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#7a847f">Para não receber mais, desligue o resumo semanal em Configurações › Notificações.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
