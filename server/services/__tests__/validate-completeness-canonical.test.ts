/**
 * validate-completeness reads the canonical required-section profiles and fails
 * closed (g-validate-completeness-canonical, 2026-10-05).
 *
 * The engine behind /api/validate-completeness, scoreSubmissionDraft and the
 * report-os CRL/RTF pre-mortem kept its own requirement table. Its defects,
 * all reproduced at HEAD before this change:
 *   - blockers were chosen by `c.module <= '3'`, so an NDA with no Module 4 or
 *     5 had zero blockers, and an empty IVDR file (module 'A') was
 *     'conditional_go';
 *   - presence was a substring match, so '3.2.S.1.1' and '1.10' both satisfied
 *     '1.1 Forms (FDA 356h)';
 *   - TYPE_MAP sent an EU MAA to the FDA NDA table (FDA 356h, no RMP), and an
 *     IND fell through to the NDA table;
 *   - devices got invented CTD-like "modules 1-6".
 *
 * Requirements now come from `ectd/required-sections.requiredSectionProfileFor`
 * (the one profile the eCTD validator reads), presence from
 * `ectd/section-code-match.sectionMatches`, and a type with no profile is
 * `not_assessed` — never scored, never a borrowed table.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../tests/setup';

vi.mock('../../db/runtime', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  db: mockPool,
  getDb: () => mockPool,
}));

const { ValidateCompletenessEngine } = await import('../validate-completeness-engine');
const { requiredSectionsFor } = await import('../ectd/required-sections');
const { scoreSubmissionDraft } = await import('../intelligence/regulatory-intelligence');

const engine = new ValidateCompletenessEngine();

function profile(type: string): string[] {
  const set = requiredSectionsFor(type);
  if (!set) throw new Error(`test setup: no profile for ${type}`);
  return [...set];
}

function item(res: { checklist: Array<{ section: string; present: boolean }> }, section: string) {
  const found = res.checklist.find((c) => c.section === section);
  if (!found) throw new Error(`checklist has no item ${section}: ${res.checklist.map((c) => c.section).join(', ')}`);
  return found;
}

describe('NDA: every missing required section is a blocker', () => {
  it('an NDA carrying only Modules 1-3 is no_go, with 5.2 and 5.3.5 among the blockers', async () => {
    const m1to3 = profile('NDA').filter((c) => /^[123]\./.test(c));
    const res = await engine.validate({ submissionType: 'NDA', presentSections: m1to3, targetAgency: 'FDA' });
    expect(res.goNoGo.decision).toBe('no_go');
    const blockerCodes = res.goNoGo.blockers.map((b) => b.split(':')[0]);
    expect(blockerCodes).toContain('5.3.5');
    expect(blockerCodes).toContain('5.2');
    expect(blockerCodes).toContain('4.2.3');
  });

  it('an NDA carrying every profiled section is go, 100% complete', async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: profile('NDA'), targetAgency: 'FDA' });
    expect(res.goNoGo.decision).toBe('go');
    expect(res.goNoGo.blockers).toEqual([]);
    expect(res.summary?.readinessPercentage).toBe(100);
  });

  it('the NDA checklist is exactly the canonical profile — no hand table', async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: [], targetAgency: 'FDA' });
    expect(res.checklist.map((c) => c.section).sort()).toEqual(profile('NDA').sort());
  });
});

describe('presence is exact-or-descendant, never a substring', () => {
  it("'3.2.S.1.1' satisfies 3.2.S and does NOT satisfy 1.1", async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: ['3.2.S.1.1'], targetAgency: 'FDA' });
    expect(item(res, '1.1').present).toBe(false);
    expect(item(res, '3.2.S').present).toBe(true);
  });

  it("'1.10' does NOT satisfy 1.1", async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: ['1.10'], targetAgency: 'FDA' });
    expect(item(res, '1.1').present).toBe(false);
  });

  it("an 'm'-prefixed leaf ('m5.3.5.1') satisfies 5.3.5", async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: ['m5.3.5.1'], targetAgency: 'FDA' });
    expect(item(res, '5.3.5').present).toBe(true);
  });
});

describe('each type is judged against its own region, never the FDA NDA table', () => {
  it('an EU MAA has no FDA 356h item and requires the EU risk-management system (1.8.2)', async () => {
    const res = await engine.validate({ submissionType: 'MAA', presentSections: [] });
    expect(JSON.stringify(res.checklist)).not.toMatch(/356h/i);
    expect(res.checklist.map((c) => c.section)).toContain('1.8.2');
    expect(res.checklist.map((c) => c.section).sort()).toEqual(profile('MAA').sort());
    expect(res.targetAgency).toBe('EMA');
  });

  it('an IND is judged against the IND profile, not the NDA table', async () => {
    const res = await engine.validate({ submissionType: 'IND', presentSections: [], targetAgency: 'FDA' });
    expect(JSON.stringify(res.checklist)).not.toMatch(/356h/i);
    expect(res.checklist.map((c) => c.section).sort()).toEqual(profile('IND').sort());
    expect(res.checklist.map((c) => c.section)).not.toContain('5.3');
  });

  it('an NDA filed with a non-FDA agency is not assessed (no borrowed region)', async () => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: [], targetAgency: 'EMA' });
    expect(res.goNoGo.decision).toBe('not_assessed');
  });
});

describe('targetAgency is reported normalized', () => {
  it.each([' ', '', 'fda', ' FDA '])("NDA with targetAgency %j is assessed and reported as 'FDA'", async (agency) => {
    const res = await engine.validate({ submissionType: 'NDA', presentSections: [], targetAgency: agency });
    expect(res.assessment.status).toBe('assessed');
    expect(res.targetAgency).toBe('FDA');
  });
});

describe('a type with no profile is not_assessed, never conditional_go', () => {
  it.each(['510(k)', 'De Novo', 'PMA'])('%s points at the eSTAR filing-readiness engine', async (t) => {
    const res = await engine.validate({ submissionType: t, presentSections: [], targetAgency: 'FDA' });
    expect(res.goNoGo.decision).toBe('not_assessed');
    expect(res.assessment.status).toBe('not_assessed');
    if (res.assessment.status !== 'not_assessed') throw new Error('unreachable');
    expect(res.assessment.assessWith?.engine).toBe('assessEstarFilingReadiness');
    expect(res.assessment.assessWith?.module).toBe('server/services/pathway-engines/estar/estar-filing-readiness.ts');
    expect(res.checklist).toEqual([]);
    expect(res.summary).toBeNull();
  });

  it('an empty IVDR technical file is not_assessed and points at the MDR/IVDR tech-doc engine', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    expect(res.goNoGo.decision).toBe('not_assessed');
    if (res.assessment.status !== 'not_assessed') throw new Error('IVDR was assessed');
    expect(res.assessment.assessWith?.engine).toBe('assembleTechDoc');
    expect(res.assessment.assessWith?.module).toBe('server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts');
  });

  // Review fix round 1: the pointer is an explicit allow-list keyed by registry
  // id. A category/segment heuristic routed EUA, HDE and every EU vigilance /
  // post-market / clinical-investigation type to an engine that does not
  // assess it, and called each one "a device pathway assessed by" that engine.
  it.each(['US_510K', 'US_DE_NOVO', 'US_PMA', 'US_IDE', 'US_PMA_SUPP'])(
    '%s points at eSTAR, which assesses it',
    async (t) => {
      const res = await engine.validate({ submissionType: t, presentSections: [] });
      if (res.assessment.status !== 'not_assessed') throw new Error(`${t} was assessed by the CTD engine`);
      expect(res.assessment.assessWith?.engine).toBe('assessEstarFilingReadiness');
    },
  );

  it.each([
    ['EU_MDR_TECHDOC', 'mdr'],
    ['mdr_td', 'mdr'],
    ['EU_MDR_CLASS_I', 'mdr'],
    ['EU_MDR_CLASS_III', 'mdr'],
    ['IVDR_TD', 'ivdr'],
    ['EU_IVDR_CLASS_A', 'ivdr'],
    ['EU_IVDR_CLASS_CD', 'ivdr'],
  ])('%s points at the tech-doc engine with regulation=%s', async (t, regulation) => {
    const res = await engine.validate({ submissionType: t, presentSections: [] });
    if (res.assessment.status !== 'not_assessed') throw new Error(`${t} was assessed by the CTD engine`);
    expect(res.assessment.assessWith?.engine).toBe('assembleTechDoc');
    expect(res.assessment.assessWith?.route).toMatch(new RegExp(`technical-file\\?regulation=${regulation}$`));
  });

  it.each([
    'US_EUA', 'US_HDE', 'EU_MIR', 'EU_FSCA', 'EU_CLIN_INVESTIGATION',
    'EU_PSUR_DEVICE', 'EU_IVD_VIGILANCE', 'EU_NB_CONSULT', 'EU_CER', 'EU_DOC', 'EU_SIG_CHANGE',
  ])('%s is assessed by neither eSTAR nor the tech-doc engine: assessWith null, no device-pathway claim', async (t) => {
    const res = await engine.validate({ submissionType: t, presentSections: [] });
    expect(res.goNoGo.decision).toBe('not_assessed');
    if (res.assessment.status !== 'not_assessed') throw new Error(`${t} was assessed`);
    expect(res.assessment.assessWith).toBeNull();
    expect(res.assessment.reason).toMatch(/No canonical required-section profile/);
    expect(res.assessment.reason).not.toMatch(/assessEstarFilingReadiness|assembleTechDoc|device pathway/);
    expect(res.goNoGo.conditions).toEqual([]);
  });

  it.each(['ANDA', '505(b)(2)', 'CTA', 'NOT-A-TYPE'])('%s has no profile: not_assessed, no checklist, no NaN', async (t) => {
    const res = await engine.validate({ submissionType: t, presentSections: [] });
    expect(res.goNoGo.decision).toBe('not_assessed');
    expect(res.goNoGo.readinessScore).toBeNull();
    expect(res.checklist).toEqual([]);
    expect(res.rtfRisk).toBeNull();
    expect(res.summary).toBeNull();
    expect(res.goNoGo.rationale).toMatch(/not assessed/i);
  });
});

describe('scoreSubmissionDraft refuses to score a not-assessed type', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }));
  });

  it('PMA: rejects with COMPLETENESS_NOT_ASSESSED (422) and never reaches the risk model or the prediction store', async () => {
    await expect(
      scoreSubmissionDraft({ organizationId: 7, submissionType: 'PMA', targetAgency: 'FDA', presentSections: [] }),
    ).rejects.toMatchObject({ code: 'COMPLETENESS_NOT_ASSESSED', statusCode: 422 });
    const sql = mockPool.query.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sql.filter((q: string) => /network_risk_priors|risk_model_versions|risk_predictions/.test(q))).toEqual([]);
  });

  it('NDA with no Module 5: the missing efficacy reports reach the model as missing-critical', async () => {
    const m1to4 = profile('NDA').filter((c) => !c.startsWith('5.'));
    const result = await scoreSubmissionDraft({ organizationId: 7, submissionType: 'NDA', targetAgency: 'FDA', presentSections: m1to4 });
    expect(result.completeness.goNoGo.decision).toBe('no_go');
    expect(result.completeness.rtfRisk.missingCritical.map((b) => b.split(':')[0]).sort()).toEqual(['5.2', '5.3.5']);
  });
});
