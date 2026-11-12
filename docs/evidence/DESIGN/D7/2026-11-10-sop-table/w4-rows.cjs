// Walk 4: a register row is one line, its next step and "More" (D7-B item 6), as the author and the approver.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function rowFacts(page, label) {
  const facts = await page.evaluate(() => {
    const tr = document.querySelector('tbody.qms-doc > tr');
    const row = document.querySelector('tbody.qms-doc');
    if (!row) return null;
    const se = document.scrollingElement;
    return {
      height: Math.round((tr || row).getBoundingClientRect().height),
      buttons: [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
      docScroll: se.scrollWidth - se.clientWidth,
      tableScroll: (() => { const t = document.querySelector('table.qms-reg'); return t ? t.scrollWidth - t.clientWidth : null; })(),
      moreVisible: (() => { const t = document.querySelector('table.qms-reg'); const m = row.querySelector('[aria-label^="More actions"]');
        if (!t || !m) return null; const a = t.getBoundingClientRect(), b = m.getBoundingClientRect(); return b.right <= a.right && b.left >= a.left; })(),
    };
  });
  log.steps.push({ name: label, ...facts });
}

run('w4-rows', async (browser) => {
  for (const who of ['author', 'approver']) {
    for (const width of [1440, 390]) {
      const tag = `${who}-${width}`;
      const { ctx, page } = await signIn(browser, who, width);
      await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
      await page.locator('tbody.qms-doc').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      await rowFacts(page, `closed-${tag}`);
      await shot(page, `w4-row-${tag}`, false);
      const more = page.getByRole('button', { name: /^More actions for / }).first();
      await more.scrollIntoViewIfNeeded();
      await more.click();
      await page.waitForTimeout(400);
      await rowFacts(page, `open-${tag}`);
      await shot(page, `w4-row-more-${tag}`, false);
      if (who === 'author' && width === 1440) {
        await page.getByRole('group', { name: /^Actions for / }).getByRole('button', { name: /View version history/ }).click();
        await page.getByRole('dialog').first().waitFor({ timeout: 20000 });
        log.steps.push({ name: 'history-dialog', title: (await page.getByRole('dialog').first().getAttribute('aria-label')) || '' });
        await shot(page, `w4-history-${tag}`, false);
      }
      await ctx.close();
    }
  }
});
