import { AdminShell } from "../AdminShell";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { channelSummary } from "@/lib/notify";

export const dynamic = "force-dynamic";

export default async function Sync() {
  const rows = await db.select().from(settings);
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/^https?:\/\//, "");
  const tok = (who: string) => rows.find((r) => r.key === `ical_token_${who}`)?.value;
  const ch = channelSummary();
  return (
    <AdminShell active="sync" wide={false}>
      <h2 className="step">Kalender-Sync</h2>
      <p className="desc">Euer eigener Kalender (Google, Apple, Outlook …) abonniert den Studio-Kalender über diese privaten Adressen. Einmal einrichten, danach erscheinen alle Buchungen, Kurse und Blockzeiten automatisch dort. Die Adressen nicht weitergeben.</p>
      {(["heike", "carlos", "studio"] as const).map((who) => tok(who) && (
        <div key={who}>
          <p className="eyebrow">{who === "studio" ? "Alles (Studio)" : who.charAt(0).toUpperCase() + who.slice(1)}</p>
          <code className="feed">webcal://{base}/api/kalender/{who}/{tok(who)}</code>
        </div>
      ))}
      <p className="hint">Apple/iPhone: Link antippen → „Abonnieren". Google Kalender: Einstellungen → „Per URL hinzufügen" (dort http statt webcal). Google aktualisiert Abos nur alle paar Stunden.</p>

      <h2 className="step" style={{ marginTop: 28 }}>Nachrichten-Kanäle</h2>
      <ul className="parts">
        <li><span>E-Mail (SMTP)</span><small>{ch.email ? "aktiv" : "nicht konfiguriert – Mails werden nur protokolliert"}</small></li>
        <li><span>WhatsApp Cloud API</span><small>{ch.whatsapp ? "aktiv" : "nicht konfiguriert – Fallback E-Mail/SMS"}</small></li>
        <li><span>SMS (seven.io)</span><small>{ch.sms ? "aktiv" : "nicht konfiguriert"}</small></li>
      </ul>
      <p className="hint">Konfiguration über die Umgebungsvariablen in der <code>.env</code> auf dem Server (siehe README).</p>
    </AdminShell>
  );
}
