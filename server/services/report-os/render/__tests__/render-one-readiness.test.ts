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
    expect(r.sections[0].blocks).toContainEqual({ kind: 'summary', text: 'Submission readiness 62% (in progress), evaluated against BLA.' });
    expect(r.sections[0].blocks).toContainEqual({ kind: 'metric', label: 'Submission readiness', value: 62, unit: '%' });
    expect(text(r)).not.toMatch(/confidence/i);
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
