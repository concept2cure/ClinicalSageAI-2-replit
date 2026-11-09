/**
 * The demo has a programme whose Module 3 this product composes (J5-13).
 *
 * ## The gap
 *
 * Both demo programmes with CMC data are biologics — C2C-101 is a monoclonal
 * antibody, LMN-201 a spirulina-expressed protein — so both are outside the
 * composition boundary this platform ships (small-molecule US IND, P-28). Those
 * refusals are correct and `demo-packs-composition-boundary.test.ts` pins them.
 * But with no programme INSIDE the boundary, the demo could not show the
 * Module 3 build at all, and the founder walks this
 * (`docs/evidence/HUMAN-TEST/J5/README.md`, J5-13).
 *
 * ## What these cases hold
 *
 * `BIOTECH_SM_CMC` — C2C-201, a fictional small molecule from the same
 * fictional sponsor — is admitted by the shipped boundary, and its recorded
 * data composes a Module 3 with real cells: the specification's own limits, the
 * procedures it names with their recorded status, the batch results, and the
 * accelerated stability point that fails its limit at six months.
 *
 * This is the demo's own content run through the real engines, which is the
 * thing phase 4's acceptance fixture could not say: that fixture proves the
 * engine over canonical sources it builds itself
 * (`phase4-acceptance-fixture-tables.test.ts`); this proves the data a person
 * clicks through composes the same way.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error — the demo packs are plain ESM with no types.
import { BIOTECH_SM, BIOTECH_SM_CMC } from '../../../../scripts/demo/launch-demo/packs/biotech-work-content.mjs';
import {
  mapAnalyticalMethodPayload,
  mapDrugProductPayload,
  mapDrugSubstancePayload,
  mapSpecificationPayload,
  mapStabilityPayload,
} from '../../cmc-write-through';
import { composeModule3FromCanonicalSources, type ComposedSection } from '../../module3Composer';
import { compositionRefusal } from '../composition-scope';

type Pack = {
  substance: Record<string, string>;
  product: Record<string, string>;
  methods: Array<Record<string, unknown>>;
  specs: Array<Record<string, string>>;
  stability: Array<Record<string, unknown>>;
};
const PACK = BIOTECH_SM_CMC as Pack;

let nextId = 0;
const source = (sourceType: string, sourcePayload: Record<string, unknown>) => ({
  id: `demo-${sourceType}-${(nextId += 1)}`,
  sourceType,
  sourcePayload,
  sourceHash: `hash-${sourceType}-${nextId}`,
});

/** The pack's records as the write-through mappers record them. */
function sourcesOf(pack: Pack) {
  const s = pack.substance;
  const p = pack.product;
  return [
    source('drug_substance', mapDrugSubstancePayload({
      substanceName: s.name, inn: s.inn, casNumber: s.casNumber,
      molecularFormula: s.molecularFormula, molecularWeight: s.molecularWeight,
      manufacturer: s.manufacturer, manufacturingRoute: s.route,
      structuralFormula: s.structuralFormula, modality: s.modality,
      developmentPhase: s.developmentPhase, status: s.status,
    })),
    source('drug_product', mapDrugProductPayload({
      productName: p.name, dosageForm: p.dosageForm, strength: p.strength,
      composition: p.composition, formulation: p.batchFormula,
      manufacturingProcess: { description: p.process, site: p.site },
      packagingMaterials: { containerClosure: p.containerClosure },
      status: p.status,
    })),
    ...pack.methods.map((m) => source('method', mapAnalyticalMethodPayload({
      methodName: m.title, methodCode: m.code, methodType: m.technique,
      technique: m.technique, purpose: m.purpose, analyte: m.analyte, matrix: m.matrix,
      validationStatus: 'validated', ichQ2Parameters: { characteristics: m.characteristics, summary: m.summary },
    }))),
    ...pack.specs.map((x) => source('specification', mapSpecificationPayload({
      materialType: x.material, materialName: x.name,
      acceptanceCriteria: x.material === 'Drug product' ? { release: x.release, shelf: x.shelf ?? x.release } : { [x.name]: x.release },
      testMethods: { method: x.method },
    }))),
    ...pack.stability.map((x) => source('stability', mapStabilityPayload({
      studyName: x.title, scope: (x as { scope: string }).scope === 'DS' ? 'drug_substance' : 'drug_product',
      storageCondition: (x as { storage: string[] }).storage[1],
      batchesStudied: [(x as { batch: string }).batch],
      timePoints: (x as { timePoints: string[] }).timePoints,
      testParameters: (x as { parameters: string[] }).parameters,
      results: (x as { results: unknown[] }).results,
      studyType: (x as { studyType: string }).studyType,
    }))),
  ];
}

const sources = sourcesOf(PACK);
const sections = composeModule3FromCanonicalSources(sources as never);
const section = (key: string): ComposedSection => {
  const found = sections.find((x) => x.sectionKey === key);
  if (!found) throw new Error(`the composer returned no ${key}`);
  return found;
};
const tableIn = (key: string, title: RegExp) => section(key).tables.find((t) => title.test(t.title));

describe('the demo small molecule is inside the composition boundary', () => {
  it('names a fictional sponsor and molecule, so nothing reads as a real programme', () => {
    expect(BIOTECH_SM.productName).toMatch(/fictional/i);
    expect(PACK.substance.inn).toMatch(/fictional/i);
  });

  it('is admitted for a US IND, and refused for a marketing application', () => {
    expect(compositionRefusal(sources as never, 'ind', 'drug')).toBeNull();
    expect(compositionRefusal(sources as never, 'nda', 'drug')).not.toBeNull();
  });

  it('states its modality, so the boundary does not rest on the route’s wording', () => {
    expect(PACK.substance.modality).toBe('small_molecule');
    const vague = [source('drug_substance', mapDrugSubstancePayload({
      substanceName: PACK.substance.name, manufacturer: PACK.substance.manufacturer,
      manufacturingRoute: 'Proprietary process.', modality: PACK.substance.modality,
    }))];
    expect(compositionRefusal(vague as never, 'ind', 'drug')).toBeNull();
  });
});

describe('its recorded data composes a Module 3 with real cells', () => {
  it('§3.2.S.1 and §3.2.P.1 are composed from the substance and product records', () => {
    expect(section('3.2.S.1').lineage.length).toBeGreaterThan(0);
    expect(section('3.2.S.1').narrativeDraft).toContain('C2C-201');
    expect(section('3.2.P.1').lineage.length).toBeGreaterThan(0);
    expect(section('3.2.P.1').narrativeDraft).toMatch(/tablet/i);
  });

  it('§3.2.S.4 files the specification’s own limits and names its procedure', () => {
    const criteria = tableIn('3.2.S.4', /Acceptance Criteria/);
    expect(criteria, '§3.2.S.4 composed no acceptance-criteria table').toBeDefined();
    expect(JSON.stringify(criteria!.rows)).toContain('98.0 - 102.0 %');
    const methods = tableIn('3.2.S.4', /^Analytical Methods$/);
    expect(methods?.rows.map((r) => r[0])).toContain('HPLC-UV assay and related substances');
    expect(methods?.rows.map((r) => r[2])).toContain('validated');
  });

  it('§3.2.P.8 reports the accelerated point that fails its limit, and withholds the conclusion', () => {
    const results = tableIn('3.2.P.8', /Stability Results/);
    expect(results, '§3.2.P.8 composed no results table').toBeDefined();
    const outside = results!.rows.filter((r) => r[6] === 'OUTSIDE');
    expect(outside, 'the 6-month accelerated total impurities (0.61 against NMT 0.5 %) was not reported as outside').toHaveLength(1);
    expect(outside[0]).toContain('0.61');
    expect(section('3.2.P.8').narrativeDraft).toContain(
      'The stability conclusion and the proposed storage period are NOT established by this section.',
    );
  });

  it('every atom the composition cites is a record this pack holds', () => {
    const held = new Set(sources.map((s) => s.id));
    for (const s of sections) {
      for (const atom of s.lineage) expect(held.has(atom.sourceObjectId), atom.sourceObjectId).toBe(true);
    }
    expect(sections.some((s) => s.lineage.length > 0)).toBe(true);
  });

  it('composes more sections with data than the biologic packs can', () => {
    /* The point of the programme: a demo in which §3.2 has content. A biologic
       pack is refused before composition, so this is the only demo programme
       for which these numbers exist at all. */
    const withData = sections.filter((s) => s.lineage.length > 0).map((s) => s.sectionKey);
    expect(withData).toContain('3.2.S.4');
    expect(withData).toContain('3.2.P.5');
    expect(withData).toContain('3.2.S.7');
    expect(withData).toContain('3.2.P.8');
  });
});
