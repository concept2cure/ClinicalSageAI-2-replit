/* Tour 2: the headline project, LMN-201, as the Lumen lead: its page, each journey stage, each work area and its
   tabs, the rail's places in its context, and its documents. */
const { open, stop, rail, fs } = require('./tour-lib.cjs');
const OUT = process.argv[2];
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(process.env.WHO || null);
  const { page } = w;
  const home = async () => {
    await rail(page, 'Projects').click(); await page.waitForTimeout(1500);
    await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
    await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
  };
  const tabsOf = () => page.evaluate(() => [...document.querySelectorAll('main [role="tab"]')].filter((t) => t.getBoundingClientRect().height > 0).map((t) => t.textContent.trim()).slice(0, 16));
  const withTabs = async (prefix) => {
    const tabs = await tabsOf();
    for (const [i, t] of tabs.entries()) {
      if (i === 0) continue;
      await stop(w, OUT, `${prefix}--${slug(t)}`, async () => { await page.locator('main [role="tab"]', { hasText: t }).first().click(); }, 2500);
    }
  };
  await stop(w, OUT, '01-project', home, 3000);
  for (const [i, stage] of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond'].entries()) {
    await stop(w, OUT, `02-journey-${i + 1}-${slug(stage)}`, async () => {
      await page.locator('main button', { hasText: new RegExp(`^\\s*${stage}\\s*$`) }).first().click();
      await page.waitForTimeout(1500);
      await page.locator('main button', { hasText: new RegExp(`^\\s*${stage}\\s*$`) }).first().scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 380);
    }, 2500);
  }
  let n = 3;
  for (const area of ['Study & Protocol Design', 'Biostatistics', 'CMC / Module 3', 'Risk-based monitoring', 'Reports']) {
    const prefix = `${String(n++).padStart(2, '0')}-area-${slug(area)}`;
    await stop(w, OUT, prefix, async () => {
      await home();
      const b = page.locator('main button', { hasText: new RegExp(`^\\s*${area.replace(/[/&]/g, '\\$&')}\\s*$`) }).first();
      await b.scrollIntoViewIfNeeded(); await b.click();
    }, 4000);
    await withTabs(prefix);
  }
  for (const place of ['Vault', 'Communication', 'Submission Center', 'Tasks']) {
    const prefix = `${String(n++).padStart(2, '0')}-place-${slug(place)}`;
    await stop(w, OUT, prefix, async () => { await home(); await rail(page, place).click(); }, 6000);
    await withTabs(prefix);
  }
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(w.results, null, 1));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 400)); process.exit(1); });
