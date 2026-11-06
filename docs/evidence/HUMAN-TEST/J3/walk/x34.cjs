const { c, prog } = require('./lib.cjs');
const ovf = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth,
  wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && window.getComputedStyle(e).position !== 'fixed'; })
    .slice(0, 8).map(e => `${e.tagName}.${(e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0,40)} r=${Math.round(e.getBoundingClientRect().right)}`) }));
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author', { width: 390, height: 844 });
  await p.goto(`${c.BASE}/concept2cure/document-authoring?program=${prog}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await c.shot(p, 'x-60-390-editor-landing.png');
  console.info('landing', JSON.stringify(await ovf(p)));
  const t = p.getByText("C2C-101 Investigator's Brochure (J3 walk)").first();
  if (await t.isVisible().catch(() => false)) { await t.click(); await p.waitForTimeout(2000); }
  await c.shot(p, 'x-61-390-editor-doc.png');
  console.info('doc', JSON.stringify(await ovf(p)));
  console.info('visible buttons', (await p.getByRole('button').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top < 844; }).map(b => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 25)))).slice(0, 40));
  await b.close();
})();
