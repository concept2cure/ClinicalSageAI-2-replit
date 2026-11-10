// Walk 12: a change's content is editable until approval, and refused after it, through the real routes (F1).
const { run, signIn, api, log } = require('./lib.cjs');

/** A response's data and body, or empty objects: the walk records what came back, whatever it was. */
const dataOf = (r) => (r.body && r.body.data) || {};
const bodyOf = (r) => r.body || {};

run('w12-change-edit', async (browser) => {
  const author = await signIn(browser, 'author', 1440);
  const n = `CC-F1-${String(Date.now()).slice(-6)}`;
  const raised = await api(author.page, 'POST', '/api/mdx/qms/changes', {
    changeNumber: n, title: 'Walk F1: content fixed at approval', classification: 'minor',
    reason: 'Walk F1: prove the signed content cannot be rewritten.' });
  const id = dataOf(raised).id;
  log.steps.push({ name: 'raise', status: raised.status, id });
  const edit1 = await api(author.page, 'PATCH', `/api/mdx/qms/changes/${id}`, { impactAssessment: 'Assessed while proposed.' });
  log.steps.push({ name: 'edit-proposed', status: edit1.status, impact: dataOf(edit1).impact_assessment });
  const move = await api(author.page, 'POST', `/api/mdx/qms/changes/${id}/transition`, { to: 'under_assessment', reason: 'Walk F1: open the assessment.' });
  log.steps.push({ name: 'to-under-assessment', status: move.status });
  const edit2 = await api(author.page, 'PATCH', `/api/mdx/qms/changes/${id}`, { implementationPlan: 'Planned under assessment.' });
  log.steps.push({ name: 'edit-under-assessment', status: edit2.status, plan: dataOf(edit2).implementation_plan });
  const approver = await signIn(browser, 'approver', 1440);
  const signed = await api(approver.page, 'POST', `/api/mdx/qms/changes/${id}/approve`, {
    password: process.env.WALK_PASSWORD, meaning: 'APPROVED', reason: 'Walk F1: approved as assessed.' });
  log.steps.push({ name: 'approve', status: signed.status, state: dataOf(signed).status,
    error: bodyOf(signed).error });
  const edit3 = await api(author.page, 'PATCH', `/api/mdx/qms/changes/${id}`, { implementationPlan: 'Rewritten after approval.' });
  log.steps.push({ name: 'edit-approved', status: edit3.status, error: bodyOf(edit3).error, details: bodyOf(edit3).details });
  const after = await api(author.page, 'GET', `/api/mdx/qms/changes/${id}`);
  const row = dataOf(after);
  log.steps.push({ name: 'read-after', status: after.status, state: row.status, plan: row.implementation_plan, impact: row.impact_assessment });
  const ghost = await api(author.page, 'PATCH', '/api/mdx/qms/changes/99999999', { title: 'Nothing' });
  log.steps.push({ name: 'edit-absent', status: ghost.status });
  await author.ctx.close(); await approver.ctx.close();
});
