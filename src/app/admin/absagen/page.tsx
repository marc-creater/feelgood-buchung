import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { cancellationsBetween } from "@/lib/data";
import { addDays, atLocal, fmtDate, fmtTime, todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { cancelled_customer_online: "Kunde storniert (Link)", cancelled_customer_phone: "Kunde abgesagt (tel.)", cancelled_admin: "Studio abgesagt" };

export default async function Absagen() {
  const today = todayKey();
  const rows = await cancellationsBetween(atLocal(addDays(today, -7), "00:00"), atLocal(addDays(today, 14), "00:00"));
  return (
    <AdminShell active="absagen" wide={false}>
      <p className="eyebrow"><Link href="/admin">‹ Kalender</Link></p>
      <h2 className="step">Absagen (letzte 7 / nächste 14 Tage)</h2>
      {rows.length === 0 && <div className="empty">Keine Absagen.</div>}
      {rows.map((r) => (
        <Link key={r.id} className="card" href={`/admin/termin/${r.id}`}>
          <span><span className="t">{r.customerName}</span> <span className="cancel-tag">{LABEL[r.status] || r.status}</span><br />
            <span className="m">{fmtDate(r.startsAt)} · {fmtTime(r.startsAt)}–{fmtTime(r.endsAt)} Uhr · {r.serviceName}{r.cancelledAt ? ` · abgesagt am ${fmtDate(r.cancelledAt)} ${fmtTime(r.cancelledAt)}` : ""}</span></span>
        </Link>
      ))}
    </AdminShell>
  );
}
