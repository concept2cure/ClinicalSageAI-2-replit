/**
 * §3.2.S.4 and §3.2.P.5 file every quality attribute the register records.
 *
 * ## The defect, found in the running product
 *
 * The Specifications register records **one row per quality attribute**:
 * `materialName` IS the attribute ("C2C-201 — assay"), `acceptanceCriteria` is
 * the `{release, shelf}` pair, and `testMethods.method` names the procedure
 * that measures it (`client/src/concept2cure/v2/surfaces/cmcSpec.ts`,
 * `specCreateBody` — the only writer the form has).
 *
 * Both composed sections expected the opposite shape — ONE record carrying
 * every attribute:
 *
 * - §3.2.S.4 read one `acceptanceCriteria` object and printed
 *   `Object.entries(criteria)` as attribute → criterion. So the "Quality
 *   Attribute" column showed `release` and `shelf`, and only the LAST scoped
 *   record's limits appeared.
 * - §3.2.P.5 built its per-attribute table from `testParameters`, a column the
 *   form never writes, and otherwise fell back to a single "Release Criteria"
 *   property row.
 *
 * Measured live on a seeded demo programme
 * (`docs/evidence/S7/2026-11-09-demo-cmc-live-run/`): **six recorded
 * attributes, one filed.** Five acceptance criteria a CMC group had entered
 * were absent from the section that exists to state them, and the one that
 * appeared was labelled `release` / `shelf` rather than by its attribute.
 *
 * ## What these cases hold
 *
 * One table row per specification record, scoped to its material: the
 * attribute as the register names it, the procedure that record names, and its
 * release and shelf-life limits. The per-row method also removes two hedges
 * the old shape forced — "See Analytical Methods table" and a blank validation
 * status — because a record that names its own procedure can be attributed to
 * that procedure's recorded status.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';

/** A specification row as `specCreateBody` records one. */
const specRow = (materialType: string, attribute: string, release: string, shelf: string, method: string) => ({
  id: `spec-${attribute}`,
  sourceType: 'specification',
  sourcePayload: {
    materialType,
    materialName: attribute,
    acceptanceCriteria: { release, shelf },
    testMethods: { method },
    ...(/drug[\s_-]?product/i.test(materialType) ? { releaseCriteria: release, shelfLifeCriteria: shelf } : {}),
  },
} as unknown as CanonicalSource);

const method = (name: string, status: string) => ({
  id: `method-${name}`,
  sourceType: 'method',
  sourcePayload: { methodName: name, technique: 'HPLC', validationStatus: status },
} as unknown as CanonicalSource);

const DS_SPECS = [
  specRow('Drug substance', 'C2C-201 — assay', '98.0 - 102.0 %', '98.0 - 102.0 %', 'HPLC-UV assay'),
  specRow('Drug substance', 'C2C-201 — water content', 'NMT 0.5 % w/w', 'NMT 0.5 % w/w', 'Karl Fischer'),
  specRow('Drug substance', 'C2C-201 — solid form', 'Conforms to Form I', 'Conforms to Form I', 'XRPD'),
];
const DP_SPECS = [
  specRow('Drug product', 'C2C-201 tablets — assay', '95.0 - 105.0 % of label claim', '93.0 - 107.0 % of label claim', 'HPLC-UV assay'),
  specRow('Drug product', 'C2C-201 tablets — dissolution', 'NLT 80 % (Q) at 30 min', 'NLT 75 % (Q) at 30 min', 'Dissolution USP <711>'),
];
const METHODS = [method('HPLC-UV assay', 'validated'), method('Karl Fischer', 'validation'), method('XRPD', 'validated'), method('Dissolution USP <711>', 'validated')];

const tableOf = (sources: CanonicalSource[], sectionKey: string, title: RegExp) => {
  const section = composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === sectionKey)!;
  return { section, table: section.tables.find((t) => title.test(t.title)) };
};

describe('§3.2.S.4 files one row per recorded attribute', () => {
  const sources = [...DS_SPECS, ...DP_SPECS, ...METHODS];

  it('names every attribute the register holds for the drug substance, and no other', () => {
    const { table } = tableOf(sources, '3.2.S.4', /Acceptance Criteria/);
    expect(table, 'no acceptance-criteria table').toBeDefined();
    expect(table!.rows.map((r) => r[0])).toEqual([
      'C2C-201 — assay',
      'C2C-201 — water content',
      'C2C-201 — solid form',
    ]);
    expect(JSON.stringify(table!.rows), 'a drug-product attribute reached §3.2.S.4').not.toContain('tablets');
  });

  it('files each attribute’s own limit, not one record’s for all of them', () => {
    const { table } = tableOf(sources, '3.2.S.4', /Acceptance Criteria/);
    const byAttribute = new Map(table!.rows.map((r) => [r[0], r]));
    expect(byAttribute.get('C2C-201 — assay')![2]).toBe('98.0 - 102.0 %');
    expect(byAttribute.get('C2C-201 — water content')![2]).toBe('NMT 0.5 % w/w');
    expect(byAttribute.get('C2C-201 — solid form')![2]).toBe('Conforms to Form I');
  });

  it('attributes each row to the procedure that record names, with that procedure’s status', () => {
    /* The old shape could not do this: one criteria object carried no
       per-attribute method, so with more than one method on file every row read
       "See Analytical Methods table" and its status column read "—". A record
       that names its own procedure can be attributed to it. */
    const { table } = tableOf(sources, '3.2.S.4', /Acceptance Criteria/);
    const byAttribute = new Map(table!.rows.map((r) => [r[0], r]));
    expect(byAttribute.get('C2C-201 — assay')!.slice(1, 2)).toEqual(['HPLC-UV assay']);
    expect(byAttribute.get('C2C-201 — assay')![3]).toBe('validated');
    expect(byAttribute.get('C2C-201 — water content')![1]).toBe('Karl Fischer');
    expect(byAttribute.get('C2C-201 — water content')![3], 'a method still in validation was filed as validated').toBe('validation');
  });

  it('says a named procedure is not in the register rather than inventing a status', () => {
    const orphan = [specRow('Drug substance', 'C2C-201 — colour', 'White to off-white', 'White to off-white', 'Visual inspection')];
    const { table } = tableOf(orphan, '3.2.S.4', /Acceptance Criteria/);
    expect(table!.rows[0][1]).toBe('Visual inspection');
    expect(table!.rows[0][3]).toBe('not in the method register');
  });
});

describe('§3.2.P.5 files one row per recorded attribute too', () => {
  const sources = [...DS_SPECS, ...DP_SPECS, ...METHODS];

  it('names every product attribute with its release and shelf-life limits', () => {
    const { table } = tableOf(sources, '3.2.P.5', /Release & Shelf-Life|Drug Product Specification/);
    expect(table, 'no product specification table').toBeDefined();
    expect(table!.rows.map((r) => r[0])).toEqual([
      'C2C-201 tablets — assay',
      'C2C-201 tablets — dissolution',
    ]);
    const assay = table!.rows.find((r) => r[0].includes('assay'))!;
    expect(assay[2]).toBe('95.0 - 105.0 % of label claim');
    expect(assay[3]).toBe('93.0 - 107.0 % of label claim');
  });

  it('keeps the drug substance’s attributes out of it', () => {
    const { table } = tableOf(sources, '3.2.P.5', /Release & Shelf-Life|Drug Product Specification/);
    expect(JSON.stringify(table!.rows)).not.toContain('water content');
  });
});

describe('a record that carries the older shape still files', () => {
  it('composes an attribute-keyed criteria object as it always did', () => {
    /* A caller that is not the form — an AnA tool, a script, an integration —
       may record one row whose criteria object is keyed by attribute. That
       shape still renders; nothing on file stops composing. */
    const legacy = [{
      id: 'legacy',
      sourceType: 'specification',
      sourcePayload: {
        materialType: 'Drug substance',
        acceptanceCriteria: { assay: '98.0 - 102.0 %', water: 'NMT 0.5 %' },
      },
    } as unknown as CanonicalSource];
    const { table } = tableOf(legacy, '3.2.S.4', /Acceptance Criteria/);
    expect(table!.rows.map((r) => r[0]).sort()).toEqual(['assay', 'water']);
  });
});
