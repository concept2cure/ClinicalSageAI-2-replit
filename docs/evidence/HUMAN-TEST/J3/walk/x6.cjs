const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary$/);
  const ed = p.locator('[contenteditable="true"]').first();
  // select a word by double-click
  await ed.getByText(/fictional humanised/).first().dblclick().catch(async()=>{ await ed.click(); });
  const cbtn = p.locator('.rse-ribbon button', { hasText: /^Comment$/ });
  await cbtn.scrollIntoViewIfNeeded(); await cbtn.click();
  await p.waitForTimeout(1200);
  await c.shot(p, 'x-10-comment-open.png');
  console.info('after comment click:', (await p.locator('body').innerText()).match(/[^\n]*[Cc]omment[^\n]*/g)?.slice(0,15));
  console.info(c.apiErrors);
  await b.close();
})();
