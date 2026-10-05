/**
 * The CER conformance validator checks the CANONICAL CER / PER structure, and a
 * section is present only when a HEADING names it.
 *
 * GET /api/cer/mdr/:reportId/validate used to run a private 10-column checklist
 * over cer_reports. Scope, appraisal, evaluator qualification, PMCF and
 * references exist only as cer_sections rows, so a CER missing every one of
 * them was `valid: true`, and an IVDR report was checked as a CER (no
 * analytical-performance pillar at all).
 *
 * A first fix matched section rows by keyword, and review found three ways a
 * keyword-matched validator calls a non-conforming document valid:
 *   - substring keywords: "endoscope" contains "scope", equipment IQ/OQ/PQ
 *     "qualification" read as evaluator qualification;
 *   - whole-word " reference " matched IVD terms of art (reference interval /
 *     range / material / method), so a PER with no references section passed;
 *   - an id like "scope" stood in for a heading the row does not have.
 * The class fix: a row names a section only when its HEADING (title), with
 * numbering and styling removed, IS a phrase of that framework's heading
 * vocabulary (MEDDEV 2.7/1 Rev 4 + MDR Annex XIV for a CER, IVDR Annex XIII
 * for a PER). Terms of art of the other framework never name a section.
 * Anything else is not found, and the verdict is not valid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// validateReportDetailed reads cer_reports (…limit(1)) and cer_sections
// (awaited …where()). The mock answers each shape with the rows set per test.
const rows: { report: unknown[]; sections: unknown[] } = { report: [], sections: [] };
vi.mock('../../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => ({
      limit: () => Promise.resolve(rows.report),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(rows.sections).then(ok, ko),
    }),
  };
  return { db: chain };
});

import UnifiedCERService from '../index';
import { validateCerConformance } from '../cerConformanceValidator';
import { CER_SECTIONS } from '../../market-specs/cer-structure';
import { PER_SECTIONS } from '../../market-specs/per-structure';
import * as stored from '../../market-specs/stored-cer-assessment';

/** Every cer_reports column populated — the input the old checklist called valid. */
function columnCompleteReport(framework: string): Record<string, unknown> {
  return {
    regulatoryFramework: framework,
    deviceName: 'x',
    deviceClass: 'III',
    executiveSummary: 's',
    deviceDescription: 'd',
    essentialRequirements: 'g',
    clinicalBackground: 'b',
    clinicalEvidence: 'e',
    literatureReview: 'l',
    riskBenefitAnalysis: 'r',
    conclusions: 'c',
  };
}

const row = (sectionId: string, title: string, text = 'written content') => ({
  sectionId,
  title,
  content: { text },
});

const CER_ROWS = [
  row('scope', 'Scope of the Clinical Evaluation'),
  row('appraisal', 'Appraisal of the Clinical Data'),
  row('pmcf', 'Post-Market Clinical Follow-up (PMCF) Considerations'),
  row('evaluators', 'Qualification of the Evaluators'),
  row('refs', 'References'),
];

const PER_ROWS_WITHOUT_ANALYTICAL = [
  row('pep', 'Performance Evaluation Plan (PEP)'),
  row('sv', 'Scientific Validity Report'),
  row('cp', 'Clinical Performance Report'),
  row('pmpf', 'Post-Market Performance Follow-up (PMPF) Considerations'),
  row('evaluators', 'Qualification of the Evaluators'),
  row('refs', 'References'),
];
const PER_ANALYTICAL_ROW = row('ap', 'Analytical Performance Report');
const COMPLETE_PER_ROWS = [...PER_ROWS_WITHOUT_ANALYTICAL, PER_ANALYTICAL_ROW];

const failedIds = (r: ReturnType<typeof validateCerConformance>) =>
  r.checks.filter(c => c.status === 'fail' && c.severity === 'mandatory').map(c => c.id);

const mdr = (sections: unknown[] = [], opts: { equivalenceClaimed?: boolean } = {}) =>
  validateCerConformance(
    columnCompleteReport('MDR_2017_745'),
    sections as never,
    { equivalenceClaimed: false, ...opts } as never
  );
const ivdr = (sections: unknown[] = []) =>
  validateCerConformance(columnCompleteReport('IVDR_2017_746'), sections as never);

describe('MDR CER — checked against the canonical CER structure', () => {
  it('a column-complete CER with no scope, appraisal, evaluator qualification, PMCF or references is NOT valid', () => {
    const r = mdr();
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(
      expect.arrayContaining(['scope', 'appraisal', 'evaluator_qualification', 'pmcf', 'references'])
    );
  });

  it('the same CER with those sections stored under their headings is valid', () => {
    const r = mdr(CER_ROWS);
    expect(failedIds(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('runs no private checklist: framework, device identification and the canonical required sections', () => {
    const r = mdr(CER_ROWS);
    const mandatory = r.checks
      .filter(c => c.severity === 'mandatory')
      .map(c => c.id)
      .sort();
    const canonical = CER_SECTIONS.filter(s => s.required && !s.equivalenceOnly).map(s => s.id);
    expect(mandatory).toEqual(['device_identification', 'framework', ...canonical].sort());
    for (const old of ['executive_summary', 'gspr_conformity', 'benefit_risk', 'literature_review', 'clinical_evidence']) {
      expect(r.checks.find(c => c.id === old)).toBeUndefined();
    }
  });

  it('a section row whose content is empty does not count as present', () => {
    for (const hollow of [{ text: '  ' }, {}, { html: '<p></p>' }, { blocks: [{ text: '' }] }]) {
      const rowsWithHollow = CER_ROWS.map(x => (x.sectionId === 'appraisal' ? { ...x, content: hollow } : x));
      const r = mdr(rowsWithHollow);
      expect(r.valid).toBe(false);
      expect(failedIds(r)).toEqual(['appraisal']);
    }
  });

  it('a missing section says it was not found and names the headings that matched nothing', () => {
    const r = mdr([...CER_ROWS.filter(x => x.sectionId !== 'scope'), row('x', 'Endoscope Design Overview')]);
    const scope = r.checks.find(c => c.id === 'scope');
    expect(scope?.status).toBe('fail');
    expect(scope?.detail).toMatch(/not found/i);
    expect(scope?.detail).toContain('Endoscope Design Overview');
  });

  it('equivalence: required when claimed; when the claim is not recorded it cannot pass silently', () => {
    const claimed = mdr(CER_ROWS, { equivalenceClaimed: true });
    expect(claimed.valid).toBe(false);
    expect(failedIds(claimed)).toEqual(['equivalence']);

    const withSection = mdr([...CER_ROWS, row('eq', '4.2 Demonstration of Equivalence')], {
      equivalenceClaimed: true,
    });
    expect(withSection.valid).toBe(true);

    const unknown = validateCerConformance(columnCompleteReport('MDR_2017_745'), CER_ROWS as never);
    const eq = unknown.checks.find(c => c.id === 'equivalence');
    expect(eq?.status).toBe('fail');
    expect(eq?.severity).toBe('recommended');
    expect(eq?.detail).toMatch(/not recorded/i);
  });
});

describe('reviewed false-valid case: substrings and equipment qualification are not sections', () => {
  // "endoscope" contains "scope"; IQ/OQ/PQ "qualification" is equipment, not
  // the evaluators. A CER holding only these has no scope and no evaluator
  // qualification, whatever the row ids say.
  const ENDOSCOPE_ROWS = [
    row('scope', 'Endoscope Design Overview'),
    row('scope-2', 'Scope and limitations of the reprocessing validation are described below.'),
    row('appraisal', 'Appraisal of the Clinical Data'),
    row('pmcf', 'PMCF'),
    row('evaluator_qualification', 'Reprocessing Validation and Qualification'),
    row('iq-oq-pq', 'Endoscope IQ/OQ/PQ Qualification'),
    row('refs', 'References'),
  ];

  it('a CER with no scope heading and no evaluator-qualification heading is NOT valid', () => {
    const r = validateCerConformance(
      { ...columnCompleteReport('MDR_2017_745'), deviceName: 'Flexible Endoscope' },
      ENDOSCOPE_ROWS as never,
      { equivalenceClaimed: false } as never
    );
    expect(r.valid).toBe(false);
    expect(failedIds(r).sort()).toEqual(['evaluator_qualification', 'scope']);
  });

  it('true-valid counterpart: the same endoscope CER with real scope and evaluator headings is valid', () => {
    const r = validateCerConformance(
      { ...columnCompleteReport('MDR_2017_745'), deviceName: 'Flexible Endoscope' },
      [
        ...ENDOSCOPE_ROWS,
        row('s', '2. Scope of the Clinical Evaluation'),
        row('q', '8 Qualification of the Responsible Evaluators'),
      ] as never,
      { equivalenceClaimed: false } as never
    );
    expect(failedIds(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a PER whose only "qualification" row is analyser IQ/OQ has no evaluator qualification', () => {
    const iq = COMPLETE_PER_ROWS.map(x =>
      x.sectionId === 'evaluators' ? row('evaluator_qualification', 'Analyser IQ OQ Qualification') : x
    );
    const r = ivdr(iq);
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(['evaluator_qualification']);
  });
});

describe('reviewed false-valid case: IVD reference terms of art are not a references section', () => {
  const REFERENCE_TERMS_OF_ART = [
    row('ri', 'Reference Interval Study'),
    row('rr', 'Reference Range Verification'),
    row('rm', 'Reference Materials and Metrological Traceability'),
    row('rmeth', 'Reference Method Comparison'),
    row('references', 'Reference Measurement Procedure'),
  ];
  const withoutReferences = COMPLETE_PER_ROWS.filter(x => x.sectionId !== 'refs');

  it('a PER with reference-interval, -range, -material and -method rows but no references section is NOT valid', () => {
    const r = ivdr([...withoutReferences, ...REFERENCE_TERMS_OF_ART]);
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(['references']);
  });

  it('true-valid counterpart: the same PER with a References heading is valid', () => {
    const r = ivdr([...withoutReferences, ...REFERENCE_TERMS_OF_ART, row('b', '**8. References and Appendices**')]);
    expect(failedIds(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });
});

describe('IVDR — checked as a Performance Evaluation Report, not a CER', () => {
  it('an IVDR report without the analytical-performance section is NOT valid', () => {
    const r = ivdr(PER_ROWS_WITHOUT_ANALYTICAL);
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(['analytical_performance']);
  });

  it('a column-complete IVDR report with no PER sections is NOT valid; no CER column stands in for a pillar', () => {
    const r = ivdr();
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(
      expect.arrayContaining(['pep', 'scientific_validity', 'analytical_performance', 'clinical_performance', 'pmpf'])
    );
  });

  it('CER headings do not satisfy PER sections', () => {
    const r = ivdr([
      ...COMPLETE_PER_ROWS.filter(x => x.sectionId !== 'cp' && x.sectionId !== 'pmpf'),
      row('ce', 'Clinical Evidence'),
      row('pmcf', 'Post-Market Clinical Follow-up (PMCF) Considerations'),
    ]);
    expect(r.valid).toBe(false);
    expect(failedIds(r).sort()).toEqual(['clinical_performance', 'pmpf']);
  });

  it('a complete PER is valid and is checked against the canonical PER sections', () => {
    const r = ivdr(COMPLETE_PER_ROWS);
    expect(r.valid).toBe(true);
    const mandatory = r.checks
      .filter(c => c.severity === 'mandatory')
      .map(c => c.id)
      .sort();
    expect(mandatory).toEqual(
      ['device_identification', 'framework', ...PER_SECTIONS.filter(s => s.required).map(s => s.id)].sort()
    );
  });
});

describe('a section is named only by a heading', () => {
  const cer = (title: string) => stored.mapStoredCerToCanonicalSections({}, [{ sectionId: 'r', title }]).present;
  const per = (title: string) => stored.mapStoredPerToCanonicalSections({}, [{ sectionId: 'r', title }]).present;

  it('every canonical CER and PER section title names its own section, and only it', () => {
    for (const s of CER_SECTIONS) expect(cer(s.title)).toEqual([s.id]);
    for (const s of PER_SECTIONS) expect(per(s.title)).toEqual([s.id]);
  });

  it('numbered and styled headings are recognised', () => {
    expect(cer('2. Scope of the Clinical Evaluation')).toEqual(['scope']);
    expect(cer('Section 8: Qualification of the Responsible Evaluators')).toEqual(['evaluator_qualification']);
    expect(cer('## 9 References')).toEqual(['references']);
    expect(cer('**References**')).toEqual(['references']);
    expect(cer('<h2>4.5 Summary and Appraisal of Clinical Data</h2>')).toEqual(['appraisal']);
    expect(per('3.1 Analytical Performance Report')).toEqual(['analytical_performance']);
    expect(cer('12.References&nbsp;')).toEqual(['references']);
    expect(cer('PMCF Plan')).toEqual(['pmcf']);
  });

  it('body prose, partial phrases and row ids never name a section', () => {
    expect(cer('The scope of this evaluation covers the flexible endoscope family.')).toEqual([]);
    expect(cer('Scope and limitations of the reprocessing validation')).toEqual([]);
    expect(cer('Qualification')).toEqual([]);
    expect(cer('Analysis')).toEqual([]);
    expect(cer('Appendices')).toEqual([]);
    // No generic qualifier word may be appended: a plan is not the section.
    expect(cer('Appraisal Plan')).toEqual([]);
    expect(cer('Scope Justification')).toEqual([]);
    expect(per('Scientific Validity Plan')).toEqual([]);
    expect(per('References Report')).toEqual([]);
    expect(
      stored.mapStoredCerToCanonicalSections({}, [{ sectionId: 'scope', title: 'Endoscope Design Overview' }]).present
    ).toEqual([]);
  });

  it("terms of art of the other framework never name a section", () => {
    for (const t of ['Analytical Performance', 'Scientific Validity Report', 'Performance Evaluation Plan', 'PMPF']) {
      expect(cer(t)).toEqual([]);
    }
    for (const t of ['PMCF', 'Equivalence', 'Clinical Evidence', 'Clinical Data', 'Scope of the Clinical Evaluation']) {
      expect(per(t)).toEqual([]);
    }
    for (const t of ['Reference Interval', 'Reference Range', 'Reference Material', 'Reference Method', 'Reference']) {
      expect(per(t)).toEqual([]);
      expect(cer(t)).toEqual([]);
    }
  });

  it('no vocabulary phrase contains a term of art of the other framework, and none names two sections', () => {
    const vocabs = [stored.CER_HEADING_VOCABULARY, stored.PER_HEADING_VOCABULARY];
    for (const v of vocabs) {
      const seen = new Map<string, string>();
      for (const [section, phrases] of Object.entries(v.headings)) {
        for (const p of phrases) {
          expect(seen.get(p) ?? section).toBe(section);
          seen.set(p, section);
          for (const excluded of v.excludedTerms) {
            expect(` ${p} `.includes(` ${excluded} `)).toBe(false);
          }
        }
      }
    }
    expect(stored.PER_HEADING_VOCABULARY.excludedTerms).toEqual(
      expect.arrayContaining(['pmcf', 'equivalence', 'clinical evidence'])
    );
    expect(stored.CER_HEADING_VOCABULARY.excludedTerms).toEqual(
      expect.arrayContaining(['analytical performance', 'scientific validity', 'reference interval'])
    );
  });
});

describe('the framework must be one the check knows', () => {
  it('an unknown or missing framework fails closed', () => {
    for (const fw of ['FDA_510K', 'unknown', '', null]) {
      const r = validateCerConformance(
        { ...columnCompleteReport('MDR_2017_745'), regulatoryFramework: fw },
        CER_ROWS as never,
        { equivalenceClaimed: false } as never
      );
      expect(r.valid).toBe(false);
      expect(failedIds(r)).toContain('framework');
    }
  });
});

describe('CER basis is the instrument of the declared framework', () => {
  it('the framework check cites the declared framework, labelled recall', () => {
    const uk = validateCerConformance(columnCompleteReport('UK_MDR_2002'), CER_ROWS as never);
    const ukFw = uk.checks.find(c => c.id === 'framework');
    expect(ukFw?.reference).toContain('UK MDR 2002');
    expect(ukFw?.reference).toContain('recall');

    const ivd = ivdr();
    const ivdFw = ivd.checks.find(c => c.id === 'framework');
    expect(ivdFw?.reference).toContain('IVDR 2017/746');
    expect(ivdFw?.reference).toContain('recall');
  });

  it('a UK MDR 2002 CER cites the MDD Annex X basis, not EU MDR Annex XIV', () => {
    const r = validateCerConformance(columnCompleteReport('UK_MDR_2002'), CER_ROWS as never);
    const refs = r.checks.filter(c => c.id !== 'framework').map(c => c.reference);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toContain('UK MDR 2002');
      expect(ref).toContain('Annex X;');
      expect(ref).not.toContain('Annex XIV');
      expect(ref).toContain('recall');
    }
  });

  it('an EU MDR CER cites MDR Annex XIV Part A, labelled recall', () => {
    const scope = mdr(CER_ROWS).checks.find(c => c.id === 'scope');
    expect(scope?.reference).toContain('MDR 2017/745 Annex XIV Part A');
    expect(scope?.reference).toContain('recall');
  });
});

describe('UnifiedCERService.validateReportDetailed — reads the cer_sections rows', () => {
  beforeEach(() => {
    rows.report = [{ reportId: 'CER-1', ...columnCompleteReport('MDR_2017_745') }];
    rows.sections = [];
  });

  it('a stored column-complete CER with no section rows is not valid', async () => {
    const r = await new UnifiedCERService({ organizationId: 7 }).validateReportDetailed('CER-1');
    if ('notFound' in r) throw new Error('report should be found');
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(expect.arrayContaining(['scope', 'appraisal', 'evaluator_qualification']));
  });

  it('the stored section rows count toward the canonical structure', async () => {
    rows.sections = CER_ROWS;
    const r = await new UnifiedCERService({ organizationId: 7 }).validateReportDetailed('CER-1');
    if ('notFound' in r) throw new Error('report should be found');
    expect(failedIds(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a stored IVDR report is checked as a PER', async () => {
    rows.report = [{ reportId: 'PER-1', ...columnCompleteReport('IVDR_2017_746') }];
    rows.sections = PER_ROWS_WITHOUT_ANALYTICAL;
    const r = await new UnifiedCERService({ organizationId: 7 }).validateReportDetailed('PER-1');
    if ('notFound' in r) throw new Error('report should be found');
    expect(r.valid).toBe(false);
    expect(failedIds(r)).toEqual(['analytical_performance']);
  });

  it('an absent report is notFound, never valid', async () => {
    rows.report = [];
    const r = await new UnifiedCERService({ organizationId: 7 }).validateReportDetailed('CER-NOPE');
    expect(r).toEqual({ notFound: true });
  });
});
