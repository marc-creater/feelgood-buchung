import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { getServices } from "@/lib/data";
import { todayKey } from "@/lib/time";
import { adminCreateBooking } from "../actions";

export const dynamic = "force-dynamic";

export default async function Neu({ searchParams }: { searchParams: Promise<{ d?: string; s?: string; t?: string; err?: string }> }) {
  const { d, s, t, err } = await searchParams;
  const all = await getServices();
  return (
    <AdminShell active="kal" err={err} wide={false}>
      <p className="eyebrow"><Link href={`/admin?d=${d || todayKey()}`}>‹ Kalender</Link></p>
      <h2 className="step">Termin anlegen</h2>
      <form action={adminCreateBooking}>
        <div className="f"><label className="lbl" htmlFor="name">Kunde</label><input id="name" name="name" type="text" required placeholder="Name" /></div>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="phone">Telefon</label><input id="phone" name="phone" type="tel" /></div>
          <div><label className="lbl" htmlFor="email">E-Mail</label><input id="email" name="email" type="email" /></div>
        </div>
        <div className="f"><label className="lbl" htmlFor="svc">Leistung / Kurs</label>
          <select id="svc" name="serviceId" defaultValue={s || ""} required>
            <option value="" disabled>bitte wählen</option>
            {all.filter((x) => x.kind === "appointment").map((x) => <option key={x.id} value={x.id}>{x.name} ({x.durationMin} min{x.status === "draft" ? ", Entwurf" : ""})</option>)}
            {all.filter((x) => x.kind === "class").map((x) => <option key={x.id} value={x.id}>Kurs: {x.name}</option>)}
          </select></div>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="date">Datum</label><input id="date" name="date" type="date" required defaultValue={d || todayKey()} /></div>
          <div><label className="lbl" htmlFor="time">Uhrzeit</label><input id="time" name="time" type="time" required step={300} defaultValue={t || "10:00"} /></div>
        </div>
        <div className="f"><label className="opt"><input type="checkbox" name="whatsapp" /><span>Kunde möchte Erinnerungen per WhatsApp (hat zugestimmt)</span></label></div>
        <div className="f"><label className="lbl" htmlFor="note">Notiz</label><input id="note" name="note" type="text" /></div>
        <p className="hint">Beim Kurs muss die Uhrzeit dem Kurstermin entsprechen. Bei Behandlungen gelten die Öffnungszeiten nicht (du kannst auch außerhalb eintragen) – nur Überschneidungen werden abgelehnt. Der Kunde bekommt eine Bestätigung.</p>
        <button className="btn" type="submit">Anlegen</button>
      </form>
    </AdminShell>
  );
}
