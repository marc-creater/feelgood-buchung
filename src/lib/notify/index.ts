/**
 * Versand-Logik: wählt Kanäle, protokolliert in `notifications`, sendet Bestätigungen sofort,
 * Erinnerungen werden geplant und vom Cron-Endpoint verschickt.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, notifications, services } from "@/db/schema";
import { emailConfigured, sendEmail, sendSms, sendWhatsAppTemplate, smsConfigured, whatsappConfigured } from "./adapters";
import { templates, type MsgContext, type TemplateType } from "./templates";
import { fmtDateLong, fmtTime, addMinutes } from "../time";
import { createEvent } from "ics";

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const STUDIO = () => process.env.STUDIO_NAME || "Feelgood";

export interface BookingBundle {
  booking: typeof bookings.$inferSelect;
  customer: typeof customers.$inferSelect;
  service: typeof services.$inferSelect;
}

export async function loadBundle(bookingId: string): Promise<BookingBundle | null> {
  const [row] = await db.select({ booking: bookings, customer: customers, service: services })
    .from(bookings).innerJoin(customers, eq(bookings.customerId, customers.id)).innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId));
  return row ?? null;
}

export function contextFor(b: BookingBundle, extra?: string): MsgContext {
  return {
    studio: STUDIO(), customerName: b.customer.name, serviceName: b.service.name,
    start: b.booking.startsAt, end: b.booking.endsAt,
    cancelUrl: `${APP_URL()}/termin/${b.booking.cancelToken}`,
    bookUrl: `${APP_URL()}/`,
    isClass: b.service.kind === "class", cancelHours: b.service.cancelHours, extra,
  };
}

/** .ics-Datei für die Bestätigungs-Mail */
export function icsFor(b: BookingBundle): string | null {
  const s = b.booking.startsAt, e = b.booking.endsAt;
  const { value } = createEvent({
    title: `${b.service.name} – ${STUDIO()}`,
    description: `Stornieren: ${APP_URL()}/termin/${b.booking.cancelToken}`,
    start: [s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate(), s.getUTCHours(), s.getUTCMinutes()],
    startInputType: "utc",
    end: [e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate(), e.getUTCHours(), e.getUTCMinutes()],
    endInputType: "utc",
    uid: `${b.booking.id}@feelgood`,
    location: process.env.STUDIO_ADDRESS || "",
  });
  return value ?? null;
}

/** Template-Parameter für WhatsApp ({{1}} Name, {{2}} Leistung, {{3}} Datum, {{4}} Uhrzeit, {{5}} Link) */
function waParams(c: MsgContext, link: string) {
  return [c.customerName.split(" ")[0] || c.customerName, c.serviceName, fmtDateLong(c.start), fmtTime(c.start), link];
}
const WA_TEMPLATE: Record<TemplateType, string | undefined> = {
  confirmation: process.env.WHATSAPP_TEMPLATE_CONFIRMATION,
  reminder: process.env.WHATSAPP_TEMPLATE_REMINDER,
  cancellation: process.env.WHATSAPP_TEMPLATE_CANCELLATION,
  change: process.env.WHATSAPP_TEMPLATE_CONFIRMATION,
  cancel_ack: process.env.WHATSAPP_TEMPLATE_CANCELLATION,
  freed_slot: process.env.WHATSAPP_TEMPLATE_FREED,
};

/**
 * Sendet eine Nachricht eines Typs über die passenden Kanäle und protokolliert.
 * Regel: E-Mail immer (wenn Adresse). Dazu WhatsApp bei Opt-in, sonst SMS – jeweils nur wenn konfiguriert.
 */
export async function sendNow(type: TemplateType, b: BookingBundle, opts: { extra?: string; withIcs?: boolean } = {}) {
  const c = contextFor(b, opts.extra);
  const t = templates[type](c);
  const results: { channel: "email" | "whatsapp" | "sms"; ok: boolean; skipped?: boolean }[] = [];

  // E-Mail
  if (b.customer.email) {
    const att = opts.withIcs ? (() => { const v = icsFor(b); return v ? [{ filename: "termin.ics", content: v, contentType: "text/calendar" }] : undefined; })() : undefined;
    const r = await sendEmail(b.customer.email, t.subject, t.text, att);
    await log(b, "email", type, r);
    results.push({ channel: "email", ok: r.ok, skipped: r.skipped });
  }
  // Messenger
  if (b.customer.phone) {
    const link = type === "freed_slot" || type === "cancellation" || type === "cancel_ack" ? c.bookUrl : c.cancelUrl;
    if (b.customer.whatsappOptIn && whatsappConfigured() && WA_TEMPLATE[type]) {
      const r = await sendWhatsAppTemplate(b.customer.phone, WA_TEMPLATE[type]!, waParams(c, link));
      await log(b, "whatsapp", type, r);
      results.push({ channel: "whatsapp", ok: r.ok, skipped: r.skipped });
      if (r.ok) return results;
    }
    if (smsConfigured()) {
      const r = await sendSms(b.customer.phone, t.short);
      await log(b, "sms", type, r);
      results.push({ channel: "sms", ok: r.ok, skipped: r.skipped });
    }
  }
  return results;
}

async function log(b: BookingBundle, channel: "email" | "whatsapp" | "sms", type: TemplateType, r: { ok: boolean; id?: string; error?: string; skipped?: boolean }) {
  await db.insert(notifications).values({
    bookingId: type === "freed_slot" ? null : b.booking.id, customerId: b.customer.id, channel, type,
    sentAt: r.ok ? new Date() : null, status: r.ok ? (r.skipped ? "skipped" : "sent") : r.skipped ? "skipped" : "failed",
    providerMessageId: r.id, error: r.error,
  });
}

/** Erinnerung planen (24 h vorher). Idempotent pro Buchung. */
export async function scheduleReminder(bookingId: string, startsAt: Date) {
  const due = addMinutes(startsAt, -24 * 60);
  const existing = await db.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.bookingId, bookingId), eq(notifications.type, "reminder"), eq(notifications.status, "pending")));
  if (existing.length) {
    await db.update(notifications).set({ scheduledFor: due }).where(eq(notifications.id, existing[0].id));
    return;
  }
  await db.insert(notifications).values({ bookingId, channel: "email", type: "reminder", scheduledFor: due, status: "pending" });
}

export async function cancelPendingReminders(bookingId: string) {
  await db.update(notifications).set({ status: "skipped", error: "Buchung storniert" })
    .where(and(eq(notifications.bookingId, bookingId), eq(notifications.status, "pending")));
}

/** Vom Cron aufgerufen: alle fälligen Erinnerungen verschicken. */
export async function runDueReminders(now = new Date()) {
  const due = await db.select().from(notifications)
    .where(and(eq(notifications.type, "reminder"), eq(notifications.status, "pending"), lte(notifications.scheduledFor, now)));
  let sent = 0;
  for (const n of due) {
    if (!n.bookingId) continue;
    // Zuerst als "in Arbeit" markieren, damit parallele Cron-Läufe nicht doppelt senden
    const claimed = await db.update(notifications).set({ status: "sent", sentAt: now, error: "claimed" })
      .where(and(eq(notifications.id, n.id), eq(notifications.status, "pending"))).returning({ id: notifications.id });
    if (!claimed.length) continue;
    const b = await loadBundle(n.bookingId);
    if (!b || b.booking.status !== "confirmed" || b.booking.startsAt < now) {
      await db.update(notifications).set({ status: "skipped", error: "Termin nicht mehr aktiv" }).where(eq(notifications.id, n.id));
      continue;
    }
    await sendNow("reminder", b);
    await db.update(notifications).set({ error: null }).where(eq(notifications.id, n.id));
    sent++;
  }
  return { due: due.length, sent };
}

/** Kopie an das Studio (neue Online-Buchung, Online-Storno). */
export async function notifyAdmin(subject: string, text: string) {
  const to = process.env.MAIL_ADMIN;
  if (!to) return;
  await sendEmail(to, `[${STUDIO()}] ${subject}`, text);
}

export const channelSummary = () => ({
  email: emailConfigured(), whatsapp: whatsappConfigured(), sms: smsConfigured(),
});
export { sql };
