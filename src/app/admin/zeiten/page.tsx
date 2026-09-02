import { AdminShell } from "../AdminShell";
import { getRules } from "@/lib/data";
import { WD_LONG } from "@/lib/time";
import { addRule, deleteRule } from "../actions";

export const dynamic = "force-dynamic";

export default async function Zeiten({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const rules = await getRules();
  return (
    <AdminShell active="zeiten" msg={msg} err={err} wide={false}>
      <h2 className="step">Buchbare Zeiten für Behandlungen</h2>
      <p className="desc">In diesen Zeitfenstern können Kunden online Behandlungen buchen (Kurse haben ihre eigenen Zeiten). Urlaub und Ausnahmen trägst du im Kalender als Blockzeit ein.</p>
      {rules.length === 0 && <div className="empty">Noch keine Zeiten – ohne Zeiten kann online nichts gebucht werden.</div>}
      <ul className="parts">
        {rules.map((r) => (
          <li key={r.id}><span><b>{WD_LONG[r.weekday]}</b> {r.startTime}–{r.endTime} Uhr <small>{r.staff ? `· ${r.staff}` : "· alle"}</small></span>
            <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="xbtn" type="submit" aria-label="entfernen">✕</button></form></li>
        ))}
      </ul>
      <p className="eyebrow">Zeit hinzufügen</p>
      <form action={addRule}>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="weekday">Wochentag</label>
            <select id="weekday" name="weekday" defaultValue={2}>{[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{WD_LONG[w]}</option>)}</select></div>
          <div><label className="lbl" htmlFor="staff">Für</label>
            <select id="staff" name="staff" defaultValue=""><option value="">alle</option><option>Heike</option><option>Carlos</option></select></div>
        </div>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="from">Von</label><input id="from" name="from" type="time" required defaultValue="09:00" /></div>
          <div><label className="lbl" htmlFor="to">Bis</label><input id="to" name="to" type="time" required defaultValue="18:00" /></div>
        </div>
        <button className="btn" type="submit">Hinzufügen</button>
      </form>
      <p className="hint" style={{ marginTop: 16 }}>Online-Buchungen sind frühestens 2 Stunden im Voraus und bis 6 Wochen im Voraus möglich; Slots liegen im 30-Minuten-Raster.</p>
    </AdminShell>
  );
}
