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
