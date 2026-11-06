const { c, openDoc } = require('./lib.cjs');
const prog = '1078548e-39d6-4132-84d7-3cbeb64890d0';
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, 'NeuroPanel-Dx 510(k) Summary (J3 walk)', /Device Description/, prog);
  await p.getByText('Build document or section').first().click(); await p.waitForTimeout(1500);
  const panel = p.locator('details', { has: p.getByText('Build document or section') }).first();
  await panel.locator('select').first().selectOption({ label: 'US · 510(k) Summary' });
  await panel.locator('select').nth(1).selectOption({ label: '4 Device Description' }).catch(e => console.info('tgt', e.message.slice(0,120)));
  await panel.getByText('Draft empty eligible sections with AnA').click();
  await panel.getByPlaceholder(/Why sections are being assembled/).fill('J3 walk: draft the device description with AnA');
  await panel.getByRole('button', { name: 'Preview build' }).click(); await p.waitForTimeout(6000);
  console.info('PREVIEW', (await panel.innerText()).slice(-1500));
  await c.shot(p, 'x-44-510k-preview.png');
  const go = panel.getByRole('button', { name: /^Build (document|section)$/ });
  console.info('enabled', await go.isEnabled());
  if (await go.isEnabled()) { await go.click(); await p.waitForTimeout(20000); }
  await c.shot(p, 'x-45-510k-build-result.png');
  console.info('RESULT', (await panel.innerText()).slice(-1500));
  console.info(c.apiErrors);
  await b.close();
})();
