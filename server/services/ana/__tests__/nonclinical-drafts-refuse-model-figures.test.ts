/**
 * AnA's Module 2.4 and 2.6 drafts never compose from studies, NOAELs or
 * findings the model writes (CLAUDE.md Rule 2; Rule 2 audit S2, 2026-10-26).
 *
 * draft_nonclinical_overview_m2_4 and draft_nonclinical_summaries_m2_6 took
 * studies[] and findings[] in the tool input and printed them as the sponsor's
 * nonclinical program: "NOAEL range: 50 mg/kg/day", the 2.6.7 toxicology table,
 * a target-organ adversity profile. The model is the conduit for every one of
 * those figures; it is the shape 2.5/2.7 had before 2026-10-05.
 *
 * No record links nonclinical studies to a project yet (founder decision R-1,
 * which store), so until then the drafts answer with the record's ICH M4S
 * outline for the open project and say that no studies are recorded against it,
 * and figures supplied in the call are refused and named as not used.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../csr/project-scope.js', async (orig) => ({
  ...await orig<typeof import('../../csr/project-scope.js')>(),
  resolveCsrScope: vi.fn(async (_db: unknown, _org: number, input: { projectId?: number }) => ({ projectId: input.projectId })),
}));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: vi.fn() }, getPool: vi.fn() }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { DRAFT_NONCLINICAL_OVERVIEW_M2_4, DRAFT_NONCLINICAL_SUMMARIES_M2_6 } from '../bla-biologics-tool-defs.js';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';

const CTX = { organizationId: 3, userId: 5, projectId: 9 } as never;
const MODEL_STUDIES = [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, noael: '50 mg/kg/day', keyFindings: 'hepatocellular hypertrophy' }];
const run = async (tool: string, input: Record<string, unknown>, ctx: unknown = CTX) => JSON.parse(await getToolHandler(tool)!(input, ctx as never));
const numbers = (sections: Array<{ number: string; subsections?: unknown[] }>): string[] =>
  sections.flatMap((s) => [s.number, ...numbers((s.subsections ?? []) as never)]);

describe.each([
  ['draft_nonclinical_overview_m2_4', '2.4'],
  ['draft_nonclinical_summaries_m2_6', '2.6'],
] as const)('%s', (tool, root) => {
  it('refuses studies written in the call: none of their figures reaches the answer', async () => {
    const out = await run(tool, { studies: MODEL_STUDIES, findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }] });
    expect(out.ok).toBe(false);
    expect(out.ignoredSuppliedFigures).toBe(true);
    expect(JSON.stringify(out)).not.toContain('50 mg/kg/day');
    expect(JSON.stringify(out)).not.toContain('hepatocellular hypertrophy');
  });

  it('with no project open and figures supplied, asks for the project and uses none of them', async () => {
    const out = await run(tool, { studies: MODEL_STUDIES }, { organizationId: 3, userId: 5 });
    expect(out).toMatchObject({ ok: false, status: 'needs_project', ignoredSuppliedFigures: true });
  });

  it('with a project open and nothing supplied, answers with the record’s outline and says no studies are recorded', async () => {
    const out = await run(tool, {});
    expect(out.nonclinical_data?.status).toBe('needs_data');
    expect(numbers(out.structure.sections)).toEqual(ctdRecordSubtree(root).map((h) => h.code));
  });

  // S2 review (2026-10-26): the outline's next step said "No nonclinical study is
  // recorded against this project" when no project had been read at all, and
  // after a scope error. Unavailable is not empty.
  it('with no project open and nothing supplied, gives the outline without claiming what a project holds', async () => {
    const out = await run(tool, {}, { organizationId: 3, userId: 5 });
    expect(out.nonclinical_data?.status).toBe('needs_project');
    expect(numbers(out.structure.sections)).toEqual(ctdRecordSubtree(root).map((h) => h.code));
    expect(JSON.stringify(out)).not.toMatch(/recorded against this project/);
    expect(out.nonclinical_data.message).not.toMatch(/draft again/);
  });

  it('when the named project cannot be resolved, says so with its code and claims no absence', async () => {
    const { resolveCsrScope, CsrScopeError } = await import('../../csr/project-scope.js');
    vi.mocked(resolveCsrScope).mockRejectedValueOnce(new CsrScopeError('CSR_PROJECT_NOT_FOUND', 404, 'The project could not be resolved.'));
    const out = await run(tool, { project_id: 99999 }, { organizationId: 3, userId: 5 });
    expect(out.nonclinical_data).toMatchObject({ status: 'needs_project', code: 'CSR_PROJECT_NOT_FOUND' });
    expect(JSON.stringify(out)).not.toMatch(/recorded against this project/);
  });
});

describe('the tool definitions ask for no figures', () => {
  it.each([DRAFT_NONCLINICAL_OVERVIEW_M2_4, DRAFT_NONCLINICAL_SUMMARIES_M2_6])('$name takes no studies or findings, and says not to pass them', (def) => {
    const props = (def.input_schema as { properties: Record<string, unknown>; required?: string[] }).properties;
    expect(Object.keys(props)).not.toContain('studies');
    expect(Object.keys(props)).not.toContain('findings');
    expect((def.input_schema as { required?: string[] }).required ?? []).toEqual([]);
    expect(def.description).toMatch(/do not pass/i);
    expect(def.description.length).toBeLessThanOrEqual(1024);
  });
});
