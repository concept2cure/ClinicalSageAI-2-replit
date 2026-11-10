/**
 * OQ-007 steps OQ-RPT-17 and -18: the two surfaces, opened in the browser. Unscripted: the runner records what the
 * page showed and a screenshot, and a reviewer judges them.
 */
import { step, state } from './context.mjs';
import { COMPLIANCE_STEPS } from './steps-compliance.mjs';

await step(
  {
    id: 'OQ-RPT-17',
    urs: ['URS-RPT-015'],
    kind: 'unscripted',
    title: 'The Reporting & analytics surface renders its views and the run history',
    action: 'Open /concept2cure/insights; read the heading and the Reporting views tabs; open Run history',
    expected: 'The heading "Reporting & analytics"; the tabs Reports, Catalog, Run history, Schedules and Bundles; the Run history table lists the report that was run; screenshots of both views',
    dependsOn: ['OQ-RPT-09'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/insights');
    await ctx.page.getByRole('heading', { name: 'Reporting & analytics', level: 1 }).waitFor({ timeout: 30_000 });
    const tabs = await ctx.page.getByRole('tablist', { name: 'Reporting views' }).getByRole('tab').allInnerTexts();
    ctx.expect(['Reports', 'Catalog', 'Run history', 'Schedules', 'Bundles'].every((t) => tabs.some((x) => x.trim().startsWith(t))), `the Reporting views tabs are ${tabs.join(', ')}`, tabs);
    await ctx.screenshot('reports');
    await ctx.page.getByRole('tab', { name: /^Run history/ }).click();
    /* The report's name is also an option of the Report type filter, so the list is read from its table: a row
       naming the report, once the history has been read. */
    const row = ctx.page.getByRole('row').filter({ hasText: state.runType.label }).first();
    await row.waitFor({ timeout: 30_000 });
    const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim();
    const count = await ctx.page.getByText(/matching reports/).first().innerText().catch(() => '');
    await ctx.screenshot('run-history');
    return `heading and tabs (${tabs.map((t) => t.trim()).join(', ')}) rendered; Run history: ${count}; first row for the report: "${rowText.slice(0, 160)}"`;
  },
);

await step(
  {
    id: 'OQ-RPT-18',
    urs: ['URS-RPT-015'],
    kind: 'unscripted',
    title: 'The Audit & compliance reports surface renders the catalog',
    action: 'Open /concept2cure/compliance-reports; read the heading and the catalog',
    expected: 'The heading "Audit & compliance reports"; the catalog names the user access review, the e-signature register and the audit trail integrity attestation; screenshot',
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/compliance-reports');
    await ctx.page.getByRole('heading', { name: 'Audit & compliance reports', level: 1 }).waitFor({ timeout: 30_000 });
    await ctx.expectText('User access review');
    await ctx.expectText('Audit trail integrity attestation');
    await ctx.expectText(/signature/i);
    await ctx.screenshot();
    return 'heading and the report catalog rendered (User access review, Audit trail integrity attestation, the e-signature register)';
  },
);

/** Imports the previous module's name so the modules run in order; see run.mjs. */
export const SURFACE_STEPS = COMPLIANCE_STEPS && 'steps-surface.mjs';
