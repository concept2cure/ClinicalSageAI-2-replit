/** OQ-PROJ-12 v0.10 — scripted observations of the folded filing reference.
 * Public API/browser only; formal execution and reviewer acceptance are outstanding.
 */
import { helpers } from '../../lib/harness.mjs';

export async function filingReferenceStep(ctx, stamp) {
  const { state } = ctx;
  await ctx.newPage({ id: state.programId, name: state.programName });
  const intakePage = ctx.page;
  const projectWrites = [];
  const recordProjectWrite = request => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'POST' && pathname === '/api/c2c/projects') projectWrites.push({ method: 'POST', pathname });
  };
  intakePage.on('request', recordProjectWrite);
  let intakeGuide;
  try {
    await ctx.goto('/concept2cure/filings-catalog?oq=filing-reference#reference-guide');
    await ctx.page.getByRole('heading', { name: 'New project', exact: true }).waitFor();
    const destination = new URL(ctx.page.url());
    ctx.expect(destination.pathname === '/concept2cure/projects', 'former catalog did not reach canonical Projects', destination.pathname);
    ctx.expect(destination.searchParams.get('oq') === 'filing-reference' && destination.hash === '#reference-guide', 'alias discarded query/hash', destination.href);
    ctx.attach('destination.json', { pathname: destination.pathname, query: destination.search, hash: destination.hash });
    await ctx.page.waitForFunction(() => document.querySelector('input[aria-label="Search filing types"]') || document.body.innerText.includes('Which filing types the platform can carry could not be read'), null, { timeout: 30_000 });
    await ctx.screenshot('wizard-browse');
    if (await ctx.page.getByRole('button', { name: 'Retry', exact: true }).isVisible().catch(() => false)) {
      ctx.expect(await ctx.page.locator('.rpk-type').count() === 0, 'an offer-read failure still offers a selectable filing');
      ctx.expect(await ctx.page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), 'wizard can continue before an offer is read');
      ctx.deviation('Offer read is explicitly unavailable with Retry and no selectable filing. Selected filing and Plan positive observations were not executed.', await ctx.page.locator('.rpk').innerText());
    }
    await ctx.page.getByRole('textbox', { name: 'Search filing types', exact: true }).fill('Investigational New Drug');
    await ctx.page.getByRole('button', { name: /^Investigational New Drug Application/ }).click();
    const selected = ctx.page.getByTestId('rpk-chosen-offer');
    const selectedText = await selected.innerText();
    ctx.expect(['Authority / region', 'Submission format', 'CTD module', 'Catalog reference.', 'How you’ll build it.'].every(text => selectedText.includes(text)), 'selected filing facts or build explanation missing', selectedText);
    const guide = ctx.page.getByRole('region', { name: 'Filing lifecycle reference', exact: true });
    ctx.expect(await guide.count() === 1, 'intake rendered duplicate lifecycle reference regions');
    ctx.expect(await guide.locator('details').evaluate(node => !node.open), 'intake reference is not collapsed by default');
    await guide.getByText('Reference guide', { exact: true }).click();
    intakeGuide = await guide.innerText();
    ctx.expect(['Authored filing-family guidance.', 'Timing examples:', 'If it comes back:', 'not this project’s status, deadline or agency commitment'].every(text => intakeGuide.includes(text)), 'intake guide does not identify its authored stages/timing/return basis', intakeGuide);
    ctx.expect(await guide.locator('ol > li').count() > 0, 'intake guide has no authored stages');
    ctx.attach('intake-reference.txt', await selected.innerText());
    await ctx.screenshot('selected-filing-reference');
    await ctx.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    intakePage.off('request', recordProjectWrite);
    ctx.attach('intake-project-writes.json', { writes: projectWrites });
    ctx.expect(projectWrites.length === 0, 'filing reference discovery or cancellation created a project', projectWrites);
  }

  const name = `OQ-001 exact IND reference ${stamp}`;
  const created = await ctx.api('POST', '/api/c2c/projects', {
    name, programType: 'ind', primaryAgency: 'FDA', submissionTypeId: 'us_ind',
    indication: 'Validation exercise — authored filing reference', priority: 'medium',
  });
  const record = created.json?.program;
  ctx.expect(created.status === 201 && helpers.uuidRe.test(String(record?.id)), 'exact filing reference fixture was not created', created.json);
  ctx.expect(record.submission_type_id === 'us_ind', 'created record does not carry its exact filing identity', record.submission_type_id);
  await ctx.newPage({ id: record.id, name });
  await ctx.goto('/concept2cure/project-home');
  await ctx.page.getByRole('button', { name: 'Plan', exact: true }).click();
  const planGuide = ctx.page.getByRole('region', { name: 'Filing lifecycle reference', exact: true });
  await planGuide.locator('details').waitFor();
  ctx.expect(await planGuide.count() === 1, 'Plan rendered duplicate lifecycle reference regions');
  ctx.expect(await planGuide.locator('details').evaluate(node => !node.open), 'recorded Plan reference is not collapsed by default');
  await planGuide.getByText('Reference guide', { exact: true }).click();
  const planText = await planGuide.innerText();
  ctx.expect(planText === intakeGuide, 'recorded exact filing Plan guide differs from the selected intake guide', planText);
  await ctx.page.getByRole('heading', { name: 'What this IND needs', exact: true }).waitFor();
  await ctx.page.getByRole('heading', { name: 'Team', exact: true }).waitFor();
  ctx.attach('plan-reference.txt', planText);
  await ctx.screenshot('exact-filing-plan');

  await ctx.newPage({ id: state.programId, name: state.programName });
  await ctx.goto('/concept2cure/project-home');
  await ctx.page.getByRole('button', { name: 'Plan', exact: true }).click();
  await ctx.expectText('No filing lifecycle guide is available for this recorded filing.');
  const missingGuide = ctx.page.getByRole('region', { name: 'Filing lifecycle reference', exact: true });
  ctx.expect(await missingGuide.locator('details').count() === 0, 'generic program type inferred a filing guide without exact recorded identity');
  await ctx.page.getByRole('heading', { name: 'What this IND needs', exact: true }).waitFor();
  await ctx.page.getByRole('heading', { name: 'Team', exact: true }).waitFor();
  await ctx.screenshot('missing-filing-plan');
  return 'former catalog bookmark opened canonical Projects wizard with query/hash and no browser project creation; selected filing facts and authored guide recorded; exact US IND Plan guide and missing-identity unavailability recorded alongside the existing plan (scripted observations require reviewer acceptance)';
}
