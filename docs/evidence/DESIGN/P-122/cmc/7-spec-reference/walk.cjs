/* CMC, Specifications: the ICH Q6A/Q6B reference under the specification table.
   Usage: node walk.cjs <outDir> <baseUrl> <pwFile> */
const { chromium } = require('playwright');
const fs = require('fs');
const [, , OUT, BASE, PW_FILE] = process.argv;
const DRUG = '2d6292f3-eeb0-4ae1-9b3c-e68e89c197ad'; // C2C-201, small molecule
const BIO = 'af5db78f-529b-45a2-a1f0-fede3f15181b'; // LMN-201, biologic

async function openSpecs(page, program) {
  await page.goto(`${BASE}/concept2cure/cmc?program=${program}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('tab', { name: /Specifications/ }).first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const card = page.getByTestId('cm-spec-reference');
  await card.waitFor({ timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  return card;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const bad = [];
  for (const [w, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on('response', (r) => { if (r.url().includes('/api/global-ri/') && r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
    page.on('pageerror', (e) => bad.push(`pageerror ${String(e.message).slice(0, 200)}`));
    await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.fill('input[type=email], input[name=email]', 'rr5-author@example.test');
    await page.fill('input[type=password]', fs.readFileSync(PW_FILE, 'utf8').trim());
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(6000);

    // Opened by a link, the shell knows the project's id alone: no guideline is chosen for the person.
    let card = await openSpecs(page, DRUG);
    console.info(`${w} opened by link:`, (await card.innerText()).replace(/\s+/g, ' ').slice(0, 260));
    await page.screenshot({ path: `${OUT}/${w}-1-opened-by-link-none-chosen.png` });
    await card.getByRole('button', { name: 'Small molecule (ICH Q6A)' }).click();
    await card.getByRole('list', { name: 'In every specification' }).waitFor({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${w}-2-small-molecule-q6a.png` });
    await card.getByRole('button', { name: 'Solid oral' }).click();
    await card.getByRole('list', { name: 'Also for a solid oral product' }).waitFor({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    console.info(`${w} solid oral:`, (await card.innerText()).replace(/\s+/g, ' ').slice(0, 420));
    await page.screenshot({ path: `${OUT}/${w}-3-solid-oral.png` });

    card = await openSpecs(page, BIO);
    await card.getByRole('button', { name: 'Biologic (ICH Q6B)' }).click();
    await card.getByRole('list', { name: 'In every specification' }).waitFor({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    console.info(`${w} biologic:`, (await card.innerText()).replace(/\s+/g, ' ').slice(0, 420));
    await page.screenshot({ path: `${OUT}/${w}-4-biologic-q6b.png` });
    await page.close();
  }
  await browser.close();
  console.info(bad.length ? `FAILED READS:\n${bad.join('\n')}` : 'no failed read and no page error');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 1200)); process.exit(1); });
