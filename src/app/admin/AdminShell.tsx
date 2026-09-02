import Link from "next/link";
import { Brand } from "@/components/Brand";
import { logoutAction } from "./actions";

export function AdminShell({ active, children, msg, err, wide = true }: { active: "kal" | "angebot" | "zeiten" | "sync" | "absagen" | ""; children: React.ReactNode; msg?: string; err?: string; wide?: boolean }) {
  return (
    <div className={`wrap ${wide ? "admin" : ""}`}>
      <div className="topnav">
        <span>Verwaltung</span>
        <nav aria-label="Bereiche">
          <Link className={active === "kal" ? "on" : ""} href="/admin">Kalender</Link>
          <Link className={active === "angebot" ? "on" : ""} href="/admin/angebot">Angebot</Link>
          <Link className={active === "zeiten" ? "on" : ""} href="/admin/zeiten">Zeiten</Link>
          <Link className={active === "sync" ? "on" : ""} href="/admin/sync">Kalender-Sync</Link>
        </nav>
        <form action={logoutAction}><button className="btn ghost sm" type="submit" style={{ marginTop: 0 }}>Abmelden</button></form>
      </div>
      <Brand sub="Verwaltung" small />
      {msg && <div className="flash">{msg}</div>}
      {err && <div className="flash err">{err}</div>}
      {children}
    </div>
  );
}
