const { c, openDoc } = require('./lib.cjs');
const prog = '1078548e-39d6-4132-84d7-3cbeb64890d0';
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, 'NeuroPanel-Dx 510(k) Summary (J3 walk)', /Device Description/, prog);
  const ed = p.locator('[contenteditable="true"]').first();
  await ed.click();
  await p.keyboard.type('NeuroPanel-Dx is a fictional in vitro diagnostic panel. This description is written by the J3 walk for the human test.');
  await p.getByPlaceholder(/Why this changed/).fill('J3 walk: first device description');
  await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(2500);
  // authorship signature
  await p.getByRole('button', { name: /E-sign/ }).first().click(); await p.waitForTimeout(1200);
  const d = p.getByRole('dialog').last();
  await d.getByRole('radio', { name: 'Authorship' }).click();
  await d.getByLabel(/Reason for this action/).fill('J3 walk: I wrote this device description');
  await d.getByLabel(/Password/).fill('pass-word');
  await c.shot(p, 'x-46-authorship-filled.png');
  await d.getByRole('button', { name: 'Sign and commit' }).click(); await p.waitForTimeout(4000);
  await c.shot(p, 'x-47-authorship-after.png');
  console.log('AFTER', (await p.locator('body').innerText()).match(/[^\n]*(Signature applied|signature recorded|refus|Couldn|not )[^\n]*/g)?.slice(0, 10));
  console.log(c.apiErrors);
  await b.close();
})();
