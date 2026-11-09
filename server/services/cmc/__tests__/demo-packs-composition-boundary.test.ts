/**
 * Each demo pack's drug substance is refused, or admitted, for the reason that
 * is true of it.
 *
 * ## Why this test is here and not with the demo pack
 *
 * The demo packs are plain `.mjs` seeders run by `node --test`
 * (`scripts/demo/launch-demo/cmc-demo-materials.test.mjs` holds their data and
 * seeder cases). They cannot import `services/cmc/composition-scope.ts`: it
 * imports its siblings by specifiers only the bundler resolves, so a plain
 * `node --test` run fails on `substance-modality.js`. This suite runs under the
 * server's own resolver, so it can hand the demo's real payload to the real
 * boundary.
 *
 * ## What it holds
 *
 * J5-13 (`docs/evidence/HUMAN-TEST/J5/README.md`) reported the Module 3 build
 * refused on the biotech demo because C2C-101 is a monoclonal antibody. The
 * refusal is right — but it was not the refusal the product gave: no pack
 * recorded a drug substance at all, so `compositionRefusal` answered
 * `CMC_MODALITY_NOT_ESTABLISHED` ("this project records no drug substance")
 * rather than `CMC_MODALITY_OUT_OF_SCOPE` naming ICH Q6B.
 *
 * With the substance recorded, the demo is refused for what it IS. This pins
 * that, through the shipped rule rather than a description of it, so a pack
 * whose data drifts out of the boundary's reading fails here instead of at a
 * walk-through.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error — the demo packs are plain ESM with no types.
import { BIOTECH_CMC } from '../../../../scripts/demo/launch-demo/packs/biotech-work-content.mjs';
// @ts-expect-error — the demo packs are plain ESM with no types.
import { LMN201_CMC } from '../../../../scripts/demo/launch-demo/packs/lumen-content.mjs';
import { mapDrugSubstancePayload } from '../../cmc-write-through';
import { compositionRefusal } from '../composition-scope';

type DemoSubstance = {
  name: string;
  manufacturer?: string;
  route?: string;
  modality?: string;
  biologicalOrigin?: string;
  cellLine?: string;
  sourceOrganism?: string;
};

/** The pack's substance as the write-through would record it. */
const sourcesFor = (substance: DemoSubstance) => [{
  id: 'demo-substance',
  sourceType: 'drug_substance',
  sourcePayload: mapDrugSubstancePayload({
    substanceName: substance.name,
    manufacturer: substance.manufacturer,
    manufacturingRoute: substance.route,
    modality: substance.modality,
    biologicalOrigin: substance.biologicalOrigin,
    cellLine: substance.cellLine,
    sourceOrganism: substance.sourceOrganism,
  }),
}];

const PACKS: Array<[string, { substance: DemoSubstance }]> = [
  ['biotech (C2C-101)', BIOTECH_CMC as { substance: DemoSubstance }],
  ['lumen (LMN-201)', LMN201_CMC as { substance: DemoSubstance }],
];

describe('the demo packs against the shipped composition boundary', () => {
  for (const [label, cmc] of PACKS) {
    it(`${label} is refused for what it is, naming the guideline that applies instead`, () => {
      const refusal = compositionRefusal(sourcesFor(cmc.substance) as never, 'ind', 'drug');

      expect(refusal, `${label}: the boundary admitted a biologic`).not.toBeNull();
      expect(refusal?.code, `${label}: refused for a record it lacks rather than for what it is`)
        .toBe('CMC_MODALITY_OUT_OF_SCOPE');
      expect(refusal?.message).toMatch(/ICH Q6B/);
      expect(refusal?.message).toMatch(/Q5A\(R2\)/);
    });

    it(`${label} states its modality rather than leaving it to the route heuristic`, () => {
      /* `classifySubstanceModality` reads the route when the modality is
         absent. A demo whose scope depended on that heuristic would change
         meaning with a wording change to its process description. */
      expect(cmc.substance.modality).toBe('biologic');
      const stated = compositionRefusal(sourcesFor({ ...cmc.substance, route: undefined }) as never, 'ind', 'drug');
      expect(stated?.code, 'the modality was being read from the route, not from the record')
        .toBe('CMC_MODALITY_OUT_OF_SCOPE');
    });
  }

  it('the same pack with a small-molecule substance would be admitted', () => {
    /* The boundary is not refusing the demo for being a demo. Swap the one
       recorded fact that decides it and the same programme composes — which is
       what a small-molecule demo project would show (J5-13's remaining half). */
    const substance = { ...(BIOTECH_CMC as { substance: DemoSubstance }).substance, modality: 'small_molecule', biologicalOrigin: undefined, cellLine: undefined, sourceOrganism: undefined };
    expect(compositionRefusal(sourcesFor(substance) as never, 'ind', 'drug')).toBeNull();
  });
});
