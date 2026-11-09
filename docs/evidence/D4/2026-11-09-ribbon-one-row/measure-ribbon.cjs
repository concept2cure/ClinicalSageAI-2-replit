// Measures row 1 of the real ribbon at a column width and a viewport, and saves a screenshot.
const { chromium } = require('playwright');
const [, , label, outDir] = process.argv;
(async () => {
  const browser = await chromium.launch();
  const cases = [
    { name: '1440-col816', viewport: { width: 1440, height: 900 }, q: '?w=816' },
    { name: '1440-col720', viewport: { width: 1440, height: 900 }, q: '?w=720' },
    { name: '390', viewport: { width: 390, height: 844 }, q: '' },
    { name: '1440-col816-dark', viewport: { width: 1440, height: 900 }, q: '?w=816&dark=1' },
  ];
  const out = [];
  for (const c of cases) {
    const page = await browser.newPage({ viewport: c.viewport, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:5333/ribbon-probe.html${c.q}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.rse-ribbon', { timeout: 30000 });
    const m = await page.evaluate(() => {
      const r = document.querySelector('.rse-ribbon:not(.rse-ribbon-more)');
      const more = document.querySelector('.rse-ribbon-more');
      const end = r.querySelector('.rse-ribbon-end');
      const box = r.getBoundingClientRect();
      const track = r.querySelector('.rse-track');
      const comment = r.querySelector('[data-testid="rse-rb-comment-on-the-selection"]');
      const vis = (el) => !!el && el.getBoundingClientRect().right <= box.right + 0.5 && el.getBoundingClientRect().width > 0;
      return {
        clientWidth: r.clientWidth, scrollWidth: r.scrollWidth, overflows: r.scrollWidth > r.clientWidth,
        offsetHeight: r.offsetHeight,
        commentInView: vis(comment), trackInView: vis(track),
        moreRowShown: !!more && getComputedStyle(more).display !== 'none',
        endGroup: !!end,
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    await page.screenshot({ path: `${outDir}/${label}-${c.name}.png`, clip: { x: 0, y: 0, width: Math.min(c.viewport.width, 900), height: 160 } });
    out.push({ case: c.name, ...m });
    await page.close();
  }
  // Opening More formatting shows row 2 (after only).
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5333/ribbon-probe.html?w=816', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rse-ribbon');
  const toggle = await page.$('[data-testid="rse-rb-more-formatting"]');
  if (toggle) {
    await toggle.click();
    const shown = await page.evaluate(() => { const m = document.querySelector('.rse-ribbon-more'); return !!m && getComputedStyle(m).display !== 'none' && !!m.querySelector('[data-testid="rse-rb-superscript"]'); });
    await page.screenshot({ path: `${outDir}/${label}-1440-more-open.png`, clip: { x: 0, y: 0, width: 900, height: 200 } });
    out.push({ case: 'more-formatting-opened', rowTwoShownWithSuperscript: shown });
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
