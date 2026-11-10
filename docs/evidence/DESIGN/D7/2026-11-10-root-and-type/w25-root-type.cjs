// Walk 25: Quality's root and type are the product's (C18). In dark and light, Quality's page shows the same
// background as another work area's; its body text is 14px; its record numbers keep their weight; its last own quiet
// button (the change log's link count) keeps its size.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

function facts() {
  const area = document.querySelector('[data-work-area]');
  const shown = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const bg = window.getComputedStyle(e).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return `${bg} (${e.className || e.tagName})`.slice(0, 80);
    }
    return null;
  };
  const cs = (sel) => { const e = document.querySelector(sel); return e ? window.getComputedStyle(e) : null; };
  const title = cs('table.reg-tbl.qms-reg td.qms-title');
  const num = cs('table.reg-tbl.qms-reg .qms-num');
  const shell = cs('.qms-shell');
  return {
    theme: document.body.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme'),
    background: area ? shown(area) : null,
    shellBackground: shell ? shell.backgroundColor : null,
    titleCell: title ? `${title.fontSize} ${title.color}` : null,
    number: num ? `${num.fontSize} ${num.fontWeight} ${num.fontFamily.split(',')[0]}` : null,
    lede: (() => { const p = cs('.ph-sub'); return p ? p.fontSize : null; })(),
  };
}

async function setDark(page, dark) {
  await page.evaluate((d) => {
    const readPrefs = () => {
      try { return JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}') || {}; } catch (e) { return { failedRead: String(e) }; }
    };
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...readPrefs(), dark: d }));
  }, dark);
}

run('w25-root-type', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  for (const dark of [true, false]) {
    await setDark(page, dark);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.locator('tbody.qms-doc').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    log.steps.push({ name: `quality-${dark ? 'dark' : 'light'}`, ...(await page.evaluate(facts)) });
    await shot(page, `w25-quality-${dark ? 'dark' : 'light'}-1440`, false);
    await page.getByRole('tab', { name: 'Change control' }).click();
    await page.waitForTimeout(1200);
    const link = page.locator('.qcc-linkcount').first();
    log.steps.push({ name: `change-${dark ? 'dark' : 'light'}`, linkCount: (await link.count()) ? await link.evaluate((e) => `${window.getComputedStyle(e).fontSize} ${window.getComputedStyle(e).fontWeight}`) : null,
      number: await page.evaluate(() => { const e = document.querySelector('table.reg-tbl.qms-reg .qms-num'); return e ? `${window.getComputedStyle(e).fontSize} ${window.getComputedStyle(e).fontWeight}` : null; }) });
    await page.getByRole('link', { name: 'Biostatistics' }).first().click().catch(() => page.getByText('Biostatistics', { exact: true }).first().click());
    await page.waitForTimeout(2500);
    log.steps.push({ name: `biostatistics-${dark ? 'dark' : 'light'}`, ...(await page.evaluate(facts)) });
  }
  await ctx.close();
});
