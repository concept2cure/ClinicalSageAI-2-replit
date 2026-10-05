/**
 * Combination products state the current 21 CFR 4.4(b)(1) call-outs.
 *
 * The QMSR rule (FR 2024-01709, in force 2026-02-02) amended 21 CFR 4.4(b)(1):
 * a drug-cGMP-base manufacturer of a combination product with a device
 * constituent no longer satisfies QSR §§ 820.20, 820.30, 820.50, 820.100,
 * 820.170 and 820.200 (those sections are removed). It satisfies 21 CFR 820.10
 * and named ISO 13485:2016 clauses:
 *
 *   - management responsibility and general requirements: §4.1, §5, §6.1, 820.10
 *   - design and development: §7.3 (with the clause 7.1 risk-management requirement)
 *   - purchasing: §7.4
 *   - analysis of data, improvement, complaint handling: §8.2.2 with 820.35(a), §8.4, §8.5
 *   - installation activities: §7.5.3
 *   - servicing activities: §7.5.4 with 820.35(b)
 *
 * (eCFR 21 CFR 4.4, search extract checked 2026-10-05; see
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-combination-product-4-4-callouts-facts.md.)
 *
 * The engine `planCombinationCGMP`, its public list and the AnA tool
 * `plan_combination_cgmp` told AnA the removed QSR list as current law.
 */

import { describe, it, expect } from 'vitest';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';
import { QMSR_EFFECTIVE } from '../../../../shared/regulatory/qmsr-crosswalk';
import {
  planCombinationCGMP,
  listDeviceProvisionsForDrugBase,
  assessDeviceConstituentControls,
} from '../combination-products-knowledge';
import { PLAN_COMBINATION_CGMP } from '../../ana/combinationProductsTools';

const AFTER = '2026-10-05';
const BEFORE = '2026-01-15';
const ECFR_4_4 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-4/subpart-A/section-4.4';
/** A removed QSR call-out section stated as current (not inside a "formerly" label). */
const REMOVED = /\b820\.(20|30|50|100|170|200)\b/;

function stripFormerly(s: string): string {
  return s.replace(/formerly[^;)]*/gi, '');
}

const drugBase = (asOf?: string) =>
  planCombinationCGMP({
    constituentTypes: ['drug', 'device'],
    category: 'single-entity',
    ...(asOf ? { asOf } : {}),
  } as Parameters<typeof planCombinationCGMP>[0]);

describe(`planCombinationCGMP on a drug-cGMP base, as of ${AFTER}`, () => {
  it('calls out 21 CFR 820.10 and the ISO 13485:2016 clauses named in 21 CFR 4.4(b)(1)', () => {
    const r = drugBase(AFTER);
    expect(r.recommendedBase).toBe('drug-cGMP-base');
    const cites = r.calledOutProvisions.map((p) => p.citation);
    expect(cites).toEqual([
      'ISO 13485:2016 §4.1, §5, §6.1; 21 CFR 820.10',
      'ISO 13485:2016 §7.3 (with the §7.1 risk-management requirement)',
      'ISO 13485:2016 §7.4',
      'ISO 13485:2016 §8.2.2 with 21 CFR 820.35(a); §8.4; §8.5',
      'ISO 13485:2016 §7.5.3',
      'ISO 13485:2016 §7.5.4 with 21 CFR 820.35(b)',
    ]);
    expect(r.calledOutProvisions.map((p) => p.topic)).toEqual([
      'Management responsibility and general requirements',
      'Design and development',
      'Purchasing',
      'Analysis of data, improvement, and complaint handling',
      'Installation activities',
      'Servicing activities',
    ]);
  });

  it('states no removed QSR section as a current requirement', () => {
    const r = drugBase(AFTER);
    for (const p of r.calledOutProvisions) {
      expect(stripFormerly(`${p.citation} ${p.topic} ${p.requirement}`), p.citation).not.toMatch(REMOVED);
    }
    const b1 = r.rationale.find((l) => l.startsWith('21 CFR 4.4(b)(1)'));
    expect(b1).toBeDefined();
    expect(b1).toMatch(/21 CFR 820\.10/);
    expect(stripFormerly(b1!)).not.toMatch(REMOVED);
    expect(r.notes.join(' ')).not.toMatch(/Map each called-out 820\.x clause/);
  });

  it('every call-out carries a well-formed basis pointing at the eCFR text of 21 CFR 4.4', () => {
    for (const p of drugBase(AFTER).calledOutProvisions) {
      expect(p.basis, p.citation).toBeDefined();
      expect(basisProblems(p.basis), p.citation).toEqual([]);
      expect(p.basis.confidence).toBe('regulator-text');
      expect(p.basis.url).toBe(ECFR_4_4);
      expect(p.basis.note).toMatch(/search extract/);
    }
  });

  it('names the removed QSR section only as "formerly"', () => {
    const r = drugBase(AFTER);
    expect(r.calledOutProvisions.map((p) => p.formerly)).toEqual([
      '21 CFR 820.20 (QSR, until 2026-02-01)',
      '21 CFR 820.30 (QSR, until 2026-02-01)',
      '21 CFR 820.50 (QSR, until 2026-02-01)',
      '21 CFR 820.100 (QSR, until 2026-02-01)',
      '21 CFR 820.170 (QSR, until 2026-02-01)',
      '21 CFR 820.200 (QSR, until 2026-02-01)',
    ]);
  });

  it('listDeviceProvisionsForDrugBase(asOf) is the same list', () => {
    expect(listDeviceProvisionsForDrugBase(AFTER).map((p) => p.citation)).toEqual(
      drugBase(AFTER).calledOutProvisions.map((p) => p.citation),
    );
  });

  it('defaults asOf to today (UTC), which is on or after the QMSR date', () => {
    expect(new Date().toISOString().slice(0, 10) >= QMSR_EFFECTIVE).toBe(true);
    expect(drugBase().calledOutProvisions[0].citation).toMatch(/21 CFR 820\.10/);
  });
});

describe(`before ${QMSR_EFFECTIVE} the QSR call-outs applied`, () => {
  it('a drug-cGMP base calls out 820.20, 820.30, 820.50, 820.100, 820.170, 820.200, labelled recall', () => {
    const r = drugBase(BEFORE);
    expect(r.calledOutProvisions.map((p) => p.citation)).toEqual([
      '21 CFR 820.20',
      '21 CFR 820.30',
      '21 CFR 820.50',
      '21 CFR 820.100',
      '21 CFR 820.170',
      '21 CFR 820.200',
    ]);
    for (const p of r.calledOutProvisions) {
      expect(p.basis.confidence).toBe('recall');
      expect(basisProblems(p.basis)).toEqual([]);
    }
  });

  it('a malformed asOf fails closed', () => {
    expect(() => drugBase('2026-02-30')).toThrow(/YYYY-MM-DD/);
  });
});

describe('the device-QS base call-outs (21 CFR 4.4(b)(2)) are unchanged', () => {
  it('lists the 211 sections', () => {
    const r = planCombinationCGMP({
      constituentTypes: ['drug', 'device'],
      category: 'single-entity',
      preferredBase: 'device-QS-base',
      asOf: AFTER,
    } as Parameters<typeof planCombinationCGMP>[0]);
    expect(r.calledOutProvisions.map((p) => p.citation)).toContain('21 CFR 211.84');
  });
});

describe('assessDeviceConstituentControls names the current 4.4(b)(1) call-out', () => {
  it(`as of ${AFTER} the rationale does not call 21 CFR 820.30 the called-out section`, () => {
    const r = assessDeviceConstituentControls({ deviceConstituentDescription: 'autoinjector', asOf: AFTER });
    const line = r.rationale.find((l) => /4\.4\(b\)\(1\)/.test(l));
    expect(line).toBeDefined();
    expect(stripFormerly(line!)).not.toMatch(REMOVED);
    expect(line).toMatch(/ISO 13485:2016 §7\.3/);
  });
});

describe('AnA tool plan_combination_cgmp', () => {
  it('does not tell the model the removed QSR call-out list', () => {
    expect(PLAN_COMBINATION_CGMP.description).not.toMatch(/820\.20, 820\.30, 820\.50/);
    expect(PLAN_COMBINATION_CGMP.description).toMatch(/21 CFR 820\.10/);
    expect(PLAN_COMBINATION_CGMP.description).toMatch(/ISO 13485:2016/);
  });

  it('exposes asOf so the call-outs are resolved for a date', () => {
    const props = (PLAN_COMBINATION_CGMP.input_schema as { properties: Record<string, unknown> }).properties;
    expect(props.asOf).toBeDefined();
  });
});
