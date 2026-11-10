/* Tour 1: every rail destination as the Lumen lead, and every tab on each, one level deep. */
const { open, stop, rail, fs } = require('./tour-lib.cjs');
const OUT = process.argv[2];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(process.env.WHO || null);
  const { page } = w;
  const DEST = ['Home', 'Projects', 'Tasks', 'Communication', 'Vault', 'Submission Center', 'CMC / Module 3', 'Biostatistics', 'Risk-based monitoring', 'Quality', 'Reporting & analytics'];
  let n = 0;
  for (const d of DEST) {
    const slug = d.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await stop(w, OUT, `${String(++n).padStart(2, '0')}-${slug}`, async () => { await rail(page, d).click(); });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('main [role="tab"]')].filter((t) => t.getBoundingClientRect().height > 0).map((t) => t.textContent.trim()).slice(0, 14));
    for (const [i, t] of tabs.entries()) {
      if (i === 0) continue;
      await stop(w, OUT, `${String(n).padStart(2, '0')}-${slug}--${t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`, async () => {
        await page.locator('main [role="tab"]', { hasText: t }).first().click();
      }, 2000);
    }
  }
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(w.results, null, 1));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 400)); process.exit(1); });
