/** Zeit-Helfer: alles Sichtbare in Europe/Berlin, alles Gespeicherte in UTC. */
export const TZ = process.env.STUDIO_TZ || "Europe/Berlin";

export const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MO_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export interface LocalParts { y: number; m: number; d: number; hh: number; mm: number; weekday: number }

/** Zerlegt einen Zeitpunkt in lokale Bestandteile (Studio-Zeitzone). */
export function localParts(date: Date, tz = TZ): LocalParts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday: wdMap[p.weekday] };
}

/** Baut aus lokalem Datum + Uhrzeit den korrekten UTC-Zeitpunkt (DST-sicher). */
export function makeLocal(y: number, m: number, d: number, hh: number, mm: number, tz = TZ): Date {
  // Erste Schätzung als UTC, dann Offset-Korrektur (zweimal, wegen DST-Grenzen)
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const lp = localParts(new Date(guess), tz);
    const asUtc = Date.UTC(lp.y, lp.m - 1, lp.d, lp.hh, lp.mm);
    guess += Date.UTC(y, m - 1, d, hh, mm) - asUtc;
  }
  return new Date(guess);
}

/** "YYYY-MM-DD" (lokal) */
export function dateKey(date: Date, tz = TZ): string {
  const p = localParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}
export function parseHM(t: string): { hh: number; mm: number } {
  const [hh, mm] = t.split(":").map(Number);
  return { hh, mm };
}
/** Lokales Datum (Key) + "HH:MM" → Date */
export function atLocal(key: string, hm: string, tz = TZ): Date {
  const { y, m, d } = parseDateKey(key);
  const { hh, mm } = parseHM(hm);
  return makeLocal(y, m, d, hh, mm, tz);
}
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function weekdayOfKey(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function mondayOf(key: string): string {
  const wd = weekdayOfKey(key);
  return addDays(key, -((wd + 6) % 7));
}

export function fmtTime(date: Date, tz = TZ): string {
  const p = localParts(date, tz);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}
export function fmtDate(date: Date, tz = TZ): string {
  const p = localParts(date, tz);
  return `${WD_SHORT[p.weekday]}, ${p.d}. ${MO_SHORT[p.m - 1]}`;
}
export function fmtDateLong(date: Date, tz = TZ): string {
  const p = localParts(date, tz);
  return `${WD_LONG[p.weekday]}, ${p.d}. ${MO_SHORT[p.m - 1]} ${p.y}`;
}
export function fmtDateKey(key: string): string {
  const { y, m, d } = parseDateKey(key);
  return `${WD_SHORT[weekdayOfKey(key)]}, ${d}. ${MO_SHORT[m - 1]}${y !== new Date().getFullYear() ? " " + y : ""}`;
}
export function fmtRange(start: Date, end: Date, tz = TZ): string {
  return `${fmtTime(start, tz)}–${fmtTime(end, tz)}`;
}
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}
export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60000);
}
export function todayKey(tz = TZ): string {
  return dateKey(new Date(), tz);
}
export function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
}
