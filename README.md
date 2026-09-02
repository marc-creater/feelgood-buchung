# Feelgood Terminbuchung

Buchungstool für Cabrera Feelgood (Massage, Yoga, Pilates): öffentliche Buchungsseite für Kunden + Verwaltung für das Studio (als Web-App auf Handy und Computer), automatische Bestätigungen und Erinnerungen, Storno-Link, „Kurzfristig frei", Kalender-Abo.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Postgres 16 · Drizzle ORM · Docker Compose. Keine Fremd-Accounts nötig außer SMTP (und optional WhatsApp/SMS).

## Was drin ist

| Bereich | Funktionen |
|---|---|
| **Buchungsseite** `/` | Behandlungen mit freien Slots (30-min-Raster, Öffnungszeiten, Puffer, Blockzeiten, Mindestvorlauf 2 h, Horizont 6 Wochen), Kurse mit Terminen und freien Plätzen (Probestunde), Buchungsformular mit WhatsApp-Opt-in und Last-Minute-Liste, „Kurzfristig frei"-Bereich |
| **Bestätigung** `/termin/<token>` | Termindetails, .ics-Download, Storno-Link (Frist pro Leistung), Storno-Seite |
| **Verwaltung** `/admin` | Passwort-Login (PWA-fähig), Dashboard-Kacheln (heute / Woche / Absagen), Tagesliste (Handy) + Stundenraster-Woche (Desktop) mit Pufferanzeige, Termin anlegen, Blockzeiten, „Kurzfristig frei"-Box mit Status-Vorlage + Last-Minute-Liste |
| **Termindetails** | Kundendaten, interne Notiz, Nachrichten-Protokoll, Verschieben (Kunde wird benachrichtigt), **drei Absage-Wege**: Kunde storniert per Link · Kunde hat telefonisch abgesagt (optional Bestätigung) · Studio sagt ab (Kunde/alle Teilnehmer werden benachrichtigt) |
| **Kurse** | Teilnehmerliste pro Termin, einzeln abmelden, ganzen Kurstermin absagen, Teilnehmer manuell eintragen |
| **Angebot** | Behandlungen/Kurse anlegen, bearbeiten, löschen; Entwurf/Öffentlich; Kurse mit mehreren Wochentagen + Uhrzeiten; Puffer, Stornofrist, Anbieter:in, Probestunde, Warteliste-Flag |
| **Zeiten** | Buchbare Zeitfenster für Behandlungen je Wochentag (optional je Anbieter:in) |
| **Kalender-Sync** | Private iCal-Feeds (Heike / Carlos / Studio) zum Abonnieren in Google/Apple/Outlook |
| **Nachrichten** | E-Mail (SMTP) immer; WhatsApp Cloud API bei Opt-in; SMS (seven.io) als Fallback – jeder Kanal nur, wenn konfiguriert. Erinnerung 24 h vorher per Cron. Kopie neuer Buchungen/Stornos ans Studio. |

## Lokal starten (Entwicklung)

```bash
cp .env.example .env            # Werte anpassen (mind. ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET)
docker compose up -d db         # oder eigene Postgres-Instanz, DATABASE_URL in .env
npm install
npm run db:migrate              # Tabellen + Doppelbuchungs-Constraint
npm run db:seed                 # echte Leistungen von cabrera-feelgood.de, Beispiel-Öffnungszeiten, iCal-Tokens
npm run dev                     # http://localhost:3000  ·  Verwaltung: /admin
```

Ohne SMTP-Zugangsdaten werden E-Mails nicht verschickt, sondern im Server-Log ausgegeben (`[email:dry-run]`) und im Nachrichten-Protokoll als „übersprungen" markiert – ideal zum Testen.

## Auf dem VPS betreiben (Docker Compose)

1. Repo auf den Server klonen, `.env` aus `.env.example` anlegen und ausfüllen:
   - `APP_URL=https://buchen.cabrera-feelgood.de` (wird in allen Links/E-Mails verwendet)
   - `ADMIN_PASSWORD`, `SESSION_SECRET` (≥ 32 zufällige Zeichen: `openssl rand -hex 32`), `CRON_SECRET`
   - `DB_PASSWORD` (optional, Default `feelgood` – für Produktion ändern)
   - SMTP-Daten des Mailanbieters, `MAIL_FROM`, `MAIL_ADMIN`
2. `docker compose up -d --build` – startet Postgres, App (mit automatischer Migration + Seed beim ersten Start), Erinnerungs-Cron (alle 10 min) und tägliches Backup nach `./backups`.
3. HTTPS davor: z. B. Caddy mit `Caddyfile.example` (Subdomain → `127.0.0.1:3000`). Auf der WordPress-Seite dann „Online buchen" auf die Subdomain verlinken.
4. Verwaltung öffnen, unter **Zeiten** die echten Öffnungszeiten eintragen (Seed enthält nur Beispiel: Di–Fr 9–18, Sa 9–13), unter **Angebot** Preise/Texte prüfen.

**Update einspielen:** `git pull && docker compose up -d --build` (Migrationen laufen automatisch).
**Backup zurückspielen:** `gunzip -c backups/feelgood-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U feelgood feelgood`

## Verwaltung als App aufs Handy

`/admin/login` im Browser öffnen → „Zum Home-Bildschirm" (iOS: Teilen-Menü; Android: Browser-Menü). Läuft dann im Vollbild mit eigenem Icon. Am Computer zeigt die Verwaltung automatisch die Wochenansicht.

## WhatsApp einrichten (optional, später)

1. Meta Business Manager → WhatsApp → Telefonnummer verifizieren (am besten eine separate Geschäftsnummer, nicht die private WhatsApp-Nummer).
2. Vier Nachrichten-Vorlagen anlegen und freigeben lassen (Platzhalter in dieser Reihenfolge: `{{1}}` Vorname, `{{2}}` Leistung, `{{3}}` Datum, `{{4}}` Uhrzeit, `{{5}}` Link):
   - `termin_bestaetigung` (Utility): „Hallo {{1}}, dein Termin {{2}} am {{3}} um {{4}} Uhr ist bestätigt. Stornieren: {{5}}"
   - `termin_erinnerung` (Utility): „Hallo {{1}}, Erinnerung: morgen um {{4}} Uhr ist dein Termin {{2}}. Falls du nicht kannst: {{5}}"
   - `termin_absage` (Utility): „Hallo {{1}}, dein Termin {{2}} am {{3}} um {{4}} Uhr muss leider ausfallen. Neu buchen: {{5}}"
   - `termin_frei` (Marketing): „Hallo {{1}}, kurzfristig frei: {{2}} am {{3}} um {{4}} Uhr. Wer zuerst bucht: {{5}}"
3. `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (permanenter System-User-Token) und die Template-Namen in `.env` eintragen, `docker compose up -d`.

Kosten (Deutschland, Stand 2026): Utility ≈ 0,045 €, Marketing ≈ 0,11 € pro Nachricht; Antworten der Kunden innerhalb 24 h kostenlos. Rechtlich: Der Opt-in-Haken im Buchungsformular ist die Einwilligung; sie wird mit Zeitstempel gespeichert.

**SMS-Fallback:** Konto bei seven.io, `SEVEN_API_KEY` eintragen (≈ 0,08 €/SMS).

## Struktur

```
src/db/schema.ts        Tabellen (services, class_schedules, availability_rules, time_blocks, customers, bookings, notifications, freed_slots, settings)
drizzle/                SQL-Migrationen (inkl. Exclusion-Constraint gegen Doppelbuchungen)
src/lib/time.ts         Zeitzone Europe/Berlin, DST-sicher
src/lib/availability.ts Slot-Berechnung (reine Funktionen, Unit-Tests)
src/lib/data.ts         Lesezugriffe (Slots, Kurstermine, Tagesansicht …)
src/lib/bookings.ts     Buchen, Absagen (3 Wege), Verschieben, Kurzfristig frei
src/lib/notify/         Vorlagen, Kanal-Adapter (E-Mail/WhatsApp/SMS), Versandprotokoll, Reminder-Cron
src/app/                Seiten (öffentlich, /termin, /admin/*), API (ics, kalender, cron)
```

## Tests

```bash
npm test                 # Unit-Tests (Verfügbarkeit, Zeitzone)
npm run test:e2e         # Playwright-Durchlauf gegen laufende App (Buchung → Admin → Absage → Kurzfristig frei …)
node e2e-flows.js        # weitere Flüsse: Kurs, Storno-Link, Doppelbuchung, Verschieben, Angebot, Cron, Blockzeit
```

## Bewusst noch nicht drin (V2-Kandidaten)

Online-Zahlung/Anzahlung, 10er-Karten & Kursblock-Abrechnung, Warteliste mit automatischer Benachrichtigung bei frei werdendem Kursplatz (Flag existiert), Kundenverzeichnis mit Historie, Bilder pro Leistung, automatische Instagram-Story, Zwei-Wege-Kalendersync, Mehrsprachigkeit.
