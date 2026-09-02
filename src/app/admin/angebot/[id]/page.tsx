import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../AdminShell";
import { getServiceById } from "@/lib/data";
import { deleteService, saveService } from "../../actions";
import { ScheduleEditor } from "../ScheduleEditor";

export const dynamic = "force-dynamic";

export default async function Editor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; err?: string }> }) {
  const { id } = await params;
  const { kind: k, err } = await searchParams;
  const isNew = id === "neu";
  const svc = isNew ? null : await getServiceById(id);
  if (!isNew && !svc) notFound();
  const kind = svc?.kind ?? (k === "class" ? "class" : "appointment");
  const isClass = kind === "class";

  return (
    <AdminShell active="angebot" err={err} wide={false}>
      <p className="eyebrow"><Link href="/admin/angebot">‹ Angebot</Link></p>
      <h2 className="step">{svc ? `${svc.name} bearbeiten` : isClass ? "Neuer Kurs" : "Neue Behandlung"}</h2>
      <form action={saveService}>
        <input type="hidden" name="id" value={svc?.id ?? ""} />
        <input type="hidden" name="kind" value={kind} />
        <div className="f"><label className="lbl" htmlFor="name">Name</label><input id="name" name="name" type="text" required defaultValue={svc?.name ?? ""} placeholder={isClass ? "z. B. Yin Yoga" : "z. B. Fußreflexzonen-Massage"} /></div>
        <div className="f"><label className="lbl" htmlFor="description">Beschreibung (Buchungsseite)</label><textarea id="description" name="description" defaultValue={svc?.description ?? ""} placeholder="Ein, zwei Sätze zur Wirkung …" /></div>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="price">Preis (€)</label><input id="price" name="price" type="text" inputMode="decimal" defaultValue={svc ? (svc.priceCents / 100).toString().replace(".", ",") : ""} placeholder="z. B. 68" /></div>
          <div><label className="lbl" htmlFor="priceLabel">Preis-Anzeige</label><input id="priceLabel" name="priceLabel" type="text" defaultValue={svc?.priceLabel ?? ""} placeholder={isClass ? "z. B. 120 € / 9 Termine" : "leer = automatisch"} /></div>
        </div>
        <div className="row2 f">
          <div><label className="lbl" htmlFor="staff">Anbieter:in</label>
            <select id="staff" name="staff" defaultValue={svc?.staff ?? "Heike"}><option>Heike</option><option>Carlos</option><option>Beide</option></select></div>
          <div><label className="lbl" htmlFor="cancelHours">Storno bis (Std. vorher)</label><input id="cancelHours" name="cancelHours" type="number" min={0} defaultValue={svc?.cancelHours ?? 24} /></div>
        </div>
        {isClass ? (
          <>
            <ScheduleEditor initial={svc?.schedule.map((e) => ({ weekday: e.weekday, startTime: e.startTime, durationMin: e.durationMin })) ?? []} />
            <input type="hidden" name="durationMin" value={svc?.durationMin ?? 60} />
            <div className="row2 f">
              <div><label className="lbl" htmlFor="capacity">Plätze</label><input id="capacity" name="capacity" type="number" min={1} defaultValue={svc?.capacity ?? 10} /></div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
                <label className="opt" style={{ padding: 8 }}><input type="checkbox" name="trialAllowed" defaultChecked={svc?.trialAllowed ?? true} /><span>Probestunde buchbar</span></label>
                <label className="opt" style={{ padding: 8 }}><input type="checkbox" name="waitlist" defaultChecked={svc?.waitlist ?? false} /><span>Warteliste</span></label>
              </div>
            </div>
          </>
        ) : (
          <div className="row2 f">
            <div><label className="lbl" htmlFor="durationMin">Dauer (min)</label><input id="durationMin" name="durationMin" type="number" min={5} step={5} required defaultValue={svc?.durationMin ?? 60} /></div>
            <div><label className="lbl" htmlFor="bufferMin">Puffer danach (min)</label><input id="bufferMin" name="bufferMin" type="number" min={0} step={5} defaultValue={svc?.bufferMin ?? 15} /></div>
          </div>
        )}
        <div className="row2 f">
          <div><label className="lbl" htmlFor="status">Sichtbarkeit</label>
            <select id="status" name="status" defaultValue={svc?.status ?? "draft"}>
              <option value="live">Öffentlich – auf der Buchungsseite sichtbar</option>
              <option value="draft">Entwurf – noch nicht öffentlich</option>
            </select></div>
          <div><label className="lbl" htmlFor="sortOrder">Reihenfolge</label><input id="sortOrder" name="sortOrder" type="number" defaultValue={svc?.sortOrder ?? 100} /></div>
        </div>
        <button className="btn" type="submit">Speichern</button>
        <Link className="btn ghost" href="/admin/angebot">Abbrechen</Link>
      </form>
      {svc && (
        <form action={deleteService} style={{ marginTop: 10 }}><input type="hidden" name="id" value={svc.id} />
          <button className="btn ghost" type="submit" style={{ color: "var(--danger)" }}>Löschen</button></form>
      )}
    </AdminShell>
  );
}
