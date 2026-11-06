const { c, openDoc, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  await p.getByRole('button', { name: /Place into filing/ }).first().click(); await p.waitForTimeout(2000);
  const d = p.getByRole('dialog').last();
  console.log('code prefill:', await d.getByLabel(/Section code/).inputValue());
  await c.shot(p, 'j3-f3-place-after.png');
  await d.getByLabel('Target submission').selectOption({ index: 1 });
  await p.waitForTimeout(2500);
  console.log('after target', (await d.innerText()).split('Target submission')[1]?.slice(0, 600));
  const seqSel = d.getByLabel(/Sequence/);
  if (await seqSel.count()) { const o = await seqSel.evaluate(e => [...e.options].map(o => o.textContent)); console.log('seqs', o); if (o.length > 1) await seqSel.selectOption({ index: 1 }); }
  await d.getByLabel(/Section code/).fill('1.14.4.1');
  await d.getByLabel(/^Reason for this placement/).fill('J3 walk: approved IB placed into sequence 0000');
  await p.waitForTimeout(800);
  await c.shot(p, 'x-55-place-filled.png');
  const btn = d.getByRole('button', { name: /Place leaf/ });
  console.log('place enabled', await btn.isEnabled(), await btn.getAttribute('title'));
  if (await btn.isEnabled()) { await btn.click(); await p.waitForTimeout(6000); }
  await c.shot(p, 'x-56-placed.png');
  console.log('RESULT', (await d.innerText().catch(() => '')).slice(-900));
  console.log(c.apiErrors);
  await b.close();
})();
