/**
 * selectDevicePathway / planDeviceSubmission (AnA tools `select_device_pathway`
 * and `plan_device_submission`) must not return a US pathway FDA would reject.
 * AnA is told to report these engines verbatim (medicalDeviceTools.ts), so a
 * wrong branch here is a wrong answer to the client.
 *
 * - A device of a new type with no predicate is class III by operation of
 *   FD&C 513(f)(1); De Novo under 513(f)(2) exists to classify it into class I
 *   or II. So "class III, no predicate, novel low/moderate risk" is De Novo.
 * - 510(k) exemption is set by the product code's classification regulation
 *   and its .9 limitations; "reserved" class I devices need a 510(k). Class I
 *   alone decides neither "exempt" nor "510(k)".
 * - A 510(k) shows substantial equivalence to a predicate; without one it is
 *   not the pathway.
 * - A HUD serves a condition affecting "not more than 8,000 individuals in the
 *   United States per year", and HDE needs an OOPD HUD designation first: an
 *   unknown population is not an HDE.
 * - eSTAR is mandatory for 510(k) and De Novo from the dates in the currency
 *   registry; the review clocks are the eSTAR catalog's MDUFA V goals.
 * - De Novo is 21 CFR 860 Subpart D (content 860.220). 21 CFR 860.93 is the
 *   classification of implants and life-supporting devices.
 */
import { describe, it, expect } from 'vitest';
import {
  selectDevicePathway,
  planDeviceSubmission,
  listDeviceCfrReferences,
  type SelectDevicePathwayParams,
} from '../medical-device-knowledge';
import { PATHWAY_CITATIONS, SUBMISSION_CITATIONS } from '../medical-device-knowledge-data';
import { SELECT_DEVICE_PATHWAY, PLAN_DEVICE_SUBMISSION } from '../../ana/medicalDeviceTools';
import { REGULATORY_FACTS } from '../../regulatory-currency/currency-registry';
import { getCatalogEntry } from '../../pathway-engines/estar/estar-catalog';

const pick = (p: SelectDevicePathwayParams) => selectDevicePathway(p);
const fact = (id: string) => REGULATORY_FACTS.find((f) => f.id === id)!;

describe('selectDevicePathway — decisions FDA would accept', () => {
  it('class III by default, no predicate, novel low/moderate risk → De Novo, PMA the alternative', () => {
    const r = pick({ usClass: 'III', predicateExists: false, novelLowModerateRisk: true });
    expect(r.usPathway).toBe('De Novo');
    expect(r.usPathwayRationale).toMatch(/513\(f\)\(1\)/);
    expect(r.usAlternatives.map((a) => a.pathway)).toContain('PMA');
  });

  it('class III with no predicate and no novelty claim → PMA route, with De Novo offered', () => {
    const r = pick({ usClass: 'III', predicateExists: false });
    expect(r.usPathway).toBe('IDE-then-PMA');
    expect(r.usAlternatives.map((a) => a.pathway)).toContain('De Novo');
  });

  it('class I is exempt only when the product code says so', () => {
    for (const predicateExists of [false, true]) {
      const r = pick({ usClass: 'I', predicateExists });
      expect(r.usPathway, `predicateExists=${predicateExists}`).toBe('undetermined');
      const f = r.findings.find((x) => x.id === 'NEEDS-INPUT-EXEMPTION');
      expect(f, 'needs-input finding').toBeDefined();
      expect(f!.statement).toMatch(/\.9 limitations/);
      expect(f!.statement).toMatch(/reserved/i);
    }
    expect(pick({ usClass: 'I', predicateExists: false, exempt: true }).usPathway).toBe('exempt');
  });

  it('a class III device stated to be 510(k)-exempt is not exempt: the inputs conflict', () => {
    const r = pick({ usClass: 'III', predicateExists: false, exempt: true });
    expect(r.usPathway).toBe('undetermined');
    expect(r.findings.find((x) => x.id === 'NEEDS-INPUT-CLASS-III-EXEMPT')?.severity).toBe('requirement');
  });

  it('class II or unclassified with no predicate is never sent to a 510(k)', () => {
    for (const usClass of ['II', 'unclassified'] as const) {
      const r = pick({ usClass, predicateExists: false });
      expect(r.usPathway, usClass).toBe('undetermined');
      expect(r.usPathwayRationale).not.toMatch(/substantial equivalence to a legally marketed predicate/i);
      const f = r.findings.find((x) => x.id === 'NEEDS-INPUT-PREDICATE');
      expect(f, 'needs-input finding').toBeDefined();
      expect(f!.statement).toMatch(/De Novo/);
      expect(f!.statement).toMatch(/513\(g\)/);
    }
    expect(pick({ usClass: 'II', predicateExists: true }).usPathway).toBe('510(k)');
    expect(pick({ usClass: 'II', predicateExists: false, novelLowModerateRisk: true }).usPathway).toBe('De Novo');
  });

  it('HUD population: not more than 8,000 qualifies; more does not; unknown is not an HDE', () => {
    const hud = (estimatedAnnualUSPopulation?: number) =>
      pick({ usClass: 'III', predicateExists: false, humanitarianUseDevice: true, estimatedAnnualUSPopulation });
    expect(hud(8000).usPathway).toBe('HDE');
    expect(hud(8001).usPathway).not.toBe('HDE');
    const unknown = hud(undefined);
    expect(unknown.usPathway).toBe('undetermined');
    const f = unknown.findings.find((x) => x.id === 'NEEDS-INPUT-HUD');
    expect(f, 'needs-input finding').toBeDefined();
    expect(f!.statement).toMatch(/HUD designation/);
    expect(f!.statement).toMatch(/not more than 8,000/);
    const withPredicate = pick({ usClass: 'III', predicateExists: true, humanitarianUseDevice: true });
    expect(withPredicate.usPathway).toBe('undetermined');
    expect(withPredicate.usAlternatives.map((a) => a.pathway)).toContain('510(k)');
  });

  it('review clocks are the eSTAR catalog MDUFA V goals', () => {
    const goal = (k: Parameters<typeof getCatalogEntry>[0]) => String(getCatalogEntry(k)!.reviewGoalDays);
    expect(pick({ usClass: 'II', predicateExists: true }).approximateUSReviewClock).toContain(goal('510k'));
    const dn = pick({ usClass: 'III', predicateExists: false, novelLowModerateRisk: true }).approximateUSReviewClock;
    expect(dn).toContain(goal('de_novo'));
    expect(dn).toMatch(/MDUFA V goal/);
  });
});

describe('planDeviceSubmission — eSTAR mandate and clocks from the registries', () => {
  it('a 510(k) plan is an eSTAR filing and the eSTAR finding is a requirement, sourced', () => {
    const r = planDeviceSubmission({ usPathway: '510(k)', asOf: '2026-10-04' });
    expect(r.submissionFormat).toMatch(/eSTAR/);
    const f = r.findings.find((x) => x.id === 'ESTAR');
    expect(f?.severity).toBe('requirement');
    expect(f?.citation?.url).toBe(fact('fda-estar-510k-mandatory').sourceUrl);
    expect(f?.statement).toContain(fact('fda-estar-510k-mandatory').effectiveDate);
  });

  it('De Novo eSTAR is not mandatory before the registry date and is after it', () => {
    const before = planDeviceSubmission({ usPathway: 'De Novo', asOf: '2025-09-30' });
    expect(before.findings.find((x) => x.id === 'ESTAR')?.severity).toBe('recommendation');
    expect(before.submissionFormat).toMatch(/eSTAR not mandatory as of 2025-09-30/);
    expect(before.submissionFormat).not.toMatch(/^FDA eSTAR/);
    expect(before.findings.find((x) => x.id === 'ESTAR')?.statement).toMatch(/not yet mandatory/);
    const after = planDeviceSubmission({ usPathway: 'De Novo', asOf: '2026-10-04' });
    expect(after.submissionFormat).toMatch(/eSTAR/);
    expect(after.findings.find((x) => x.id === 'ESTAR')?.severity).toBe('requirement');
  });

  it('the tool no longer offers a useEStar switch', () => {
    const props = (PLAN_DEVICE_SUBMISSION.input_schema as { properties: Record<string, unknown> }).properties;
    expect(props).not.toHaveProperty('useEStar');
  });

  it('the Q-Sub phase uses the 70-day Pre-Submission goal', () => {
    const r = planDeviceSubmission({ usPathway: 'De Novo', asOf: '2026-10-04' });
    const q = r.timeline.find((t) => /Q-Sub/.test(t.phase));
    expect(q?.durationEstimate).toContain(String(getCatalogEntry('qsub_pre_submission')!.reviewGoalDays));
    expect(q?.durationEstimate).not.toMatch(/75-90/);
  });
});

describe('De Novo citation and HUD wording', () => {
  it('no De Novo citation names 21 CFR 860.93', () => {
    const all = [
      ...PATHWAY_CITATIONS.map((c) => c.source + ' ' + c.note),
      ...SUBMISSION_CITATIONS.map((c) => c.source + ' ' + c.note),
      ...listDeviceCfrReferences().map((c) => c.key + ' ' + c.title),
      pick({ usClass: 'II', predicateExists: false, novelLowModerateRisk: true }).usPathwayRationale,
      SELECT_DEVICE_PATHWAY.description,
      PLAN_DEVICE_SUBMISSION.description,
    ].join('\n');
    expect(all).not.toMatch(/860\.93/);
    expect(all).toMatch(/860 Subpart D/);
  });

  it('no text states the superseded "<8,000" HUD threshold', () => {
    const schema = JSON.stringify(SELECT_DEVICE_PATHWAY);
    const rationales = [
      pick({ usClass: 'III', predicateExists: false, humanitarianUseDevice: true, estimatedAnnualUSPopulation: 10 }),
      pick({ usClass: 'III', predicateExists: false }),
    ]
      .flatMap((r) => [r.usPathwayRationale, ...r.usAlternatives.map((a) => a.whenApplicable)])
      .join('\n');
    const hdePlan = JSON.stringify(planDeviceSubmission({ usPathway: 'HDE', asOf: '2026-10-04' }));
    for (const t of [schema, rationales, hdePlan]) expect(t).not.toMatch(/<\s*8,?000/);
  });
});
