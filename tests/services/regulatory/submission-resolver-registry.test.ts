/** Real-registry companion to submission-resolver-intent.test.ts.
 * These tests do not mock the bridge/catalog or turn channel availability
 * into acceptance evidence. They require the native repository test runtime. */
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge';
import { resolveSubmissionPlan } from '../../../server/services/regulatory/submission-resolver';

it.each(['US_505B2', 'US_DE_NOVO', 'US_IND_AMENDMENT', 'EU_VARIATION_IB',
  'JP_MINOR_CHANGE', 'CA_SANDS', 'AU_CTA', 'AU_CAT2'])
  ('the shared plan preserves catalog selection %s and its own blueprints', id => {
    const selected = getApplicationType(id);
    assert.ok(selected?.active, `${id} must be an active real registry entry`);
    const row = resolveSubmissionPlan({ filingType: id, regions: [selected.region] }).perRegion[0];
    assert.equal(row.filing?.id, id);
    assert.equal(row.filing?.dossierStandard, selected.dossierStandard);
    assert.equal(row.sectionBlueprint, selected.defaultSectionBlueprint);
    assert.equal(row.taskBlueprint, selected.defaultTaskBlueprint);
    assert.equal(row.validationProfile, selected.validationProfile);
  });
it('unrecognized selected filing remains unresolved rather than becoming an NDA', () => {
  const plan = resolveSubmissionPlan({ filingType: 'synthetic_unknown_filing_93829',
    productClass: 'small_molecule', regions: ['US'] });
  assert.equal(plan.coverage, 'partial');
  assert.equal(plan.perRegion[0].filing, null);
  assert.equal(plan.perRegion[0].submitSupported, false);
});
it('conflicting explicit NDA/device settings do not silently select another filing', () => {
  const plan = resolveSubmissionPlan({ filingType: 'US_NDA', productClass: 'medical_device', regions: ['US', 'EU'] });
  assert.equal(plan.coverage, 'partial');
  assert.ok(plan.perRegion.every(row => row.filing === null));
});
it('the real eSTAR catalog entry cannot inherit an FDA eCTD Module 1 build claim', () => {
  const row = resolveSubmissionPlan({ filingType: 'US_DE_NOVO', regions: ['US'] }).perRegion[0];
  assert.equal(row.filing?.id, 'US_DE_NOVO');
  assert.equal(row.filing?.dossierStandard, 'eSTAR');
  assert.equal(row.module1Path, null); assert.equal(row.buildSupported, false);
});
it('the plan resolves a curated alias using the same bridge as the other callers', () => {
  const selected = resolveToRegistryEntry('  de_novo  ');
  assert.ok(selected);
  const row = resolveSubmissionPlan({ filingType: '  de_novo  ', regions: [selected.region] }).perRegion[0];
  assert.equal(row.filing?.id, selected.id);
});
