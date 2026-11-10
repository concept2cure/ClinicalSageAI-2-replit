// Walk 10: the SOP register as D0's table, in dark, at 1440 and 390 (C6).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

run('w10-dark', async (browser) => {
  for (const width of [1440, 390]) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    await page.evaluate(() => {
      const readPrefs = () => {
        try { return JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}') || {}; } catch (e) { return { failedRead: String(e) }; }
      };
      const prefs = readPrefs();
      localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: true }));
    });
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.locator('tbody.qms-doc').first().waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.waitForTimeout(600);
    const f = await page.evaluate(() => {
      const t = document.querySelector('table.reg-tbl.qms-reg');
      const cell = t.querySelector('tbody.qms-doc td');
      const more = t.querySelector('tbody[data-more] > tr > td');
      return {
        dark: document.body.getAttribute('data-theme'),
        cellColor: window.getComputedStyle(cell).color,
        moreBg: more ? window.getComputedStyle(more).backgroundColor : null,
        headColor: window.getComputedStyle(t.querySelector('th')).color,
        docScroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      };
    });
    log.steps.push({ name: `dark-${width}`, ...f });
    await shot(page, `w10-dark-${width}`, width === 390);
    await ctx.close();
  }
});
