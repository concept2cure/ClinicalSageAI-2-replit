const { c, openDoc, prog } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  // suggestions
  const chip = p.locator('.rse-ribbon .rse-chip');
  console.log('chip', await chip.count() ? await chip.innerText() : 'none');
  if (await chip.count()) {
    await chip.click(); await p.waitForTimeout(800);
    const strip = p.getByRole('region', { name: 'Suggested edits' });
    console.log('STRIP', await strip.innerText());
    await strip.getByRole('button', { name: /Accept all/ }).click(); await p.waitForTimeout(2500);
    await c.shot(p, 'x-34-accept-suggestion.png');
    console.log('after accept', (await p.locator('body').innerText()).match(/[^\n]*(Why this changed|Unsaved|saved|refus|reason)[^\n]*/gi)?.slice(0, 8));
    if (await p.getByPlaceholder(/Why this changed/).count()) {
      await p.getByPlaceholder(/Why this changed/).fill('J3 walk: accept the tracked sentence');
      await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(2500);
    }
  }
  // comments rail
  await p.getByRole('button', { name: /comment/i }).filter({ hasText: /^\s*1\s*$/ }).first().click().catch(async () => {
    console.log('open rail by toolbar icon'); await p.locator('button[aria-label*="omment"]').first().click(); });
  await p.waitForTimeout(1500);
  await c.shot(p, 'x-35-comments-rail.png');
  const resolve = p.getByRole('button', { name: /^Resolve/ }).first();
  console.log('resolve count', await p.getByRole('button', { name: /^Resolve/ }).count());
  await resolve.click(); await p.waitForTimeout(800);
  await p.getByPlaceholder(/Reason for resolving/).fill('Reference added to the nonclinical section plan.');
  await p.getByRole('button', { name: 'Resolve', exact: true }).last().click(); await p.waitForTimeout(2500);
  await c.shot(p, 'x-36-resolve.png');
  const dlg = p.getByRole('dialog');
  console.log('resolve UI', (await p.locator('body').innerText()).match(/[^\n]*(Resolv|resolv)[^\n]*/g)?.slice(0, 10));
  console.log(c.apiErrors);
  await b.close();
})();
