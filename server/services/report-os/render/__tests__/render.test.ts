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

  /* QA 2026-10-08 (j8): the stored figure was `95 − 20 × blockers`, printed as
     "Overall confidence 75%" beside a readiness that was not computed. No engine
     behind this renderer measures a confidence, so none is printed
     (render-one-readiness.test.ts pins what is said instead). */
  it('prints no confidence, whatever figure the run carries', () => {
    const report = renderReport(baseInput({ confidence: 88 }));
    const exec = sectionById(report.sections, 'executive-summary');
    expect(exec?.blocks.find(b => b.kind === 'metric' && b.label === 'Confidence')).toBeUndefined();
    expect(JSON.stringify(report.sections)).not.toMatch(/confidence/i);
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

  /* Reporting review 2026-10-01: this case pinned the defect. A summary with no
     gap evaluation printed "No gaps detected", and sealed it in final records,
     for every scope no evaluation covers. "Not evaluated" and "no gaps" now
     never print the same sentence. */
  it('says gaps were not evaluated when no gap evaluation ran, and claims no empty list', () => {
    const report = renderReport(baseInput({ summary: {} }));
    const gaps = sectionById(report.sections, 'gaps');
    expect(gaps).toBeDefined();
    expect(gaps?.blocks.find(b => b.kind === 'gap-list')).toBeUndefined();
    const note = gaps?.blocks.find(b => b.kind === 'summary');
    expect(note?.kind === 'summary' && note.text).toBe('Gaps were not evaluated for this scope.');
    expect(JSON.stringify(report)).not.toContain('No gaps detected');
  });

  it('says no gaps were detected only when an evaluation ran and found none', () => {
    const report = renderReport(
      baseInput({ summary: { regulatory: { artifactsAssessed: true, missingArtifacts: [] } } }),
    );
    const gaps = sectionById(report.sections, 'gaps');
    const gapList = gaps?.blocks.find(b => b.kind === 'gap-list');
    expect(gapList?.kind === 'gap-list' && gapList.items).toEqual([]);
    const note = gaps?.blocks.find(b => b.kind === 'summary');
    expect(note?.kind === 'summary' && note.text).toBe(`No gaps detected as of ${FIXED_AT}.`);
  });

  /* HS-1008-2. THE FIXTURE ABOVE USED TO BE `{ missingArtifacts: [] }` ALONE,
     and this case is why that was wrong. The orchestrator sets that field on
     every project-scope run, and `evaluateReadiness` returns `missing: []`
     whenever the filing type has no resolved artifact matrix — most of the
     application registry. So "no evaluation ran" and "an evaluation ran clean"
     arrived at the renderer looking identical, and the renderer chose the
     reassuring reading for both, in a document that can be sealed. An empty
     list with no assessment flag now fails closed. */
  it('does not read an empty missingArtifacts list as an evaluation, absent the assessed flag', () => {
    const report = renderReport(baseInput({ summary: { regulatory: { missingArtifacts: [] } } }));
    const gaps = sectionById(report.sections, 'gaps');
    const note = gaps?.blocks.find(b => b.kind === 'summary');
    expect(note?.kind === 'summary' && note.text).toBe('Gaps were not evaluated for this scope.');
    expect(JSON.stringify(report)).not.toContain('No gaps detected');
  });

  /* The structural rule, independent of any provider path: a document may not
     state "No gaps detected" while the same document lists blockers. Before
     this the renderer consulted neither `blockers` nor the readiness level
     before printing the sentence, so a report listed "Artifact requirements not
     assessed" as a blocker and then reassured on the next page. */
  it('withholds the no-gaps sentence while the same report lists blockers', () => {
    const report = renderReport(
      baseInput({
        blockers: ['Artifact requirements not assessed: no matrix is defined for this filing type.'],
        summary: { regulatory: { artifactsAssessed: true, missingArtifacts: [] } },
      }),
    );
    expect(sectionById(report.sections, 'blockers')).toBeDefined();
    const note = sectionById(report.sections, 'gaps')?.blocks.find(b => b.kind === 'summary');
    expect(note?.kind === 'summary' && note.text).toContain('not a clear result');
    expect(JSON.stringify(report)).not.toContain('No gaps detected');
  });

  /* The run's own gap list reaches the gaps section, with the evaluator's
     severities mapped into the renderer's. Section gaps and the `critical`
     not-assessed markers used to go only into blockers. */
  it('renders the readiness run\'s own gaps, at their recorded severity', () => {
    const report = renderReport(
      baseInput({
        summary: {
          regulatory: {
            artifactsAssessed: false,
            missingArtifacts: [],
            gaps: [
              {
                type: 'artifact',
                code: 'ARTIFACT_REQUIREMENTS_NOT_MODELLED',
                title: 'Artifact requirements not assessed',
                severity: 'critical',
                message: 'This score reflects section completeness only.',
              },
              { type: 'section', code: 'SECTION_INCOMPLETE', title: 'Module 2.5 incomplete', severity: 'important', message: '' },
              { type: 'section', code: 'SECTION_THIN', title: 'Module 1.2 is thin', severity: 'recommended', message: 'Consider expanding.' },
            ],
          },
        },
      }),
    );
    const gapList = sectionById(report.sections, 'gaps')?.blocks.find(b => b.kind === 'gap-list');
    expect(gapList?.kind).toBe('gap-list');
    if (gapList?.kind === 'gap-list') {
      expect(gapList.items).toEqual([
        {
          title: 'Artifact requirements not assessed',
          severity: 'critical',
          message: 'This score reflects section completeness only.',
        },
        { title: 'Module 2.5 incomplete', severity: 'high' },
        { title: 'Module 1.2 is thin', severity: 'medium', message: 'Consider expanding.' },
      ]);
    }
    expect(JSON.stringify(report)).not.toContain('No gaps detected');
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
    const score = exec?.blocks.find(b => b.kind === 'metric' && b.label === 'Submission readiness');
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
