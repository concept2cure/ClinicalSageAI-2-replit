/**
 * The eCTD Module 2–5 backbone is held to the ICH M4 heading record
 * (D2, 2026-10-05, step g-ich-m4-headings; docs/design/ANA_REGULATORY_RECORD.md
 * §9 K and §10 "ich-backbone-parity.test.ts").
 *
 * `ICH_BACKBONE` (server/services/submission-gateways/ectd-packager/
 * ich-headings.ts) decides where every Module 2–5 leaf is placed in index.xml.
 * It is a hand-written tree. Until the ICH eCTD v3.2.2 DTD is vendored
 * (finding 37), it cannot be derived from the record, so this test holds it to
 * the record instead: every section it names must be a heading of
 * `ich-m4-headings.ts` ∪ `CTD_AUTHORING_GUIDANCE` (`isIchHeading`). A heading
 * added to the backbone that ICH M4 does not define — 4.3.1, say — fails here.
 *
 * The planted case runs the same check on a copy of the backbone with a
 * '4.3.1' heading added, so the gate is seen failing on what it exists to
 * catch, every run.
 */
import { describe, it, expect } from 'vitest';
import {
  ICH_BACKBONE,
  type IchHeading,
} from '../../server/services/submission-gateways/ectd-packager/ich-headings';
import { isIchHeading } from '../../server/services/ind/ctd/ich-m4-headings';

/** Every backbone section that is not a heading of the record, in tree order. */
function sectionsAbsentFromRecord(tree: readonly IchHeading[]): string[] {
  const out: string[] = [];
  const walk = (hs: readonly IchHeading[]) => {
    for (const h of hs) {
      if (!isIchHeading(h.section)) out.push(h.section);
      if (h.children) walk(h.children);
    }
  };
  walk(tree);
  return out;
}

describe('ICH_BACKBONE ⊆ ICH M4 heading record', () => {
  it('every backbone section is an ICH M4 heading', () => {
    expect(sectionsAbsentFromRecord(ICH_BACKBONE)).toEqual([]);
  });

  it('a planted heading the record does not define is caught', () => {
    const planted: IchHeading[] = ICH_BACKBONE.map((m) =>
      m.section !== '4'
        ? m
        : {
            ...m,
            children: [
              ...(m.children ?? []),
              {
                element: 'm4-3-literature-references',
                section: '4.3',
                children: [{ element: 'm4-3-1-single-dose-toxicity', section: '4.3.1' }],
              },
            ],
          },
    );
    expect(sectionsAbsentFromRecord(planted)).toEqual(['4.3.1']);
  });
});
