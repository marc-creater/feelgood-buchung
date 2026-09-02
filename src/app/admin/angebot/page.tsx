import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { getServices } from "@/lib/data";
import { WD_SHORT } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Angebot({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const all = await getServices();
  const beh = all.filter((s) => s.kind === "appointment"), kurse = all.filter((s) => s.kind === "class");
  const pill = (s: { status: string }) => <span className={`pill ${s.status === "live" ? "live" : "draft"}`}>{s.status === "live" ? "Öffentlich" : "Entwurf"}</span>;
  return (
    <AdminShell active="angebot" msg={msg} err={err} wide={false}>
      <div className="adminrow">
        <Link className="btn" href="/admin/angebot/neu?kind=appointment">+ Behandlung</Link>
        <Link className="btn" href="/admin/angebot/neu?kind=class">+ Kurs</Link>
      </div>
      <p className="eyebrow">Behandlungen ({beh.length})</p>
      {beh.map((s) => (
        <Link key={s.id} className="card" href={`/admin/angebot/${s.id}`}>
          <span><span className="t">{s.name}</span><br /><span className="m">{s.durationMin} min · {s.priceLabel} · {s.staff}{s.bufferMin ? ` · Puffer ${s.bufferMin} min` : ""} · Storno bis {s.cancelHours} h</span></span>
          {pill(s)}
        </Link>
      ))}
      <p className="eyebrow">Kurse ({kurse.length})</p>
      {kurse.map((s) => (
        <Link key={s.id} className="card" href={`/admin/angebot/${s.id}`}>
          <span><span className="t">{s.name}</span><br /><span className="m">{s.schedule.map((e) => `${WD_SHORT[e.weekday]} ${e.startTime}`).join(" · ") || "– noch keine Zeiten –"} · {s.priceLabel} · {s.staff}</span>
            <span className="badges"><span className="badge">{s.capacity} Plätze</span>{s.trialAllowed && <span className="badge">Probestunde</span>}{s.waitlist && <span className="badge">Warteliste</span>}</span></span>
          {pill(s)}
        </Link>
      ))}
      <p className="hint" style={{ marginTop: 12 }}>Entwürfe sind auf der Buchungsseite unsichtbar – erst „Öffentlich" schaltet sie frei.</p>
    </AdminShell>
  );
}
