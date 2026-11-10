// Walk 18: the quality records registers as D0's table, each row's next step and More (C11).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

const TABS = ['CAPA', 'Deviations', 'Nonconformances', 'Suppliers', 'Internal audits', 'Management reviews'];

run('w18-records', async (browser) => {
  for (const width of [1440, 390]) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    // The walk's project is open (its CAPA belongs to it), opened the way a link opens it.
    await page.goto(`${BASE}/concept2cure/quality?program=5d669ca3-055f-48b1-9c34-364eb33ecb95`, { waitUntil: 'networkidle' });
    for (const tab of TABS) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(1800);
      const f = await page.evaluate(() => {
        const area = document.querySelector('[data-work-area]');
        const t = area.querySelector('table.reg-tbl.qms-reg');
        const empty = area.querySelector('.c2c-empty-state');
        if (!t) return { table: false, empty: empty ? empty.textContent.trim() : null };
        const first = t.querySelector('tbody.qms-rec > tr');
        const acts = first ? first.querySelector('.qms-rowacts') : null;
        const r = acts ? acts.getBoundingClientRect() : null;
        return {
          table: true,
          heads: [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim()),
          rows: t.querySelectorAll('tbody.qms-rec').length,
          rowHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
          next: acts ? [...acts.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()) : [],
          actionsInView: r ? r.right <= t.getBoundingClientRect().right + 1 : null,
          chips: [...t.querySelectorAll('.rd-chip')].slice(0, 4).map((c) => `${c.className}:${c.textContent.trim()}`),
          old: area.querySelectorAll('.qms-row, .qms-thead, .qms-pill, .qms-tag, .qms-table').length,
          tableScroll: t.scrollWidth - t.clientWidth,
          docScroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
        };
      });
      log.steps.push({ name: `${tab}-${width}`, ...f });
      if (f.table && f.rows && (tab === 'CAPA' || tab === 'Deviations' || tab === 'Suppliers')) {
        const body = page.locator('tbody.qms-rec').first();
        await body.getByRole('button', { name: /^More actions for/ }).click();
        await page.waitForTimeout(300);
        log.steps.push({ name: `${tab}-${width}-more`, group: await body.getByRole('group').textContent() });
        await shot(page, `w18-${tab.replace(/ /g, '-').toLowerCase()}-${width}`, false);
      }
    }
    await ctx.close();
  }
});
