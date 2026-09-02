import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Crumbs } from "@/components/Brand";
import { getServiceById } from "@/lib/data";
import { fmtDate, fmtTime } from "@/lib/time";
import { bookAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Form({ params, searchParams }: { params: Promise<{ serviceId: string }>; searchParams: Promise<{ start?: string; err?: string }> }) {
  const { serviceId } = await params;
  const { start, err } = await searchParams;
  const svc = await getServiceById(serviceId);
  if (!svc || svc.status !== "live" || !start) notFound();
  const startDate = new Date(start);
  if (isNaN(startDate.getTime())) notFound();

  return (
    <div className="wrap">
      <Brand />
      <Crumbs step={3} />
      <h2 className="step">Fast geschafft</h2>
      <div className="summary"><b>{svc.name}</b>{fmtDate(startDate)} · {fmtTime(startDate)} Uhr · {svc.priceLabel}</div>
      {err && <div className="flash err">{err}</div>}
      <form action={bookAction}>
        <input type="hidden" name="serviceId" value={svc.id} />
        <input type="hidden" name="start" value={startDate.toISOString()} />
        <div className="f"><label className="lbl" htmlFor="name">Name</label><input id="name" name="name" type="text" required autoComplete="name" /></div>
        <div className="f"><label className="lbl" htmlFor="phone">Handynummer</label><input id="phone" name="phone" type="tel" required placeholder="für die Terminerinnerung" autoComplete="tel" /></div>
        <div className="f"><label className="lbl" htmlFor="email">E-Mail</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="f"><label className="opt"><input type="checkbox" name="whatsapp" defaultChecked />
          <span>Erinnert mich gern <b>per WhatsApp</b> 24 Stunden vorher. Ohne Häkchen kommt die Erinnerung per E-Mail{process.env.SEVEN_API_KEY ? "/SMS" : ""}.</span></label></div>
        <div className="f"><label className="opt"><input type="checkbox" name="lastMinute" />
          <span>Sagt mir Bescheid, wenn <b>kurzfristig ein Termin frei</b> wird (Last-Minute-Liste, jederzeit abbestellbar).</span></label></div>
        {svc.kind === "class" && svc.trialAllowed && (
          <div className="f"><label className="opt"><input type="checkbox" name="trial" defaultChecked /><span>Das ist meine <b>Probestunde</b>.</span></label></div>
        )}
        <p className="hint">Kostenlos stornierbar bis {svc.cancelHours} h vor dem Termin – der Link dazu steht in der Bestätigung. Mit der Buchung akzeptierst du unsere <a href="https://cabrera-feelgood.de/agb" target="_blank" rel="noreferrer">AGB</a> und <a href="https://cabrera-feelgood.de/datenschutz" target="_blank" rel="noreferrer">Datenschutzhinweise</a>.</p>
        <button className="btn" type="submit">Verbindlich buchen</button>
        <Link className="btn ghost" href={`/buchen/${svc.id}`}>Zurück</Link>
      </form>
    </div>
  );
}
