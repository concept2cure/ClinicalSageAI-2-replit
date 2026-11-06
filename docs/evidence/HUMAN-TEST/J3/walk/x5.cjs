const { c, openDoc } = require('./lib.cjs');
(async () => {
  const b = await c.chromium.launch();
  const p = await c.signIn(b, 'author');
  await openDoc(p, "C2C-101 Investigator's Brochure (J3 walk)", /Summary$/);
  const ed = p.locator('[contenteditable="true"]').first();
  await ed.click(); await p.keyboard.press('End');
  await p.keyboard.type(' C2C-101 is a fictional antibody against IL-23p19, written by the J3 walk.');
  await p.getByPlaceholder(/Why this changed/).fill('J3 walk: first draft of the summary');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(2500);
  await c.shot(p, 'x-09-saved.png');
  console.log((await p.locator('main').innerText()).match(/All changes saved|Saved[^\n]*|Unsaved[^\n]*|\d+ revisions[^\n]*/g));
  const tb = await p.evaluate(() => { const t = [...document.querySelectorAll('[role=toolbar]')].map(e => ({ label: e.getAttribute('aria-label'), sw: e.scrollWidth, cw: e.clientWidth, ov: getComputedStyle(e).overflowX, btns: [...e.querySelectorAll('button')].map(b=>b.textContent.trim()||b.getAttribute('aria-label')).join('|') })); return t; });
  console.log(JSON.stringify(tb, null, 1));
  console.log(c.apiErrors);
  await b.close();
})();
