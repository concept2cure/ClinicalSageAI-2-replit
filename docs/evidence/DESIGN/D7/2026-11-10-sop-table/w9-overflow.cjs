// Which element pushes the page wider than a 390px viewport.
const { run, signIn, log, BASE } = require('./lib.cjs');
run('w9-overflow', async (browser) => {
  const { ctx, page } = await signIn(browser, 'author', 390);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.locator('tbody.qms-doc').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')].map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > vw + 1 && r.width > 0)
      .filter(({ el }) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = window.getComputedStyle(a).overflowX; if (o !== 'visible') return false; } return true; })
      .slice(0, 14)
      .map(({ el, r }) => ({ tag: el.tagName, cls: String(el.className).slice(0, 50), right: Math.round(r.right), w: Math.round(r.width),
        disp: window.getComputedStyle(el).display, ox: window.getComputedStyle(el).overflowX }));
  });
  log.steps.push({ name: 'wide', wide });
  const doc = await page.evaluate(() => {
    const se = document.scrollingElement;
    const scrollers = [...document.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(window.getComputedStyle(el).overflowX))
      .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth }));
    return { docSW: se.scrollWidth, docCW: se.clientWidth, bodySW: document.body.scrollWidth, scrollers };
  });
  log.steps.push({ name: 'doc', ...doc });
  await ctx.close();
});
