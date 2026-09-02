import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../AdminShell";
import { loadBundle } from "@/lib/notify";
import { getServices } from "@/lib/data";
import { dateKey, fmtTime } from "@/lib/time";
import { adminReschedule } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function Bearbeiten({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const b = await loadBundle(id);
  if (!b) notFound();
  const beh = (await getServices()).filter((s) => s.kind === "appointment");
  return (
    <AdminShell active="kal" err={err} wide={false}>
      <p className="eyebrow"><Link href={`/admin/termin/${id}`}>‹ Termin</Link></p>
      <h2 className="step">{b.customer.name} · verschieben</h2>
      <form action={adminReschedule}>
        <input type="hidden" name="id" value={id} />
        {b.service.kind === "appointment" && (
          <div className="f"><label className="lbl" htmlFor="svc">Leistung</label>
            <select id="svc" name="serviceId" defaultValue={b.service.id}>{beh.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}</select></div>
        )}
        <div className="row2 f">
          <div><label className="lbl" htmlFor="date">Datum</label><input id="date" name="date" type="date" required defaultValue={dateKey(b.booking.startsAt)} /></div>
          <div><label className="lbl" htmlFor="time">Uhrzeit</label><input id="time" name="time" type="time" required step={300} defaultValue={fmtTime(b.booking.startsAt)} /></div>
        </div>
        <p className="hint">{b.service.kind === "class" ? "Alle Teilnehmer werden" : "Der Kunde wird"} über die Änderung automatisch benachrichtigt. Überschneidungen mit anderen Terminen werden abgelehnt.</p>
        <button className="btn" type="submit">Änderung speichern</button>
        <Link className="btn ghost" href={`/admin/termin/${id}`}>Abbrechen</Link>
      </form>
    </AdminShell>
  );
}
