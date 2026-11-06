const c = require('../common.cjs');
const prog = '258ad4a3-386f-4ff2-aa76-fb10228b27db';
async function openDoc(p, title, section, program = prog) {
  await p.goto(`${c.BASE}/concept2cure/document-authoring?program=${program}`, { waitUntil: 'networkidle' });
  const t = p.getByText(title, { exact: false }).first();
  await t.waitFor({ timeout: 60000 });
  await t.click();
  await p.waitForTimeout(2000);
  if (section) {
    try { await p.getByRole('button', { name: section }).first().click({ timeout: 20000 }); }
    catch (e) { await c.shot(p, 'x-fail-open.png'); throw e; }
    await p.waitForTimeout(1200);
  }
}
module.exports = { c, prog, openDoc };
