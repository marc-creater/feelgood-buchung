import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AdminShell } from "../../AdminShell";
import { db } from "@/db";
import { bookings, customers } from "@/db/schema";
import { getServiceById } from "@/lib/data";
import { dateKey, fmtDateLong, fmtTime } from "@/lib/time";
import { adminCancel, adminCancelSession } from "../../actions";

export const dynamic = "force-dynamic";

export default async function KursSession({ params, searchParams }: { params: Promise<{ serviceId: string }>; searchParams: Promise<{ t?: string; msg?: string; err?: string }> }) {
  const { serviceId } = await params;
  const { t, msg, err } = await searchParams;
  const svc = await getServiceById(serviceId);
  if (!svc || !t) notFound();
  const start = new Date(t);
  const rows = await db.select({ b: bookings, c: customers }).from(bookings).innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(eq(bookings.serviceId, serviceId), eq(bookings.startsAt, start)));
  const active = rows.filter((r) => r.b.status === "confirmed");
  const gone = rows.filter((r) => r.b.status !== "confirmed");

  return (
    <AdminShell active="kal" msg={msg} err={err} wide={false}>
      <p className="eyebrow"><Link href={`/admin?d=${dateKey(start)}`}>‹ Kalender</Link></p>
      <h2 className="step" style={{ marginBottom: 4 }}>{svc.name}</h2>
      <p className="hint" style={{ margin: "0 0 14px" }}>{fmtDateLong(start)} · {fmtTime(start)} Uhr · {svc.staff} · {active.length} / {svc.capacity} Plätze</p>

      <p className="eyebrow">Teilnehmer ({active.length})</p>
      {active.length === 0 && <p className="hint">Noch keine Anmeldungen.</p>}
      <ul className="parts">
        {active.map(({ b, c }) => (
          <li key={b.id}>
            <span><Link href={`/admin/termin/${b.id}`}>{c.name}</Link>{b.isTrial && <small> · Probestunde</small>}<br /><small>{c.phone}</small></span>
            <form action={adminCancel}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="by" value="phone" />
              <button className="xbtn" type="submit" title="Teilnehmer abmelden (hat selbst abgesagt)">abmelden</button></form>
          </li>
        ))}
      </ul>
      {gone.length > 0 && <><p className="eyebrow">Abgemeldet</p><ul className="parts">{gone.map(({ b, c }) => <li key={b.id}><span style={{ textDecoration: "line-through" }}>{c.name}</span><small>{b.status === "cancelled_admin" ? "Studio" : "Kunde"}</small></li>)}</ul></>}

      <p className="eyebrow">Aktionen</p>
      <Link className="btn" href={`/admin/neu?d=${dateKey(start)}&s=${serviceId}&t=${fmtTime(start)}`}>+ Teilnehmer eintragen</Link>
      {active.length > 0 && (
        <form action={adminCancelSession} style={{ marginTop: 10 }}>
          <input type="hidden" name="serviceId" value={serviceId} /><input type="hidden" name="start" value={start.toISOString()} />
          <div className="f"><input type="text" name="reason" placeholder="Grund (optional, steht in der Nachricht)" /></div>
          <button className="btn danger" type="submit">Kurstermin absagen &amp; alle {active.length} benachrichtigen</button>
        </form>
      )}
    </AdminShell>
  );
}
