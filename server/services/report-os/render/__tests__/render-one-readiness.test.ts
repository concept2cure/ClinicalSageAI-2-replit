/**
 * What the rendered report says about readiness, its scope and its own content
 * (QA 2026-10-08, j8):
 *   - the digest states the evaluated readiness, or that it was not computed —
 *     never "Overall confidence 75" beside a readiness nobody computed;
 *   - the scope is named, not "project 1";
 *   - a register draws its own counts instead of the readiness digest.
 */
import { describe, expect, it } from 'vitest';
import { renderReport, type RenderInput } from '../render';
import { computeContentHash, extractProvenanceAtoms } from '../../sealing/seal';

const AT = '2026-10-08T00:00:00.000Z';
const notComputed = 'Submission readiness not computed: the project records no registry context (registryId or submissionType).';

const digest = (over: Partial<RenderInput> = {}): RenderInput => ({
  reportTypeId: 'readiness.executive_digest',
  reportTypeLabel: 'Executive Readiness Digest',
  scopeType: 'project',
  scopeId: '1',
  providers: [
    { provider: 'artifact_state', observedAt: AT, status: 'ready' },
    { provider: 'submission_readiness', observedAt: AT, status: 'missing', blocker: notComputed },
  ],
  confidence: 75,
  blockers: [notComputed],
  summary: { scopeType: 'project', scopeId: '1', scopeLabel: 'C2C-001 IND Program' },
  status: 'partial',
  generatedAt: AT,
  ...over,
});

const text = (r: ReturnType<typeof renderReport>) => JSON.stringify(r.sections);

describe('renderReport — readiness', () => {
  it('renders all evaluated gaps, including required sections when no artifact is missing', () => {
    const report = renderReport(digest({ summary: { regulatory: { missingArtifacts: [], gaps: [{ title: 'Module 3', severity: 'critical', message: 'Required section missing' }] } } }));
    expect(text(report)).toContain('Required section missing');
    expect(text(report)).not.toContain('No gaps detected');
  });
  it('does not claim an assessment from a legacy empty artifact list', () => {
    const report = renderReport(digest({ summary: { regulatory: { missingArtifacts: [] } } }));
    expect(text(report)).not.toContain('No gaps detected');
    expect(text(report)).toContain('Gaps were not evaluated for this scope');
  });
  it('seals stored aggregate inputs and extracts rendered source atoms', () => {
    const input = digest({ providers: [{ provider: 'submission_readiness', observedAt: AT, status: 'partial', atoms: [{ sourceTable: 'sections', recordId: 44, sourceField: 'status', transformation: 'calculation' }] }], summary: { regulatory: { readinessScore: 50, gaps: [] }, computedScope: 'project', provenance: { inputs: [{ id: 44, status: 'draft' }] } } });
    const report = renderReport(input);
    expect(extractProvenanceAtoms(report)).toContainEqual(expect.objectContaining({ sourceTable: 'sections', recordId: 44 }));
    const changed = renderReport({ ...input, summary: { ...input.summary, provenance: { inputs: [{ id: 44, status: 'review' }] } } });
    expect(computeContentHash(changed)).not.toBe(computeContentHash(report));
  });
  it('states that readiness was not computed, and prints no confidence', () => {
    const r = renderReport(digest());
    const summary = r.sections[0];
    expect(text(r)).not.toMatch(/confidence/i);
    expect(summary.blocks).toContainEqual({ kind: 'summary', text: notComputed });
    expect(summary.blocks).toContainEqual({ kind: 'metric', label: 'Submission readiness', value: null, status: 'missing' });
  });

  it('states the evaluated readiness when the evaluator ran', () => {
    const r = renderReport(
      digest({
        providers: [{ provider: 'submission_readiness', observedAt: AT, status: 'partial' }],
        blockers: [],
        summary: { scopeLabel: 'BX-301', regulatory: { readinessScore: 62, readinessLevel: 'in_progress', applicationDisplayName: 'BLA' } },
      }),
    );
    // A run stored before its gap list was kept: the count was not read, and
    // the sentence says so rather than calling 62% ready (readiness-statement).
    expect(r.sections[0].blocks).toContainEqual({ kind: 'summary', text: 'BX-301 scores 62% on submission readiness; its critical-gap count was not read. Evaluated against BLA.' });
    expect(r.sections[0].blocks).toContainEqual({ kind: 'metric', label: 'Submission readiness', value: 62, unit: '%' });
    expect(text(r)).not.toMatch(/confidence/i);
  });

  /* HS-1008-1, in the digest. The digest printed the evaluator's level raw
     ("not_ready" in the running app, 2026-11-02) and appended it to the
     summary in its own words. It now speaks through
     shared/regulatory/readiness-statement, the one place "ready" is decided,
     and shows the critical-gap count instead. The renderer reads a STORED
     summary, so this case gives it a level that disagrees with its gaps
     (`nearly_ready` beside an open critical gap): today's evaluator would say
     `not_ready` (readinessEvaluator.ts:178), but the renderer must decide from
     the gaps, not trust the level. */
  it('never calls a figure with a critical gap open ready, and prints no raw level', () => {
    const r = renderReport(
      digest({
        providers: [{ provider: 'submission_readiness', observedAt: AT, status: 'partial' }],
        blockers: [],
        summary: { scopeLabel: 'BX-204', regulatory: { readinessScore: 100, readinessLevel: 'nearly_ready', applicationDisplayName: 'IND', gaps: [
          { title: 'Artifact matrix', severity: 'critical', message: 'Required artifacts are not modelled for this filing type.' },
          { title: 'Cover letter', severity: 'minor', message: 'Draft.' },
        ] } },
      }),
    );
    const blocks = r.sections[0].blocks;
    expect(blocks).toContainEqual({ kind: 'summary', text: 'BX-204 scores 100% on submission readiness, with 1 critical gap outstanding. Evaluated against IND.' });
    expect(blocks).toContainEqual({ kind: 'metric', label: 'Critical gaps', value: 1 });
    expect(blocks.some((b) => b.kind === 'metric' && b.label === 'Readiness level')).toBe(false);
    const said = JSON.stringify(blocks);
    expect(said).not.toMatch(/nearly[ _]ready|not_ready|\bready\b/i);
  });

  it('says ready only when no critical gap is open', () => {
    const r = renderReport(
      digest({
        providers: [{ provider: 'submission_readiness', observedAt: AT, status: 'ready' }],
        blockers: [],
        summary: { scopeLabel: 'BX-204', regulatory: { readinessScore: 96, readinessLevel: 'ready', applicationDisplayName: 'IND', gaps: [] } },
      }),
    );
    expect(r.sections[0].blocks).toContainEqual({ kind: 'summary', text: 'BX-204 is 96% ready. Evaluated against IND.' });
    expect(r.sections[0].blocks).toContainEqual({ kind: 'metric', label: 'Critical gaps', value: 0 });
  });
});

describe('renderReport — scope', () => {
  it('names the scope by the label the run stored, not by its row id', () => {
    const r = renderReport(digest());
    expect(r.sections[0].blocks[0]).toEqual({ kind: 'summary', text: 'Executive Readiness Digest for C2C-001 IND Program. Status: partial.' });
    expect(r.scopeLabel).toBe('C2C-001 IND Program');
    expect(text(r)).not.toMatch(/for project 1/);
  });
});

describe('renderReport — a register', () => {
  it('draws its own counts, says they are the organisation’s, and states no readiness', () => {
    const r = renderReport({
      ...digest(),
      reportTypeId: 'controlled_substances.inventory_ledger',
      reportTypeLabel: 'Controlled Substances Inventory & DEA Ledger',
      providers: [{ provider: 'controlled_substances', observedAt: AT, status: 'missing', blocker: 'No controlled_substances records for this organization' }],
      blockers: ['No controlled_substances records for this organization'],
      summary: { scopeLabel: 'HLV-333', domain: { substances: 0, bySchedule: {}, activeRegistrations: 2, transactions: 5 }, domainScope: 'organization' },
    });
    const register = r.sections.find((s) => s.id === 'register');
    expect(register).toBeTruthy();
    expect(register!.blocks).toContainEqual({ kind: 'metric', label: 'Active registrations', value: 2 });
    expect(register!.blocks).toContainEqual({ kind: 'metric', label: 'Transactions', value: 5 });
    expect(register!.blocks).toContainEqual({ kind: 'summary', text: 'By schedule: none recorded.' });
    expect(JSON.stringify(register)).toMatch(/organisation/);
    expect(text(r)).not.toMatch(/Submission readiness/);
  });
});
