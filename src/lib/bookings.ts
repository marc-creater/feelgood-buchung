/**
 * Domänenlogik: Buchen, Absagen (3 Wege), Verschieben, "Kurzfristig frei".
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, freedSlots, services } from "@/db/schema";
import { getServiceById, slotsForDay, classSessionsWithLoad, lastMinuteCount } from "./data";
import { addMinutes, dateKey, fmtDateLong, fmtTime } from "./time";
import { cancelPendingReminders, loadBundle, notifyAdmin, scheduleReminder, sendNow, type BookingBundle } from "./notify";

export class BookingError extends Error {}

export interface CustomerInput {
  name: string; phone: string; email: string;
  whatsappOptIn?: boolean; lastMinuteOptIn?: boolean;
}

/** Kunde per E-Mail/Telefon wiederfinden oder anlegen; Opt-ins aktualisieren. */
export async function upsertCustomer(c: CustomerInput) {
  const email = c.email.trim().toLowerCase();
  const phone = c.phone.trim();
  let existing = email ? (await db.select().from(customers).where(eq(customers.email, email)))[0] : undefined;
  if (!existing && phone) existing = (await db.select().from(customers).where(eq(customers.phone, phone)))[0];
  const patch = {
    name: c.name.trim(), phone, email,
    whatsappOptIn: !!c.whatsappOptIn,
    whatsappOptInAt: c.whatsappOptIn ? new Date() : existing?.whatsappOptInAt ?? null,
    lastMinuteOptIn: c.lastMinuteOptIn ?? existing?.lastMinuteOptIn ?? false,
  };
  if (existing) {
    const [u] = await db.update(customers).set(patch).where(eq(customers.id, existing.id)).returning();
    return u;
  }
  const [n] = await db.insert(customers).values(patch).returning();
  return n;
}

/** Behandlung buchen (online oder durch das Studio). */
export async function createAppointment(input: {
  serviceId: string; start: Date; customer: CustomerInput; source?: "online" | "admin"; note?: string; skipValidation?: boolean;
}): Promise<BookingBundle> {
  const svc = await getServiceById(input.serviceId);
  if (!svc || svc.kind !== "appointment") throw new BookingError("Leistung nicht gefunden.");
  if (svc.status !== "live" && input.source !== "admin") throw new BookingError("Leistung ist nicht buchbar.");
  if (!input.skipValidation) {
    const slots = await slotsForDay(svc, dateKey(input.start));
    if (!slots.some((s) => s.start.getTime() === input.start.getTime())) throw new BookingError("Dieser Termin ist leider nicht (mehr) verfügbar.");
  }
  const cust = await upsertCustomer(input.customer);
  const end = addMinutes(input.start, svc.durationMin);
  let booking;
  try {
    [booking] = await db.insert(bookings).values({
      customerId: cust.id, serviceId: svc.id, startsAt: input.start, endsAt: end,
      blockedUntil: addMinutes(end, svc.bufferMin), blocksCalendar: true,
      source: input.source ?? "online", note: input.note ?? "",
    }).returning();
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "23P01") throw new BookingError("Der Termin wurde gerade von jemand anderem gebucht – bitte eine andere Zeit wählen.");
    throw e;
  }
  // frei gewordenen Slot als wieder belegt markieren
  await db.update(freedSlots).set({ rebookedBookingId: booking.id })
    .where(and(eq(freedSlots.serviceId, svc.id), eq(freedSlots.startsAt, input.start), sql`${freedSlots.rebookedBookingId} is null`));
  const bundle = (await loadBundle(booking.id))!;
  await afterCreate(bundle);
  return bundle;
}

/** Kursplatz buchen (Probestunde oder Teilnahme). */
export async function createClassBooking(input: {
  serviceId: string; start: Date; customer: CustomerInput; source?: "online" | "admin"; isTrial?: boolean;
}): Promise<BookingBundle> {
  const svc = await getServiceById(input.serviceId);
  if (!svc || svc.kind !== "class") throw new BookingError("Kurs nicht gefunden.");
  if (svc.status !== "live" && input.source !== "admin") throw new BookingError("Kurs ist nicht buchbar.");
  const sessions = await classSessionsWithLoad(svc);
  const sess = sessions.find((s) => s.start.getTime() === input.start.getTime());
  if (!sess) throw new BookingError("Diesen Kurstermin gibt es nicht.");
  const cust = await upsertCustomer(input.customer);
  const booking = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${services} where id = ${svc.id} for update`); // serialisiert Platzvergabe
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(bookings)
      .where(and(eq(bookings.serviceId, svc.id), eq(bookings.startsAt, input.start), eq(bookings.status, "confirmed")));
    if (n >= svc.capacity && input.source !== "admin") throw new BookingError("Der Kurs ist leider voll.");
    const dup = await tx.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.serviceId, svc.id), eq(bookings.startsAt, input.start), eq(bookings.customerId, cust.id), eq(bookings.status, "confirmed")));
    if (dup.length) throw new BookingError("Du bist für diesen Termin schon angemeldet.");
    const [b] = await tx.insert(bookings).values({
      customerId: cust.id, serviceId: svc.id, startsAt: input.start, endsAt: sess.end,
      blockedUntil: sess.end, blocksCalendar: false, source: input.source ?? "online", isTrial: !!input.isTrial,
    }).returning();
    return b;
  });
  const bundle = (await loadBundle(booking.id))!;
  await afterCreate(bundle);
  return bundle;
}

async function afterCreate(b: BookingBundle) {
  await sendNow("confirmation", b, { withIcs: true });
  await scheduleReminder(b.booking.id, b.booking.startsAt);
  if (b.booking.source === "online") {
    await notifyAdmin(`Neue Buchung: ${b.service.name} ${fmtDateLong(b.booking.startsAt)} ${fmtTime(b.booking.startsAt)}`,
      `${b.customer.name} (${b.customer.phone} · ${b.customer.email}) hat online gebucht:\n${b.service.name} am ${fmtDateLong(b.booking.startsAt)} um ${fmtTime(b.booking.startsAt)} Uhr.\n\nVerwaltung: ${process.env.APP_URL}/admin?d=${dateKey(b.booking.startsAt)}`);
  }
}

export type CancelBy = "online" | "phone" | "admin";

/**
 * Absage. online = Kunde per Storno-Link (Studio wird informiert, keine Nachricht an Kunden),
 * phone = Kunde mündlich, Studio trägt ein (optional Bestätigung), admin = Studio sagt ab (Kunde wird benachrichtigt).
 */
export async function cancelBooking(bookingId: string, by: CancelBy, opts: { reason?: string; sendAck?: boolean; enforceDeadline?: boolean } = {}) {
  const b = await loadBundle(bookingId);
  if (!b) throw new BookingError("Buchung nicht gefunden.");
  if (b.booking.status !== "confirmed") return b;
  if (opts.enforceDeadline) {
    const deadline = addMinutes(b.booking.startsAt, -b.service.cancelHours * 60);
    if (new Date() > deadline) throw new BookingError(`Online-Stornierung ist nur bis ${b.service.cancelHours} Stunden vor dem Termin möglich. Bitte ruf kurz an.`);
  }
  const status = by === "online" ? "cancelled_customer_online" : by === "phone" ? "cancelled_customer_phone" : "cancelled_admin";
  await db.update(bookings).set({ status, cancelledAt: new Date() }).where(eq(bookings.id, bookingId));
  await cancelPendingReminders(bookingId);
  // Slot frei geworden? (nur Behandlungen in der Zukunft)
  if (b.service.kind === "appointment" && b.booking.startsAt > new Date()) {
    await db.insert(freedSlots).values({ bookingId, serviceId: b.service.id, startsAt: b.booking.startsAt, endsAt: b.booking.endsAt });
  }
  const fresh = (await loadBundle(bookingId))!;
  if (by === "admin") await sendNow("cancellation", fresh, { extra: opts.reason });
  if (by === "phone" && opts.sendAck) await sendNow("cancel_ack", fresh);
  if (by === "online") {
    await notifyAdmin(`Storno: ${b.service.name} ${fmtDateLong(b.booking.startsAt)} ${fmtTime(b.booking.startsAt)}`,
      `${b.customer.name} hat online storniert: ${b.service.name} am ${fmtDateLong(b.booking.startsAt)} um ${fmtTime(b.booking.startsAt)} Uhr.\nDie Zeit ist wieder frei – siehe "Kurzfristig frei" in der Verwaltung: ${process.env.APP_URL}/admin`);
  }
  return fresh;
}

/** Verschieben (optional andere Leistung). Kunde wird benachrichtigt. */
export async function rescheduleBooking(bookingId: string, newStart: Date, newServiceId?: string) {
  const b = await loadBundle(bookingId);
  if (!b) throw new BookingError("Buchung nicht gefunden.");
  const svc = newServiceId ? await getServiceById(newServiceId) : b.service;
  if (!svc) throw new BookingError("Leistung nicht gefunden.");
  const end = addMinutes(newStart, b.service.kind === "class" ? b.service.durationMin : svc.durationMin);
  try {
    await db.update(bookings).set({
      serviceId: svc.id, startsAt: newStart, endsAt: end, blockedUntil: addMinutes(end, svc.kind === "appointment" ? svc.bufferMin : 0),
    }).where(eq(bookings.id, bookingId));
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01") throw new BookingError("Zu dieser Zeit ist schon ein anderer Termin.");
    throw e;
  }
  await scheduleReminder(bookingId, newStart);
  const fresh = (await loadBundle(bookingId))!;
  await sendNow("change", fresh);
  return fresh;
}

/** Kurzfristig frei: Last-Minute-Liste benachrichtigen. */
export async function notifyLastMinuteList(freedId: string) {
  const [f] = await db.select().from(freedSlots).where(eq(freedSlots.id, freedId));
  if (!f) throw new BookingError("Eintrag nicht gefunden.");
  const svc = await getServiceById(f.serviceId);
  const list = await db.select().from(customers).where(eq(customers.lastMinuteOptIn, true));
  let n = 0;
  for (const c of list) {
    // Pseudo-Bundle, damit die Vorlagen/Kanäle wiederverwendet werden
    const fake: BookingBundle = {
      booking: { id: f.id, customerId: c.id, serviceId: f.serviceId, startsAt: f.startsAt, endsAt: f.endsAt, blockedUntil: f.endsAt, blocksCalendar: true, status: "confirmed", source: "admin", cancelToken: "", cancelledAt: null, isTrial: false, note: "", createdAt: new Date() },
      customer: c, service: svc!,
    };
    await sendNow("freed_slot", fake);
    n++;
  }
  await db.update(freedSlots).set({ listNotifiedAt: new Date() }).where(eq(freedSlots.id, freedId));
  return n;
}

export async function freedSlotShared(freedId: string) {
  await db.update(freedSlots).set({ statusShared: true }).where(eq(freedSlots.id, freedId));
}
export async function dismissFreedSlot(freedId: string) {
  await db.update(freedSlots).set({ dismissedAt: new Date() }).where(eq(freedSlots.id, freedId));
}
export { lastMinuteCount, gte };
