const { c, openDoc, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'reviewer');
  await p.goto(`${c.BASE}/concept2cure/project-home?program=${prog}`, { waitUntil: 'networkidle' });
  await p.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Review/ }).click();
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /Review documents on the review board/ }).click().catch(async () => p.getByText('Review documents on the review board').click());
  await p.waitForTimeout(3000);
  console.log(p.url());
  await c.shot(p, 'x-27-board.png');
  console.log((await c.mainText(p)).slice(0, 2500));
  console.log(c.apiErrors);
  await b.close();
})();
