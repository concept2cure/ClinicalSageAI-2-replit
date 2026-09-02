/**
 * The ICH comparison a recorded impurity is subject to.
 *
 * The register captures a level; ICH Q3A(R2)/Q3B(R2) say what must happen at
 * that level. These pin the comparison, its boundaries, and — as much as the
 * numbers — every case where it must REFUSE rather than answer.
 */
import { describe, expect, it } from 'vitest';

import {
  assessRecordedImpurity,
  impurityClassOf,
  isAssessableImpurity,
  normaliseLevelToPercent,
  parseDoseMg,
} from '../impurity-assessment';
import { resolveImpurityThresholds } from '../../global-ri/impurities-thresholds';

describe('parseDoseMg', () => {
  it('reads the doses a CMC staffer types', () => {
    expect(parseDoseMg('500 mg')).toEqual({ ok: true, mg: 500 });
    expect(parseDoseMg('2 g/day')).toEqual({ ok: true, mg: 2000 });
    expect(parseDoseMg('0.5g')).toEqual({ ok: true, mg: 500 });
    // A bare number is the register's own stated unit.
    expect(parseDoseMg('250')).toEqual({ ok: true, mg: 250 });
  });

  it('refuses a dose it cannot key a threshold to, rather than defaulting', () => {
    /* A weight-normalised dose is not a maximum daily dose without the patient
       weight the record does not carry; zero is not a dose. */
    for (const bad of ['', null, undefined, '5 mg/kg', 'two tablets', '0 mg']) {
      expect(parseDoseMg(bad).ok).toBe(false);
    }
  });
});

describe('normaliseLevelToPercent', () => {
  it('converts the units a level is actually recorded in', () => {
    expect(normaliseLevelToPercent('0.08', '%', 500)).toMatchObject({ ok: true, percent: 0.08 });
    expect(normaliseLevelToPercent('300', 'ppm', 500)).toMatchObject({ ok: true, percent: 0.03 });
    // 1 mg/day against a 500 mg dose is 0.2%.
    expect(normaliseLevelToPercent('1', 'mg/day', 500)).toMatchObject({ ok: true, percent: 0.2 });
  });

  it('refuses a level with no unit rather than reading it as a percentage', () => {
    /* The column defaults to '%', but a number typed with the unit cleared is
       not a percentage because a column says so — and a ppm figure read as a
       percentage overstates it twenty-thousand-fold. */
    const r = normaliseLevelToPercent('300', '', 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LEVEL_UNIT_UNRECORDED');
  });
});

describe('impurityClassOf', () => {
  it('maps the register vocabulary onto the guideline classes', () => {
    expect(impurityClassOf('process-related')).toBe('organic');
    expect(impurityClassOf('degradation')).toBe('degradation');
    expect(impurityClassOf('residual-solvent')).toBe('residual-solvent');
    expect(impurityClassOf('elemental')).toBe('elemental');
    expect(impurityClassOf('mutagenic')).toBe('mutagenic');
    expect(impurityClassOf('')).toBe('unresolved');
  });
});

describe('resolveImpurityThresholds — the ICH bands, with "whichever is lower" evaluated', () => {
  it('evaluates the min rule instead of returning a sentence to parse', () => {
    /* At a 1500 mg dose the 1.0 mg/day alternative is 0.0667%, which is LOWER
       than the 0.10% band. Reading the percentage — the obvious parse of the
       guideline's own wording — over-permits by half, in the direction of not
       reporting an impurity that must be reported. */
    const r = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 1500, impurityClass: 'organic' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identification.governing).toBe('absolute');
    expect(r.identification.effectivePercent).toBeCloseTo(0.0667, 4);
    expect(r.identification.effectiveMgPerDay).toBeCloseTo(1.0, 6);
  });

  it('uses each threshold row own inequality at exactly 2 g/day', () => {
    /* Q3A(R2) Attachment 1 splits reporting at <= 2 g but identification and
       qualification at < 2 g. The effective limits agree at the boundary; the
       citation does not, and printing the low band there would quote a row the
       guideline does not apply. */
    const r = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 2000, impurityClass: 'organic' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaryExact).toBe(true);
    expect(r.reporting.expression).toBe('0.05%');
    expect(r.identification.expression).toBe('0.05%');
    expect(r.qualification.expression).toBe('0.05%');
    // Just below the boundary the low band governs, and the min rule still applies.
    const below = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 1999, impurityClass: 'organic' });
    if (!below.ok) throw new Error('expected a resolved set');
    expect(below.identification.expression).toContain('0.10%');
    expect(below.identification.effectivePercent).toBeCloseTo(0.05, 3);
  });

  it('does not cross the two guidelines: Q3B has bands Q3A does not', () => {
    const ds = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 5, impurityClass: 'organic' });
    const dp = resolveImpurityThresholds({ matrix: 'drug_product', maxDailyDoseMg: 5, impurityClass: 'degradation' });
    if (!ds.ok || !dp.ok) throw new Error('expected resolved sets');
    expect(ds.identification.expression).toContain('0.10%');
    expect(dp.identification.expression).toContain('0.5%');
    expect(ds.citation).toContain('Q3A');
    expect(dp.citation).toContain('Q3B');
  });

  it('refuses a class the guideline does not govern, and names the one that does', () => {
    for (const [cls, routeFragment] of [
      ['residual-solvent', 'Q3C'],
      ['elemental', 'Q3D'],
      ['mutagenic', 'M7'],
    ] as const) {
      const r = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 500, impurityClass: cls });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe('CLASS_OUT_OF_SCOPE');
      expect(r.routeTo).toContain(routeFragment);
    }
  });

  it('refuses a missing or non-positive dose rather than falling through to a default', () => {
    /* The copy of this table that used to sit in cmc-quality-knowledge had a
       band gap at 2000.01 and a hardcoded fallback behind it, so a dose of
       2000.5 produced a fabricated threshold. */
    expect(resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: null, impurityClass: 'organic' }).ok).toBe(false);
    expect(resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 0, impurityClass: 'organic' }).ok).toBe(false);
    const gap = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 2000.5, impurityClass: 'organic' });
    expect(gap.ok).toBe(true);
    if (gap.ok) expect(gap.reporting.expression).toBe('0.03%');
  });
});

describe('assessRecordedImpurity — one recorded impurity, one verdict', () => {
  const base = {
    impurityName: 'Impurity A',
    impurityType: 'process-related',
    maximumDailyDose: '500 mg',
    levelUnit: '%',
  };

  it('places a level in the right band', () => {
    // MDD 500 mg: reporting 0.05%, identification 0.10%, qualification 0.15%.
    const cases: Array<[string, string]> = [
      ['0.02', 'below-reporting'],
      ['0.07', 'reportable'],
      ['0.12', 'above-identification'],
      ['0.30', 'above-qualification'],
    ];
    for (const [level, expected] of cases) {
      const a = assessRecordedImpurity({ ...base, observedLevel: level }, 'drug_substance');
      expect(a.ok).toBe(true);
      if (a.ok) expect(a.disposition).toBe(expected);
    }
  });

  it('states what an impurity above a threshold still owes', () => {
    const unidentified = assessRecordedImpurity({ ...base, observedLevel: '0.12' }, 'drug_substance');
    if (!unidentified.ok) throw new Error('expected an assessment');
    expect(unidentified.outstanding.join(' ')).toContain('no structure recorded');

    const unqualified = assessRecordedImpurity(
      { ...base, observedLevel: '0.30', structure: 'CC1=CC(=O)N' },
      'drug_substance',
    );
    if (!unqualified.ok) throw new Error('expected an assessment');
    expect(unqualified.outstanding.join(' ')).toContain('no qualification basis recorded');

    const settled = assessRecordedImpurity(
      { ...base, observedLevel: '0.30', structure: 'CC1=CC(=O)N', qualificationBasis: '90-day rat study TX-114' },
      'drug_substance',
    );
    if (!settled.ok) throw new Error('expected an assessment');
    expect(settled.outstanding).toEqual([]);
  });

  it('refuses rather than assessing when the record cannot support a comparison', () => {
    const noDose = assessRecordedImpurity({ ...base, maximumDailyDose: '', observedLevel: '0.08' }, 'drug_substance');
    expect(noDose.ok).toBe(false);
    if (!noDose.ok) expect(noDose.code).toBe('MDD_MISSING');

    const noLevel = assessRecordedImpurity({ ...base, observedLevel: '' }, 'drug_substance');
    expect(noLevel.ok).toBe(false);
    if (!noLevel.ok) expect(noLevel.code).toBe('LEVEL_MISSING');

    const noUnit = assessRecordedImpurity({ ...base, observedLevel: '300', levelUnit: '' }, 'drug_substance');
    expect(noUnit.ok).toBe(false);
    if (!noUnit.ok) expect(noUnit.code).toBe('LEVEL_UNIT_UNRECORDED');

    const outOfScope = assessRecordedImpurity(
      { ...base, impurityType: 'residual-solvent', observedLevel: '300', levelUnit: 'ppm' },
      'drug_substance',
    );
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.code).toBe('CLASS_OUT_OF_SCOPE');
  });

  it('compares a ppm level correctly instead of reading it as a percentage', () => {
    // 300 ppm is 0.03%, which is BELOW the 0.05% reporting threshold at 500 mg.
    // Read as "300%" it would be above every threshold there is.
    const a = assessRecordedImpurity(
      { ...base, impurityType: 'degradation', observedLevel: '300', levelUnit: 'ppm' },
      'drug_substance',
    );
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.observedPercent).toBeCloseTo(0.03, 6);
      expect(a.disposition).toBe('below-reporting');
      expect(a.observedAsRecorded).toBe('300 ppm');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   The adversarial review of the engine. Each of these is a defect six review
   lenses converged on, and the case that used to produce the wrong answer.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('review: scope is decided before the dose, and covers every class ICH excludes', () => {
  it('refuses an inorganic impurity instead of giving it organic thresholds', () => {
    /* 'elemental' next to it was refused; 'inorganic' fell through and was given
       an ICH Q3A organic-impurity percentage the guideline never wrote for it. */
    const r = resolveImpurityThresholds({ matrix: 'drug_substance', maxDailyDoseMg: 500, impurityClass: 'inorganic' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CLASS_OUT_OF_SCOPE');
  });

  it('refuses a process impurity in the DRUG PRODUCT — Q3B governs degradation products', () => {
    const process = resolveImpurityThresholds({ matrix: 'drug_product', maxDailyDoseMg: 500, impurityClass: 'organic' });
    expect(process.ok).toBe(false);
    if (!process.ok) expect(process.routeTo).toContain('Q3A');
    const degradant = resolveImpurityThresholds({ matrix: 'drug_product', maxDailyDoseMg: 500, impurityClass: 'degradation' });
    expect(degradant.ok).toBe(true);
  });

  it('reports an out-of-scope class as out of scope even when the dose is also missing', () => {
    /* Parsing the dose first sent the reader to fix the dose for a residual
       solvent, which would not have produced a Q3A threshold either way. */
    const a = assessRecordedImpurity(
      { impurityName: 'Methanol', impurityType: 'residual-solvent', observedLevel: '300', levelUnit: 'ppm' },
      'drug_substance',
    );
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.code).toBe('CLASS_OUT_OF_SCOPE');
      expect(a.routeTo).toContain('Q3C');
    }
  });

  it('maps the register vocabulary exactly before falling back to substrings', () => {
    // "process-related residual material" matched `residual` and became a solvent.
    expect(impurityClassOf('process-related')).toBe('organic');
    expect(impurityClassOf('process related residual material')).toBe('residual-solvent');
    expect(impurityClassOf('inorganic')).toBe('inorganic');
  });
});

describe('review: the comparison itself', () => {
  const base = { impurityName: 'Impurity A', impurityType: 'process-related', maximumDailyDose: '500 mg', levelUnit: '%' };

  it('acts ABOVE a threshold, not at it', () => {
    /* ICH reads "greater than" throughout. Using >= manufactured a deficiency
       for an impurity sitting exactly on the qualification threshold. */
    const exactly = assessRecordedImpurity({ ...base, observedLevel: '0.15' }, 'drug_substance');
    if (!exactly.ok) throw new Error('expected an assessment');
    expect(exactly.disposition).toBe('above-identification');
    expect(exactly.outstanding.join(' ')).not.toContain('qualification basis');

    const above = assessRecordedImpurity({ ...base, observedLevel: '0.16' }, 'drug_substance');
    if (!above.ok) throw new Error('expected an assessment');
    expect(above.disposition).toBe('above-qualification');
  });

  it('refuses a level recorded as a limit rather than reading it as an exact value', () => {
    /* "<0.15" means the assay did not measure a value. Stripping the operator
       reported the impurity as sitting on the 0.15% threshold — a deficiency
       over a result that says the opposite. */
    const a = assessRecordedImpurity({ ...base, observedLevel: '<0.15' }, 'drug_substance');
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.code).toBe('LEVEL_UNPARSEABLE');
      expect(a.message).toContain('recorded as a limit');
    }
  });

  it('refuses a level that reduces to nothing rather than reading it as zero', () => {
    const a = assessRecordedImpurity({ ...base, observedLevel: '%' }, 'drug_substance');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe('LEVEL_UNPARSEABLE');
  });

  it('quotes the Q3B row the dose actually falls in at 1 mg and 10 mg', () => {
    /* Q3B(R2) writes these bands with strict lower bounds, so a dose sitting
       exactly on a boundary belongs to the HIGHER band. */
    const atOne = resolveImpurityThresholds({ matrix: 'drug_product', maxDailyDoseMg: 1, impurityClass: 'degradation' });
    if (!atOne.ok) throw new Error('expected a resolved set');
    expect(atOne.identification.expression).toContain('0.5%');
    const atTen = resolveImpurityThresholds({ matrix: 'drug_product', maxDailyDoseMg: 10, impurityClass: 'degradation' });
    if (!atTen.ok) throw new Error('expected a resolved set');
    expect(atTen.qualification.expression).toContain('0.5%');
  });
});

describe('review: isAssessableImpurity is the engine, not a proxy for it', () => {
  it('agrees with the engine on every record the proxy used to pass', () => {
    const cases = [
      // Field-present but the engine refuses each one.
      { impurityName: 'A', impurityType: 'process-related', observedLevel: '0.08', levelUnit: '%', maximumDailyDose: 'two tablets' },
      { impurityName: 'B', impurityType: 'process-related', observedLevel: '0.08', levelUnit: 'AU', maximumDailyDose: '500 mg' },
      { impurityName: 'C', impurityType: 'residual-solvent', observedLevel: '300', levelUnit: 'ppm', maximumDailyDose: '500 mg' },
      { impurityName: 'D', impurityType: 'process-related', observedLevel: '<0.15', levelUnit: '%', maximumDailyDose: '500 mg' },
    ];
    for (const record of cases) {
      expect(isAssessableImpurity(record, 'drug_substance')).toBe(false);
      expect(assessRecordedImpurity(record, 'drug_substance').ok).toBe(false);
    }
    const good = { impurityName: 'E', impurityType: 'process-related', observedLevel: '0.08', levelUnit: '%', maximumDailyDose: '500 mg' };
    expect(isAssessableImpurity(good, 'drug_substance')).toBe(true);
  });
});
