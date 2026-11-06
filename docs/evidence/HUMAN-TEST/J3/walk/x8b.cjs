const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary/);
  const ed = p.locator('[contenteditable="true"]').first();
  // track changes
  await p.keyboard.press('Escape');
  const track = p.locator('.rse-track input');
  await track.scrollIntoViewIfNeeded(); await track.click(); await p.waitForTimeout(2500); console.log('checked', await track.isChecked(), await p.locator('.rse-actnotice, [role=status]').allInnerTexts().catch(()=>[]));
  await p.waitForTimeout(1500);
  await ed.click(); await p.keyboard.press('Control+End');
  await p.keyboard.type(' A tracked sentence added by the J3 walk.');
  await p.waitForTimeout(800);
  await c.shot(p, 'x-13-tracked.png');
  console.log('TRACK', (await p.locator('main').innerText()).match(/[^\n]*(Track|suggested edit)[^\n]*/g));
  console.log(c.apiErrors);
  await b.close();
})();
