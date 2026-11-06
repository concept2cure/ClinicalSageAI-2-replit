const { c, prog } = require('./lib.cjs');
const ovf = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
(async () => {
  const b = await c.chromium.launch();
  const r = await c.signIn(b, 'reviewer', { width: 390, height: 844 });
  await r.goto(`${c.BASE}/concept2cure/review?program=${prog}`, { waitUntil: 'networkidle' }); await r.waitForTimeout(2000);
  await c.shot(r, 'x-62-390-review-board.png');
  console.log('board overflow', await ovf(r));
  await r.goto(`${c.BASE}/concept2cure/document-authoring?program=1078548e-39d6-4132-84d7-3cbeb64890d0`, { waitUntil: 'networkidle' }); await r.waitForTimeout(1500);
  await r.getByText('NeuroPanel-Dx 510(k) Summary (J3 walk)').first().click(); await r.waitForTimeout(2000);
  await r.getByRole('button', { name: /E-sign/ }).first().click(); await r.waitForTimeout(1500);
  await c.shot(r, 'x-63-390-esign.png');
  console.log('esign overflow', await ovf(r));
  const d = r.getByRole('dialog').last(); const box = await d.boundingBox(); console.log('dialog box', box);
  await b.close();
})();
