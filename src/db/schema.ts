import {
  pgTable, uuid, text, integer, boolean, timestamp, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const serviceKind = pgEnum("service_kind", ["appointment", "class"]);
export const serviceStatus = pgEnum("service_status", ["draft", "live"]);
export const bookingStatus = pgEnum("booking_status", [
  "confirmed",
  "cancelled_customer_online",
  "cancelled_customer_phone",
  "cancelled_admin",
  "no_show",
  "done",
]);
export const bookingSource = pgEnum("booking_source", ["online", "admin"]);
export const notifyChannel = pgEnum("notify_channel", ["email", "whatsapp", "sms"]);
export const notifyType = pgEnum("notify_type", [
  "confirmation", "reminder", "cancellation", "change", "freed_slot", "cancel_ack",
]);
export const notifyStatus = pgEnum("notify_status", ["pending", "sent", "failed", "skipped"]);

/** Leistungen (Behandlungen) und Kurse */
export const services = pgTable("services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: serviceKind("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  durationMin: integer("duration_min").notNull().default(60), // bei Kursen: Default, je Zeit überschreibbar
  bufferMin: integer("buffer_min").notNull().default(0),
  priceCents: integer("price_cents").notNull().default(0),
  priceLabel: text("price_label").notNull().default(""), // z. B. "132 € / 8 Termine"
  capacity: integer("capacity").notNull().default(1),
  status: serviceStatus("status").notNull().default("draft"),
  staff: text("staff").notNull().default("Heike"),
  cancelHours: integer("cancel_hours").notNull().default(24),
  trialAllowed: boolean("trial_allowed").notNull().default(false),
  waitlist: boolean("waitlist").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Wöchentliche Kurszeiten (mehrere pro Kurs) */
export const classSchedules = pgTable("class_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 0 = So … 6 = Sa
  startTime: text("start_time").notNull(), // "18:00"
  durationMin: integer("duration_min").notNull(),
}, (t) => [index("class_schedules_service_idx").on(t.serviceId)]);

/** Wöchentliche Verfügbarkeit für Behandlungen */
export const availabilityRules = pgTable("availability_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  staff: text("staff"), // null = gilt für alle
});

/** Urlaub, Pausen, private Blockzeiten */
export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull().default("Blockzeit"),
  staff: text("staff"),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  whatsappOptInAt: timestamp("whatsapp_opt_in_at", { withTimezone: true }),
  lastMinuteOptIn: boolean("last_minute_opt_in").notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("customers_email_idx").on(t.email), index("customers_phone_idx").on(t.phone)]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), // Ende der eigentlichen Leistung
  blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(), // Ende inkl. Puffer
  blocksCalendar: boolean("blocks_calendar").notNull().default(true), // false bei Kursteilnahme
  status: bookingStatus("status").notNull().default("confirmed"),
  source: bookingSource("source").notNull().default("online"),
  cancelToken: uuid("cancel_token").notNull().default(sql`gen_random_uuid()`),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  isTrial: boolean("is_trial").notNull().default(false),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("bookings_starts_idx").on(t.startsAt),
  index("bookings_customer_idx").on(t.customerId),
  uniqueIndex("bookings_cancel_token_idx").on(t.cancelToken),
]);

/** Versandprotokoll — garantiert Idempotenz der Erinnerungen */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id),
  channel: notifyChannel("channel").notNull(),
  type: notifyType("type").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: notifyStatus("status").notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_booking_type_idx").on(t.bookingId, t.type)]);

/** Durch Absage frei gewordene Termine ("Kurzfristig frei") */
export const freedSlots = pgTable("freed_slots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  freedAt: timestamp("freed_at", { withTimezone: true }).notNull().defaultNow(),
  statusShared: boolean("status_shared").notNull().default(false),
  listNotifiedAt: timestamp("list_notified_at", { withTimezone: true }),
  rebookedBookingId: uuid("rebooked_booking_id"),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Service = typeof services.$inferSelect;
export type ClassSchedule = typeof classSchedules.$inferSelect;
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type FreedSlot = typeof freedSlots.$inferSelect;
