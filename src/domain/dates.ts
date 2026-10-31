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

/** “out/26” — rótulo curto de mês para eixos de gráficos. */
export function formatMonthShort(key: MonthKey): string {
  return `${monthName(Number(key.slice(5, 7))).slice(0, 3)}/${key.slice(2, 4)}`;
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

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthFromName(name: string): number | null {
  const n = name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").slice(0, 3);
  const pt = MONTHS_PT.indexOf(n);
  if (pt >= 0) return pt + 1;
  const en = MONTHS_EN.indexOf(n);
  return en >= 0 ? en + 1 : null;
}

export interface FlexibleDateOptions {
  /** Ordem de dia e mês em datas com barra: "dmy" (padrão brasileiro) ou "mdy" (arquivos em inglês). */
  order?: "dmy" | "mdy";
  /** Data de referência para completar o ano quando o extrato traz só "dd/mm". */
  referenceDate?: ISODate;
}

/** Sem ano: usa o ano da referência, ou o anterior se a data ficaria mais de um mês no futuro. */
function withInferredYear(month: number, day: number, reference: ISODate): ISODate | null {
  const ref = parts(reference);
  let iso = makeDate(ref.year, month, day);
  if (!isISODate(iso)) return null;
  if (diffDays(reference, iso) > 31) iso = makeDate(ref.year - 1, month, day);
  return isISODate(iso) ? iso : null;
}

/**
 * Interpreta datas importadas: "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd", "dd-mm-aaaa", "dd.mm.aaaa",
 * com ou sem horário ("05/01/2026 14:32"), mês por extenso ("05 jan 2026", "5 de janeiro de 2026")
 * e, com referência, sem ano ("05/01", "05 JAN").
 */
export function parseFlexibleDate(input: string, options: FlexibleDateOptions = {}): ISODate | null {
  // Horário depois da data não muda o dia: "05/01/2026 14:32:10", "2026-01-05T14:32".
  const s = input.trim().replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(h|hs|[ap]m)?\s*(Z|[+-]\d{2}:?\d{2})?$/i, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const iso = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return isISODate(iso) ? iso : null;
  }
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) {
    const iso = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return isISODate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (m[3]!.length === 2) year += year >= 70 ? 1900 : 2000;
    const [day, month] = options.order === "mdy" ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
    const iso = makeDate(year, month, day);
    return isISODate(iso) ? iso : null;
  }
  m = /^(\d{1,2})\s*(?:de\s+|[/.-]\s*)?([a-zç]{3,})\.?\s*(?:de\s+|[/.-]\s*)?(\d{2,4})?$/i.exec(s);
  if (m) {
    const month = monthFromName(m[2]!);
    if (month) {
      if (!m[3]) return options.referenceDate ? withInferredYear(month, Number(m[1]), options.referenceDate) : null;
      let year = Number(m[3]);
      if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
      const iso = makeDate(year, month, Number(m[1]));
      return isISODate(iso) ? iso : null;
    }
  }
  m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (m && options.referenceDate) {
    const [day, month] = options.order === "mdy" ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
    return withInferredYear(month, day, options.referenceDate);
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
