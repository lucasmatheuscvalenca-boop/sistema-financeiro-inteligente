import { addDays, type ISODate } from "./dates";

/**
 * Arquivo de calendário (iCalendar, RFC 5545) com eventos de dia inteiro e lembrete às 9h da
 * véspera. Abre no Google Agenda, no calendário do iPhone e no Outlook.
 */

export interface IcsEvent {
  date: ISODate;
  title: string;
  description?: string;
}

function escapeText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Linhas com no máximo 75 bytes; as seguintes começam com espaço (dobra do RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** Hash curto e estável (FNV-1a) para o UID: o mesmo evento importado de novo não duplica. */
function hash(v: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const day = (d: ISODate) => d.replace(/-/g, "");

export function buildIcs(events: readonly IcsEvent[], opts: { now: Date; calendarName: string; domain: string }): string {
  const stamp = opts.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Meu Banqueiro//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(opts.calendarName)}`, "X-WR-TIMEZONE:America/Sao_Paulo"];
  const seen = new Map<string, number>();
  for (const e of events) {
    const base = hash(`${e.date}|${e.title}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${base}-${n}@${opts.domain}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${day(addDays(e.date, 1))}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Amanhã: ${e.title}`)}`,
      // Evento de dia inteiro começa à meia-noite: 15 horas antes = 9h da véspera.
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
