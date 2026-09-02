/**
 * Kanal-Adapter. Jeder gibt { ok, id?, error?, skipped? } zurück und wirft nie.
 * Nicht konfigurierte Kanäle melden `skipped`, damit der Fallback greift.
 */
import nodemailer from "nodemailer";

export interface SendResult { ok: boolean; id?: string; error?: string; skipped?: boolean }

/* ---------- E-Mail (SMTP) ---------- */
export function emailConfigured() { return !!process.env.SMTP_HOST; }

export async function sendEmail(to: string, subject: string, text: string, attachments?: { filename: string; content: string; contentType: string }[]): Promise<SendResult> {
  if (!to) return { ok: false, skipped: true, error: "keine E-Mail-Adresse" };
  if (!emailConfigured()) {
    console.log(`[email:dry-run] an ${to} · ${subject}\n${text}\n`);
    return { ok: true, skipped: true, id: "dry-run" };
  }
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const info = await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, attachments });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ---------- WhatsApp Cloud API (Meta) ---------- */
export function whatsappConfigured() { return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN); }

/** Telefonnummer nach E.164 ohne "+" (Meta-Format), Default Deutschland. */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("00")) p = p.slice(2);
  else if (p.startsWith("0")) p = "49" + p.slice(1);
  return p;
}

/**
 * Sendet ein freigegebenes Template. `params` sind die {{1}}, {{2}} … des Templates.
 * Templates müssen im Meta Business Manager angelegt und freigegeben sein (Kategorie "Utility" für Bestätigung/Erinnerung/Absage, "Marketing" für "Kurzfristig frei").
 */
export async function sendWhatsAppTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
  if (!to) return { ok: false, skipped: true, error: "keine Telefonnummer" };
  if (!whatsappConfigured()) return { ok: false, skipped: true, error: "WhatsApp nicht konfiguriert" };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: normalizePhone(to), type: "template",
        template: {
          name: template, language: { code: process.env.WHATSAPP_LANG || "de" },
          components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: JSON.stringify(json).slice(0, 500) };
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ---------- SMS (seven.io) ---------- */
export function smsConfigured() { return !!process.env.SEVEN_API_KEY; }

export async function sendSms(to: string, text: string): Promise<SendResult> {
  if (!to) return { ok: false, skipped: true, error: "keine Telefonnummer" };
  if (!smsConfigured()) return { ok: false, skipped: true, error: "SMS nicht konfiguriert" };
  try {
    const res = await fetch("https://gateway.seven.io/api/sms", {
      method: "POST",
      headers: { "X-Api-Key": process.env.SEVEN_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: "+" + normalizePhone(to), text, from: process.env.SMS_SENDER || "Feelgood" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success !== "100") return { ok: false, error: JSON.stringify(json).slice(0, 500) };
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
