const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('response', r => { if (r.status() >= 500) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  // 1) Startseite
  await page.goto(BASE + '/');
  await page.screenshot({ path: 'e2e-1-start.png', fullPage: true });
  console.log('Leistungen sichtbar:', await page.locator('a.card').count());

  // 2) Behandlung wählen → Slots
  await page.click('a.card:has-text("Klangschalen-Massage")');
  await page.waitForURL(/\/buchen\//); await page.waitForSelector('.slot');
  console.log('Tage im Streifen:', await page.locator('.day').count(), '| freie Slots:', await page.locator('.slot').count());
  await page.screenshot({ path: 'e2e-2-slots.png', fullPage: true });
  const slotText = await page.locator('.slot').first().innerText();

  // 3) Formular
  await page.locator('.slot').first().click();
  await page.waitForLoadState('networkidle');
  await page.fill('#name', 'Test Kundin');
  await page.fill('#phone', '0170 1234567');
  await page.fill('#email', 'test@example.com');
  await page.check('input[name=lastMinute]');
  await page.screenshot({ path: 'e2e-3-form.png', fullPage: true });
  await page.click('button:has-text("Verbindlich buchen")');
  await page.waitForURL(/\/termin\//, { timeout: 20000 });
  console.log('Bestätigung URL:', page.url().replace(BASE, ''));
  await page.screenshot({ path: 'e2e-4-confirm.png', fullPage: true });
  const token = page.url().split('/termin/')[1].split('?')[0];

  // 4) ICS
  const ics = await page.request.get(BASE + '/api/ics/' + token);
  console.log('ICS:', ics.status(), (await ics.text()).includes('BEGIN:VEVENT'));

  // 5) Slot darf nicht mehr frei sein
  await page.goto(BASE + '/');
  await page.click('a.card:has-text("Klangschalen-Massage")');
  await page.waitForURL(/\/buchen\//); await page.waitForSelector('.days');
  const stillThere = await page.locator('.slot', { hasText: slotText }).count();
  console.log('gebuchter Slot', slotText, 'noch sichtbar (soll 0):', stillThere);

  // 6) Admin Login + Dashboard
  await page.goto(BASE + '/admin');
  await page.waitForURL(/login/);
  await page.fill('#pw', 'test1234');
  await page.click('button:has-text("Anmelden")');
  await page.waitForURL(/\/admin$/, { timeout: 20000 });
  await page.screenshot({ path: 'e2e-5-admin-mobil.png', fullPage: true });
  // zum Buchungstag springen
  const dayLink = page.locator('#daystrip a.day');
  console.log('Termine heute (Kachel):', await page.locator('.stat b').first().innerText());
  // Termin-Detail über Absagen/Kalender finden: wir suchen den Eintrag "Test Kundin" in den nächsten Tagen
  let found = false;
  const hrefs = await dayLink.evaluateAll(els => els.map(e => e.getAttribute('href')));
  for (const h of hrefs) {
    await page.goto(BASE + h); await page.waitForSelector('#daylist .eyebrow');
    if (await page.locator('#daylist a.apt:has-text("Test Kundin")').count()) { found = true; break; }
  }
  console.log('Buchung im Admin gefunden:', found);
  await page.locator('#daylist a.apt:has-text("Test Kundin")').click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e-6-termin.png', fullPage: true });
  console.log('Nachrichten protokolliert:', await page.locator('.parts').last().locator('li').count());

  // 7) Kunde hat telefonisch abgesagt
  await page.click('button:has-text("Kunde hat abgesagt")');
  await page.waitForLoadState('networkidle');
  console.log('nach Absage:', (await page.locator('.flash').innerText()).slice(0, 60), '|', await page.locator('.cancel-tag').first().innerText());
  await page.goto(BASE + '/admin');
  console.log('Kurzfristig frei Box:', await page.locator('.card.freed').count(), '| Absagen-Kachel:', await page.locator('.stat b').nth(2).innerText());
  await page.screenshot({ path: 'e2e-7-dashboard-freed.png', fullPage: true });

  // 8) Kunde sieht "Kurzfristig frei"
  await page.goto(BASE + '/');
  console.log('Kurzfristig frei auf Startseite:', await page.locator('a.card.hot').count());

  // 9) Desktop Wochenraster
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/admin');
  await page.waitForLoadState('networkidle');
  console.log('Wochenraster Events:', await page.locator('.ev').count(), '| Puffer:', await page.locator('.evbuf').count());
  await page.screenshot({ path: 'e2e-8-week.png', fullPage: true });

  // 10) Angebot + Zeiten + Sync
  await page.goto(BASE + '/admin/angebot'); console.log('Angebot Karten:', await page.locator('a.card').count());
  await page.click('a.card:has-text("Pilates")'); await page.waitForLoadState('networkidle');
  console.log('Kurs-Zeilen im Editor:', await page.locator('.schedrow').count());
  await page.screenshot({ path: 'e2e-9-editor.png', fullPage: true });
  await page.goto(BASE + '/admin/zeiten'); console.log('Regeln:', await page.locator('.parts li').count());
  await page.goto(BASE + '/admin/sync'); console.log('Feeds:', await page.locator('code.feed').count());
  const feedUrl = (await page.locator('code.feed').first().innerText()).replace('webcal://', 'http://');
  const feed = await page.request.get(feedUrl);
  console.log('iCal-Feed:', feed.status(), (await feed.text()).split('BEGIN:VEVENT').length - 1, 'Events');

  // 11) Cron
  const cron = await page.request.get(BASE + '/api/cron/reminders?key=cron-dev');
  console.log('Cron:', cron.status(), await cron.text());

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'keine');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
