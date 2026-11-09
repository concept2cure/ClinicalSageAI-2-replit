/**
 * §3.2.S.4's acceptance criteria are the DRUG SUBSTANCE's.
 *
 * ## The defect, found in the running product
 *
 * `'3.2.S.4'` read `valObj(m, 'acceptanceCriteria')` — the FIRST specification
 * source carrying an acceptance-criteria object, whatever material it is for.
 * A programme that records both a drug-substance and a drug-product
 * specification (which every real programme does) therefore rendered
 * **whichever source came first** as the drug substance's acceptance criteria.
 *
 * Measured on this container's database after seeding the demo
 * (`docs/evidence/S7/2026-11-09-demo-cmc-live-run/`): §3.2.S.4's
 * acceptance-criteria table for C2C-201 read
 *
 *     | shelf   | See Analytical Methods table | NLT 80 % (Q) released at 30 minutes |
 *     | release | See Analytical Methods table | NLT 80 % (Q) released at 30 minutes |
 *
 * — the drug PRODUCT's dissolution limit, under the drug substance's
 * specification, with the attribute names replaced by the register's
 * release/shelf keys. A filed section asserting a limit for the wrong material
 * is a false statement about what was tested.
 *
 * §3.2.P.5 was never exposed to this: it reads `releaseCriteria`, which
 * `mapSpecificationPayload` emits only for a drug-product spec. The substance
 * side had no such guard.
 *
 * ## The rule
 *
 * The same one §3.2.S.7 / §3.2.P.8 already use for stability studies, through
 * the same helpers: a specification is evidence for the side its
 * `materialType` records, an UNRECORDED material covers BOTH (a row written
 * before the field existed must not vanish from either section), and the
 * section says the scope is unrecorded rather than pretending to know.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';

const spec = (id: string, materialType: string | undefined, acceptanceCriteria: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id,
  sourceType: 'specification',
  sourcePayload: { ...(materialType === undefined ? {} : { materialType }), acceptanceCriteria, ...over },
} as unknown as CanonicalSource);

const DS_CRITERIA = { assay: '98.0 - 102.0 %', 'total impurities': 'NMT 0.5 %' };
const DP_CRITERIA = { release: 'NLT 80 % (Q) released at 30 minutes', shelf: 'NLT 75 % (Q) at 30 minutes' };

const criteriaTableOf = (sources: CanonicalSource[], sectionKey: string) => {
  const section = composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === sectionKey)!;
  return { section, table: section.tables.find((t) => /Acceptance Criteria/.test(t.title)) };
};

describe('§3.2.S.4 files the drug substance’s own acceptance criteria', () => {
  it('ignores a drug-product specification, whichever order the sources arrive in', () => {
    for (const order of [
      [spec('dp', 'Drug product', DP_CRITERIA), spec('ds', 'Drug substance', DS_CRITERIA)],
      [spec('ds', 'Drug substance', DS_CRITERIA), spec('dp', 'Drug product', DP_CRITERIA)],
    ]) {
      const { table } = criteriaTableOf(order, '3.2.S.4');
      expect(table, 'no acceptance-criteria table').toBeDefined();
      expect(table!.rows.map((r) => r[0]).sort()).toEqual(['assay', 'total impurities']);
      expect(JSON.stringify(table!.rows), 'the product’s dissolution limit reached §3.2.S.4')
        .not.toContain('released at 30 minutes');
    }
  });

  it('files nothing rather than the product’s limits when only a product spec exists', () => {
    const { section, table } = criteriaTableOf([spec('dp', 'Drug product', DP_CRITERIA)], '3.2.S.4');
    expect(table, 'the product’s criteria were filed as the substance’s').toBeUndefined();
    /* NOT fixed here, and recorded rather than asserted away: the section still
       reports `acceptanceCriteria` as AVAILABLE, because completeness is
       computed by one generic collector over every matched source and that
       collector is not material-scoped. So a programme with only a
       drug-product specification reads as 50% on §3.2.S.4 while the section
       files no criteria at all — a section reporting itself more complete than
       it is, which is a lesser fault than the false limit this fix removes but
       is still a fault.

       The two ways to close it both need the owning lane: a side-scoped field
       in `mapSpecificationPayload` (which would report every specification
       already on file as missing it, since stored canonical payloads are not
       rewritten), or a per-type scope on `SectionRule` so the collector honours
       it — a change to the rule table every section reads. */
    expect(section.missingInputs, 'the completeness gap below was closed without updating this note')
      .not.toContain('acceptanceCriteria');
    expect(section.completeness).toBeLessThan(100);
  });

  it('keeps a specification whose material was never recorded, and says so', () => {
    /* A row written before the register had the field is ambiguous, not
       drug-product — the same rule the stability side applies. It renders, and
       the section states that its material is unrecorded. */
    const { section, table } = criteriaTableOf([spec('legacy', undefined, DS_CRITERIA)], '3.2.S.4');
    expect(table?.rows.map((r) => r[0]).sort()).toEqual(['assay', 'total impurities']);
    expect(section.narrativeDraft).toMatch(/material.*not recorded|not recorded.*material/i);
  });
});

describe('§3.2.P.5 is unchanged', () => {
  it('still reads the product’s release criteria and not the substance’s', () => {
    const sources = [
      spec('ds', 'Drug substance', DS_CRITERIA),
      spec('dp', 'Drug product', DP_CRITERIA, { releaseCriteria: 'NLT 80 % (Q) released at 30 minutes' }),
    ];
    const p5 = composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === '3.2.P.5')!;
    expect(p5.narrativeDraft).toContain('NLT 80 % (Q) released at 30 minutes');
    expect(p5.narrativeDraft).not.toContain('98.0 - 102.0 %');
  });
});
