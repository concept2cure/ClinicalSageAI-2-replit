import { describe, expect, it } from 'vitest';
import { renderReport, type RenderInput } from '../render';
import type { ReportSection } from '../types';

const FIXED_AT = '2026-06-15T00:00:00.000Z';

function baseInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    reportTypeId: 'submission-readiness',
    reportTypeLabel: 'Submission Readiness',
    scopeType: 'project',
    scopeId: '42',
    providers: [
      { provider: 'artifact_state', observedAt: FIXED_AT, status: 'ready' },
      { provider: 'submission_readiness', observedAt: FIXED_AT, status: 'partial', blocker: 'No approved artifacts' },
    ],
    confidence: 75,
    blockers: [],
    summary: { scopeType: 'project', scopeId: '42' },
    status: 'partial',
    generatedAt: FIXED_AT,
    ...overrides,
  };
}

function sectionById(sections: ReportSection[], id: string): ReportSection | undefined {
  return sections.find(s => s.id === id);
}

describe('renderReport', () => {
  it('renders the four core sections', () => {
    const report = renderReport(baseInput());
    const ids = report.sections.map(s => s.id);
    expect(ids).toContain('executive-summary');
    expect(ids).toContain('provider-readiness');
    expect(ids).toContain('gaps');
    // No blockers in base input, so blockers section is omitted.
    expect(ids).not.toContain('blockers');
  });

  it('includes a Confidence metric block', () => {
    const report = renderReport(baseInput({ confidence: 88 }));
    const exec = sectionById(report.sections, 'executive-summary');
    const metric = exec?.blocks.find(b => b.kind === 'metric' && b.label === 'Confidence');
    expect(metric).toBeDefined();
    expect(metric).toMatchObject({ kind: 'metric', label: 'Confidence', value: 88, unit: '%' });
  });

  it('produces one provider table row per provider', () => {
    const report = renderReport(baseInput());
    const providers = sectionById(report.sections, 'provider-readiness');
    const table = providers?.blocks.find(b => b.kind === 'table');
    expect(table?.kind).toBe('table');
    if (table?.kind === 'table') {
      expect(table.columns).toEqual(['Provider', 'Status', 'Note']);
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0]).toEqual(['artifact_state', 'ready', '—']);
      expect(table.rows[1]).toEqual(['submission_readiness', 'partial', 'No approved artifacts']);
    }
  });

  it('omits the blockers section when there are no blockers', () => {
    const report = renderReport(baseInput({ blockers: [] }));
    expect(sectionById(report.sections, 'blockers')).toBeUndefined();
  });

  it('includes the blockers section when blockers are present', () => {
    const report = renderReport(baseInput({ blockers: ['Missing form 1571', 'No approved artifacts'] }));
    const blockers = sectionById(report.sections, 'blockers');
    expect(blockers).toBeDefined();
    const list = blockers?.blocks.find(b => b.kind === 'blocker-list');
    expect(list?.kind).toBe('blocker-list');
    if (list?.kind === 'blocker-list') {
      expect(list.items).toEqual(['Missing form 1571', 'No approved artifacts']);
    }
  });

  it('always includes a gaps section with an empty-state path', () => {
    const report = renderReport(baseInput({ summary: {} }));
    const gaps = sectionById(report.sections, 'gaps');
    expect(gaps).toBeDefined();
    const gapList = gaps?.blocks.find(b => b.kind === 'gap-list');
    expect(gapList?.kind).toBe('gap-list');
    if (gapList?.kind === 'gap-list') {
      expect(gapList.items).toEqual([]);
    }
    const note = gaps?.blocks.find(b => b.kind === 'summary');
    expect(note?.kind).toBe('summary');
    if (note?.kind === 'summary') {
      expect(note.text).toBe(`No gaps detected as of ${FIXED_AT}.`);
    }
  });

  it('renders gaps from regulatory.missingArtifacts', () => {
    const report = renderReport(
      baseInput({
        summary: { regulatory: { missingArtifacts: ['Cover letter', 'Clinical overview'] } },
      }),
    );
    const gaps = sectionById(report.sections, 'gaps');
    const gapList = gaps?.blocks.find(b => b.kind === 'gap-list');
    expect(gapList?.kind).toBe('gap-list');
    if (gapList?.kind === 'gap-list') {
      expect(gapList.items).toEqual([
        { title: 'Cover letter', severity: 'high' },
        { title: 'Clinical overview', severity: 'high' },
      ]);
    }
  });

  it('adds readiness metrics when regulatory summary present', () => {
    const report = renderReport(
      baseInput({
        summary: { regulatory: { readinessScore: 62, readinessLevel: 'in_progress' } },
      }),
    );
    const exec = sectionById(report.sections, 'executive-summary');
    const score = exec?.blocks.find(b => b.kind === 'metric' && b.label === 'Readiness score');
    const level = exec?.blocks.find(b => b.kind === 'metric' && b.label === 'Readiness level');
    expect(score).toMatchObject({ value: 62, unit: '%' });
    expect(level).toMatchObject({ value: 'in_progress' });
  });

  it('prepends a downgrade note when truthfulness.downgradedFrom is set', () => {
    const report = renderReport(
      baseInput({
        truthfulness: {
          allowedStatus: 'partial',
          downgradedFrom: 'final',
          reasons: ['Confidence too low.'],
        },
      }),
    );
    const exec = sectionById(report.sections, 'executive-summary');
    const first = exec?.blocks[0];
    expect(first?.kind).toBe('summary');
    if (first?.kind === 'summary') {
      expect(first.text).toContain('downgraded from final to partial');
      expect(first.text).toContain('Confidence too low.');
    }
    expect(report.truthfulness).toBeDefined();
  });

  it('is deterministic when generatedAt is passed', () => {
    const input = baseInput();
    const a = renderReport(input);
    const b = renderReport(input);
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(FIXED_AT);
  });
});
