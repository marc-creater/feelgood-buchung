import { Brand } from "@/components/Brand";
import { loginAction } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next, err } = await searchParams;
  return (
    <div className="wrap">
      <Brand sub="Verwaltung" small />
      <h2 className="step" style={{ textAlign: "center" }}>Anmelden</h2>
      {err && <div className="flash err">{err}</div>}
      <form action={loginAction}>
        <input type="hidden" name="next" value={next || "/admin"} />
        <div className="f"><label className="lbl" htmlFor="pw">Passwort</label><input id="pw" name="password" type="password" required autoFocus /></div>
        <button className="btn" type="submit">Anmelden</button>
      </form>
      <p className="hint" style={{ marginTop: 20 }}>Tipp fürs Handy: Diese Seite über „Zum Home-Bildschirm" hinzufügen – dann läuft die Verwaltung wie eine App.</p>
    </div>
  );
}
