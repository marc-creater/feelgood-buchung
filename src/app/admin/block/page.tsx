import Link from "next/link";
import { eq } from "drizzle-orm";
import { AdminShell } from "../AdminShell";
import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { fmtDateLong, fmtTime, todayKey } from "@/lib/time";
import { addBlock, deleteBlock } from "../actions";

export const dynamic = "force-dynamic";

export default async function Block({ searchParams }: { searchParams: Promise<{ d?: string; del?: string; err?: string }> }) {
  const { d, del, err } = await searchParams;
  const day = d || todayKey();
  const existing = del ? (await db.select().from(timeBlocks).where(eq(timeBlocks.id, del)))[0] : undefined;
  return (
    <AdminShell active="kal" err={err} wide={false}>
      <p className="eyebrow"><Link href={`/admin?d=${day}`}>‹ Kalender</Link></p>
      {existing ? (
        <>
          <h2 className="step">{existing.reason}</h2>
          <p className="hint">{fmtDateLong(existing.startsAt)} · {fmtTime(existing.startsAt)}–{fmtTime(existing.endsAt)} Uhr{existing.staff ? ` · ${existing.staff}` : ""} · in dieser Zeit sind keine Buchungen möglich</p>
          <form action={deleteBlock}><input type="hidden" name="id" value={existing.id} /><input type="hidden" name="d" value={day} />
            <button className="btn danger" type="submit">Blockzeit entfernen</button></form>
        </>
      ) : (
        <>
          <h2 className="step">Zeit blockieren</h2>
          <form action={addBlock}>
            <div className="f"><label className="lbl" htmlFor="reason">Grund</label><input id="reason" name="reason" type="text" placeholder="z. B. Urlaub, privat" defaultValue="Blockzeit" /></div>
            <div className="row2 f">
              <div><label className="lbl" htmlFor="date">Von (Datum)</label><input id="date" name="date" type="date" required defaultValue={day} /></div>
              <div><label className="lbl" htmlFor="from">Uhrzeit</label><input id="from" name="from" type="time" required defaultValue="12:00" /></div>
            </div>
            <div className="row2 f">
              <div><label className="lbl" htmlFor="dateEnd">Bis (Datum)</label><input id="dateEnd" name="dateEnd" type="date" defaultValue={day} /></div>
              <div><label className="lbl" htmlFor="to">Uhrzeit</label><input id="to" name="to" type="time" required defaultValue="14:00" /></div>
            </div>
            <div className="f"><label className="lbl" htmlFor="staff">Gilt für</label>
              <select id="staff" name="staff" defaultValue=""><option value="">alle</option><option>Heike</option><option>Carlos</option></select></div>
            <p className="hint">Für Urlaub einfach Von- und Bis-Datum setzen (z. B. 00:00 bis 23:59).</p>
            <button className="btn" type="submit">Blockieren</button>
          </form>
        </>
      )}
    </AdminShell>
  );
}
