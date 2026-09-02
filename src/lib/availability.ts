/**
 * Verfügbarkeits-Engine (reine Funktionen, ohne DB) – testbar.
 */
import { atLocal, addMinutes, weekdayOfKey } from "./time";

export interface Interval { start: Date; end: Date }
export interface Rule { weekday: number; startTime: string; endTime: string; staff: string | null }

export interface SlotInput {
  dateKey: string;            // "YYYY-MM-DD" (lokal)
  durationMin: number;        // Dauer der Leistung
  bufferMin: number;          // Puffer danach
  staff: string;              // Anbieter:in der Leistung ("Beide" = egal)
  rules: Rule[];              // alle Verfügbarkeitsregeln
  busy: Interval[];           // belegte Zeiträume (Buchungen inkl. Puffer, Blockzeiten, Kurse)
  now: Date;
  leadMin?: number;           // Mindestvorlauf, Default 120 min
  gridMin?: number;           // Raster, Default 30 min
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Freie Startzeiten für einen Tag. */
export function freeSlots(input: SlotInput): Interval[] {
  const { dateKey, durationMin, bufferMin, staff, rules, busy, now } = input;
  const leadMin = input.leadMin ?? 120;
  const gridMin = input.gridMin ?? 30;
  const wd = weekdayOfKey(dateKey);
  const dayRules = rules.filter((r) => r.weekday === wd && (!r.staff || r.staff === staff || staff === "Beide"));
  const earliest = addMinutes(now, leadMin);
  const out: Interval[] = [];
  const total = durationMin + bufferMin;

  for (const r of dayRules) {
    const winStart = atLocal(dateKey, r.startTime);
    const winEnd = atLocal(dateKey, r.endTime);
    for (let t = winStart; addMinutes(t, total) <= winEnd; t = addMinutes(t, gridMin)) {
      if (t < earliest) continue;
      const cand: Interval = { start: t, end: addMinutes(t, total) };
      if (busy.some((b) => overlaps(cand, b))) continue;
      if (out.some((o) => o.start.getTime() === t.getTime())) continue;
      out.push({ start: t, end: addMinutes(t, durationMin) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Prüft, ob ein konkreter Start zulässig ist (für die Buchung selbst). */
export function isSlotFree(input: SlotInput & { start: Date }): boolean {
  return freeSlots(input).some((s) => s.start.getTime() === input.start.getTime());
}
