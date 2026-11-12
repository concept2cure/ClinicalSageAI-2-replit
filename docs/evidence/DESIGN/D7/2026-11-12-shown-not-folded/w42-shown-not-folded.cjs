// Walk 42 (P-122 rule 2): what Quality showed before the restyle is on the screen, not behind a closed disclosure; and
// the three classes the trunk lane found with no rule (`.qcc-change`, `.qms-doc`, `.qms-row-more-tr`) each carry one.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');
const WIDTHS = (process.env.WIDTHS || '1440,390').split(',').map(Number);

// Every disclosure in the work area: its summary, whether it is open, and how much of its body is laid out.
const disclosures = (page) => page.evaluate(() => [...document.querySelectorAll('[data-work-area] details')].map((d) => ({
  summary: (d.querySelector('summary')?.textContent || '').trim().slice(0, 60), open: d.open,
  bodyHeight: Math.round([...d.children].filter((c) => c.tagName !== 'SUMMARY').reduce((h, c) => h + c.getBoundingClientRect().height, 0)),
})));
// A change's target date: a <time>, on one line.
const targetDates = (page) => page.evaluate(() => [...document.querySelectorAll('tbody.qcc-change time')].slice(0, 4).map((t) => ({
  text: t.textContent.trim(), dateTime: t.getAttribute('datetime'), whiteSpace: window.getComputedStyle(t).whiteSpace,
  lines: Math.round(t.getBoundingClientRect().height / parseFloat(window.getComputedStyle(t).lineHeight)),
})));
// A document row's facts other than its title, at phone width: one line each.
const documentFacts = (page) => page.evaluate(() => [...document.querySelectorAll('tbody.qms-doc')].slice(0, 3).map((b) =>
  [...b.querySelector('tr').children].filter((td) => !td.classList.contains('qms-title')).map((td) => ({
    text: td.textContent.trim().slice(0, 18), whiteSpace: window.getComputedStyle(td).whiteSpace }))));
// The row under the facts and the "more" row share one rule: no gap above them.
const rowGaps = (page) => page.evaluate(() => [...document.querySelectorAll('tr.qms-row-acts-tr > td, tr.qms-row-more-tr > td')].slice(0, 6)
  .map((td) => ({ row: td.parentElement.className, paddingTop: window.getComputedStyle(td).paddingTop })));

// A proposed change with a target date, so the date is on the screen to measure: the walk gives one its date
// through the edit route, as the Edit drawer does.
async function giveATargetDate(browser) {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  const list = await api(page, 'GET', '/api/mdx/qms/changes?limit=200');
  const rows = list.body?.data ?? [];
  const dated = rows.find((c) => c.targetImplementationDate || c.target_implementation_date);
  const proposed = rows.find((c) => c.status === 'proposed');
  let set = null;
  if (!dated && proposed) {
    const r = await api(page, 'PATCH', `/api/mdx/qms/changes/${proposed.id}`, { targetImplementationDate: '2026-12-15', editReason: 'Walk 42: a target date to plan against.' });
    set = { change: proposed.changeNumber ?? proposed.change_number ?? proposed.id, status: r.status };
  }
  log.steps.push({ name: 'target-date', alreadyDated: dated?.changeNumber ?? null, set });
  await ctx.close();
}

run('w42-shown-not-folded', async (browser) => {
  await giveATargetDate(browser);
  for (const width of WIDTHS) {
    const { ctx, page } = await signIn(browser, 'approver', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const tab of await page.getByRole('tab').allTextContents()) {
      const t = page.getByRole('tab', { name: tab, exact: true });
      await t.scrollIntoViewIfNeeded(); await t.click(); await page.waitForTimeout(1500);
      const step = { name: `${tab} @${width}`, disclosures: await disclosures(page) };
      if (tab === 'Change control') {
        step.targetDates = await targetDates(page);
        const how = page.locator('details', { has: page.getByText('How a change is raised') });
        await how.scrollIntoViewIfNeeded(); await shot(page, `w42-how-a-change-is-raised-${width}`, false);
      }
      if (tab === 'SOP register') {
        if (width === 390) step.documentFacts = await documentFacts(page);
        const more = page.getByRole('button', { name: /^More actions for / }).first();
        if (await more.count()) { await more.click(); await page.waitForTimeout(400); }
        step.rowGaps = await rowGaps(page);
        const how = page.locator('details', { has: page.getByText('How coverage is counted') });
        if (await how.count()) { await how.scrollIntoViewIfNeeded(); await shot(page, `w42-how-coverage-is-counted-${width}`, false); }
      }
      log.steps.push(step);
    }
    await ctx.close();
  }
});
