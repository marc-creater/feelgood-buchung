"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRules, bookings, classSchedules, services, timeBlocks } from "@/db/schema";
import { SESSION_COOKIE, createSessionValue, passwordOk } from "@/lib/auth";
import { BookingError, cancelBooking, createAppointment, createClassBooking, dismissFreedSlot, freedSlotShared, notifyLastMinuteList, rescheduleBooking } from "@/lib/bookings";
import { atLocal, dateKey } from "@/lib/time";
import { getServiceById } from "@/lib/data";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string, d = 0) => { const v = parseInt(s(fd, k)); return isNaN(v) ? d : v; };
const on = (fd: FormData, k: string) => fd.get(k) === "on";

function back(path: string, msg?: string, err?: string) {
  const q = new URLSearchParams();
  if (msg) q.set("msg", msg);
  if (err) q.set("err", err);
  const qs = q.toString();
  redirect(path + (qs ? (path.includes("?") ? "&" : "?") + qs : ""));
}
function errMsg(e: unknown) { if (e instanceof BookingError) return e.message; console.error(e); return "Unerwarteter Fehler."; }

/* ---------- Login ---------- */
export async function loginAction(fd: FormData) {
  const next = s(fd, "next") || "/admin";
  if (!passwordOk(s(fd, "password"))) redirect(`/admin/login?err=${encodeURIComponent("Passwort stimmt nicht.")}&next=${encodeURIComponent(next)}`);
  const c = await cookies();
  c.set(SESSION_COOKIE, await createSessionValue(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  redirect(next.startsWith("/admin") ? next : "/admin");
}
export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/* ---------- Termine ---------- */
export async function adminCreateBooking(fd: FormData) {
  const serviceId = s(fd, "serviceId");
  const day = s(fd, "date"), time = s(fd, "time");
  const start = atLocal(day, time);
  const customer = { name: s(fd, "name"), phone: s(fd, "phone"), email: s(fd, "email"), whatsappOptIn: on(fd, "whatsapp") };
  const svc = await getServiceById(serviceId);
  try {
    if (!svc) throw new BookingError("Leistung wählen.");
    if (svc.kind === "class") await createClassBooking({ serviceId, start, customer, source: "admin" });
    else await createAppointment({ serviceId, start, customer, source: "admin", note: s(fd, "note"), skipValidation: true });
  } catch (e) { back(`/admin/neu?d=${day}`, undefined, errMsg(e)); }
  back(`/admin?d=${day}`, "Termin angelegt.");
}

export async function adminCancel(fd: FormData) {
  const id = s(fd, "id"), by = s(fd, "by") as "phone" | "admin";
  let day = "";
  try {
    const b = await cancelBooking(id, by, { reason: s(fd, "reason") || undefined, sendAck: on(fd, "ack") });
    day = dateKey(b.booking.startsAt);
  } catch (e) { back(`/admin/termin/${id}`, undefined, errMsg(e)); }
  back(`/admin/termin/${id}`, by === "admin" ? "Abgesagt – Kunde ist benachrichtigt." : "Termin entfernt – die Zeit ist wieder frei." + (on(fd, "ack") ? " Bestätigung geschickt." : ""));
  void day;
}

export async function adminReschedule(fd: FormData) {
  const id = s(fd, "id");
  const start = atLocal(s(fd, "date"), s(fd, "time"));
  try {
    await rescheduleBooking(id, start, s(fd, "serviceId") || undefined);
  } catch (e) { back(`/admin/termin/${id}/bearbeiten`, undefined, errMsg(e)); }
  back(`/admin/termin/${id}`, "Verschoben – Kunde ist benachrichtigt.");
}

export async function adminSaveNote(fd: FormData) {
  const id = s(fd, "id");
  await db.update(bookings).set({ note: s(fd, "note") }).where(eq(bookings.id, id));
  back(`/admin/termin/${id}`, "Notiz gespeichert.");
}

/** Ganze Kurs-Session absagen: alle Teilnehmer benachrichtigen */
export async function adminCancelSession(fd: FormData) {
  const serviceId = s(fd, "serviceId"), start = new Date(s(fd, "start"));
  const rows = await db.select({ id: bookings.id }).from(bookings)
    .where(eq(bookings.serviceId, serviceId));
  let n = 0;
  for (const r of rows) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, r.id));
    if (b.startsAt.getTime() === start.getTime() && b.status === "confirmed") { await cancelBooking(b.id, "admin", { reason: s(fd, "reason") || undefined }); n++; }
  }
  back(`/admin/kurs/${serviceId}?t=${encodeURIComponent(start.toISOString())}`, `Kurstermin abgesagt – ${n} Teilnehmer benachrichtigt.`);
}

/* ---------- Kurzfristig frei ---------- */
export async function freedAction(fd: FormData) {
  const id = s(fd, "id"), what = s(fd, "what");
  let msg = "";
  try {
    if (what === "shared") { await freedSlotShared(id); msg = "Als geteilt markiert."; }
    if (what === "dismiss") { await dismissFreedSlot(id); msg = "Verworfen."; }
    if (what === "notify") { const n = await notifyLastMinuteList(id); msg = `Last-Minute-Liste benachrichtigt (${n} Kund:innen).`; }
  } catch (e) { back("/admin", undefined, errMsg(e)); }
  back("/admin", msg);
}

/* ---------- Blockzeiten ---------- */
export async function addBlock(fd: FormData) {
  const day = s(fd, "date");
  const startsAt = atLocal(day, s(fd, "from")), endsAt = atLocal(s(fd, "dateEnd") || day, s(fd, "to"));
  if (endsAt <= startsAt) back(`/admin/block?d=${day}`, undefined, "Ende muss nach dem Anfang liegen.");
  await db.insert(timeBlocks).values({ startsAt, endsAt, reason: s(fd, "reason") || "Blockzeit", staff: s(fd, "staff") || null });
  back(`/admin?d=${day}`, "Zeit blockiert.");
}
export async function deleteBlock(fd: FormData) {
  const id = s(fd, "id"), day = s(fd, "d");
  await db.delete(timeBlocks).where(eq(timeBlocks.id, id));
  back(`/admin?d=${day}`, "Blockzeit entfernt.");
}

/* ---------- Angebot ---------- */
export async function saveService(fd: FormData) {
  const id = s(fd, "id");
  const kind: "class" | "appointment" = s(fd, "kind") === "class" ? "class" : "appointment";
  const data = {
    kind, name: s(fd, "name"), description: s(fd, "description"),
    durationMin: n(fd, "durationMin", 60), bufferMin: kind === "appointment" ? n(fd, "bufferMin", 0) : 0,
    priceCents: Math.round(parseFloat(s(fd, "price").replace(",", ".")) * 100) || 0,
    priceLabel: s(fd, "priceLabel") || (s(fd, "price") ? s(fd, "price").replace(".", ",") + " €" : ""),
    capacity: kind === "class" ? n(fd, "capacity", 10) : 1,
    status: (s(fd, "status") === "live" ? "live" : "draft") as "live" | "draft",
    staff: s(fd, "staff") || "Heike", cancelHours: n(fd, "cancelHours", 24),
    trialAllowed: on(fd, "trialAllowed"), waitlist: on(fd, "waitlist"), sortOrder: n(fd, "sortOrder", 100),
  };
  if (!data.name) back(id ? `/admin/angebot/${id}` : `/admin/angebot/neu?kind=${kind}`, undefined, "Name fehlt.");
  let svcId = id;
  if (id) await db.update(services).set(data).where(eq(services.id, id));
  else { const [r] = await db.insert(services).values(data).returning(); svcId = r.id; }
  if (kind === "class") {
    await db.delete(classSchedules).where(eq(classSchedules.serviceId, svcId));
    const wds = fd.getAll("wd").map(String), times = fd.getAll("time").map(String), durs = fd.getAll("dur").map(String);
    for (let i = 0; i < wds.length; i++) {
      if (!times[i]) continue;
      await db.insert(classSchedules).values({ serviceId: svcId, weekday: parseInt(wds[i]), startTime: times[i], durationMin: parseInt(durs[i]) || data.durationMin });
    }
  }
  revalidatePath("/");
  back("/admin/angebot", "Gespeichert.");
}
export async function deleteService(fd: FormData) {
  const id = s(fd, "id");
  const [{ c }] = await db.select({ c: bookings.id }).from(bookings).where(eq(bookings.serviceId, id)).limit(1).then((r) => r.length ? [{ c: 1 }] : [{ c: 0 }]);
  if (c) { await db.update(services).set({ status: "draft" }).where(eq(services.id, id)); back("/admin/angebot", "Es gibt schon Buchungen dazu – die Leistung wurde stattdessen auf Entwurf gesetzt."); }
  await db.delete(services).where(eq(services.id, id));
  revalidatePath("/");
  back("/admin/angebot", "Gelöscht.");
}

/* ---------- Öffnungszeiten ---------- */
export async function addRule(fd: FormData) {
  const wd = n(fd, "weekday", 1), from = s(fd, "from"), to = s(fd, "to");
  if (!from || !to || to <= from) back("/admin/zeiten", undefined, "Bitte gültige Zeiten angeben.");
  await db.insert(availabilityRules).values({ weekday: wd, startTime: from, endTime: to, staff: s(fd, "staff") || null });
  back("/admin/zeiten", "Zeit hinzugefügt.");
}
export async function deleteRule(fd: FormData) {
  await db.delete(availabilityRules).where(eq(availabilityRules.id, s(fd, "id")));
  back("/admin/zeiten", "Entfernt.");
}
