"use client";
import { useState } from "react";
import { freedAction } from "./actions";

/** Status-Vorlage für WhatsApp/Instagram: Grafik-Vorschau + Text zum Kopieren. Sie entscheidet, ob sie es postet. */
export function StatusSheet({ id, date, time, service, url }: { id: string; date: string; time: string; service: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Kurzfristig frei bei ${process.env.NEXT_PUBLIC_STUDIO_NAME || "Feelgood"}: ${date}, ${time} Uhr – ${service}. Jetzt buchen: ${url}`;
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch { /* Fallback: Text ist markierbar */ }
    setCopied(true);
  }
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} style={{ marginTop: 0 }}>Status-Vorlage</button>
      {open && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(10,16,13,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 20 }} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: "var(--surface)", color: "var(--ink)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, padding: "20px 16px 26px", maxHeight: "88vh", overflowY: "auto" }}>
            <h3 style={{ fontFamily: "Marcellus,Georgia,serif", fontWeight: 400, fontSize: 20, margin: "0 0 10px" }}>Status-Vorlage</h3>
            <p className="hint" style={{ margin: "0 0 12px" }}>Bild speichern oder Text kopieren – und selbst entscheiden, ob es in den WhatsApp-Status oder auf Instagram geht.</p>
            <div className="story">
              <div className="sb">{(process.env.NEXT_PUBLIC_STUDIO_NAME || "FEELGOOD").toUpperCase()}</div>
              <div className="sh">Kurzfristig frei</div>
              <div className="sd">{date} · {time} Uhr<br />{service}</div>
              <div className="sl">{url}</div>
            </div>
            <label className="lbl" htmlFor={`st-${id}`}>Text zum Kopieren</label>
            <textarea id={`st-${id}`} className="copybox" readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
            {copied && <div className="flash" style={{ marginTop: 10 }}>Kopiert. Jetzt WhatsApp öffnen → Status → einfügen.</div>}
            <form action={freedAction} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="what" value="shared" />
              <button className="btn" type="button" onClick={copy}>Text kopieren</button>
              <button className="btn ghost" type="submit">Als geteilt markieren</button>
            </form>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Schließen</button>
          </div>
        </div>
      )}
    </>
  );
}
