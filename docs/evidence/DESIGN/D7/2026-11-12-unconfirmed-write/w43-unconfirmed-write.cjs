// Walk 43: a Quality write whose connection is cut. The drawer says the server did not confirm it and to check
// before trying again; it shows neither the browser's "Failed to fetch" nor "Not recorded".
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

const drawerLine = async (page) => {
  const d = page.getByRole('dialog').last();
  await d.getByRole('status').waitFor({ timeout: 15000 });
  return { line: (await d.getByRole('status').textContent()).trim(), drawerStillOpen: await d.isVisible(),
    browserWords: /Failed to fetch|Load failed|NetworkError/.test(await d.textContent()) };
};

run('w43-unconfirmed-write', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // The connection drops for every write; reads still answer.
  await page.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort('connectionreset')));

  // A CAPA's move.
  await page.getByRole('tab', { name: 'CAPA', exact: true }).click();
  await page.waitForTimeout(1500);
  const capa = page.locator('tbody.qms-rec').filter({ has: page.getByRole('button', { name: 'Advance' }) }).first();
  await capa.getByRole('button', { name: 'Advance' }).click();
  let d = page.getByRole('dialog').last();
  const moveTo = d.getByLabel(/^Move to/);
  const options = (await moveTo.locator('option').evaluateAll((os) => os.map((o) => o.value))).filter(Boolean);
  await moveTo.selectOption(options[0]);
  await d.getByLabel(/Reason for this move/).fill('Walk 43: the connection is cut for this move.');
  await d.getByRole('button', { name: 'Record the move' }).click();
  log.steps.push({ name: 'capa-move', movedTo: options[0], ...(await drawerLine(page)) });
  await shot(page, 'w43-capa-move-1440', false);
  await d.getByRole('button', { name: /Cancel|Close/ }).first().click();

  // A change's move.
  await page.getByRole('tab', { name: 'Change control', exact: true }).click();
  await page.waitForTimeout(1500);
  const change = page.locator('tbody.qcc-change').filter({ has: page.getByRole('button', { name: 'Advance' }) }).first();
  await change.getByRole('button', { name: 'Advance' }).click();
  d = page.getByRole('dialog').last();
  const to = d.getByRole('combobox').first();
  const states = (await to.locator('option').evaluateAll((os) => os.map((o) => o.value))).filter(Boolean);
  await to.selectOption(states[0]);
  await d.getByRole('textbox').last().fill('Walk 43: the connection is cut for this move.');
  await d.locator('.de-f .de-btn.primary').click();
  log.steps.push({ name: 'change-move', movedTo: states[0], ...(await drawerLine(page)) });
  await shot(page, 'w43-change-move-1440', false);
  await ctx.close();
});
