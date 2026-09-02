"use client";
import { useState } from "react";

type Row = { weekday: number; startTime: string; durationMin: number };
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function ScheduleEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ weekday: 1, startTime: "18:00", durationMin: 60 }]);
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <p className="eyebrow" style={{ marginTop: 4 }}>Zeiten</p>
      {rows.map((r, i) => (
        <div className="schedrow" key={i}>
          <select name="wd" value={r.weekday} onChange={(e) => upd(i, { weekday: +e.target.value })} aria-label="Wochentag">
            {[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{WD[w]}</option>)}
          </select>
          <input name="time" type="time" value={r.startTime} onChange={(e) => upd(i, { startTime: e.target.value })} aria-label="Uhrzeit" required />
          <input name="dur" className="mins" type="number" min={15} step={5} value={r.durationMin} onChange={(e) => upd(i, { durationMin: +e.target.value })} aria-label="Dauer in Minuten" />
          <button type="button" className="xbtn" aria-label="Zeit entfernen" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="addrow" onClick={() => setRows([...rows, { weekday: 4, startTime: "18:00", durationMin: rows[0]?.durationMin || 60 }])}>+ weitere Zeit hinzufügen</button>
    </div>
  );
}
