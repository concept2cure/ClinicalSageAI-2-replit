// Walk 38: at 1440, 1280, 1024 and 390, in every Quality register: is any fact of a record outside its box before the
// table is scrolled, and are the record's actions in view? (After w37: the actions are the line under the facts.)
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const WIDTHS = (process.env.WIDTHS || '1440,1280,1024,390').split(',').map(Number);

const measure = (page) => page.evaluate(() => {
  const area = document.querySelector('[data-work-area]');
  const vw = window.innerWidth;
  return [...area.querySelectorAll('.reg-tbl.qms-reg')].map((table) => {
    const scroller = table.parentElement;
    const box = scroller.getBoundingClientRect();
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    let factsOutside = 0, actsOutside = 0; const sample = [];
    table.querySelectorAll(':scope > tbody').forEach((body) => {
      const facts = body.querySelector(':scope > tr');
      let out = false;
      [...facts.children].forEach((td, i) => {
        const range = document.createRange(); range.selectNodeContents(td);
        const cr = range.getBoundingClientRect();
        if (cr.width > 0 && cr.right > box.right + 1) { out = true; if (sample.length < 2) sample.push({ col: heads[i], text: td.textContent.trim().slice(0, 24), past: Math.round(cr.right - box.right) }); }
      });
      if (out) factsOutside += 1;
      const acts = body.querySelector(':scope > tr.qms-row-acts-tr .qms-rowacts');
      if (acts) for (const b of acts.querySelectorAll('button')) { const r = b.getBoundingClientRect(); if (r.left < -1 || r.right > vw + 1) { actsOutside += 1; break; } }
    });
    return { name: (table.closest('.pj-sec')?.querySelector('h2')?.textContent || '').trim(), heads: heads.length, hasActionsHead: heads.includes('Actions'),
      tableWidth: Math.round(table.scrollWidth), boxWidth: Math.round(scroller.clientWidth), scrolls: table.scrollWidth > scroller.clientWidth + 1,
      rows: table.querySelectorAll(':scope > tbody').length, factsOutside, actsOutside, sample };
  });
});

run('w38-facts-and-actions', async (browser) => {
  for (const width of WIDTHS) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    for (const tab of await page.getByRole('tab').allTextContents()) {
      const t = page.getByRole('tab', { name: tab, exact: true });
      await t.scrollIntoViewIfNeeded(); await t.click(); await page.waitForTimeout(1500);
      log.steps.push({ name: `${tab} @${width}`, pageScrolls: await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1), tables: await measure(page) });
      if (['SOP register', 'Change control', 'Suppliers'].includes(tab)) await shot(page, `w38-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}-${width}`, false);
    }
    await ctx.close();
  }
});
