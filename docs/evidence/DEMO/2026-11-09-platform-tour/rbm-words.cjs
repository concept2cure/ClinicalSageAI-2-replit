const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const OUT = S + '/walk-1109-evidence/rbm-words'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: S + '/walk-1109-capture/work/state.json' });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:5100/concept2cure/rbm?program=e00d4d40-5378-41dc-b85e-e49662afe6a6', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.c2c-v2'); await p.waitForTimeout(4000);
  const ids = /buildAttentionFeed|rbm-engine|scoreRisk|scorePatientCohort|MIN_COHORT|site-risk-engine|monitoringTierFromRisk|ich_e6r3|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g;
  const out = [];
  for (const tab of ['Overview', 'Risk review report', 'Risk assessment (RACT)', 'Patient profiles', 'Site risk']) {
    await p.getByRole('tab', { name: tab }).or(p.getByRole('button', { name: tab })).first().click(); await p.waitForTimeout(2500);
    const text = await p.evaluate(() => document.querySelector('main, .page')?.innerText || document.body.innerText);
    out.push({ tab, leaks: [...new Set(text.match(ids) || [])] });
    await p.screenshot({ path: `${OUT}/${tab.replace(/[^a-z]+/gi, '-').toLowerCase()}.png` });
  }
  console.info(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
