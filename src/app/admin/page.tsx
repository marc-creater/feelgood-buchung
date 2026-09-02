import Link from "next/link";
import { AdminShell } from "./AdminShell";
import { cancellationsBetween, dayEntries, lastMinuteCount, openFreedSlots } from "@/lib/data";
import { addDays, atLocal, fmtDate, fmtTime, localParts, mondayOf, parseDateKey, todayKey, WD_SHORT, weekdayOfKey, minutesBetween } from "@/lib/time";
import { freedAction } from "./actions";
import { StatusSheet } from "./StatusSheet";

export const dynamic = "force-dynamic";

const H0 = 8, H1 = 21, PX = 44;
const MO = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const CANCEL_LABEL: Record<string, string> = {
  cancelled_customer_online: "Kunde storniert (Link)", cancelled_customer_phone: "Kunde abgesagt (tel.)", cancelled_admin: "Studio abgesagt", no_show: "nicht erschienen",
};

type Entry = { key: string; kind: "beh" | "kurs" | "block"; start: Date; end: Date; bufEnd?: Date; title: string; sub: string; href: string; cancelled?: string; cap?: string };

async function entriesFor(key: string): Promise<Entry[]> {
  const { bookings, blocks, sessions } = await dayEntries(key);
  const out: Entry[] = [];
  for (const b of bookings) if (b.kind === "appointment") out.push({
    key: b.id, kind: "beh", start: b.startsAt, end: b.endsAt, bufEnd: b.blockedUntil, title: b.customerName,
    sub: `${b.serviceName} · ${minutesBetween(b.startsAt, b.endsAt)} min${b.staff !== "Heike" ? " · " + b.staff : ""}`,
    href: `/admin/termin/${b.id}`, cancelled: b.status !== "confirmed" ? CANCEL_LABEL[b.status] || "abgesagt" : undefined,
  });
  for (const s of sessions) {
    const parts = bookings.filter((b) => b.serviceId === s.service.id && b.startsAt.getTime() === s.start.getTime() && b.status === "confirmed");
    out.push({
      key: `${s.service.id}-${s.start.getTime()}`, kind: "kurs", start: s.start, end: s.end, title: s.service.name,
      sub: `Kurs · ${s.durationMin} min · ${s.service.staff}`, cap: `${parts.length} / ${s.service.capacity}`,
      href: `/admin/kurs/${s.service.id}?t=${encodeURIComponent(s.start.toISOString())}`,
    });
  }
  for (const b of blocks) out.push({ key: b.id, kind: "block", start: b.startsAt, end: b.endsAt, title: b.reason, sub: b.staff || "alle", href: `/admin/block?d=${key}&del=${b.id}` });
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ d?: string; msg?: string; err?: string }> }) {
  const { d, msg, err } = await searchParams;
  const today = todayKey();
  const sel = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  const mon = mondayOf(sel);
  const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const week = await Promise.all(weekKeys.map(entriesFor));
  const dayList = weekKeys.includes(sel) ? week[weekKeys.indexOf(sel)] : await entriesFor(sel);
  const stripKeys = Array.from({ length: 10 }, (_, i) => addDays(today, i - 1));

  const todayCount = (await entriesFor(today)).filter((e) => e.kind !== "block" && !e.cancelled).length;
  const weekFrom = atLocal(today, "00:00"), weekTo = atLocal(addDays(today, 7), "00:00");
  const canc = await cancellationsBetween(weekFrom, weekTo);
  const weekCount = week.flat().filter((e) => e.kind !== "block" && !e.cancelled).length;
  const freed = await openFreedSlots();
  const lm = await lastMinuteCount();

  return (
    <AdminShell active="kal" msg={msg} err={err}>
      <div className="stats">
        <Link className="stat" href={`/admin?d=${today}`}><b>{todayCount}</b><small>Termine heute</small></Link>
        <div className="stat"><b>{weekCount}</b><small>diese Woche</small></div>
        <Link className="stat" href="/admin/absagen"><b className={canc.length ? "warn" : ""}>{canc.length}</b><small>Absagen (7 Tage)</small></Link>
      </div>
      <div className="adminrow">
        <Link className="btn" href={`/admin/neu?d=${sel}`}>+ Termin</Link>
        <Link className="btn ghost" href={`/admin/block?d=${sel}`}>Zeit blockieren</Link>
      </div>

      {freed.length > 0 && (
        <>
          <p className="eyebrow">Kurzfristig frei geworden ({freed.length})</p>
          {freed.map((f) => (
            <div key={f.id} className="card freed">
              <span className="t">{fmtDate(f.startsAt)} · {fmtTime(f.startsAt)}–{fmtTime(f.endsAt)} Uhr</span><br />
              <span className="m">{f.serviceName} · durch Absage frei geworden</span>
              <span className="badges">{f.statusShared && <span className="badge">Status geteilt ✓</span>}{f.listNotifiedAt && <span className="badge">Last-Minute-Liste benachrichtigt ✓</span>}</span>
              <div className="acts">
                <StatusSheet id={f.id} date={fmtDate(f.startsAt)} time={fmtTime(f.startsAt)} service={f.serviceName} url={(process.env.APP_URL || "").replace(/^https?:\/\//, "")} />
                <form action={freedAction}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="what" value="notify" />
                  <button className="btn" type="submit" disabled={!!f.listNotifiedAt || lm === 0} title={lm === 0 ? "Noch niemand auf der Liste" : ""}>Last-Minute-Liste ({lm})</button></form>
                <form action={freedAction}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="what" value="dismiss" /><button className="btn ghost" type="submit" style={{ marginTop: 0 }}>Verwerfen</button></form>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Mobil: Tages-Streifen + Liste */}
      <div className="days" id="daystrip">
        {stripKeys.map((k) => { const { d: dd } = parseDateKey(k); return (
          <Link key={k} className={`day ${k === sel ? "on" : ""}`} href={`/admin?d=${k}`} scroll={false}><small>{WD_SHORT[weekdayOfKey(k)]}</small><b>{dd}</b></Link>
        ); })}
      </div>
      <div id="daylist">
        <p className="eyebrow">{fmtDate(atLocal(sel, "12:00"))}</p>
        {dayList.length === 0 && <div className="empty">Frei – kein Termin.</div>}
        {dayList.map((e) => (
          <Link key={e.key} className={`apt ${e.kind}${e.cancelled ? " cancelled" : ""}`} href={e.href}>
            <time>{fmtTime(e.start)}–{fmtTime(e.end)}</time>
            <span><span className="who">{e.title}</span><br /><span className="what">{e.sub}{e.bufEnd && minutesBetween(e.end, e.bufEnd) > 0 ? ` · +${minutesBetween(e.end, e.bufEnd)} min Puffer` : ""}</span></span>
            {e.cancelled ? <span className="cap"><span className="cancel-tag">{e.cancelled}</span></span> : e.cap ? <span className="cap">{e.cap} Plätze</span> : null}
          </Link>
        ))}
      </div>

      {/* Desktop: Wochenraster */}
      <div id="week">
        <div className="weeknav">
          <Link href={`/admin?d=${addDays(mon, -7)}`}>‹ Vorige Woche</Link>
          <span>{fmtDate(atLocal(mon, "12:00"))} – {fmtDate(atLocal(addDays(mon, 6), "12:00"))}</span>
          <Link href={`/admin?d=${addDays(mon, 7)}`}>Nächste Woche ›</Link>
        </div>
        <div className="tg">
          <div className="tgcorner" />
          {weekKeys.map((k) => { const { d: dd, m } = parseDateKey(k); return (
            <Link key={k} className={`tgh ${k === sel ? "on" : ""}`} href={`/admin?d=${k}`}>{WD_SHORT[weekdayOfKey(k)]}<b>{dd}. {MO[m - 1]}</b></Link>
          ); })}
          <div className="tgaxis" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: H1 - H0 - 1 }, (_, k) => <span key={k} style={{ top: (k + 1) * PX }}>{String(H0 + k + 1).padStart(2, "0")}:00</span>)}
          </div>
          {weekKeys.map((k, i) => (
            <div key={k} className={`tgcol ${k === sel ? "on" : ""}`} style={{ height: (H1 - H0) * PX }}>
              {week[i].map((e) => {
                const sp = localParts(e.start); const startMin = sp.hh * 60 + sp.mm;
                const dur = minutesBetween(e.start, e.end); const buf = e.bufEnd ? minutesBetween(e.end, e.bufEnd) : 0;
                const top = Math.max(0, (startMin - H0 * 60) / 60 * PX), h = Math.max(18, dur / 60 * PX);
                return (
                  <span key={e.key}>
                    <Link className={`ev ${e.kind}${e.cancelled ? " cancelled" : ""}`} href={e.href} style={{ top, height: h - 2 }} title={`${e.title} · ${e.sub}${buf ? ` · +${buf} min Puffer` : ""}`}>
                      <b>{fmtTime(e.start)} {e.title}</b>{h >= 34 && <span>{e.sub}{e.cap ? ` · ${e.cap}` : ""}</span>}
                    </Link>
                    {buf > 0 && !e.cancelled && <div className="evbuf" style={{ top: top + h, height: buf / 60 * PX }} title={`Pufferzeit ${buf} min`} />}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Schraffiert = Pufferzeit nach der Behandlung. Termin anklicken für Details, Verschieben oder Absage.</p>
      </div>
      <p className="hint" style={{ marginTop: 16 }}>Grün = Behandlung · Ocker = Kurs · Grau = Blockzeit.</p>
    </AdminShell>
  );
}
