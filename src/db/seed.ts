/**
 * Legt die echten Leistungen von Cabrera Feelgood an (Stand 08/2026) plus Beispiel-Öffnungszeiten.
 * Läuft nur, wenn noch keine Leistungen existieren (idempotent).
 */
import { db, pool } from "./index";
import { services, classSchedules, availabilityRules, settings } from "./schema";
import { randomBytes } from "node:crypto";

async function main() {
  const existing = await db.select({ id: services.id }).from(services).limit(1);
  if (existing.length) { console.log("Seed übersprungen – es gibt schon Leistungen."); await pool.end(); return; }

  const beh = [
    { name: "Rückenmassage", durationMin: 30, priceCents: 4200, description: "Eine dynamische Massage, kraftvoll oder entspannend ganz auf deine Bedürfnisse abgestimmt." },
    { name: "Rücken-Komfort-Massage", durationMin: 45, priceCents: 5800, description: "Die Rückenmassage und das Einbinden der Arme lässt sowohl Verspannungen abklingen als auch genügend Zeit, um sich eine kleine Pause zu nehmen." },
    { name: "Heisse Rolle", durationMin: 40, priceCents: 5800, description: "Mit einem heißen gewickelten Tuch wird die Rückenmuskulatur erwärmt und im Anschluss kräftig massiert." },
    { name: "Ganzkörpermassage", durationMin: 60, priceCents: 7400, description: "Die Gedanken zur Ruhe kommen lassen und bei sanften knetenden Bewegungen dem Körper Entspannung gönnen. Ein Stück Urlaub!" },
    { name: "Klangschalen-Massage", durationMin: 60, priceCents: 8500, description: "Sanfte Schwingungen und wohltuende Klänge tibetischer Klangschalen bringen dein gesamtes System in Balance. Verspannungen lösen sich, der Geist kommt zur Ruhe." },
    { name: "Hot-Stone-Massage", durationMin: 90, priceCents: 10900, description: "Mit heißen Lavasteinen wird der ganze Körper massiert und eine tiefe Entspannung tritt ein." },
    { name: "Personal Training", durationMin: 60, priceCents: 10500, description: "Trainiere in unseren Räumen im 1:1-Training. Ganzheitlich und individuell, um deine Ziele SMART zu erreichen.", staff: "Carlos" },
  ];
  let order = 10;
  for (const b of beh) {
    await db.insert(services).values({
      kind: "appointment", name: b.name, description: b.description, durationMin: b.durationMin,
      bufferMin: 15, priceCents: b.priceCents, priceLabel: (b.priceCents / 100).toFixed(0) + " €",
      capacity: 1, status: "live", staff: b.staff ?? "Heike", cancelHours: 24, sortOrder: order += 10,
    });
  }

  const kurse = [
    { name: "Hatha Yoga", priceLabel: "132 € / 8 Termine", priceCents: 13200, cap: 10, staff: "Heike",
      description: "Klassisches Hatha Yoga: Haltungen, Atmung und Entspannung im Wechsel – für Einsteiger und Geübte. Kursblock über 8 Termine, Probestunde möglich.",
      times: [{ weekday: 1, startTime: "18:00", durationMin: 75 }, { weekday: 4, startTime: "18:00", durationMin: 75 }] },
    { name: "Hatha Yoga (Abend)", priceLabel: "132 € / 8 Termine", priceCents: 13200, cap: 10, staff: "Heike",
      description: "Die längere Abendeinheit: 90 Minuten Hatha Yoga zum Tagesausklang. Kursblock über 8 Termine, Probestunde möglich.",
      times: [{ weekday: 1, startTime: "19:30", durationMin: 90 }, { weekday: 4, startTime: "19:30", durationMin: 90 }] },
    { name: "Pilates", priceLabel: "120 € / 9 Termine", priceCents: 12000, cap: 10, staff: "Carlos",
      description: "Kräftigung der Tiefenmuskulatur, Stabilität und Haltung – konzentriert und gelenkschonend am Morgen. Kursblock über 9 Termine.",
      times: [{ weekday: 2, startTime: "09:00", durationMin: 60 }, { weekday: 4, startTime: "09:00", durationMin: 60 }] },
  ];
  for (const k of kurse) {
    const [svc] = await db.insert(services).values({
      kind: "class", name: k.name, description: k.description, durationMin: k.times[0].durationMin,
      priceCents: k.priceCents, priceLabel: k.priceLabel, capacity: k.cap, status: "live", staff: k.staff,
      cancelHours: 24, trialAllowed: true, waitlist: true, sortOrder: order += 10,
    }).returning();
    for (const t of k.times) await db.insert(classSchedules).values({ serviceId: svc.id, ...t });
  }

  // Beispiel-Öffnungszeiten für Behandlungen (im Admin änderbar): Di–Fr 9–18, Sa 9–13
  for (const wd of [2, 3, 4, 5]) await db.insert(availabilityRules).values({ weekday: wd, startTime: "09:00", endTime: "18:00" });
  await db.insert(availabilityRules).values({ weekday: 6, startTime: "09:00", endTime: "13:00" });

  // Private Kalender-Abo-Tokens
  for (const who of ["heike", "carlos", "studio"]) {
    await db.insert(settings).values({ key: `ical_token_${who}`, value: randomBytes(16).toString("hex") });
  }
  console.log("Seed fertig: 7 Behandlungen, 3 Kurse, Öffnungszeiten, iCal-Tokens.");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
