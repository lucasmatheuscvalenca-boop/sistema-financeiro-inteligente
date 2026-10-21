/**
 * Datas financeiras são "datas de calendário" sem fuso horário, no formato
 * ISO "YYYY-MM-DD". Toda a aritmética usa UTC internamente para evitar erros de
 * horário de verão. "Hoje" é calculado no fuso do usuário (padrão America/Sao_Paulo).
 */
export type ISODate = string;
/** Mês de referência no formato "YYYY-MM". */
export type MonthKey = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export class DateError extends Error {}

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function assertISODate(value: string, label = "data"): ISODate {
  if (!isISODate(value)) throw new DateError(`${label} inválida: "${value}"`);
  return value;
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(date);
  if (!m) throw new DateError(`Data inválida: "${date}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, "0");
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Cria uma data ajustando o dia ao último dia do mês quando necessário (31/02 -> 28/02). */
export function dateWithClampedDay(year: number, month: number, day: number): ISODate {
  // normaliza mês fora do intervalo 1..12
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeDate(y, m, Math.min(Math.max(day, 1), daysInMonth(y, m)));
}

function toUTC(date: ISODate): number {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/** Soma meses preservando o dia quando possível (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parts(date);
  return dateWithClampedDay(year, month + months, day);
}

export function addYears(date: ISODate, years: number): ISODate {
  return addMonths(date, years * 12);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(...dates: ISODate[]): ISODate {
  return dates.reduce((a, b) => (a < b ? a : b));
}

export function maxDate(...dates: ISODate[]): ISODate {
  return dates.reduce((a, b) => (a > b ? a : b));
}

export function isBetween(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function assertMonthKey(value: string): MonthKey {
  const m = MONTH_RE.exec(value);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new DateError(`Mês inválido: "${value}"`);
  return value;
}

export function startOfMonth(dateOrMonth: ISODate | MonthKey): ISODate {
  return `${dateOrMonth.slice(0, 7)}-01`;
}

export function endOfMonth(dateOrMonth: ISODate | MonthKey): ISODate {
  const year = Number(dateOrMonth.slice(0, 4));
  const month = Number(dateOrMonth.slice(5, 7));
  return makeDate(year, month, daysInMonth(year, month));
}

export function addMonthsToKey(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${key}-01`, months));
}

/** Diferença em meses de calendário entre dois meses de referência (b - a). */
export function monthDiff(a: MonthKey | ISODate, b: MonthKey | ISODate): number {
  const ya = Number(a.slice(0, 4));
  const ma = Number(a.slice(5, 7));
  const yb = Number(b.slice(0, 4));
  const mb = Number(b.slice(5, 7));
  return (yb - ya) * 12 + (mb - ma);
}

/** Meses completos entre duas datas (como idade): 15/01 -> 14/03 = 1 mês. */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  const a = parts(from);
  const b = parts(to);
  let months = (b.year - a.year) * 12 + (b.month - a.month);
  if (b.day < a.day && b.day < daysInMonth(b.year, b.month)) months -= 1;
  return months;
}

/** Data de hoje no fuso informado. */
export function todayInTimeZone(timeZone = "America/Sao_Paulo", now: Date = new Date()): ISODate {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(now);
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export function formatMonthKey(key: MonthKey): string {
  const month = Number(key.slice(5, 7));
  return `${monthName(month)} de ${key.slice(0, 4)}`;
}

export function formatDateBR(date: ISODate): string {
  const { year, month, day } = parts(date);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function formatDateShort(date: ISODate): string {
  const { month, day } = parts(date);
  return `${pad(day)}/${pad(month)}`;
}

/** Interpreta datas importadas: "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd", "dd-mm-aaaa", "dd.mm.aaaa". */
export function parseFlexibleDate(input: string): ISODate | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const iso = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return isISODate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (m[3]!.length === 2) year += year >= 70 ? 1900 : 2000;
    const iso = makeDate(year, Number(m[2]), Number(m[1]));
    return isISODate(iso) ? iso : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m) {
    const iso = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return isISODate(iso) ? iso : null;
  }
  return null;
}

/** Idade em anos completos numa data. */
export function ageAt(birthDate: ISODate, at: ISODate): number {
  const b = parts(birthDate);
  const a = parts(at);
  let age = a.year - b.year;
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1;
  return age;
}
