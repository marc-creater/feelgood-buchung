"use server";

import { redirect } from "next/navigation";
import { BookingError, cancelBooking, createAppointment, createClassBooking } from "@/lib/bookings";
import { getServiceById } from "@/lib/data";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";

function str(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }

export async function bookAction(fd: FormData) {
  const serviceId = str(fd, "serviceId");
  const start = new Date(str(fd, "start"));
  const customer = {
    name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"),
    whatsappOptIn: fd.get("whatsapp") === "on", lastMinuteOptIn: fd.get("lastMinute") === "on",
  };
  if (!customer.name || !customer.phone || !customer.email) redirect(`/buchen/${serviceId}/form?start=${encodeURIComponent(start.toISOString())}&err=${encodeURIComponent("Bitte alle Felder ausfüllen.")}`);
  const svc = await getServiceById(serviceId);
  if (!svc) redirect("/");
  let token = "";
  try {
    const b = svc.kind === "class"
      ? await createClassBooking({ serviceId, start, customer, isTrial: fd.get("trial") === "on" })
      : await createAppointment({ serviceId, start, customer });
    token = b.booking.cancelToken;
  } catch (e) {
    const msg = e instanceof BookingError ? e.message : "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.";
    if (!(e instanceof BookingError)) console.error(e);
    redirect(`/buchen/${serviceId}/form?start=${encodeURIComponent(start.toISOString())}&err=${encodeURIComponent(msg)}`);
  }
  redirect(`/termin/${token}?neu=1`);
}

export async function cancelByTokenAction(fd: FormData) {
  const token = str(fd, "token");
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.cancelToken, token));
  if (!b) redirect("/");
  try {
    await cancelBooking(b.id, "online", { enforceDeadline: true });
  } catch (e) {
    const msg = e instanceof BookingError ? e.message : "Stornierung fehlgeschlagen.";
    redirect(`/termin/${token}?err=${encodeURIComponent(msg)}`);
  }
  redirect(`/termin/${token}?storniert=1`);
}
