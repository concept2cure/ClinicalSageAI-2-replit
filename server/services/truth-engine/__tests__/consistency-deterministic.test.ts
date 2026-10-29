/**
 * The consistency check's verdicts come from the reconciliation engine, not a
 * model.
 *
 * runConsistencyCheck sent the claim and its sources to the gateway and
 * persisted the model's own match/conflict labels as consistency findings
 * (CLAUDE.md Rule 2: verdicts come from deterministic engines; the model
 * narrates). It now compares the labelled figures reconcileDossierNumbers
 * extracts between the claim and each source, makes no model call, and says
 * which sources shared no figure with the claim rather than counting them
 * as consistent.
 *
 * 2026-10-29 (slice G4): it compares the SAVED text of the named authoring
 * sections, read by the engine under the tenant and the submission's project.
 * Text in the call is never compared. Until then a caller's text was graded
 * and recorded against the submission, whatever the dossier said.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  route: vi.fn(async () => {
    throw new Error('the consistency check must not call a model');
  }),
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
  inserted: [] as Array<Record<string, unknown>>,
  /** The saved authoring sections the engine reads (authoring_sections ⋈ authoring_documents). */
  sections: [] as Array<{ id: string; code: string | null; title: string | null; content: string; program_id: string | null }>,
  submission: { id: 11, programId: null as string | null },
}));

vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: h.route }) }));
vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../../db', () => {
  let n = 0;
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => [h.submission] }) }) });
  const execute = async () => ({ rows: h.sections });
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        h.inserted.push(v);
        return [{ id: ++n, ...v }];
      },
    }),
  });
  return { db: { select, insert, execute }, pool: {}, getPool: () => ({}) };
});
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { runConsistencyCheck } from '../truth-engine-service';
// Imported at collection, not inside a test: loading the AnA tool registry takes
// longer than one test's budget, and that cost is not what these tests measure.
import { getToolHandler } from '../../ana/AnaToolExecutor';

const CTX = { organizationId: 7, userId: 3 };
const P = '40000000-0000-4000-8000-000000000001';
const saved = (id: string, code: string, content: string, program_id: string | null = P) => ({ id, code, title: null, content, program_id });
const LEFT = { sectionId: 'L' };

beforeEach(() => {
  h.route.mockClear();
  h.logAction.mockClear();
  h.inserted.length = 0;
  h.submission = { id: 11, programId: P };
  h.sections = [
    saved('L', '2.7.3', '<p>The study randomized 186 subjects at 42 sites; the hazard ratio was 0.71.</p>'),
    saved('A', 'CSR-001', '<p>In total the trial randomized 120 subjects across 42 sites.</p>'),
    saved('B', 'CSR-002', '<p>The study randomized 186 subjects.</p>'),
    saved('N', 'Label', '<p>Hepatotoxicity has been reported.</p>'),
  ];
});

describe('runConsistencyCheck', () => {
  it('records a conflict and a match from the figures each text states, with no model call', async () => {
    const r = await runConsistencyCheck(
      {
        submissionId: 11,
        dimension: 'subject-counts',
        left: LEFT,
        right: [{ sectionId: 'A' }, { sectionId: 'B' }],
      },
      CTX,
    );
    expect(h.route).not.toHaveBeenCalled();
    const byRef = (ref: string) => r.findings.filter((f) => f.rightRef === ref).map((f) => [f.status, f.detail]);
    expect(byRef('CSR-001 [A]')).toEqual([
      ['conflict', 'sample_size: 2.7.3 [L] gives 186; CSR-001 [A] gives 120.'],
      ['match', 'sites: 2.7.3 [L] gives 42; CSR-001 [A] gives 42.'],
    ]);
    expect(byRef('CSR-002 [B]')).toEqual([['match', 'sample_size: 2.7.3 [L] gives 186; CSR-002 [B] gives 186.']]);
    expect(r.notCompared).toEqual([
      { rightRef: 'CSR-001 [A]', label: 'hazard_ratio', reason: 'not stated in the source' },
      { rightRef: 'CSR-002 [B]', label: 'hazard_ratio', reason: 'not stated in the source' },
      { rightRef: 'CSR-002 [B]', label: 'sites', reason: 'not stated in the source' },
    ]);
  });

  it('records nothing for a source that states none of the claim\'s figures, and names each as not compared', async () => {
    const r = await runConsistencyCheck(
      { submissionId: 11, dimension: 'label-vs-safety', left: LEFT, right: [{ sectionId: 'N' }] },
      CTX,
    );
    expect(r.findings).toEqual([]);
    expect(r.notCompared.map((n) => [n.rightRef, n.label])).toEqual([
      ['Label [N]', 'hazard_ratio'],
      ['Label [N]', 'sample_size'],
      ['Label [N]', 'sites'],
    ]);
    expect(h.inserted).toEqual([]);
  });

  it('audits the check as the engine that ran it, not as AI generation', async () => {
    await runConsistencyCheck(
      { submissionId: 11, dimension: 'subject-counts', left: LEFT, right: [{ sectionId: 'B' }] },
      CTX,
    );
    const [entry] = h.logAction.mock.calls.at(-1) as [Record<string, any>];
    expect(entry.action).toBe('CONSISTENCY_CHECK');
    expect(entry.details).toMatchObject({
      engine: 'dossier-number-reconciliation', findingCount: 1, conflicts: 0, notCompared: 2, claimSection: 'L', sourceSections: ['B'],
    });
    expect(JSON.stringify(entry)).not.toMatch(/promptVersion|AI_GENERATE/);
  });
});

describe("AnA's check_consistency", () => {
  it('tells AnA which figures were not compared, and that this is not a finding of consistency', async () => {
    const res = JSON.parse(
      await getToolHandler('check_consistency')!(
        { submission_id: 11, dimension: 'label-vs-safety', left: { section_id: 'L' }, right: [{ section_id: 'N' }] },
        { ...CTX, humanConfirmed: true } as never,
      ),
    );
    expect(res.ok).toBe(true);
    expect(res.notCompared.map((n: { rightRef: string }) => n.rightRef)).toEqual(['Label [N]', 'Label [N]', 'Label [N]']);
    expect(res.message).toMatch(/not compared/i);
    expect(res.message).toMatch(/not a finding of consistency/i);
  });

  it('refuses a source named by text instead of a saved section, before writing anything', async () => {
    const res = JSON.parse(
      await getToolHandler('check_consistency')!(
        { submission_id: 11, dimension: 'x', left: { section_id: 'L' }, right: [{ text: 'The study randomized 186 subjects.' }] },
        { ...CTX, humanConfirmed: true } as never,
      ),
    );
    expect(res.error).toMatch(/section_id/);
    expect(res.error).toMatch(/not compared/);
    expect(h.inserted).toEqual([]);
  });

  it('compares the saved section, not the text in the call, and says the text was ignored', async () => {
    // The saved claim says 186. The call says 100. Before 2026-10-29 the 100 was
    // graded and recorded against the submission.
    const res = JSON.parse(
      await getToolHandler('check_consistency')!(
        {
          submission_id: 11, dimension: 'subject-counts',
          left: { section_id: 'L', text: 'The study randomized 100 subjects.' },
          right: [{ section_id: 'B', text: 'The study randomized 100 subjects.' }],
        },
        { ...CTX, humanConfirmed: true } as never,
      ),
    );
    expect(res.ok).toBe(true);
    expect(res.findings.map((f: { status: string; detail: string }) => [f.status, f.detail])).toEqual([
      ['match', 'sample_size: 2.7.3 [L] gives 186; CSR-002 [B] gives 186.'],
    ]);
    expect(res.suppliedText).toBe('ignored');
    expect(res.message).toMatch(/supplied in the call was ignored/);
  });
});

describe('what the check may read', () => {
  it("refuses a section of another project than the submission's, writing nothing", async () => {
    h.sections.push(saved('X', 'CSR-009', '<p>The study randomized 99 subjects.</p>', '40000000-0000-4000-8000-000000000999'));
    await expect(runConsistencyCheck({ submissionId: 11, dimension: 'x', left: LEFT, right: [{ sectionId: 'X' }] }, CTX))
      .rejects.toThrow(/not in this submission's project/);
    expect(h.inserted).toEqual([]);
  });

  it('refuses a section that is not saved in this organization', async () => {
    await expect(runConsistencyCheck({ submissionId: 11, dimension: 'x', left: LEFT, right: [{ sectionId: 'missing' }] }, CTX))
      .rejects.toThrow(/missing was not found in this organization/);
  });
});
