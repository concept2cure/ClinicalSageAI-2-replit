const { run, signIn, log, BASE } = require('./lib.cjs');
run('probe-tabs', async (browser) => {
  for (const width of [1440, 1280, 1024]) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    log.steps.push({ width, ...(await page.evaluate(() => {
      const t = document.querySelector('[data-work-area] .tabs');
      const tabs = [...t.querySelectorAll('.tab')];
      const box = t.getBoundingClientRect();
      return { strip: Math.round(t.scrollWidth), box: Math.round(t.clientWidth), over: Math.round(t.scrollWidth - t.clientWidth),
        clipped: tabs.filter((b) => b.getBoundingClientRect().right > box.right + 1).map((b) => b.textContent.trim()),
        widths: tabs.map((b) => Math.round(b.getBoundingClientRect().width)) };
    })) });
    await page.screenshot({ path: require('path').join(require('./lib.cjs').SHOTS, 'probe-tabs-' + width + '.png'), clip: { x: 264, y: 60, width: Math.min(width - 264, 1176), height: 330 } }); await ctx.close();
  }
});
