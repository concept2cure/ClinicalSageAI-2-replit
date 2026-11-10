// Walk 3: Quality on the work-area pattern (D7-B), at 1440 and 390, light and dark.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const se = document.scrollingElement;
    const scrollers = [...document.querySelectorAll('.page, .qms-page, main')].map((el) => ({ cls: el.className.slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth }));
    const rows = [...document.querySelectorAll('.qms-row')].map((r) => Math.round(r.getBoundingClientRect().height));
    const h1 = [...document.querySelectorAll('h1')].map((h) => h.textContent);
    const title = document.querySelector('[data-work-area="quality"] .ph-title');
    const tr = title ? title.getBoundingClientRect() : null;
    const upper = [...document.querySelectorAll('[data-work-area="quality"] *')].filter((el) => window.getComputedStyle(el).textTransform === 'uppercase' && el.textContent.trim()).map((el) => el.className || el.tagName).slice(0, 8);
    return {
      docScroll: se.scrollWidth - se.clientWidth, scrollers, rows, h1,
      titleHeight: tr ? Math.round(tr.height) : null,
      starters: [...document.querySelectorAll('[data-work-area="quality"] > .sp-starters .sp-starter')].map((b) => b.textContent),
      tabs: [...document.querySelectorAll('[data-work-area="quality"] [role=tablist] [role=tab]')].map((b) => b.textContent),
      figures: document.querySelector('[data-testid="qms-register-figures"]')?.textContent ?? null,
      coverage: document.querySelector('[data-testid="qms-coverage-figure"]')?.textContent ?? null,
      kpiTiles: document.querySelectorAll('.qms-kpi').length,
      typeCards: document.querySelectorAll('.qms-tpl-card').length,
      topbar: document.querySelectorAll('.qms-topbar').length,
      upper,
      h2: [...document.querySelectorAll('[data-work-area] h2')].map((h) => `${h.textContent}${h.parentElement && h.parentElement.classList.contains('pj-sec-h') ? '' : ' (NOT pj-sec-h)'}`),
      boxes: document.querySelectorAll('.qms-grid2, .qms-sec-head, .qms-train-fill').length,
      reviewFigure: document.querySelector('[data-testid="qms-review-figure"]')?.textContent ?? null,
      emptyLines: [...document.querySelectorAll('[data-work-area] .qms-empty')].map((e) => e.textContent),
    };
  });
  log.steps.push({ name: label, ...m });
}

run('w6-sop', async (browser) => {
  for (const dark of [false, true]) {
    for (const width of [1440, 390]) {
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      const { ctx, page } = await signIn(browser, 'author', width);
      await page.evaluate((d) => {
        const read = () => { try { return JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}'); } catch { return {}; } };
        const p = read();
        p.dark = d; localStorage.setItem('c2c-v2-prefs', JSON.stringify(p));
      }, dark);
      await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
      await page.locator('[data-work-area="quality"]').waitFor({ timeout: 60000 });
      await page.getByText('QS-SOP-001').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      await shot(page, `w6-sop-${tag}`, false);
      await shot(page, `w6-sop-${tag}-full`, true);
      await measure(page, `sop-${tag}`);
      if (width === 1440 && !dark) {
        for (const name of ['Change control', 'CAPA', 'Management reviews']) {
          await page.getByRole('tab', { name }).click();
          await page.waitForTimeout(1500);
          await shot(page, `w6-tab-${name.replace(/\W+/g, '-').toLowerCase()}-${tag}`, false);
          await measure(page, `tab-${name}-${tag}`);
        }
        await page.getByRole('tab', { name: 'SOP register' }).click();
        await page.waitForTimeout(800);
        await page.getByRole('region', { name: 'Controlled documents' }).getByRole('button', { name: 'New controlled document' }).click();
        const dialog = page.getByRole('dialog', { name: 'New controlled document' });
        await dialog.waitFor({ timeout: 20000 });
        const opts = await dialog.getByLabel('Template').locator('option').allTextContents();
        log.steps.push({ name: 'template-options', opts });
        const second = await dialog.getByLabel('Template').locator('option').nth(1).getAttribute('value');
        if (second) await dialog.getByLabel('Template').selectOption(second);
        await page.waitForTimeout(400);
        log.steps.push({ name: 'after-choose', title: await dialog.getByLabel('Title').inputValue(), type: await dialog.getByLabel('Document type').inputValue() });
        await shot(page, `w6-new-${tag}`, false);
      }
      if (width === 390 && !dark) {
        await page.getByRole('tab', { name: 'Change control' }).click();
        await page.waitForTimeout(1500);
        await shot(page, `w6-tab-change-control-${tag}`, false);
        await measure(page, `tab-change-${tag}`);
      }
      await ctx.close();
    }
  }
});
