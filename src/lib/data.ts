/**
 * Datenzugriff rund um Verfügbarkeit, Kurse und Kalender (lesend).
 */
import { and, asc, eq, gte, lt, lte, ne, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRules, bookings, classSchedules, customers, freedSlots, services, timeBlocks } from "@/db/schema";
import type { Service, ClassSchedule } from "@/db/schema";
import { freeSlots, type Interval } from "./availability";
import { addDays, addMinutes, atLocal, weekdayOfKey, todayKey } from "./time";

export const HORIZON_DAYS = 42;   // Buchungshorizont
export const LEAD_MIN = 120;      // Mindestvorlauf für Online-Buchung

export async function getServices(opts: { liveOnly?: boolean } = {}) {
  const rows = await db.select().from(services)
    .where(opts.liveOnly ? eq(services.status, "live") : undefined)
    .orderBy(asc(services.sortOrder), asc(services.name));
  const scheds = await db.select().from(classSchedules);
  return rows.map((s) => ({ ...s, schedule: scheds.filter((c) => c.serviceId === s.id).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)) }));
}
export type ServiceWithSchedule = Service & { schedule: ClassSchedule[] };

export async function getServiceById(id: string): Promise<ServiceWithSchedule | null> {
  const [s] = await db.select().from(services).where(eq(services.id, id));
  if (!s) return null;
  const schedule = await db.select().from(classSchedules).where(eq(classSchedules.serviceId, id));
  return { ...s, schedule };
}

export async function getRules() {
  return db.select().from(availabilityRules).orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime));
}

/** Konkrete Kurstermine ab einem Datum (aus dem Wochenplan berechnet). */
export function expandClassSessions(svc: ServiceWithSchedule, fromKey: string, days: number): { start: Date; end: Date; durationMin: number }[] {
  const out: { start: Date; end: Date; durationMin: number }[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(fromKey, i);
    const wd = weekdayOfKey(key);
    for (const e of svc.schedule) if (e.weekday === wd) {
      const start = atLocal(key, e.startTime);
      out.push({ start, end: addMinutes(start, e.durationMin), durationMin: e.durationMin });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Belegte Zeiträume eines Tages für eine Anbieter:in (Buchungen inkl. Puffer, Blockzeiten, eigene Kurse). */
export async function busyIntervals(dateKey: string, staff: string): Promise<Interval[]> {
  const dayStart = atLocal(dateKey, "00:00");
  const dayEnd = atLocal(addDays(dateKey, 1), "00:00");
  const bk = await db.select({ start: bookings.startsAt, end: bookings.blockedUntil, staff: services.staff })
    .from(bookings).innerJoin(services, eq(bookings.serviceId, services.id))
    .where(and(eq(bookings.status, "confirmed"), eq(bookings.blocksCalendar, true), lt(bookings.startsAt, dayEnd), gte(bookings.blockedUntil, dayStart)));
  const bl = await db.select().from(timeBlocks).where(and(lt(timeBlocks.startsAt, dayEnd), gte(timeBlocks.endsAt, dayStart)));
  const sameStaff = (s: string | null) => !s || s === staff || staff === "Beide" || s === "Beide";
  const busy: Interval[] = [
    ...bk.filter((b) => sameStaff(b.staff)).map((b) => ({ start: b.start, end: b.end })),
    ...bl.filter((b) => sameStaff(b.staff)).map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];
  // Kurse derselben Anbieter:in blockieren die Zeit ebenfalls
  const classes = (await getServices({ liveOnly: true })).filter((s) => s.kind === "class" && sameStaff(s.staff));
  for (const c of classes) for (const sess of expandClassSessions(c, dateKey, 1)) busy.push({ start: sess.start, end: sess.end });
  return busy;
}

/** Freie Startzeiten für eine Behandlung an einem Tag. */
export async function slotsForDay(svc: Service, dateKey: string, now = new Date()) {
  const rules = await getRules();
  const busy = await busyIntervals(dateKey, svc.staff);
  return freeSlots({ dateKey, durationMin: svc.durationMin, bufferMin: svc.bufferMin, staff: svc.staff, rules, busy, now, leadMin: LEAD_MIN });
}

/** Welche Tage im Horizont haben überhaupt Slots? (für den Datums-Streifen) */
export async function daysWithSlots(svc: Service, fromKey = todayKey(), days = HORIZON_DAYS) {
  const rules = await getRules();
  const result: { key: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(fromKey, i);
    const wd = weekdayOfKey(key);
    if (!rules.some((r) => r.weekday === wd && (!r.staff || r.staff === svc.staff || svc.staff === "Beide"))) { result.push({ key, count: 0 }); continue; }
    const slots = await slotsForDay(svc, key);
    result.push({ key, count: slots.length });
  }
  return result;
}

/** Kurstermine mit Belegung. */
export async function classSessionsWithLoad(svc: ServiceWithSchedule, fromKey = todayKey(), days = 28) {
  const sessions = expandClassSessions(svc, fromKey, days).filter((s) => s.start > new Date());
  if (!sessions.length) return [];
  const counts = await db.select({ startsAt: bookings.startsAt, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.serviceId, svc.id), eq(bookings.status, "confirmed"), inArray(bookings.startsAt, sessions.map((s) => s.start))))
    .groupBy(bookings.startsAt);
  return sessions.map((s) => {
    const booked = counts.find((c) => c.startsAt.getTime() === s.start.getTime())?.n ?? 0;
    return { ...s, booked, free: Math.max(0, svc.capacity - booked) };
  });
}

/** Alle Einträge eines Tages für die Verwaltung. */
export async function dayEntries(dateKey: string) {
  const dayStart = atLocal(dateKey, "00:00");
  const dayEnd = atLocal(addDays(dateKey, 1), "00:00");
  const bk = await db.select({
    id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt, blockedUntil: bookings.blockedUntil,
    status: bookings.status, source: bookings.source, blocksCalendar: bookings.blocksCalendar, isTrial: bookings.isTrial,
    serviceId: services.id, serviceName: services.name, kind: services.kind, staff: services.staff, capacity: services.capacity,
    customerId: customers.id, customerName: customers.name, customerPhone: customers.phone, customerEmail: customers.email,
    whatsappOptIn: customers.whatsappOptIn,
  }).from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(gte(bookings.startsAt, dayStart), lt(bookings.startsAt, dayEnd)))
    .orderBy(asc(bookings.startsAt));
  const bl = await db.select().from(timeBlocks).where(and(lt(timeBlocks.startsAt, dayEnd), gte(timeBlocks.endsAt, dayStart))).orderBy(asc(timeBlocks.startsAt));
  const classes = (await getServices({ liveOnly: true })).filter((s) => s.kind === "class");
  const sessions = classes.flatMap((c) => expandClassSessions(c, dateKey, 1).map((s) => ({ ...s, service: c })));
  return { bookings: bk, blocks: bl, sessions };
}

export async function openFreedSlots() {
  return db.select({
    id: freedSlots.id, startsAt: freedSlots.startsAt, endsAt: freedSlots.endsAt, freedAt: freedSlots.freedAt,
    statusShared: freedSlots.statusShared, listNotifiedAt: freedSlots.listNotifiedAt,
    serviceId: services.id, serviceName: services.name, durationMin: services.durationMin, staff: services.staff,
  }).from(freedSlots).innerJoin(services, eq(freedSlots.serviceId, services.id))
    .where(and(sql`${freedSlots.dismissedAt} is null`, sql`${freedSlots.rebookedBookingId} is null`, gte(freedSlots.startsAt, new Date())))
    .orderBy(asc(freedSlots.startsAt));
}

export async function lastMinuteCount() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.lastMinuteOptIn, true));
  return r?.n ?? 0;
}

export async function cancellationsBetween(from: Date, to: Date) {
  return db.select({
    id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status, cancelledAt: bookings.cancelledAt,
    serviceName: services.name, kind: services.kind, customerName: customers.name,
  }).from(bookings).innerJoin(services, eq(bookings.serviceId, services.id)).innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(gte(bookings.startsAt, from), lte(bookings.startsAt, to), ne(bookings.status, "confirmed"), ne(bookings.status, "done"), ne(bookings.status, "no_show")))
    .orderBy(asc(bookings.startsAt));
}
