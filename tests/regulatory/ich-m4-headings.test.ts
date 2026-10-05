/**
 * The ICH M2/M4/M5 headings the guidance record does not carry, held once
 * (D2, 2026-10-05, step g-ich-m4-headings; docs/design/ANA_REGULATORY_RECORD.md
 * "One ICH M2–M5 record", R5; verified finding 33 steps 1–2).
 *
 * Before this step the platform had no list of the CTD headings ICH M4 actually
 * defines. `CTD_AUTHORING_GUIDANCE` carries content for 115 codes; the
 * structural headings around them (2.1, 2.6, 2.7, 4.1, 4.2.1, 5.3.1.1 …) were
 * nowhere, so nothing could tell a real heading from an invented one.
 * `server/services/templates/ectd-fallback-templates.ts` ships
 * "MODULE 4.3.1 - SINGLE DOSE TOXICITY": ICH M4S has 4.3 Literature References,
 * undivided, and single-dose toxicity is 4.2.3.1.
 *
 * This pins:
 *   - `isIchHeading` refuses 4.3.1 and other invented or regional codes, and
 *     accepts every heading of the structural rows and of the guidance record;
 *   - the structural rows are disjoint from the `CTD_AUTHORING_GUIDANCE` keys
 *     (one record, two halves, never two copies of a heading);
 *   - every row is a canonical code, unique, with its parent named and itself
 *     a heading, and every M2–M5 guidance code's parent is a heading too;
 *   - every row's basis is well formed, and none claims checked regulator text
 *     it does not carry.
 */
import { describe, it, expect } from 'vitest';
import {
  ICH_M4_HEADINGS,
  isIchHeading,
  ichHeadingTitle,
} from '../../server/services/ind/ctd/ich-m4-headings';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';
import { basisProblems } from '../../shared/regulatory/regulatory-basis';
import { normalizeCtdCode, compareSectionCode } from '../../shared/regulatory/section-code';

const parentOf = (code: string): string | null => {
  const segs = code.split('.');
  return segs.length > 1 ? segs.slice(0, -1).join('.') : null;
};
const isM2to5 = (code: string) => /^[2-5](\.|$)/.test(code);

describe('isIchHeading — invented and regional codes are refused', () => {
  it.each([
    ['4.3.1', 'M4S 4.3 Literature References has no subdivisions; single-dose toxicity is 4.2.3.1'],
    ['m4.3.1', 'the m-prefixed spelling of the same invented heading'],
    ['4.2.4', 'M4S 4.2 has 4.2.1–4.2.3 only'],
    ['2.8', 'Module 2 ends at 2.7'],
    ['5.3.8', 'M4E 5.3 ends at 5.3.7'],
    ['5.5', 'Module 5 ends at 5.4'],
    ['6', 'there is no Module 6'],
    ['1.2', 'Module 1 is regional, not an ICH M4 heading'],
    ['', 'empty'],
    ['Single dose toxicity', 'not code-shaped'],
  ])('%s is not an ICH heading (%s)', (code) => {
    expect(isIchHeading(code)).toBe(false);
  });
});

describe('isIchHeading — real headings are accepted, from either half of the record', () => {
  it.each([
    ['4.2.3.1', 'guidance record'],
    ['m4.2.3.1', 'guidance record, m-prefixed'],
    ['4.3', 'guidance record'],
    ['2.7.3', 'guidance record'],
    ['3.2.s.1', 'guidance record, lower-case Module 3 part'],
    ['2', 'structural: Module 2'],
    ['2.1', 'structural: CTD table of contents'],
    ['2.6', 'structural: nonclinical written and tabulated summaries'],
    ['2.7', 'structural: clinical summary'],
    ['2.5.7', 'structural: M4E 2.5.7 Literature References'],
    ['2.7.4.2.1.1', 'structural: M4E common adverse events'],
    ['4.1', 'structural: Module 4 table of contents'],
    ['4.2.1', 'structural: pharmacology'],
    ['4.2.3', 'structural: toxicology'],
    ['4.2.3.5.4', 'structural: juvenile animal studies'],
    ['5.3.1.1', 'structural: BA study reports'],
    ['5.3.5', 'structural: reports of efficacy and safety studies'],
    ['3.2.P', 'structural: Module 3 skeleton'],
  ])('%s is an ICH heading (%s)', (code) => {
    expect(isIchHeading(code)).toBe(true);
  });

  it('ichHeadingTitle reads whichever half holds the code, and null for a non-heading', () => {
    expect(ichHeadingTitle('4.2.3.1')).toBe(CTD_AUTHORING_GUIDANCE['4.2.3.1'].title);
    expect(ichHeadingTitle('5.3.1.1')).toBe('Bioavailability (BA) Study Reports');
    expect(ichHeadingTitle('4.3.1')).toBeNull();
    expect(ichHeadingTitle('1.2')).toBeNull();
  });
});

describe('ICH_M4_HEADINGS — one record with the guidance, never a copy of it', () => {
  const codes = ICH_M4_HEADINGS.map((h) => h.code);

  it('is disjoint from the CTD_AUTHORING_GUIDANCE keys', () => {
    const overlap = codes.filter((c) => Object.prototype.hasOwnProperty.call(CTD_AUTHORING_GUIDANCE, c));
    expect(overlap).toEqual([]);
  });

  it('holds no duplicate code', () => {
    expect(codes.filter((c, i) => codes.indexOf(c) !== i)).toEqual([]);
  });

  it('every code is canonical, in Modules 2–5, and in CTD order', () => {
    for (const c of codes) {
      expect(normalizeCtdCode(c), c).toBe(c);
      expect(isM2to5(c), c).toBe(true);
    }
    expect([...codes].sort(compareSectionCode)).toEqual(codes);
  });

  it('every row names its parent, and the parent is itself a heading', () => {
    for (const h of ICH_M4_HEADINGS) {
      expect(h.parent, h.code).toBe(parentOf(h.code));
      if (h.parent !== null) expect(isIchHeading(h.parent), `${h.code} → ${h.parent}`).toBe(true);
      expect(h.module, h.code).toBe(Number(h.code[0]));
      expect(h.title.trim().length, h.code).toBeGreaterThan(0);
    }
  });

  it('every M2–M5 guidance code hangs under a heading (the tree is closed)', () => {
    const orphans = Object.keys(CTD_AUTHORING_GUIDANCE)
      .filter(isM2to5)
      .filter((c) => {
        const p = parentOf(c);
        return p !== null && !isIchHeading(p);
      });
    expect(orphans).toEqual([]);
  });

  it('every basis is well formed', () => {
    for (const h of ICH_M4_HEADINGS) expect(basisProblems(h.basis), h.code).toEqual([]);
  });

  it('Module 3 holds only the skeleton the eCTD backbone names; the CMC lane appends the rest', () => {
    expect(ICH_M4_HEADINGS.filter((h) => h.module === 3).map((h) => h.code)).toEqual([
      '3',
      '3.1',
      '3.2',
      '3.2.S',
      '3.2.P',
      '3.3',
    ]);
  });
});
