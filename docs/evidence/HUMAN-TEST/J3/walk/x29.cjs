const { c, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await p.goto(`${c.BASE}/concept2cure/quality?program=${prog}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^SOP-\s*Standard operating procedure/ }).click(); await p.waitForTimeout(1500);
  const d = p.getByRole('dialog').last();
  await c.shot(p, 'x-52-new-sop.png');
  await d.getByLabel('Project').selectOption({ label: 'C2C-101 — [Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque psoriasis (IND)' });
  await d.getByLabel('Title').fill('SOP-J3 Electronic Signatures (J3 walk)');
  await d.getByLabel('Reason').fill('J3 walk: a controlled SOP written in the one editor');
  await d.getByRole('button', { name: 'Create and open' }).click();
  await p.waitForTimeout(6000); await p.waitForLoadState('networkidle');
  console.info(p.url());
  await c.shot(p, 'x-53-sop-created.png');
  console.info((await p.locator('body').innerText()).match(/[^\n]*(created|Created|refus|Couldn|SOP-J3)[^\n]*/g)?.slice(0, 10));
  console.info(c.apiErrors);
  await b.close();
})();
