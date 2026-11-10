// Walk 20: past the CAPA read's cap (100 most recently updated), the register and the CAPA column say so (C12).
// Setup: CAPAs raised through the CAPA route the register's own form posts to, until the project holds over 100.
const { run, signIn, shot, api, log, BASE } = require('./lib.cjs');
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';

run('w20-capa-cap', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  const before = await api(page, 'GET', '/api/capa-mdr/capa?limit=500');
  const have = (before.body && before.body.rows ? before.body.rows.length : 0);
  let made = 0;
  for (let i = have; i < 101; i += 1) {
    const r = await api(page, 'POST', '/api/capa-mdr/capa', { programId: PROGRAM, title: `Walk C12: capped read ${i + 1}`, type: 'corrective', source: 'trend_signal', riskLevel: 'low' });
    if (r.status < 300) made += 1; else { log.steps.push({ name: 'raise-refused', status: r.status, body: JSON.stringify(r.body).slice(0, 200) }); break; }
  }
  const all = await api(page, 'GET', '/api/capa-mdr/capa?limit=500');
  log.steps.push({ name: 'setup', had: have, raised: made, total: all.body && all.body.rows ? all.body.rows.length : null });
  await page.reload({ waitUntil: 'networkidle' });
  for (const tab of ['CAPA', 'Nonconformances', 'Deviations']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(2500);
    const f = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="qms-record-figures"]');
      const capaCells = [...document.querySelectorAll('tbody.qms-rec')].map((b) => {
        const heads = [...document.querySelectorAll('table.qms-reg thead th')].map((h) => h.textContent.trim());
        const i = heads.indexOf('CAPA');
        return i >= 0 ? b.querySelector('tr').cells[i].textContent.trim() : null;
      });
      return { line: line ? line.textContent : null, rows: document.querySelectorAll('tbody.qms-rec').length, capaCells: capaCells.slice(0, 3) };
    });
    log.steps.push({ name: tab, ...f });
    if (tab !== 'Deviations') await shot(page, `w20-${tab.toLowerCase()}-1440`, false);
  }
  await ctx.close();
});
