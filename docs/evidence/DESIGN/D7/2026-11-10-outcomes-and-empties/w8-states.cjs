// Walk 8: outcomes are toasts and empty lines are the shared quiet empty state (C3), on SOP, Change control and CAPA.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function states(page, label) {
  const f = await page.evaluate(() => ({
    empties: [...document.querySelectorAll('[data-work-area] .c2c-empty-state')].map((e) => ({
      text: e.textContent.trim(), align: window.getComputedStyle(e).textAlign,
    })),
    ownEmpty: document.querySelectorAll('[data-work-area] .qms-empty, [data-work-area] .qcc-detail-empty').length,
    headsOverNothing: [...document.querySelectorAll('.qms-table')].filter((t) => !t.querySelector('.qms-row')).length,
    docScroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
  }));
  log.steps.push({ name: label, ...f });
}

run('w8-states', async (browser) => {
  for (const width of [1440, 390]) {
    const { ctx, page } = await signIn(browser, 'author', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.locator('.qms-row').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await states(page, `sop-${width}`);
    if (width === 1440) await shot(page, 'w8-sop-1440', true);
    await page.getByRole('tab', { name: 'CAPA' }).click();
    await page.waitForTimeout(2000);
    await states(page, `capa-${width}`);
    if (width === 1440) await shot(page, 'w8-capa-1440', false);
    await page.getByRole('tab', { name: 'Change control' }).click();
    await page.getByRole('heading', { name: 'Change control log' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await states(page, `change-${width}`);
    if (width === 1440) {
      await page.getByRole('button', { name: 'Raise change request' }).click();
      const d = page.getByRole('dialog', { name: /Raise change request/ });
      await d.waitFor({ timeout: 15000 });
      const n = `CC-QS-${String(Date.now()).slice(-5)}`;
      await d.getByLabel(/Change number/).fill(n);
      await d.getByLabel(/^Title/).fill('Walk: toast after a raised change');
      await d.getByLabel(/Reason for the change/).fill('Walk C3: the outcome is a toast, and the log stays on screen.');
      await d.getByRole('button', { name: /Raise change/ }).click();
      const toast = page.locator('[role=status], [role=alert]').filter({ hasText: n });
      await toast.first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      log.steps.push({ name: 'raise-toast', text: (await toast.first().textContent().catch(() => null)), rowShown: await page.getByText(n).count(),
        figures: await page.locator('[data-testid="change-figures"]').textContent().catch(() => null),
        rows: await page.locator('.qms-row').count() });
      await shot(page, 'w8-change-toast-1440', false);
    }
    await ctx.close();
  }
});
