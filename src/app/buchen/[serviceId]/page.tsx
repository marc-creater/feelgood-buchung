import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Crumbs } from "@/components/Brand";
import { classSessionsWithLoad, daysWithSlots, getServiceById, slotsForDay, HORIZON_DAYS } from "@/lib/data";
import { addDays, fmtDate, fmtTime, parseDateKey, todayKey, WD_SHORT } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Buchen({ params, searchParams }: { params: Promise<{ serviceId: string }>; searchParams: Promise<{ d?: string }> }) {
  const { serviceId } = await params;
  const { d } = await searchParams;
  const svc = await getServiceById(serviceId);
  if (!svc || svc.status !== "live") notFound();

  if (svc.kind === "class") {
    const sessions = await classSessionsWithLoad(svc);
    return (
      <div className="wrap">
        <Brand />
        <Crumbs step={2} />
        <h2 className="step">{svc.name} · Termin wählen</h2>
        <p className="desc">{svc.description}</p>
        {svc.trialAllowed && <p className="hint" style={{ marginBottom: 12 }}>Du kannst einzelne Termine als Probestunde buchen. Den Kursblock ({svc.priceLabel}) besprechen wir vor Ort.</p>}
        {sessions.length === 0 && <div className="empty">Aktuell sind keine Termine geplant.</div>}
        {sessions.map((s) => (
          s.free > 0 ? (
            <Link key={s.start.toISOString()} className="card" href={`/buchen/${svc.id}/form?start=${encodeURIComponent(s.start.toISOString())}`}>
              <span><span className="t">{fmtDate(s.start)}</span><br /><span className="m">{fmtTime(s.start)} Uhr · {s.durationMin} min</span></span>
              <span className="p">{s.free} frei</span>
            </Link>
          ) : (
            <div key={s.start.toISOString()} className="card" style={{ opacity: .5 }}>
              <span><span className="t">{fmtDate(s.start)}</span><br /><span className="m">{fmtTime(s.start)} Uhr · {s.durationMin} min</span></span>
              <span className="p" style={{ color: "var(--danger)" }}>ausgebucht</span>
            </div>
          )
        ))}
        <Link className="btn ghost" href="/">Zurück</Link>
      </div>
    );
  }

  const today = todayKey();
  const days = await daysWithSlots(svc, today, HORIZON_DAYS);
  const selected = d && days.some((x) => x.key === d) ? d : (days.find((x) => x.count > 0)?.key ?? addDays(today, 1));
  const slots = await slotsForDay(svc, selected);

  return (
    <div className="wrap">
      <Brand />
      <Crumbs step={2} />
      <h2 className="step">{svc.name} · Termin wählen</h2>
      <p className="desc">{svc.description}</p>
      <div className="days">
        {days.map((x) => {
          const { d: dd } = parseDateKey(x.key);
          const wd = new Date(x.key + "T12:00:00Z").getUTCDay();
          return (
            <Link key={x.key} className={`day ${x.key === selected ? "on" : ""} ${x.count === 0 ? "off" : ""}`} href={`/buchen/${svc.id}?d=${x.key}`} scroll={false}>
              <small>{WD_SHORT[wd]}</small><b>{dd}</b>
            </Link>
          );
        })}
      </div>
      {slots.length ? (
        <div className="slots">
          {slots.map((s) => (
            <Link key={s.start.toISOString()} className="slot" href={`/buchen/${svc.id}/form?start=${encodeURIComponent(s.start.toISOString())}`}>{fmtTime(s.start)}</Link>
          ))}
        </div>
      ) : (
        <div className="empty">An diesem Tag ist leider alles belegt – wähl gern einen anderen Tag.</div>
      )}
      <Link className="btn ghost" href="/">Zurück</Link>
    </div>
  );
}
