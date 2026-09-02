import Link from "next/link";
import { Brand, Crumbs } from "@/components/Brand";
import { getServices, openFreedSlots } from "@/lib/data";
import { fmtDate, fmtTime, WD_SHORT } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const all = await getServices({ liveOnly: true });
  const beh = all.filter((s) => s.kind === "appointment");
  const kurse = all.filter((s) => s.kind === "class");
  const freed = await openFreedSlots();

  return (
    <div className="wrap">
      <Brand />
      <Crumbs step={1} />
      <h2 className="step">Was darf es sein?</h2>

      {freed.length > 0 && (
        <>
          <p className="eyebrow">Kurzfristig frei</p>
          {freed.map((f) => (
            <Link key={f.id} className="card hot" href={`/buchen/${f.serviceId}/form?start=${encodeURIComponent(f.startsAt.toISOString())}`}>
              <span><span className="t">{fmtDate(f.startsAt)} · {fmtTime(f.startsAt)} Uhr</span><br /><span className="m">{f.serviceName} · {f.durationMin} min</span></span>
              <span className="tag kurs">frei geworden</span>
            </Link>
          ))}
        </>
      )}

      <p className="eyebrow">Behandlungen</p>
      {beh.map((s) => (
        <Link key={s.id} className="card" href={`/buchen/${s.id}`}>
          <span><span className="t">{s.name}</span><br /><span className="m">{s.durationMin} min{s.staff !== "Heike" ? ` · ${s.staff}` : ""}</span></span>
          <span style={{ textAlign: "right" }}><span className="tag beh">Behandlung</span><br /><span className="p">{s.priceLabel}</span></span>
        </Link>
      ))}

      {kurse.length > 0 && <p className="eyebrow">Kurse</p>}
      {kurse.map((s) => (
        <Link key={s.id} className="card" href={`/buchen/${s.id}`}>
          <span><span className="t">{s.name}</span><br /><span className="m">{s.schedule.map((e) => `${WD_SHORT[e.weekday]} ${e.startTime}`).join(" · ") || "Termine folgen"}</span></span>
          <span style={{ textAlign: "right" }}><span className="tag kurs">Kurs</span><br /><span className="p">{s.priceLabel}</span></span>
        </Link>
      ))}
      <p className="hint" style={{ marginTop: 24 }}>Fragen? Ruf uns an: {process.env.STUDIO_PHONE || "+49 177 6002199"}</p>
    </div>
  );
}
