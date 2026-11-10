// Walk 5: Change control as one log section: figures, a stage .seg, the procedure as a closed disclosure (D7-B).
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

async function facts(page, label) {
  const f = await page.evaluate(() => {
    const se = document.scrollingElement;
    const seg = document.querySelector('[role=group][aria-label="Lifecycle stage"]');
    return {
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent),
      h2: [...document.querySelectorAll('[data-work-area] h2')].map((h) => h.textContent),
      figures: document.querySelector('[data-testid="change-figures"], [data-testid="change-summary-absent"]')?.textContent ?? null,
      stages: seg ? [...seg.querySelectorAll('button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' *' : ''}`) : null,
      tiles: document.querySelectorAll('.qcc-node, .qcc-flow, .qcc-train').length,
      howOpen: document.querySelector('details.pj-more')?.open ?? null,
      docScroll: se.scrollWidth - se.clientWidth,
    };
  });
  log.steps.push({ name: label, ...f });
}

run('w5-change', async (browser) => {
  for (const width of [1440, 390]) {
    const { ctx, page } = await signIn(browser, 'author', width);
    if (width === 1440) {
      const listed = await api(page, 'GET', '/api/mdx/qms/changes');
      const have = (listed.body?.data ?? []).some((c) => c.change_number === 'CC-QS-001');
      if (!have) {
        const made = await api(page, 'POST', '/api/mdx/qms/changes', {
          changeNumber: 'CC-QS-001', title: 'Move complaint intake to the new CRM form', changeType: 'document',
          classification: 'minor', reason: 'The CRM replaces the paper intake log.', description: 'Paper log to CRM form.',
        });
        log.steps.push({ name: 'raise', status: made.status, body: JSON.stringify(made.body).slice(0, 300) });
      }
    }
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Change control' }).click();
    await page.getByRole('heading', { name: 'Change control log' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await facts(page, `change-${width}`);
    await shot(page, `w5-change-${width}`, false);
    await shot(page, `w5-change-${width}-full`, true);
    if (width === 1440) {
      await page.getByRole('group', { name: 'Lifecycle stage' }).getByRole('button', { name: /^Proposed:/ }).click();
      await page.waitForTimeout(400);
      await facts(page, 'filtered-proposed');
      await page.getByText('How a change is raised').click();
      await page.waitForTimeout(300);
      await facts(page, 'how-opened');
      await shot(page, 'w5-change-how-open', true);
    }
    await ctx.close();
  }
});
