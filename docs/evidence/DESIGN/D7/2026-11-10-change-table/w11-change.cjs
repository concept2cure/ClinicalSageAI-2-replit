// Walk 11: the change log as D0's table, each row's next step and More, its linked records as its own row (C8).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function measure(page, label) {
  const f = await page.evaluate(() => {
    const t = document.querySelector('[data-work-area] table.reg-tbl.qms-reg');
    if (!t) return { table: false };
    const first = t.querySelector('tbody.qcc-change > tr');
    return {
      table: true,
      heads: [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim()),
      bodies: t.querySelectorAll('tbody.qcc-change').length,
      rowHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
      firstRowButtons: first ? [...first.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()) : [],
      oldClasses: document.querySelectorAll('[data-work-area] .qms-row, [data-work-area] .qcc-class, [data-work-area] .qms-chip').length,
      cellSize: first ? window.getComputedStyle(first.querySelector('td')).fontSize : null,
      tableScroll: t.scrollWidth - t.clientWidth,
      docScroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    };
  });
  log.steps.push({ name: label, ...f });
}

run('w11-change', async (browser) => {
  for (const [width, dark] of [[1440, false], [390, false], [1440, true]]) {
    const { ctx, page } = await signIn(browser, 'author', width);
    if (dark) {
      await page.evaluate(() => {
        const readPrefs = () => {
          try { return JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}') || {}; } catch (e) { return { failedRead: String(e) }; }
        };
        localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...readPrefs(), dark: true }));
      });
    }
    const tag = `${width}${dark ? '-dark' : ''}`;
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Change control' }).click();
    await page.locator('tbody.qcc-change').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await measure(page, `closed-${tag}`);
    await shot(page, `w11-log-${tag}`, width === 390);
    const first = page.locator('tbody.qcc-change').first();
    await first.getByRole('button', { name: /^More actions for/ }).click();
    await page.waitForTimeout(400);
    log.steps.push({ name: `more-${tag}`, group: await first.getByRole('group').textContent() });
    await first.locator('button.qms-num').click();
    await page.waitForTimeout(400);
    log.steps.push({ name: `detail-${tag}`, detail: await first.locator('.qcc-detail').textContent().catch(() => null) });
    await measure(page, `open-${tag}`);
    await shot(page, `w11-log-open-${tag}`, width === 390);
    await ctx.close();
  }
});
