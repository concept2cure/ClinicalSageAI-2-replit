/**
 * Reporting-guideline advisor — unit tests. Deterministic; verifies guideline
 * resolution, study-type auto-selection, checklist content, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseReportingGuideline, listReportingGuidelines } from '../reporting-guidelines';

describe('adviseReportingGuideline', () => {
  it('returns CONSORT checklist essentials for RCTs', () => {
    const r = adviseReportingGuideline({ guideline: 'consort' });
    expect(r.resolved.guideline).toBe('consort');
    expect(r.brief).toContain('flow diagram');
    expect(r.brief.toLowerCase()).toContain('allocation concealment');
  });

  it('auto-selects PRISMA from a systematic-review study type', () => {
    const r = adviseReportingGuideline({ studyType: 'systematic review and meta-analysis' });
    expect(r.resolved.guideline).toBe('prisma');
    expect(r.selection[0].id).toBe('prisma');
  });

  it('auto-selects STROBE for an observational cohort', () => {
    const r = adviseReportingGuideline({ studyType: 'retrospective observational cohort' });
    expect(r.resolved.guideline).toBe('strobe');
  });

  it('auto-selects SPIRIT for a trial protocol', () => {
    const r = adviseReportingGuideline({ studyType: 'clinical trial protocol' });
    expect(r.resolved.guideline).toBe('spirit');
  });

  it('lists the guideline catalog', () => {
    const ids = listReportingGuidelines().map(g => g.id);
    expect(ids).toEqual(expect.arrayContaining(['consort', 'spirit', 'strobe', 'prisma', 'stard', 'arrive', 'care']));
  });
});
