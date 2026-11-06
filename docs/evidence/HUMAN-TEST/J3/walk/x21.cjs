const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  await p.getByRole('button', { name: /Place into filing/ }).first().click(); await p.waitForTimeout(2000);
  const d = p.getByRole('dialog').last();
  await c.shot(p, 'x-37-place.png');
  console.info('DIALOG', (await d.innerText()).slice(0, 3000));
  console.info(c.apiErrors);
  await b.close();
})();
