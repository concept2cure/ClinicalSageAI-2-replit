/* Ask AnA from Home and from the project page, as the Lumen lead; record what comes back and any error. */
const { open, stop, rail, fs } = require('./tour-lib.cjs');
const OUT = process.argv[2];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(null); const { page } = w;
  await stop(w, OUT, 'ana-1-home-ask', async () => {
    await rail(page, 'Home').click(); await page.waitForTimeout(1500);
    const box = page.getByPlaceholder(/How can I help with your filing today/);
    await box.click(); await box.fill('What is the status of the LMN-201 clinical study report, and what should I do next?');
    await page.keyboard.press('Enter');
  }, 25000);
  console.info('HOME ANSWER:', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1200));
  await stop(w, OUT, 'ana-2-project-ask', async () => {
    await rail(page, 'Projects').click(); await page.waitForTimeout(1500);
    await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
    await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
    const box = page.getByPlaceholder(/How can I help with this project/);
    await box.click(); await box.fill('Summarise where this project stands for its IND.');
    await page.keyboard.press('Enter');
  }, 25000);
  console.info('PROJECT ANSWER:', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1200));
  fs.writeFileSync(`${OUT}/ana-results.json`, JSON.stringify(w.results, null, 1));
  console.info('API', JSON.stringify(w.net.slice(0, 10)), 'CONSOLE', JSON.stringify(w.cons.slice(0, 6)));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 500)); process.exit(1); });
