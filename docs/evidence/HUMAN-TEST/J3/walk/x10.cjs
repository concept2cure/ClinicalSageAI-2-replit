const { c, openDoc, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Introduction/);
  await p.getByText('Build document or section').first().click(); await p.waitForTimeout(1500);
  const panel = p.locator('details', { has: p.getByText('Build document or section') }).first();
  const sel = panel.locator('select').first();
  await sel.selectOption({ label: "GLOBAL · Investigator's Brochure (IB)" }).catch(e => console.log('sel', e.message.slice(0,200)));
  const tgt = panel.locator('select').nth(1);
  console.log('targets', await tgt.evaluate(e => [...e.options].map(o=>o.textContent).slice(0,8)).catch(()=>null));
  await panel.getByText('Draft empty eligible sections with AnA').click();
  await panel.getByPlaceholder(/Why sections are being assembled/).fill('J3 walk: build the IB with AnA');
  await p.waitForTimeout(500);
  const btns = await panel.getByRole('button').allInnerTexts(); console.log('btns', btns);
  await c.shot(p, 'x-18-build-ready.png');
  console.log('build title', await panel.getByRole('button', { name: 'Build document' }).getAttribute('title'));
  await panel.getByRole('button', { name: 'Preview build' }).click(); await p.waitForTimeout(8000);
  await c.shot(p, 'j3-f1-build-preview.png');
  console.log('PREVIEW', (await panel.innerText()).slice(-1800));
  const go = panel.getByRole('button', { name: 'Build document' });
  console.log('enabled', await go.isEnabled());
  if (await go.isEnabled()) { await go.click(); await p.waitForTimeout(15000); }
  await c.shot(p, 'j3-f1-build-after-fix.png');
  console.log('RESULT', (await panel.innerText()).slice(-1500));
  console.log(c.apiErrors);
  await b.close();
})();
