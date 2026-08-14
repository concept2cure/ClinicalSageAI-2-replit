/**
 * The regulatory vocabulary.
 *
 * Every alias asserted here is a spelling that was actually in the codebase
 * when ledger L56 was measured — these are not hypothetical inputs. The scale
 * tests exist to pin the distinction the module is built on: identity variants
 * collapse, ordinal scales do not.
 */
import { describe, expect, it } from 'vitest';

import {
  AGENCIES,
  JURISDICTIONS,
  JURISDICTION_AGENCY,
  RISK_SCALE,
  DEFICIENCY_SCALE,
  DIAGNOSTIC_SCALE,
  normalizeAgency,
  normalizeJurisdiction,
  rankIn,
  translateScale,
} from '../vocabulary';

describe('agencies — one spelling', () => {
  it('accepts the canonical form unchanged', () => {
    for (const a of AGENCIES) expect(normalizeAgency(a)).toBe(a);
  });

  it('collapses the case variants that were live in the codebase', () => {
    // `Agency` carried FDA and fda as separate members in different modules.
    expect(normalizeAgency('fda')).toBe('FDA');
    expect(normalizeAgency('FDA')).toBe('FDA');
    expect(normalizeAgency('health_canada')).toBe('HEALTH_CANADA');
    expect(normalizeAgency('Health_Canada')).toBe('HEALTH_CANADA');
    expect(normalizeAgency('ca_health_canada')).toBe('HEALTH_CANADA');
    expect(normalizeAgency('swissmedic')).toBe('SWISSMEDIC');
    expect(normalizeAgency('Swissmedic')).toBe('SWISSMEDIC');
  });

  it('refuses rather than guesses', () => {
    // `general` was a member of one of the old enums. It is not an agency.
    expect(normalizeAgency('general')).toBeNull();
    expect(normalizeAgency('')).toBeNull();
    expect(normalizeAgency(undefined)).toBeNull();
    expect(normalizeAgency('NOT_AN_AGENCY')).toBeNull();
  });

  it('does not treat a standards body as an agency', () => {
    // ICH/ISO/IEC/IMDRF publish; they do not approve. Conflating them is how
    // the old enum reached 26 members.
    for (const b of ['ICH', 'ISO', 'IEC', 'IMDRF']) expect(normalizeAgency(b)).toBeNull();
  });
});

describe('jurisdictions — territory, not authority', () => {
  it('collapses the five spellings of Japan that were in use', () => {
    for (const v of ['JP', 'jp', 'japan', 'PMDA', 'pmda']) {
      expect(normalizeJurisdiction(v)).toBe('JP');
    }
  });

  it('collapses the five spellings of Canada', () => {
    for (const v of ['CA', 'ca', 'canada', 'health_canada', 'ca_health_canada']) {
      expect(normalizeJurisdiction(v)).toBe('CA');
    }
  });

  it('maps every jurisdiction to exactly one agency', () => {
    for (const j of JURISDICTIONS) {
      expect(AGENCIES).toContain(JURISDICTION_AGENCY[j]);
    }
    expect(Object.keys(JURISDICTION_AGENCY).sort()).toEqual([...JURISDICTIONS].sort());
  });

  it('refuses the values that are not jurisdictions at all', () => {
    // All three were members of one or another of the old enums.
    expect(normalizeJurisdiction('GLOBAL')).toBeNull();
    expect(normalizeJurisdiction('ICH')).toBeNull();
    expect(normalizeJurisdiction('mdsap')).toBeNull();
  });
});

describe('scales — an ordinal is not a spelling', () => {
  it('ranks by position, which is what string comparison gets wrong', () => {
    // 'major' > 'high' alphabetically. By rank, within their own scales, they
    // are third of four in both — and the point is that they are in DIFFERENT
    // scales and were being compared as strings.
    expect(rankIn(RISK_SCALE, 'high')).toBe(2);
    expect(rankIn(DEFICIENCY_SCALE, 'major')).toBe(2);
    expect(rankIn(RISK_SCALE, 'critical')).toBeGreaterThan(rankIn(RISK_SCALE, 'high')!);
  });

  it('accepts the historical spellings within a scale', () => {
    expect(rankIn(RISK_SCALE, 'moderate')).toBe(rankIn(RISK_SCALE, 'medium'));
    expect(rankIn(RISK_SCALE, 'extreme')).toBe(rankIn(RISK_SCALE, 'critical'));
    expect(rankIn(RISK_SCALE, 'very_high')).toBe(rankIn(RISK_SCALE, 'critical'));
    expect(rankIn(DEFICIENCY_SCALE, 'info')).toBe(rankIn(DEFICIENCY_SCALE, 'informational'));
  });

  it('keeps the scales apart — the same word can mean different ranks', () => {
    // 'critical' is the top of the risk scale and the top of the deficiency
    // scale, but 'informational' is the BOTTOM of deficiency and not a risk
    // member at all except by alias. Merging the enums would have lost this.
    expect(rankIn(DEFICIENCY_SCALE, 'informational')).toBe(0);
    expect(rankIn(DIAGNOSTIC_SCALE, 'info')).toBe(0);
    expect(rankIn(DIAGNOSTIC_SCALE, 'major')).toBeNull();
    expect(rankIn(RISK_SCALE, 'error')).toBeNull();
  });

  it('returns null for a non-member instead of a default rank', () => {
    expect(rankIn(RISK_SCALE, 'catastrophic')).toBeNull();
    expect(rankIn(RISK_SCALE, undefined)).toBeNull();
  });

  it('translates across scales proportionally, and says so by being explicit', () => {
    expect(translateScale(DIAGNOSTIC_SCALE, RISK_SCALE, 'error')).toBe('critical');
    expect(translateScale(DIAGNOSTIC_SCALE, RISK_SCALE, 'info')).toBe('low');
    expect(translateScale(RISK_SCALE, DEFICIENCY_SCALE, 'critical')).toBe('critical');
    expect(translateScale(RISK_SCALE, DEFICIENCY_SCALE, 'low')).toBe('informational');
    expect(translateScale(RISK_SCALE, DIAGNOSTIC_SCALE, 'not-a-member')).toBeNull();
  });

  it('every scale is ordered least-severe first', () => {
    for (const s of [RISK_SCALE, DEFICIENCY_SCALE, DIAGNOSTIC_SCALE]) {
      expect(rankIn(s, s.members[0])).toBe(0);
      expect(rankIn(s, s.members[s.members.length - 1])).toBe(s.members.length - 1);
    }
  });
});
