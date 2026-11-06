const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  // save the pending tracked edit with a reason if dirty
  if (await p.getByPlaceholder(/Why this changed/).count()) {
    await p.getByPlaceholder(/Why this changed/).fill('J3 walk: tracked sentence proposed');
    await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(2000);
  }
  await p.getByRole('button', { name: 'Document', exact: true }).click();
  await p.waitForTimeout(2500);
  await c.shot(p, 'x-14-document-view.png');
  console.info('DOCVIEW', (await p.locator('main').innerText()).slice(0, 1500));
  // download menu
  const dl = p.getByRole('button', { name: /Download|Export/i }).first();
  console.info('dl count', await p.getByRole('button', { name: /Download|Export/i }).count());
  await dl.click(); await p.waitForTimeout(800);
  await c.shot(p, 'x-15-download-menu.png');
  console.info('MENU', await p.getByRole('menu').allInnerTexts().catch(()=>[]));
  const items = p.getByRole('menuitem');
  const n = await items.count();
  for (let i = 0; i < n; i++) console.info('item', await items.nth(i).innerText());
  if (n) {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }).catch(() => null), items.first().click()]);
    console.info('download', d && d.suggestedFilename(), d && await d.path());
    await p.waitForTimeout(1500); await c.shot(p, 'x-16-after-download.png');
  }
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Section', exact: true }).click(); await p.waitForTimeout(1500);
  await p.getByText('Build document or section').first().click(); await p.waitForTimeout(1500);
  await c.shot(p, 'x-17-build-open.png');
  console.info('BUILD', (await p.locator('main').innerText()).match(/Build document or section[\s\S]{0,1200}/)?.[0]);
  console.info(c.apiErrors);
  await b.close();
})();
