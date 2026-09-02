/**
 * Privater iCal-Feed zum Abonnieren (Google/Apple/Outlook): alle bestätigten Buchungen,
 * Kurstermine und Blockzeiten der nächsten 8 Wochen (+ 2 Wochen zurück).
 * who = heike | carlos | studio  (studio = alles)
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { createEvents, type EventAttributes } from "ics";
import { db } from "@/db";
import { bookings, customers, services, settings, timeBlocks } from "@/db/schema";
import { expandClassSessions, getServices } from "@/lib/data";
import { addDays, todayKey } from "@/lib/time";

function arr(d: Date): [number, number, number, number, number] {
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

export async function GET(_req: Request, { params }: { params: Promise<{ who: string; token: string }> }) {
  const { who, token } = await params;
  const [row] = await db.select().from(settings).where(eq(settings.key, `ical_token_${who}`));
  if (!row || row.value !== token) return new Response("Nicht gefunden", { status: 404 });
  const staffName = who === "studio" ? null : who.charAt(0).toUpperCase() + who.slice(1);
  const mine = (s: string | null) => !staffName || !s || s === staffName || s === "Beide";

  const from = new Date(Date.now() - 14 * 86400_000), to = new Date(Date.now() + 56 * 86400_000);
  const events: EventAttributes[] = [];

  const bk = await db.select({ b: bookings, c: customers, s: services }).from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id)).innerJoin(services, eq(bookings.serviceId, services.id))
    .where(and(eq(bookings.status, "confirmed"), eq(bookings.blocksCalendar, true), gte(bookings.startsAt, from), lte(bookings.startsAt, to)));
  for (const { b, c, s } of bk) if (mine(s.staff)) events.push({
    uid: `${b.id}@feelgood`, title: `${s.name} – ${c.name}`,
    description: `${c.phone} · ${c.email}${b.note ? "\n" + b.note : ""}\nPuffer danach: ${s.bufferMin} min`,
    start: arr(b.startsAt), startInputType: "utc", end: arr(b.endsAt), endInputType: "utc",
  });

  const classes = (await getServices({ liveOnly: true })).filter((s) => s.kind === "class" && mine(s.staff));
  for (const c of classes) for (const sess of expandClassSessions(c, addDays(todayKey(), -14), 70)) events.push({
    uid: `${c.id}-${sess.start.getTime()}@feelgood`, title: `Kurs: ${c.name}`,
    start: arr(sess.start), startInputType: "utc", end: arr(sess.end), endInputType: "utc",
  });

  const bl = await db.select().from(timeBlocks).where(and(gte(timeBlocks.endsAt, from), lte(timeBlocks.startsAt, to)));
  for (const b of bl) if (mine(b.staff)) events.push({
    uid: `${b.id}@feelgood`, title: `Blockzeit: ${b.reason}`,
    start: arr(b.startsAt), startInputType: "utc", end: arr(b.endsAt), endInputType: "utc",
  });

  const { value, error } = createEvents(events, { calName: `${process.env.STUDIO_NAME || "Feelgood"} ${staffName ?? "Studio"}` });
  if (error) return new Response(String(error), { status: 500 });
  return new Response(value, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" } });
}
