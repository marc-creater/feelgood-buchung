const { chromium } = require('playwright');
const { Client } = require('pg');
const BASE = 'http://localhost:3000';
(async () => {
  const pg = new Client({ connectionString: 'postgres://feelgood:feelgood@localhost:5432/feelgood' }); await pg.connect();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 500) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const login = async () => { await page.goto(BASE + '/admin/login'); await page.fill('#pw', 'test1234'); await page.click('button:has-text("Anmelden")'); await page.waitForURL(/\/admin$/); };
  const book = async (svcName, who, extra = async () => {}) => {
    await page.goto(BASE + '/'); await page.click(`a.card:has-text("${svcName}")`); await page.waitForURL(/\/buchen\//);
    await page.waitForSelector('a.slot, a.card'); const link = page.locator('a.slot').first(); const isSlot = await link.count();
    if (isSlot) await link.click(); else await page.locator('a.card[href*="form"]').first().click();
    await page.waitForURL(/form/); await page.fill('#name', who); await page.fill('#phone', '0170 ' + Math.floor(Math.random() * 1e6)); await page.fill('#email', who.replace(/\s/g, '.').toLowerCase() + '@example.com');
    await extra(); await page.click('button:has-text("Verbindlich buchen")'); await page.waitForURL(/\/termin\//); return page.url();
  };

  // A) Kursbuchung (Probestunde) + Kapazität
  const kursUrl = await book('Pilates', 'Kurs Testerin');
  console.log('A Kursbuchung ok:', kursUrl.includes('/termin/'), '| Probestunde:', (await page.locator('.summary').innerText()).includes('Pilates'));
  const { rows: kb } = await pg.query("select is_trial, blocks_calendar from bookings b join services s on s.id=b.service_id where s.name='Pilates' order by b.created_at desc limit 1");
  console.log('   is_trial:', kb[0].is_trial, '| blockt Kalender:', kb[0].blocks_calendar);

  // B) Storno-Link (online) – Frist: Termin muss > 24h weg sein → wir buchen einen späteren Slot
  await page.goto(BASE + '/'); await page.click('a.card:has-text("Rückenmassage")'); await page.waitForURL(/\/buchen\//);
  const days = await page.locator('a.day:not(.off)').evaluateAll(a => a.map(x => x.getAttribute('href')));
  await page.goto(BASE + days[3]); await page.waitForSelector('a.slot'); await page.locator('a.slot').first().click(); await page.waitForURL(/form/);
  await page.fill('#name', 'Storno Tester'); await page.fill('#phone', '0170 999'); await page.fill('#email', 'storno@example.com');
  await page.click('button:has-text("Verbindlich buchen")'); await page.waitForURL(/\/termin\//);
  const hasCancel = await page.locator('button:has-text("Termin stornieren")').count();
  console.log('B Storno-Button sichtbar:', hasCancel);
  await page.click('button:has-text("Termin stornieren")'); await page.waitForURL(/storniert=1/);
  console.log('   storniert-Seite:', await page.locator('h2:has-text("Storniert")').count());
  const { rows: sb } = await pg.query("select status from bookings b join customers c on c.id=b.customer_id where c.email='storno@example.com'");
  console.log('   Status in DB:', sb[0].status);

  await book('Ganzkörpermassage', 'Verschiebe Tester');
  // C) Doppelbuchungs-Schutz (DB-Constraint): zweite Buchung auf denselben Slot direkt per SQL
  const { rows: ex } = await pg.query("select starts_at, ends_at, blocked_until, service_id, customer_id from bookings where status='confirmed' and blocks_calendar limit 1");
  let dup = 'nicht getestet';
  if (ex.length) {
    try { await pg.query("insert into bookings (customer_id, service_id, starts_at, ends_at, blocked_until) values ($1,$2,$3,$4,$5)", [ex[0].customer_id, ex[0].service_id, ex[0].starts_at, ex[0].ends_at, ex[0].blocked_until]); dup = 'FEHLER: Doppelbuchung wurde akzeptiert'; }
    catch (e) { dup = 'abgelehnt (' + e.code + ')'; }
  }
  console.log('C Doppelbuchung:', dup);

  // D) Admin: Verschieben + Studio-Absage
  await login();
  const { rows: ab } = await pg.query("select b.id, b.starts_at from bookings b where status='confirmed' and blocks_calendar order by starts_at limit 1");
  await page.goto(BASE + '/admin/termin/' + ab[0].id + '/bearbeiten');
  await page.fill('#time', '15:00'); await page.click('button:has-text("Änderung speichern")'); await page.waitForURL(/msg=/);
  console.log('D Verschieben:', decodeURIComponent(page.url().split('msg=')[1]));
  const { rows: mv } = await pg.query("select to_char(starts_at at time zone 'Europe/Berlin','HH24:MI') t from bookings where id=$1", [ab[0].id]);
  console.log('   neue Zeit in DB:', mv[0].t);
  await page.fill('input[name=reason]', 'Krankheit'); await page.click('button:has-text("Studio sagt ab")'); await page.waitForURL(/msg=/);
  console.log('   Studio-Absage:', decodeURIComponent(page.url().split('msg=')[1]));
  const { rows: nt } = await pg.query("select type, channel, status from notifications where booking_id=$1 order by created_at", [ab[0].id]);
  console.log('   Nachrichten:', nt.map(n => n.type + '/' + n.status).join(', '));

  // E) Angebot: neue Leistung als Entwurf → unsichtbar → live → sichtbar
  await page.goto(BASE + '/admin/angebot/neu?kind=appointment');
  await page.fill('#name', 'Fußreflexzonen-Massage'); await page.fill('#price', '68'); await page.fill('#durationMin', '45');
  await page.click('button:has-text("Speichern")'); await page.waitForURL(/angebot\?msg/);
  await page.goto(BASE + '/'); console.log('E Entwurf öffentlich sichtbar (soll 0):', await page.locator('a.card:has-text("Fußreflex")').count());
  const { rows: ns } = await pg.query("select id from services where name='Fußreflexzonen-Massage'");
  await page.goto(BASE + '/admin/angebot/' + ns[0].id); await page.selectOption('#status', 'live'); await page.click('button:has-text("Speichern")'); await page.waitForURL(/angebot\?msg/);
  await page.goto(BASE + '/'); console.log('   nach Veröffentlichen sichtbar:', await page.locator('a.card:has-text("Fußreflex")').count());
  // Kurs mit dritter Zeit speichern
  const { rows: pi } = await pg.query("select id from services where name='Pilates'");
  await page.goto(BASE + '/admin/angebot/' + pi[0].id); await page.click('button:has-text("weitere Zeit")'); await page.click('button:has-text("Speichern")'); await page.waitForURL(/angebot\?msg/);
  const { rows: sc } = await pg.query("select count(*)::int n from class_schedules where service_id=$1", [pi[0].id]);
  console.log('   Pilates-Zeiten nach Editor:', sc[0].n);

  // F) Reminder-Cron: Erinnerung künstlich fällig machen
  await pg.query("update notifications set scheduled_for = now() - interval '1 minute' where type='reminder' and status='pending'");
  const cron = await page.request.get(BASE + '/api/cron/reminders?key=cron-dev'); console.log('F Cron:', await cron.text());
  const { rows: rm } = await pg.query("select count(*)::int n from notifications where type='reminder' and status in ('sent','skipped') and error is null");
  console.log('   Reminder verschickt/protokolliert:', rm[0].n);
  const unauth = await page.request.get(BASE + '/api/cron/reminders'); console.log('   Cron ohne Key:', unauth.status());

  // G) Blockzeit anlegen → Slots weg
  await page.goto(BASE + '/admin/block?d=' + days[5].split('d=')[1]); await page.fill('#from', '09:00'); await page.fill('#to', '13:00'); await page.click('button:has-text("Blockieren")'); await page.waitForURL(/msg=/);
  await page.goto(BASE + days[5]); await page.waitForSelector('.slots, .empty');
  const slotsAfter = await page.locator('a.slot').allInnerTexts();
  console.log('G Slots am Blocktag (keine vor 13:00):', slotsAfter.filter(t => t < '13:00').length === 0, slotsAfter.slice(0, 3));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'keine');
  await browser.close(); await pg.end();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
