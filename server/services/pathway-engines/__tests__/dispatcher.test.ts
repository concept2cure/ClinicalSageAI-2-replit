import { describe, it, expect } from 'vitest';
import { assessPathwayReadiness, PATHWAYS } from '../index';
import { mapToEstar } from '../estar/estar-mapper';

describe('mapToEstar', () => {
  it('510(k) requires a substantial-equivalence comparison', () => {
    const r = mapToEstar({
      type: '510k',
      leaves: [{ sectionCode: 'dd', title: 'Device description', documentType: 'device_description', substantive: true }],
    });
    expect(r.summary.missingRequired).toContain('substantial-equivalence');
    expect(r.summary.ready).toBe(false);
  });
  it('De Novo requires a classification request + special controls (not predicate SE)', () => {
    const r = mapToEstar({ type: 'de_novo', leaves: [] });
    expect(r.sections.some((s) => s.id === 'substantial-equivalence')).toBe(false);
    expect(r.summary.missingRequired).toContain('classification-request');
    expect(r.summary.missingRequired).toContain('special-controls');
  });
});

describe('assessPathwayReadiness — dispatcher', () => {
  it('routes ctis and aggregates Part I + Part II gaps with prefixes', () => {
    const r = assessPathwayReadiness({ pathway: 'ctis', leaves: [], memberStates: ['DE'] });
    expect(r.pathway).toBe('ctis');
    expect(r.ready).toBe(false);
    expect(r.missingRequired.some((m) => m.startsWith('I:'))).toBe(true);
    expect(r.missingRequired.some((m) => m.startsWith('II:DE:'))).toBe(true);
  });

  it('routes mdr and ivdr to the tech-doc assembler', () => {
    expect(assessPathwayReadiness({ pathway: 'mdr', leaves: [] }).missingRequired).toContain('clinical-evaluation');
    expect(assessPathwayReadiness({ pathway: 'ivdr', leaves: [] }).missingRequired).toContain('performance-evaluation');
  });

  it('routes estar variants to the eSTAR mapper', () => {
    expect(assessPathwayReadiness({ pathway: 'estar_510k', leaves: [] }).missingRequired).toContain('substantial-equivalence');
    expect(assessPathwayReadiness({ pathway: 'estar_de_novo', leaves: [] }).missingRequired).toContain('classification-request');
  });

  it('routes pma to the PMA mapper and threads the submission type', () => {
    const r = assessPathwayReadiness({ pathway: 'pma', leaves: [], pmaSubmissionType: 'panel_track_supplement' });
    expect(r.pathway).toBe('pma');
    expect(r.ready).toBe(false);
    expect(r.missingRequired).toContain('clinical');
    expect((r.detail as { submissionType: string }).submissionType).toBe('panel_track_supplement');
  });

  it('routes prestar q_sub / ide / 513g to the PreSTAR mapper', () => {
    const qSub = assessPathwayReadiness({ pathway: 'prestar_q_sub', leaves: [], qSubType: 'submission_issue_request' });
    expect(qSub.missingRequired).toContain('deficiency-reference');
    expect((qSub.detail as { qSubType: string }).qSubType).toBe('submission_issue_request');

    expect(assessPathwayReadiness({ pathway: 'prestar_ide', leaves: [] }).missingRequired).toContain('investigational-plan');
    expect(assessPathwayReadiness({ pathway: 'prestar_513g', leaves: [] }).missingRequired).toContain('classification-questions');
  });

  it('exposes the full set of pathways', () => {
    expect(PATHWAYS).toEqual([
      'ctis',
      'mdr',
      'ivdr',
      'estar_510k',
      'estar_de_novo',
      'pmda_shonin',
      'pma',
      'prestar_q_sub',
      'prestar_ide',
      'prestar_513g',
    ]);
  });
});
