// Walk 37: at a given width, does a register's pinned actions column cover the facts beside it? For each tab: the
// table's own width against its box, and each row's cells whose content runs under the actions cell.
const { run, signIn, log, BASE } = require('./lib.cjs');
const WIDTHS = (process.env.WIDTHS || '1440,1280,1024').split(',').map(Number);

const measure = (page) => page.evaluate(() => {
  const area = document.querySelector('[data-work-area]');
  return [...area.querySelectorAll('.reg-tbl.qms-reg')].map((table) => {
    const scroller = [table, table.parentElement].find((el) => /auto|scroll/.test(window.getComputedStyle(el).overflowX)) || table;
    const covered = [];
    const heads = [...table.querySelectorAll('thead th')];
    const actHead = heads[heads.length - 1].getBoundingClientRect();
    heads.slice(0, -1).forEach((th) => {
      const r = th.getBoundingClientRect();
      if (r.right > actHead.left + 1 && th.textContent.trim()) covered.push({ head: th.textContent.trim(), by: Math.round(r.right - actHead.left) });
    });
    let rowsCovered = 0; const sample = [];
    table.querySelectorAll('tbody > tr:first-child').forEach((tr) => {
      const cells = [...tr.children]; const act = cells[cells.length - 1];
      const acts = act.querySelector('.qms-rowacts');
      const left = (acts ? acts.getBoundingClientRect() : act.getBoundingClientRect()).left;
      let hit = false;
      cells.slice(0, -1).forEach((td, i) => {
        const range = document.createRange(); range.selectNodeContents(td);
        const cr = range.getBoundingClientRect();
        if (cr.width > 0 && cr.right > left + 1) { hit = true; if (sample.length < 3) sample.push({ col: heads[i] ? heads[i].textContent.trim() : i, text: td.textContent.trim().slice(0, 30), under: Math.round(cr.right - left) }); }
      });
      if (hit) rowsCovered += 1;
    });
    return { name: (table.closest('.pj-sec')?.querySelector('h2')?.textContent || '').trim(), tableWidth: Math.round(table.scrollWidth), boxWidth: Math.round(scroller.clientWidth),
      overflow: Math.round(table.scrollWidth - scroller.clientWidth), headsCovered: covered, rows: table.querySelectorAll('tbody').length, rowsCovered, sample };
  });
});

run('w37-covered-cells', async (browser) => {
  for (const width of WIDTHS) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    for (const tab of await page.getByRole('tab').allTextContents()) {
      const t = page.getByRole('tab', { name: tab, exact: true });
      await t.scrollIntoViewIfNeeded(); await t.click(); await page.waitForTimeout(1500);
      log.steps.push({ name: `${tab} @${width}`, tables: await measure(page) });
    }
    await ctx.close();
  }
});
