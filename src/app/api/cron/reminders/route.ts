/**
 * Erinnerungen verschicken. Alle 10–15 Minuten aufrufen (docker-compose enthält einen Cron-Container):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/reminders
 */
import { runDueReminders } from "@/lib/notify";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) return new Response("Unauthorized", { status: 401 });
  const result = await runDueReminders();
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}
