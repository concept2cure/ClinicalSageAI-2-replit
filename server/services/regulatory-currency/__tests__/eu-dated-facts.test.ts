/**
 * EU medicines dates are EU facts, not ICH Step 4 dates read as EU law.
 *
 * ── The defect (D2 record, step g-eu-medicines-dated-facts; finding 45) ──────
 * The currency registry held ICH E6(R3) only as ICH Step 4 facts, both
 * `in_force`: Principles + Annex 1 from 2025-01-06 and Annex 2 from 2026-06-03.
 * The freshness check treats an ICH fact as in every jurisdiction, so an EU
 * sponsor citing "ICH E6(R3) Annex 2" was told it was in force. EMA's own page
 * says Annex 2 comes into effect in the EU on 2027-01-15, and Principles +
 * Annex 1 came into effect on 2025-07-23. The registry also had no EMA eCTD
 * v4.0 fact, no EU M1 v3.1.1 / validation criteria v8.2 fact and no record of
 * the pharma package, which existed only as undated prompt prose.
 *
 * Basis for every date: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/
 * 2026-10-05-record/g-eu-medicines-dated-facts-facts.md.
 */
import { describe, it, expect } from 'vitest';
import {
  REGULATORY_FACTS,
  findFacts,
  statusAsOf,
  changeRadar,
  hasFixedEffectiveDate,
  type RegulatoryFact,
} from '../currency-registry.js';
import { checkGuidanceFreshness } from '../guidance-ingestion-service.js';
import { EU_REGULATORY_DEEP_DIVE } from '../../ana-ri/locale-overlays.js';
import { getMarketSpec } from '../../market-specs/market-submission-specs.js';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry.js';

const TODAY = '2026-10-05';
const fact = (id: string): RegulatoryFact => {
  const f = REGULATORY_FACTS.find((x) => x.id === id);
  if (!f) throw new Error(`no fact ${id} in the currency registry`);
  return f;
};

describe('ICH E6(R3) in the EU is dated by EMA, not by ICH Step 4', () => {
  it('records Principles + Annex 1 in force in the EU from 2025-07-23', () => {
    const facts = findFacts({ topic: 'E6(R3)', jurisdiction: 'EU', asOf: TODAY });
    const principles = facts.find((f) => f.id === 'eu-e6r3-effective');
    expect(principles, 'no EU E6(R3) fact').toBeDefined();
    expect(principles).toMatchObject({ jurisdiction: 'EU', status: 'in_force', effectiveDate: '2025-07-23' });
    expect(principles!.sourceUrl).toMatch(/^https:\/\/www\.ema\.europa\.eu\//);
  });

  it('records Annex 2 as upcoming in the EU until 2027-01-15, then in force', () => {
    const [annex2] = findFacts({ topic: 'E6(R3)', jurisdiction: 'EU', asOf: TODAY }).filter(
      (f) => f.id === 'eu-e6r3-annex2-effective',
    );
    expect(annex2, 'no EU E6(R3) Annex 2 fact').toBeDefined();
    expect(annex2).toMatchObject({ status: 'mandatory_upcoming', effectiveDate: '2027-01-15' });
    expect(statusAsOf(fact('eu-e6r3-annex2-effective'), '2027-01-14')).toBe('mandatory_upcoming');
    expect(statusAsOf(fact('eu-e6r3-annex2-effective'), '2027-01-15')).toBe('in_force');
  });

  it('keeps the ICH Step 4 facts, and their notes say Step 4 is not regional effect', () => {
    for (const id of ['ich-e6r3-gcp-step4', 'ich-e6r3-annex2-step4']) {
      expect(fact(id).jurisdiction).toBe('ICH');
      expect(fact(id).note, id).toMatch(/regional effect differs/i);
    }
    expect(fact('ich-e6r3-gcp-step4').note).toContain('eu-e6r3-effective');
    expect(fact('ich-e6r3-annex2-step4').note).toContain('eu-e6r3-annex2-effective');
  });

  it('leaves "supersedes E6(R2)" on the ICH fact only', () => {
    expect(fact('ich-e6r3-gcp-step4').supersedes).toBe('E6(R2)');
    expect(fact('eu-e6r3-effective').supersedes).toBeUndefined();
    expect(fact('eu-e6r3-annex2-effective').supersedes).toBeUndefined();
  });
});

describe('check_guidance_freshness answers an EU citation with the EU fact', () => {
  it('resolves an EU "ICH E6(R3) Annex 2" citation to the EU fact and says it is not yet in effect', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'ICH E6(R3) Annex 2', jurisdiction: 'EU' }],
    }).results;
    expect(r.basis?.id).toBe('eu-e6r3-annex2-effective');
    expect(r.latestKnownDate).toBe('2027-01-15');
    expect(r.warning ?? '').toMatch(/not yet in effect/i);
    expect(r.warning ?? '').toContain('2027-01-15');
  });

  it('does not call a current EU Annex 2 citation stale against a date still to come', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'ICH E6(R3) Annex 2', jurisdiction: 'EU', citedDate: '2026-08-01' }],
    }).results;
    expect(r.warning ?? '').not.toMatch(/predates/);
  });

  it('resolves an EU "ICH E6(R3)" citation to the EU Principles fact', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'ICH E6(R3) Good Clinical Practice', jurisdiction: 'EU', citedDate: '2025-09-01' }],
    }).results;
    expect(r).toMatchObject({ current: true, basis: { id: 'eu-e6r3-effective' }, latestKnownDate: '2025-07-23' });
  });

  it('dates an EU E6(R2) citation as superseded on the EU date', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'ICH E6(R2)', jurisdiction: 'EU' }],
    }).results;
    expect(r.current).toBe(false);
    expect(r.basis?.id).toBe('eu-e6r3-effective');
    expect(r.warning ?? '').toContain('2025-07-23');
  });

  it('still answers a citation with no jurisdiction from the ICH Step 4 facts', () => {
    const [annex2, base] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'ICH E6(R3) Annex 2' }, { title: 'ICH E6(R2)' }],
    }).results;
    expect(annex2.basis?.id).toBe('ich-e6r3-annex2-step4');
    expect(base.basis?.id).toBe('ich-e6r3-gcp-step4');
  });
});

describe('EU eCTD dated facts', () => {
  it('records EMA eCTD v4.0 as optional for new centralised MAAs since 2025-12-22', () => {
    const v4 = fact('ema-ectd-v4-cp-optional');
    expect(v4).toMatchObject({ jurisdiction: 'EU', status: 'in_force', effectiveDate: '2025-12-22' });
    expect(v4.aliases).toContain('eCTD v4.0');
    // The mandatory date is a plan, not a day: it is in the note, never a dated fact.
    expect(v4.note).toMatch(/Q1 2028/);
    expect(v4.note).toMatch(/planned/i);
    expect(findFacts({ jurisdiction: 'EU', topic: 'eCTD' }).map((f) => f.id)).toContain('ema-ectd-v4-cp-optional');
  });

  it('identifies an EU "eCTD v4.0" citation as the EMA fact, not FDA or PMDA', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'eCTD v4.0', jurisdiction: 'EU' }],
    }).results;
    expect(r.basis?.id).toBe('ema-ectd-v4-cp-optional');
  });

  it('records EU M1 v3.1.1 with validation criteria v8.2 as mandatory since 2025-12-01', () => {
    const m1 = fact('eu-ectd-m1-v311-vc-v82');
    expect(m1).toMatchObject({ jurisdiction: 'EU', status: 'in_force', effectiveDate: '2025-12-01' });
    expect(m1.aliases).toEqual(expect.arrayContaining(['EU M1 v3.1.1', 'validation criteria v8.2']));
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'EU eCTD validation criteria v8.2', jurisdiction: 'EU' }],
    }).results;
    expect(r.basis?.id).toBe('eu-ectd-m1-v311-vc-v82');
  });

  it('derives the EU eCTD datasheet format from the dated facts', () => {
    const eu = getMarketSpec('eu-ectd')!;
    expect(eu.submissionFormat).toContain(fact('ema-ectd-v4-cp-optional').effectiveDate);
    expect(eu.submissionFormat).toContain('v3.1.1');
    expect(eu.submissionFormat).toContain(fact('eu-ectd-m1-v311-vc-v82').effectiveDate);
  });

  it('cites EU M1 v3.1.1 by fact id where filing types used to cite v3.0', () => {
    for (const id of [
      'EU_MAA', 'EU_VARIATION_IA', 'EU_VARIATION_IB', 'EU_VARIATION_II', 'EU_RMP', 'EU_RENEWAL',
      'EU_CMA', 'EU_BIOSIMILAR_MAA', 'EU_LINE_EXTENSION', 'EU_CTD_M1_REGIONAL', 'ICH_CTD_M1',
    ]) {
      const authority = getApplicationType(id)?.moduleAuthority ?? '';
      expect(authority, id).toMatch(/(?:M1|Module 1)(?: Specification)? v3\.1\.1/);
      expect(authority, id).toContain('eu-ectd-m1-v311-vc-v82');
      expect(authority, id).not.toMatch(/(?:M1|Module 1)(?: Specification)? v3\.0\b/);
    }
  });

  it('identifies an "EU M1 v3.1.1" citation although "M1" reads as an ICH code', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'EU M1 v3.1.1', jurisdiction: 'EU' }],
    }).results;
    expect(r.basis?.id).toBe('eu-ectd-m1-v311-vc-v82');
  });
});

describe('the pharma package is recorded as proposed, undated, and never promoted', () => {
  /* Founder decision 25 (DECISIONS.md): a proposal is stored as `proposed`,
     never as in force. On 2026-09-28 the Council adopted its first-reading
     position; the Parliament's second-reading approval is pending, so no act
     is adopted. */
  it('is stored as a proposal with no effective date', () => {
    const pkg = fact('eu-pharma-package');
    expect(pkg).toMatchObject({ jurisdiction: 'EU', status: 'proposed' });
    expect(pkg.topic).toMatch(/\(proposed, not adopted\)/);
    expect(pkg.note).toMatch(/position at first reading/);
    expect(pkg.note).toMatch(/Parliament\S* approval at second reading is pending/);
    expect(pkg.note).not.toMatch(/adopted by the Council/);
    expect(hasFixedEffectiveDate(pkg)).toBe(false);
    expect(pkg.effectiveDate).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pkg.note).toMatch(/Directive 2001\/83\/EC/);
    expect(pkg.note).toMatch(/726\/2004/);
    expect(pkg.note).toMatch(/Official Journal/);
  });

  it('is never promoted to in force, whatever the date', () => {
    expect(statusAsOf(fact('eu-pharma-package'), '2099-12-31')).toBe('proposed');
    expect(findFacts({ topic: 'pharma package', asOf: '2099-12-31' })[0]?.status).toBe('proposed');
  });

  it('a citation of it is reported as proposed, not current, and never as adopted', () => {
    const [r] = checkGuidanceFreshness({
      asOf: TODAY,
      citedGuidances: [{ title: 'EU pharma package', jurisdiction: 'EU' }],
    }).results;
    expect(r.basis?.id).toBe('eu-pharma-package');
    expect(r.current).toBe(false);
    expect(r.latestKnownDate).toBeUndefined();
    expect(r.warning).toMatch(/^Proposed, not law \(EU\): current law governs/);
    expect(r.warning).not.toMatch(/Adopted/);
  });

  it('stays on the change radar after any draft date — an undated change never predates a document', () => {
    const radar = changeRadar({ jurisdictions: ['EU'], draftedOn: '2099-01-01' });
    expect(radar.map((d) => d.fact.id)).toContain('eu-pharma-package');
    // A proposal imposes no obligation: it is on the radar as info, not as a mandatory change.
    const all = changeRadar({ jurisdictions: ['EU'] });
    expect(all.find((d) => d.fact.id === 'eu-pharma-package')?.severity).toBe('info');
    // Within each severity, dated facts run newest first and an undated one sorts last.
    for (const severity of ['void_rule', 'mandatory_change', 'info'] as const) {
      const group = all.filter((d) => d.severity === severity);
      const dated = group.filter((d) => hasFixedEffectiveDate(d.fact)).map((d) => d.fact.effectiveDate);
      expect(dated, severity).toEqual([...dated].sort().reverse());
      const firstUndated = group.findIndex((d) => !hasFixedEffectiveDate(d.fact));
      if (firstUndated >= 0) expect(group.slice(firstUndated).every((d) => !hasFixedEffectiveDate(d.fact)), severity).toBe(true);
    }
    const info = all.filter((d) => d.severity === 'info');
    expect(info[info.length - 1].fact.id).toBe('eu-pharma-package');
  });

  it('is the one statement of the package in AnA\'s EU prompt', () => {
    expect(EU_REGULATORY_DEEP_DIVE).toContain(fact('eu-pharma-package').note);
    expect(EU_REGULATORY_DEEP_DIVE).not.toMatch(/expected to enter into force from 2026/);
  });
});

describe('every fact carries a date or the explicit not-fixed marker', () => {
  it('has an ISO effective date unless it is marked not fixed', () => {
    for (const f of REGULATORY_FACTS) {
      if (hasFixedEffectiveDate(f)) expect(f.effectiveDate, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else expect(['mandatory_upcoming', 'proposed'], `${f.id}: only a future or proposed change may be undated`).toContain(f.status);
    }
  });
});
