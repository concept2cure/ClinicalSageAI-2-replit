// Walk 29: the training section's all-clear says only what was assessed, and speaks for the reader when the read was
// their own rows. Read as the approver (everyone), the author and the trainee, at 1440, with what the route said.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

async function section(page, who) {
  const meta = await api(page, 'GET', '/api/mdx/qms/training/expiring?within_days=60');
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sec = page.getByTestId('training-expiry');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const seen = await sec.evaluate((s) => {
    const text = (sel) => { const el = s.querySelector(sel); return el ? el.textContent.trim().slice(0, 160) : null; };
    return {
      heading: text('h2'), sub: text('.pj-sec-h .sec-sub'),
      rows: [...s.querySelectorAll('[data-testid="training-expiry-row"]')].map((r) => r.textContent.trim().replace(/\s+/g, ' ').slice(0, 160)),
      empty: text('.c2c-empty-state, [class*="empty"]'),
      unassessed: text('[data-testid="training-expiry-unassessed"]'), capped: text('[data-testid="training-expiry-capped"]'),
    };
  });

  log.steps.push({ name: `section-${who}`, status: meta.status, meta: meta.body?.meta ?? null, ...seen });
  await shot(page, `w29-training-${who}-1440`, false);
}

/* Every walk user is an administrator of the walk organisation, and Theo Trainee was also designated a QMS approver for
   walk 23, so each sees everyone's rows. To read the section as a member who sees only their own rows, the
   administrator makes Theo a member and withdraws the designation, each with its reason, then restores both. */
async function theoAs(browser, role, designated, reason) {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  const orgId = await page.evaluate(() => {
    const t = localStorage.getItem('trialsage_access_token') || '';
    try { const c = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return c.organizationId || c.orgId || c.organization_id; } catch { return null; }
  });
  const r = await api(page, 'PATCH', `/api/tenant-users/${orgId}/3`, { role, reason });
  const d = await api(page, 'PUT', `/api/tenant-users/${orgId}/3/qms-approver`, { designated, reason });
  log.steps.push({ name: `theo-${role}${designated ? '-designated' : ''}`, roleStatus: r.status, designationStatus: d.status });
  await ctx.close();
}

run('w29-training-assessed', async (browser) => {
  for (const who of ['approver', 'author', 'trainee']) {
    const { ctx, page } = await signIn(browser, who, 1440);
    await section(page, who);
    await ctx.close();
  }
  // Theo is an administrator too, so the walk makes Theo a member, undesignated, for one read, and restores both after.
  await theoAs(browser, 'member', false, 'Walk 29: read the training section as a member who sees only their own rows.');
  try {
    const { ctx, page } = await signIn(browser, 'trainee', 1440);
    await section(page, 'trainee-own');
    await ctx.close();
  } finally {
    await theoAs(browser, 'admin', true, 'Walk 29: restore the role and designation changed for the own-rows read.');
  }
});
