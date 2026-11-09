/** The same resolver serves AnA and the existing planner. Synthetic registry,
 * bridge and support collaborators isolate selection semantics: these are not
 * new regulatory rules, gateway certification or real registry validation. */
import assert from 'node:assert/strict';
import { beforeEach, it, vi } from 'vitest';
import type { RegulatoryApplicationType, Region, ApplicationFamily, ProductClass } from '../../../shared/regulatory/document-taxonomy';

const h = vi.hoisted(() => ({
  entries: [] as RegulatoryApplicationType[],
  bridgeCalls: [] as string[],
  searchCalls: [] as string[],
  aliases: {} as Record<string, string>,
  gatewayCalls: [] as string[],
}));
vi.mock('../../../shared/regulatory/global-document-registry', () => ({
  getByRegion: (region: string) => h.entries.filter(e => e.region === region),
  getApplicationType: (id: string) => h.entries.find(e => e.id === id),
  resolveFromLegacy: (name: string) => h.entries.find(e => e.id === h.aliases[name]),
  // Deliberately broad search demonstrates why a fuzzy discovery hit must not
  // determine an explicitly selected filing.
  search: (name: string) => { h.searchCalls.push(name); return h.entries.slice(0, 1); },
}));
vi.mock('../../../shared/regulatory/submission-type-bridge', () => ({
  resolveToRegistryEntry: (name: string) => {
    h.bridgeCalls.push(name);
    const key = name.trim().toUpperCase();
    return h.entries.find(e => e.id === (h.aliases[key] ?? key)) ?? null;
  },
}));
vi.mock('../../../server/services/submission-gateways', () => ({ listGateways: () => [
  { region: 'fda', gateway: 'esg' }, { region: 'pmda', gateway: 'pmda_gateway' },
] }));
vi.mock('../../../shared/regulatory/region-identity', () => ({ REGION_IDENTITY: {
  US: { m1Backbone: 'm1/us/us-regional.xml' }, EU: { m1Backbone: 'm1/eu/eu-regional.xml' },
  JP: { m1Backbone: 'm1/jp/jp-regional.xml' },
} }));
vi.mock('../../../server/services/regulatory/registry/submittabilityCoverage', () => ({
  submissionChannelFor: (entry: RegulatoryApplicationType) => {
    h.gatewayCalls.push(entry.id);
    if (entry.id === 'EU_CTA') return { kind: 'portal', channel: 'Synthetic CTIS fixture' };
    if (entry.agency === 'EMA') return { kind: 'unconnected', channel: 'Synthetic EU channel',
      reason: 'No connector fixture', applicantStep: 'Applicant uploads' };
    if (entry.agency === 'PMDA') return { kind: 'gateway', region: 'pmda', name: 'pmda_gateway' };
    return { kind: 'gateway', region: 'fda', name: 'esg' };
  },
}));
vi.mock('../../../server/services/regulatory/market-support', () => ({
  module1StatementForAgency: (agency: string) => ['FDA', 'EMA', 'PMDA'].includes(agency)
    ? { shape: agency === 'FDA' ? 'structured' : 'flat', detail: 'Synthetic module shape' } : null,
  channelSupportFor: (entry: RegulatoryApplicationType) => entry.agency === 'PMDA'
    ? { state: 'refused', detail: 'Synthetic adapter refusal' } : { state: 'unproven' },
}));

import { resolveSubmissionPlan, submissionCoverageMatrix, pickRegionalEntry, CORE_REGIONS }
  from '../../../server/services/regulatory/submission-resolver';

function entry(id: string, region: Region, applicationFamily: ApplicationFamily, productClass: ProductClass[],
  extra: Partial<RegulatoryApplicationType> = {}): RegulatoryApplicationType {
  return { id, region, country: 'Synthetic country', agency: ({ US: 'FDA', EU: 'EMA', JP: 'PMDA',
    CA: 'Health_Canada', AU: 'TGA' } as const)[region as 'US' | 'EU' | 'JP' | 'CA' | 'AU'] ?? 'ICH',
    applicationFamily, applicationType: id, displayName: `Synthetic ${id}`,
    synonyms: [], stage: 'initial', productClass, dossierStandard: 'eCTD', active: true,
    requiredArtifacts: [], defaultSectionBlueprint: `${id}_sections`, defaultTaskBlueprint: `${id}_tasks`,
    validationProfile: `${id}_validation`, lifecycleActions: ['submit'], ...extra };
}
function reset() {
  h.entries = [
    entry('US_NDA', 'US', 'marketing_authorization', ['small_molecule']),
    entry('US_505B2', 'US', 'marketing_authorization', ['small_molecule']),
    entry('US_BLA', 'US', 'marketing_authorization', ['biologic']),
    entry('US_510K', 'US', 'device_clearance', ['medical_device', 'ivd'], { dossierStandard: 'eSTAR' }),
    entry('US_DE_NOVO', 'US', 'device_clearance', ['medical_device', 'ivd'], { dossierStandard: 'eSTAR' }),
    entry('US_EUA', 'US', 'device_clearance', ['ivd'], { dossierStandard: 'none' }),
    entry('US_IND', 'US', 'clinical_trial', ['small_molecule', 'biologic']),
    entry('US_IND_AMENDMENT', 'US', 'clinical_trial', ['any'], { stage: 'amendment', parentApplicationType: 'US_IND' }),
    entry('EU_MAA', 'EU', 'marketing_authorization', ['small_molecule', 'biologic']),
    entry('EU_CTA', 'EU', 'clinical_trial', ['small_molecule', 'biologic'], { dossierStandard: 'regional' }),
    entry('EU_VARIATION_IA', 'EU', 'variation', ['any'], { stage: 'amendment' }),
    entry('EU_VARIATION_IB', 'EU', 'variation', ['any'], { stage: 'amendment' }),
    entry('JP_STANDARD', 'JP', 'marketing_authorization', ['biologic']),
    entry('JP_SELECTED', 'JP', 'marketing_authorization', ['biologic']),
    entry('CA_STANDARD', 'CA', 'marketing_authorization', ['small_molecule']),
    entry('CA_SELECTED', 'CA', 'marketing_authorization', ['small_molecule']),
    entry('AU_CTN', 'AU', 'clinical_trial', ['any']),
    entry('AU_CTA', 'AU', 'clinical_trial', ['any']),
  ];
  h.aliases = { NDA: 'US_NDA', BLA: 'US_BLA', IND: 'US_IND', '505(B)(2)': 'US_505B2',
    DE_NOVO: 'US_DE_NOVO', DENOVO: 'US_DE_NOVO', 'IND-AMEND': 'US_IND_AMENDMENT', 'TYPE IB': 'EU_VARIATION_IB' };
  h.bridgeCalls = []; h.searchCalls = []; h.gatewayCalls = [];
  CORE_REGIONS.splice(0, CORE_REGIONS.length, 'US', 'EU', 'JP');
}
beforeEach(reset);

it.each([
  ['US_505B2', 'US'], ['US_DE_NOVO', 'US'], ['US_EUA', 'US'], ['US_IND_AMENDMENT', 'US'],
  ['EU_VARIATION_IB', 'EU'], ['JP_SELECTED', 'JP'], ['CA_SELECTED', 'CA'], ['AU_CTA', 'AU'],
] as const)('keeps explicitly selected %s in its recorded %s region', (id, region) => {
  const plan = resolveSubmissionPlan({ filingType: id, regions: [region] });
  assert.equal(plan.perRegion[0].filing?.id, id);
  assert.equal(plan.perRegion[0].sectionBlueprint, `${id}_sections`);
  assert.equal(plan.perRegion[0].validationProfile, `${id}_validation`);
});
it.each(['denovo', ' DE_NOVO ', 'ind-amend', 'type ib', '505(b)(2)'])('uses the existing bridge for alias %s rather than its own fuzzy selection', alias => {
    const id = h.aliases[alias.trim().toUpperCase()];
    const candidate = h.entries.find(e => e.id === id)!;
    assert.equal(resolveSubmissionPlan({ filingType: alias, regions: [candidate.region] }).perRegion[0].filing?.id, id);
    assert.ok(h.bridgeCalls.includes(alias));
    assert.deepEqual(h.searchCalls, []);
  });
it.each(['not-a-filing', 'partial marketing name'])('unknown selection %s remains a gap', filingType => {
  const plan = resolveSubmissionPlan({ filingType, regions: ['US', 'EU'] });
  assert.equal(plan.coverage, 'partial');
  assert.ok(plan.perRegion.every(r => r.filing === null && !r.buildSupported && !r.submitSupported));
  assert.match(plan.gaps.join(' '), /not recognized|registered filing/i);
  assert.deepEqual(h.gatewayCalls, []);
});
it('does not use a family hint to overwrite an unrecognized explicit filing', () => {
  const plan = resolveSubmissionPlan({ filingType: 'unknown', applicationFamily: 'clinical_trial', productClass: 'biologic', regions: ['US'] });
  assert.equal(plan.perRegion[0].filing, null);
});
it.each(['biologic', 'medical_device', 'ivd'] as const)('an explicit small-molecule filing does not silently change to fit %s', productClass => {
  const plan = resolveSubmissionPlan({ filingType: 'US_NDA', productClass, regions: ['US', 'EU'] });
  assert.equal(plan.coverage, 'partial');
  assert.ok(plan.perRegion.every(r => r.filing === null));
  assert.match(plan.gaps.join(' '), /product class|project settings/i);
});
it.each(['medical_device', 'ivd', 'generic'] as const)('never returns an incompatible marketing candidate for %s', productClass => {
  assert.equal(pickRegionalEntry('EU', 'marketing_authorization', productClass), undefined);
  const plan = resolveSubmissionPlan({ applicationFamily: 'marketing_authorization', productClass, regions: ['EU'] });
  assert.equal(plan.perRegion[0].filing, null);
  assert.equal(plan.coverage, 'partial');
});
it('retains an explicitly generic registry row for a matching family', () => {
  h.entries.push(entry('EU_GENERIC', 'EU', 'marketing_authorization', ['any']));
  assert.equal(pickRegionalEntry('EU', 'marketing_authorization', 'ivd')?.id, 'EU_GENERIC');
});
it('prefers a compatible exact product over a generic row', () => {
  h.entries.unshift(entry('EU_GENERIC', 'EU', 'marketing_authorization', ['any']));
  assert.equal(pickRegionalEntry('EU', 'marketing_authorization', 'biologic')?.id, 'EU_MAA');
});
it('does not substitute a specific marketing product when no product is established', () => {
  assert.equal(pickRegionalEntry('US', 'marketing_authorization', 'any'), undefined);
});
it('does not advertise an inactive selected filing as a live candidate', () => {
  h.entries.find(e => e.id === 'US_DE_NOVO')!.active = false;
  const plan = resolveSubmissionPlan({ filingType: 'US_DE_NOVO', regions: ['US'] });
  assert.equal(plan.perRegion[0].filing, null);
  assert.match(plan.gaps.join(' '), /inactive/i);
});
it('skips inactive entries in family-level discovery', () => {
  h.entries.find(e => e.id === 'US_NDA')!.active = false;
  assert.equal(pickRegionalEntry('US', 'marketing_authorization', 'small_molecule')?.id, 'US_505B2');
});
it('does not convert an amendment into an initial filing in another region', () => {
  const plan = resolveSubmissionPlan({ filingType: 'US_IND_AMENDMENT', productClass: 'biologic', regions: ['US', 'EU'] });
  assert.equal(plan.perRegion[0].filing?.id, 'US_IND_AMENDMENT');
  assert.equal(plan.perRegion[1].filing, null);
  assert.match(plan.perRegion[1].notes.join(' '), /lifecycle stage amendment/);
});
it('uses a compatible same-stage regional candidate when one is recorded', () => {
  h.entries.push(entry('EU_AMENDMENT', 'EU', 'clinical_trial', ['biologic'], { stage: 'amendment' }));
  const plan = resolveSubmissionPlan({ filingType: 'US_IND_AMENDMENT', productClass: 'biologic', regions: ['EU'] });
  assert.equal(plan.perRegion[0].filing?.id, 'EU_AMENDMENT');
});
it.each(['eSTAR', 'regional', 'none'] as const)('does not infer a %s build from the FDA eCTD backbone', dossierStandard => {
  h.entries.push(entry('US_OTHER', 'US', 'device_approval', ['medical_device'], { dossierStandard }));
  const row = resolveSubmissionPlan({ filingType: 'US_OTHER', regions: ['US'] }).perRegion[0];
  assert.equal(row.filing?.dossierStandard, dossierStandard);
  assert.equal(row.buildSupported, false); assert.equal(row.module1Path, null);
  assert.match(row.notes.join(' '), /does not establish a build/i);
});
it('coverage cannot count a non-eCTD device filing as an eCTD build', () => {
  const matrix = submissionCoverageMatrix(['US'], ['device_clearance'], ['medical_device']);
  assert.equal(matrix.rows[0].cells[0].buildSupported, false);
  assert.equal(matrix.rows[0].fullyCovered, false);
});
it('coverage does not borrow a drug filing for an unsupported IVD marketing combination', () => {
  const matrix = submissionCoverageMatrix(['EU'], ['marketing_authorization'], ['ivd']);
  assert.equal(matrix.rows[0].cells[0].filingId, null);
  assert.equal(matrix.rows[0].fullyCovered, false);
});
it('retains established eCTD build and channel distinctions without enabling new gateways', () => {
  const plan = resolveSubmissionPlan({ filingType: 'BLA' });
  assert.equal(plan.perRegion[0].filing?.id, 'US_BLA');
  assert.equal(plan.perRegion[0].buildSupported, true);
  assert.equal(plan.perRegion[0].submitSupported, true);
  assert.equal(plan.perRegion[1].buildSupported, false);
  assert.equal(plan.perRegion[1].submitSupported, false);
  assert.equal(plan.perRegion[1].channel?.kind, 'unconnected');
  assert.equal(plan.perRegion[2].buildSupported, false);
  assert.equal(plan.perRegion[2].submitSupported, false);
  assert.equal(plan.coverage, 'partial');
});
it.each(['CA', 'AU'] as const)('does not convert a catalogued %s selection into a new build or gateway claim', region => {
  const filingType = region === 'CA' ? 'CA_SELECTED' : 'AU_CTA';
  const row = resolveSubmissionPlan({ filingType, regions: [region] }).perRegion[0];
  assert.equal(row.filing?.id, filingType); assert.equal(row.buildSupported, false);
  assert.equal(row.submitSupported, false); assert.equal(row.gateway, null);
});
it('continues to report a portal-only filing without a transmission gateway', () => {
  const row = resolveSubmissionPlan({ filingType: 'EU_CTA', regions: ['EU'] }).perRegion[0];
  assert.equal(row.channel?.kind, 'portal'); assert.equal(row.gateway, null);
  assert.equal(row.submitSupported, false);
});
it('does not let returned default regions mutate subsequent plans', () => {
  resolveSubmissionPlan({ filingType: 'BLA' }).intent.regions.splice(0, 3, 'AU');
  assert.deepEqual(CORE_REGIONS, ['US', 'EU', 'JP']);
  assert.deepEqual(resolveSubmissionPlan({ filingType: 'BLA' }).intent.regions, ['US', 'EU', 'JP']);
});
it('caller region changes cannot rewrite the already resolved plan intent', () => {
  const regions: Region[] = ['US', 'EU'];
  const plan = resolveSubmissionPlan({ filingType: 'BLA', regions });
  regions.splice(0, 2, 'AU');
  assert.deepEqual(plan.intent.regions, ['US', 'EU']);
  assert.deepEqual(plan.perRegion.map(r => r.region), plan.intent.regions);
});
it('returned methodology cannot alter a later plan', () => {
  const first = resolveSubmissionPlan({ filingType: 'BLA' });
  const length = first.methodology.length;
  first.methodology.push('FABRICATED SUCCESS');
  assert.equal(resolveSubmissionPlan({ filingType: 'BLA' }).methodology.length, length);
});
it('coverage dimensions are detached from caller arrays', () => {
  const regions: Region[] = ['US']; const families: ApplicationFamily[] = ['marketing_authorization'];
  const products: ProductClass[] = ['biologic'];
  const matrix = submissionCoverageMatrix(regions, families, products);
  regions[0] = 'AU'; families[0] = 'device_clearance'; products[0] = 'ivd';
  assert.deepEqual(matrix.regions, ['US']); assert.deepEqual(matrix.families, ['marketing_authorization']);
  assert.deepEqual(matrix.productClasses, ['biologic']);
});
it('an empty coverage request is not fully covered', () => {
  const matrix = submissionCoverageMatrix([], ['marketing_authorization'], ['biologic']);
  assert.equal(matrix.rows[0].fullyCovered, false);
  assert.match(matrix.summary, /^0\/0 /);
});
it('retains the established default comparison regions rather than expanding release scope', () => {
  assert.deepEqual(CORE_REGIONS, ['US', 'EU', 'JP']);
  const plan = resolveSubmissionPlan({ filingType: 'BLA', regions: [] });
  assert.deepEqual(plan.intent.regions, CORE_REGIONS);
});
