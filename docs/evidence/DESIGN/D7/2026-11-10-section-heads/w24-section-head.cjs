// Walk 24: each register's sentence is the line under its section head (C18a). The head keeps the title and its
// actions on one row at 1440 and 1280; at 390 they wrap by D0's phone rule.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function head(page, label) {
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const sec = document.querySelector('[data-work-area] .pj-sec');
    const h = sec.querySelector('.pj-sec-h');
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    const line = h.nextElementSibling;
    return {
      title: top(h.querySelector('h2')), titleLines: Math.round(h.querySelector('h2').getBoundingClientRect().height / 22),
      actions: [...h.querySelectorAll('.pj-sec-acts > *')].map((e) => `${(e.textContent || '').trim().slice(0, 30)}@${top(e)}`),
      sentence: line && line.classList.contains('sec-sub') ? `${line.tagName}@${top(line)}: ${line.textContent.slice(0, 90)}` : null,
      pageScroll: document.documentElement.scrollWidth > window.innerWidth,
      dates: [...sec.querySelectorAll('.qms-when')].slice(0, 3).map((e) => `${e.textContent.trim()}:${Math.round(e.getBoundingClientRect().height)}px`),
    };
  });
  log.steps.push({ name: label, ...m });
}

run('w24-section-head', async (browser) => {
  for (const w of [1440, 1280, 390]) {
    const { ctx, page } = await signIn(browser, 'approver', w);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await head(page, `sop-${w}`);
    if (w !== 1280) await shot(page, `w24-sop-${w}`, false);
    for (const tab of ['Change control', 'CAPA']) {
      await page.getByRole('tab', { name: tab }).click();
      await head(page, `${tab}-${w}`);
    }
    await ctx.close();
  }
});
