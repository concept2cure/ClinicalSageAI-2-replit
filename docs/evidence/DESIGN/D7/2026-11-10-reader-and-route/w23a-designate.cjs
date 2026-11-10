// Walk 23a (setup): the walk organisation had designated no QMS approver and no member holds the Approver role, so no
// route could name an approver. The administrator designates Quinn Approver through the membership route, with a reason.
const { run, signIn, log, api, BASE } = require('./lib.cjs');
run('w23a-designate', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  const org = await page.evaluate(() => {
    const t = localStorage.getItem('trialsage_access_token') || '';
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
  });
  const orgId = org && (org.organizationId || org.orgId || org.organization_id);
  const userId = org && (org.userId || org.id || org.sub);
  log.steps.push({ name: 'who', orgId, userId });
  const r = await api(page, 'PUT', `/api/tenant-users/${orgId}/${process.env.DESIGNATE || userId}/qms-approver`, { designated: true, reason: 'Walk C17: designate the QA approver so routes can name one.' });
  log.steps.push({ name: 'designated', status: r.status, body: r.body });
  await ctx.close();
});
