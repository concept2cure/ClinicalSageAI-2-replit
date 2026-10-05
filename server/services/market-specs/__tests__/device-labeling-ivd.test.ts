/**
 * FDA IVD (21 CFR 809.10) and investigational-device (21 CFR 812.5) label
 * elements in the deterministic device labeling engine, and the check of a
 * program's authored labeling against them.
 *
 * Facts relied on: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-fda-ivd-investigational-labeling-facts.md
 */
import { describe, it, expect } from 'vitest';
import * as engine from '../device-labeling';
import { deviceLabelingRequirements } from '../device-labeling';
import { basisProblems, type RegulatoryBasis } from '../../../../shared/regulatory/regulatory-basis';
import { LABELING_RULES_KNOWLEDGE } from '../../ivd-knowledge/regulatory/labeling-rules';
import { FDA_IVD_KNOWLEDGE } from '../../ivd-knowledge/regulatory/fda-ivd';

interface El { id: string; basis: string; basisDetail?: RegulatoryBasis }
type Req = ReturnType<typeof deviceLabelingRequirements> & { fdaIvdLabel?: El[]; fdaIvdInsert?: El[] };

const req = (facts: Record<string, boolean>): Req => deviceLabelingRequirements(facts as never) as Req;
const fdaAll = (r: Req): El[] => [...r.fdaLabel, ...(r.fdaIvdLabel ?? []), ...(r.fdaIvdInsert ?? [])];
const bases = (els: El[]) => els.map((e) => e.basis);
const IUO = 'For Investigational Use Only. The performance characteristics of this product have not been established.';
const CAUTION = 'CAUTION—Investigational device. Limited by Federal (or United States) law to investigational use.';

type Check = (facts: object, sections: object[]) => { rows: Array<{ id: string; basis: string; status: string }> };
const check = (): Check => {
  const fn = (engine as unknown as { checkAuthoredLabeling?: Check }).checkAuthoredLabeling;
  expect(typeof fn, 'checkAuthoredLabeling is exported').toBe('function');
  return fn as Check;
};
const row = (rows: Array<{ basis: string; status: string }>, re: RegExp) => rows.find((r) => re.test(r.basis));

const INSERT_WITHOUT_LIMITATIONS = [
  'Intended Use',
  'The assay qualitatively detects analyte X in human serum.',
  'Summary and Explanation of the Test',
  'Principle of the Procedure',
  'Reagents',
  'Specimen Collection and Preparation',
  'Procedure',
  'Quality Control',
  'Results',
  'Expected Values',
  'Specific Performance Characteristics',
  'Bibliography',
].join('\n');

describe('809.10 — IVD label and package insert', () => {
  it('(a) an IVD gets the 809.10(a) label elements and the 809.10(b)(1)–(b)(12) insert items', () => {
    const r = req({ isIvd: true });
    const b = bases(fdaAll(r));
    expect(b.some((x) => /809\.10\(a\)/.test(x))).toBe(true);
    for (const n of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(b.some((x) => new RegExp(`809\\.10\\(b\\)\\(${n}\\)`).test(x)), `809.10(b)(${n})`).toBe(true);
    }
  });

  it('a non-IVD device gets no 809.10 element', () => {
    expect(bases(fdaAll(req({}))).some((x) => /809\.10/.test(x))).toBe(false);
  });

  it('an RUO IVD carries the 809.10(c)(2)(i) statement and is exempt from (a) and (b)', () => {
    const r = req({ isIvd: true, isRuo: true });
    const b = bases(fdaAll(r));
    expect(b.some((x) => /809\.10\(c\)\(2\)\(i\)(?!i)/.test(x))).toBe(true);
    expect(b.some((x) => /809\.10\(a\)|809\.10\(b\)/.test(x))).toBe(false);
  });

  it('every 809.10 / 812.5 element carries a well-formed basisDetail; regulator text points at eCFR', () => {
    const els = fdaAll(req({ isIvd: true })).concat(fdaAll(req({ forClinicalInvestigation: true })), fdaAll(req({ isIvd: true, isRuo: true, isIuo: true })));
    const fresh = els.filter((e) => /809\.10|812\.5/.test(e.basis));
    expect(fresh.length).toBeGreaterThan(20);
    for (const e of fresh) {
      expect(e.basisDetail, `basisDetail on ${e.id}`).toBeDefined();
      expect(basisProblems(e.basisDetail!), e.id).toEqual([]);
      if (e.basisDetail!.confidence === 'regulator-text') expect(e.basisDetail!.url).toMatch(/^https:\/\/www\.ecfr\.gov\//);
    }
    // The displayed citation and its provenance name the same paragraph.
    for (const e of fresh) expect(e.basisDetail!.ref, e.id).toBe(e.basis);
  });
});

describe('812.5 — investigational devices', () => {
  it('(b) a device for clinical investigation carries the 812.5(a) caution statement on the FDA label', () => {
    const r = req({ forClinicalInvestigation: true });
    const caution = r.fdaLabel.find((e) => /812\.5\(a\)/.test(e.basis) && (e as { statement?: string }).statement === CAUTION);
    expect(caution).toBeDefined();
  });

  it('(c) an IVD study exempt under 812.2(c)(3) gets the IUO statement and no 812.5 element', () => {
    const r = req({ isIvd: true, forClinicalInvestigation: true, isIuo: true, ivdStudyExemptUnder8122c3: true });
    const all = fdaAll(r);
    expect(all.some((e) => /809\.10\(c\)\(2\)\(ii\)/.test(e.basis) && (e as { statement?: string }).statement === IUO)).toBe(true);
    expect(bases(all).some((x) => /812\.5/.test(x))).toBe(false);
  });

  it('an investigational IVD not shown exempt gets both the IUO statement and 812.5', () => {
    const all = fdaAll(req({ isIvd: true, forClinicalInvestigation: true }));
    expect(bases(all).some((x) => /809\.10\(c\)\(2\)\(ii\)/.test(x))).toBe(true);
    expect(bases(all).some((x) => /812\.5\(a\)/.test(x))).toBe(true);
  });
});

describe('checkAuthoredLabeling — found / not_found / not_checkable, never a verdict', () => {
  it('(d) an IVD insert without a Limitations heading reports 809.10(b)(10) as not_found', () => {
    const { rows } = check()({ isIvd: true }, [{ key: 'D2', label: 'Proposed labeling and instructions for use', text: INSERT_WITHOUT_LIMITATIONS, authored: true }]);
    expect(row(rows, /809\.10\(b\)\(10\)/)?.status).toBe('not_found');
    expect(row(rows, /809\.10\(b\)\(11\)/)?.status).toBe('found');
    expect(row(rows, /809\.10\(b\)\(12\)/)?.status).toBe('found');
  });

  it('with the heading present, 809.10(b)(10) is found', () => {
    const text = `${INSERT_WITHOUT_LIMITATIONS}\nLimitations of the Procedure\nHemolysed specimens interfere.`;
    const { rows } = check()({ isIvd: true }, [{ key: 'D2', text, authored: true }]);
    expect(row(rows, /809\.10\(b\)\(10\)/)?.status).toBe('found');
  });

  it('no section, or only an unauthored one, is not_checkable rather than not_found', () => {
    for (const sections of [[], [{ key: 'D2', text: '', authored: false }], [{ key: 'D2', text: `${INSERT_WITHOUT_LIMITATIONS}\nLimitations`, authored: false }]]) {
      const { rows } = check()({ isIvd: true }, sections);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.status === 'not_checkable')).toBe(true);
    }
  });

  it('the 812.5(a) caution statement is found only when its wording is present', () => {
    const c = check();
    const facts = { forClinicalInvestigation: true };
    const absent = c(facts, [{ key: 'E2', text: 'Investigational device. Use only in the study.', authored: true }]);
    expect(absent.rows.find((r) => r.id === 'inv_caution_statement')?.status).toBe('not_found');
    const present = c(facts, [{ key: 'E2', text: 'CAUTION - Investigational device. Limited by Federal law to investigational use.', authored: true }]);
    expect(present.rows.find((r) => r.id === 'inv_caution_statement')?.status).toBe('found');
  });
});

describe('one requirement list — the ivd-knowledge prose points at the engine', () => {
  const pkg = LABELING_RULES_KNOWLEDGE.find((e) => e.id === 'label.fda.809-10-package-insert')!;
  const def = FDA_IVD_KNOWLEDGE.find((e) => e.id === 'fda.ivd.definition-and-ruo-iuo')!;

  it('labeling-rules no longer enumerates (and misnumbers) the 809.10(b) items', () => {
    expect(pkg.detail).not.toMatch(/\(9\) limitations/i);
    expect(pkg.detail).not.toMatch(/\(11\) specific performance/i);
    expect(pkg.detail).toMatch(/deviceLabelingRequirements/);
  });

  it('fda-ivd no longer holds a parallel package-insert list', () => {
    expect(def.detail).not.toMatch(/summary and explanation, principle of the procedure, reagents/i);
    expect(def.detail).toMatch(/deviceLabelingRequirements/);
  });
});
