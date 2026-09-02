import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Brand, Crumbs } from "@/components/Brand";
import { db } from "@/db";
import { bookings, customers, services } from "@/db/schema";
import { addMinutes, fmtDate, fmtTime } from "@/lib/time";
import { cancelByTokenAction } from "@/app/actions";
import { channelSummary } from "@/lib/notify";

export const dynamic = "force-dynamic";

export default async function Termin({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ neu?: string; storniert?: string; err?: string }> }) {
  const { token } = await params;
  const { neu, storniert, err } = await searchParams;
  const [row] = await db.select({ b: bookings, c: customers, s: services }).from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id)).innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.cancelToken, token));
  if (!row) notFound();
  const { b, c, s } = row;
  const cancelled = b.status !== "confirmed";
  const deadline = addMinutes(b.startsAt, -s.cancelHours * 60);
  const canCancel = !cancelled && new Date() < deadline;
  const ch = channelSummary();
  const first = c.name.split(" ")[0];

  return (
    <div className="wrap">
      <Brand />
      <Crumbs step={4} />
      <div className="confirm">
        {cancelled ? (
          <>
            <div className="ok" style={{ background: "var(--surface2)", color: "var(--ink-soft)" }}>–</div>
            <h2>Storniert</h2>
            <p className="hint" style={{ maxWidth: "36ch", margin: "0 auto 16px" }}>Dein Termin {s.name} am {fmtDate(b.startsAt)} um {fmtTime(b.startsAt)} Uhr ist storniert. Du bekommst keine Erinnerung mehr.</p>
            <Link className="btn" href="/">Neuen Termin buchen</Link>
          </>
        ) : (
          <>
            <div className="ok">✓</div>
            <h2>{neu ? `Gebucht, ${first}!` : `Dein Termin, ${first}`}</h2>
            <div className="summary" style={{ textAlign: "left" }}><b>{s.name}</b>{fmtDate(b.startsAt)} · {fmtTime(b.startsAt)}–{fmtTime(b.endsAt)} Uhr · {s.priceLabel}</div>
            {err && <div className="flash err">{err}</div>}
            {c.email && <div className="notify"><span className="ic">@</span><span>Bestätigung mit diesem Link {ch.email ? "ist unterwegs an" : "geht an"} <b>{c.email}</b>.</span></div>}
            <div className="notify"><span className="ic">✆</span><span>Erinnerung 24 h vorher per <b>{c.whatsappOptIn && ch.whatsapp ? "WhatsApp" : ch.sms ? "SMS" : "E-Mail"}</b>{c.whatsappOptIn && ch.whatsapp ? ` an ${c.phone}` : ""}.</span></div>
            <div className="notify"><span className="ic">▦</span><span><a href={`/api/ics/${token}`}>Termin in meinen Kalender übernehmen</a> (.ics)</span></div>
            {canCancel ? (
              <form action={cancelByTokenAction} style={{ marginTop: 18 }}>
                <input type="hidden" name="token" value={token} />
                <p className="hint">Kostenlos stornierbar bis {fmtDate(deadline)}, {fmtTime(deadline)} Uhr.</p>
                <button className="btn ghost" type="submit" style={{ color: "var(--danger)" }}>Termin stornieren</button>
              </form>
            ) : (
              <p className="hint" style={{ marginTop: 18 }}>Die Stornofrist ({s.cancelHours} h vorher) ist vorbei – bitte ruf kurz an: {process.env.STUDIO_PHONE || "+49 177 6002199"}.</p>
            )}
            <Link className="btn ghost" href="/">Weiteren Termin buchen</Link>
          </>
        )}
      </div>
    </div>
  );
}
