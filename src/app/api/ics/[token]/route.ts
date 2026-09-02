import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { icsFor, loadBundle } from "@/lib/notify";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.cancelToken, token));
  if (!b) return new Response("Nicht gefunden", { status: 404 });
  const bundle = await loadBundle(b.id);
  const ics = bundle && icsFor(bundle);
  if (!ics) return new Response("Fehler", { status: 500 });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="termin.ics"' } });
}
