/** Einfacher Admin-Login: ein Passwort, signierter Cookie (HMAC-SHA256), 30 Tage gültig. Edge-kompatibel. */
export const SESSION_COOKIE = "fg_admin";
const DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET fehlt oder ist zu kurz (min. 16 Zeichen).");
  return s;
}
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function createSessionValue(): Promise<string> {
  const exp = Date.now() + DAYS * 86400_000;
  const payload = `admin.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}
export async function verifySessionValue(v: string | undefined): Promise<boolean> {
  if (!v) return false;
  const parts = v.split(".");
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  if (who !== "admin" || Number(exp) < Date.now()) return false;
  const expected = await hmac(`${who}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
export function passwordOk(pw: string): boolean {
  const want = process.env.ADMIN_PASSWORD || "";
  return want.length > 0 && pw === want;
}
