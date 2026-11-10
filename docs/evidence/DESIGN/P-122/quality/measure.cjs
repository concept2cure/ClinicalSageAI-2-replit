const { chromium } = require('playwright');
const BASE = 'http://localhost:5263';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill('rr5-author@example.test');
  await page.locator('input[type=password]').fill(process.env.WALK_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });
  await page.goto(`${BASE}/concept2cure/quality?program=af5db78f-529b-45a2-a1f0-fede3f15181b`, { waitUntil: 'networkidle' });
  for (const tab of ['SOP register', 'Change control', 'CAPA', 'Deviations', 'Nonconformances', 'Suppliers', 'Internal audits', 'Management reviews']) {
    await page.getByRole('tab', { name: tab, exact: true }).click(); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const t = document.querySelector('.reg-tbl.qms-reg'); if (!t) return null;
      const box = t.closest(".qms-reg-scroll") || t.parentElement; const sec = box.getBoundingClientRect(); const r = t.getBoundingClientRect();
      const acts = [...t.querySelectorAll('.qms-rowacts')].map((a) => Math.round(a.getBoundingClientRect().right));
      return { pane: Math.round(sec.right), table: Math.round(r.right), maxActRight: Math.max(0, ...acts) };
    });
    console.info(tab, JSON.stringify(m));
  }
  await b.close();
})();
