import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AdminShell } from "../../AdminShell";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { loadBundle } from "@/lib/notify";
import { dateKey, fmtDateLong, fmtTime, minutesBetween } from "@/lib/time";
import { adminCancel, adminSaveNote } from "../../actions";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { cancelled_customer_online: "Kunde storniert (Link)", cancelled_customer_phone: "Kunde abgesagt (tel.)", cancelled_admin: "Studio abgesagt", no_show: "nicht erschienen", done: "erledigt" };
const TYPE: Record<string, string> = { confirmation: "Bestätigung", reminder: "Erinnerung", cancellation: "Absage", change: "Änderung", cancel_ack: "Storno-Bestätigung", freed_slot: "Kurzfristig frei" };

export default async function Termin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { msg, err } = await searchParams;
  const b = await loadBundle(id);
  if (!b) notFound();
  const active = b.booking.status === "confirmed";
  const log = await db.select().from(notifications).where(eq(notifications.bookingId, id)).orderBy(desc(notifications.createdAt));
  const day = dateKey(b.booking.startsAt);

  return (
    <AdminShell active="kal" msg={msg} err={err} wide={false}>
      <p className="eyebrow"><Link href={`/admin?d=${day}`}>‹ Kalender</Link></p>
      <h2 className="step" style={{ marginBottom: 4 }}>{b.customer.name} {!active && <span className="cancel-tag">{LABEL[b.booking.status] || b.booking.status}</span>}</h2>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        {fmtDateLong(b.booking.startsAt)} · {fmtTime(b.booking.startsAt)}–{fmtTime(b.booking.endsAt)} Uhr · {b.service.name}
        {b.service.kind === "appointment" && minutesBetween(b.booking.endsAt, b.booking.blockedUntil) > 0 && ` · danach ${minutesBetween(b.booking.endsAt, b.booking.blockedUntil)} min Puffer`}
        {b.booking.source === "online" ? " · online gebucht" : " · vom Studio angelegt"}{b.booking.isTrial && " · Probestunde"}
      </p>

      <p className="eyebrow">Kunde</p>
      <ul className="parts">
        <li><span>Telefon</span><a href={`tel:${b.customer.phone}`}>{b.customer.phone || "–"}</a></li>
        <li><span>E-Mail</span><a href={`mailto:${b.customer.email}`}>{b.customer.email || "–"}</a></li>
        <li><span>Erinnerung per</span><small>{b.customer.whatsappOptIn ? "WhatsApp (Opt-in)" : "E-Mail/SMS"}{b.customer.lastMinuteOptIn ? " · Last-Minute-Liste" : ""}</small></li>
      </ul>

      <form action={adminSaveNote}>
        <input type="hidden" name="id" value={id} />
        <div className="f"><label className="lbl" htmlFor="note">Notiz (nur intern)</label><textarea id="note" name="note" defaultValue={b.booking.note} placeholder="z. B. Rückenbeschwerden links, mag es warm" /></div>
        <button className="btn ghost sm" type="submit">Notiz speichern</button>
      </form>

      {active && (
        <>
          <p className="eyebrow">Aktionen</p>
          <Link className="btn" href={`/admin/termin/${id}/bearbeiten`}>Bearbeiten / Verschieben</Link>
          {b.service.kind === "appointment" && (
            <form action={adminCancel} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="by" value="phone" />
              <label className="opt" style={{ marginBottom: 8 }}><input type="checkbox" name="ack" /><span>Storno-Bestätigung an {b.customer.name.split(" ")[0]} schicken</span></label>
              <button className="btn ghost" type="submit" style={{ color: "var(--danger)", marginTop: 0 }}>Kunde hat abgesagt (telefonisch / persönlich)</button>
              <p className="hint">Termin raus, Zeit sofort wieder buchbar, keine Absage-Nachricht – der Kunde weiß ja Bescheid.</p>
            </form>
          )}
          <form action={adminCancel} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="by" value="admin" />
            <div className="f"><input type="text" name="reason" placeholder="Grund (optional, steht in der Nachricht)" /></div>
            <button className="btn danger" type="submit">Studio sagt ab &amp; Kunden benachrichtigen</button>
          </form>
        </>
      )}

      <p className="eyebrow">Nachrichten</p>
      {log.length === 0 && <p className="hint">Noch nichts verschickt.</p>}
      <ul className="parts">
        {log.map((n) => (
          <li key={n.id}><span>{TYPE[n.type] || n.type} · {n.channel}</span>
            <small>{n.status === "pending" ? `geplant ${fmtDateLong(n.scheduledFor)} ${fmtTime(n.scheduledFor)}` : n.status === "sent" ? `gesendet ${fmtTime(n.sentAt!)}` : n.status === "skipped" ? `übersprungen${n.error ? " (" + n.error + ")" : ""}` : `Fehler: ${n.error}`}</small></li>
        ))}
      </ul>
    </AdminShell>
  );
}
