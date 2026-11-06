const { c, openDoc } = require('./lib.cjs');
const prog = '1078548e-39d6-4132-84d7-3cbeb64890d0';
const T = 'NeuroPanel-Dx 510(k) Summary (J3 walk)';
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, T, /Device Description/, prog);
  await p.getByRole('button', { name: 'More document actions' }).click(); await p.waitForTimeout(500);
  await p.getByRole('menuitem', { name: /Review tasks/ }).click(); await p.waitForTimeout(2500);
  await c.shot(p, 'x-58-author-review-tasks.png');
  const panel = await p.locator('aside, [role=complementary], [role=dialog]').last().innerText().catch(() => '');
  console.log('PANEL', panel.slice(0, 1500));
  // bell
  await p.locator('header button, [aria-label*="otification"]').last().click().catch(()=>{}); await p.waitForTimeout(1500);
  console.log('BELL', (await p.locator('body').innerText()).match(/[^\n]*(hanges requested|requested changes|Changes requested)[^\n]*/g));
  await c.shot(p, 'x-59-bell.png');
  await b.close();
})();
