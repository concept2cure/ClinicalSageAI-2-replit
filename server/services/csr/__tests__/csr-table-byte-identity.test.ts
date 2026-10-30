/**
 * Receipts must keep verifying for existing sources (CDISC pilot D10–D12,
 * 2026-10-30): the scientific-review receipts and the retained-run
 * reconstruction hash the engine's table cells, so a source that uses none of
 * the declared populations, the descriptive demographics, armless efficacy
 * results or "efficacy not supplied" must tabulate byte-identically to before.
 * The digests below were computed at commit 7e4c7f479e, before those changes,
 * over the repository's SYNTHETIC fixtures (and the derived ADaM envelopes,
 * which those changes must not alter for a manifest that declares nothing new).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CsrEfficacyResults } from '../../../../shared/csr-adam-bundle';
import { buildCSRTables } from '../../csr-tabulation-builders';
import { readAdamDataset } from '../adam-dataset-reader';
import { deriveCsrSourceFromAdam } from '../adam-source-derivation';
import { legacyAdae, legacyAdlbc, legacyAdlbh, legacyAdsl, legacyAdvs, legacyBundle } from './support/adam-legacy-synthetic';
import * as lmn from './support/adam-lmn201-synthetic';
import { scaleEnvelope } from './support/csr-scale-synthetic';
import { sourceFixture } from './source-input-fixture';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = (doc: unknown) => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), 'x.json');
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};
const legacyEfficacy = { format: 'concept2cure.csr-efficacy-results.v1', protocolNumber: 'SYN-LMN201-PROTOCOL', results: [
  { endpointName: lmn.PRIMARY, endpointType: 'primary', armId: 'DRUG', value: 1, display: 'synthetic' },
  { endpointName: lmn.PRIMARY, endpointType: 'primary', armId: 'PBO', value: 2, display: 'synthetic' }] } as CsrEfficacyResults;

/** Pinned at 7e4c7f479e (before D10–D12). */
const BEFORE = {
  sourceFixtureTables: '691c25af53642c88e2a7da1825ccf94dbf14a6c63c35d7054dea221df4d9e53a',
  lmn201SeedTables: '9e0ccd50ce1daf1d007b571010a40a083604ad86817612b9e1d5b279a3ad3b33',
  scale300Tables: 'f1d59353d4d91700c8dd3943ae0757b63986f8f41ac982fecaa0616b18fc5318',
  legacyAdamEnvelope: '2726c4fa5b06e98c382b5a72e30d59fbf9f3a17cd7abe5c2e16a2f94da7d2f09',
  legacyAdamTables: 'b43091befc18d7ff272c1f902edda9af3a30ae628b982c903f9d5fb5b0ea09fc',
  lmn201AdamEnvelope: 'a7a68dc46daa67764f107c2ddddc1e1ebaf5b4e5a4067f64c3385a981d86b9c3',
  lmn201AdamTables: 'be373127215af341c668914a7cf557cd71b8b489a69db70b784daf9f2280666e',
};

function currentDigests() {
  const seed = JSON.parse(readFileSync(path.resolve('data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v1.json'), 'utf8'));
  const legacy = deriveCsrSourceFromAdam(legacyBundle(), { ADSL: legacyAdsl(), ADAE: legacyAdae(), ADLBC: legacyAdlbc(), ADLBH: legacyAdlbh(), ADVS: legacyAdvs() }, legacyEfficacy);
  const derived = deriveCsrSourceFromAdam(lmn.bundle(), { ADSL: read(lmn.adsl()), ADAE: read(lmn.adae()), ADEX: read(lmn.adex()), ADLB: read(lmn.adlb()),
    ADVS: read(lmn.advs()), ADCM: read(lmn.adcm()) }, lmn.efficacyResults());
  return {
    sourceFixtureTables: sha(buildCSRTables(sourceFixture().studyData)),
    lmn201SeedTables: sha(buildCSRTables(seed.studyData)),
    scale300Tables: sha(buildCSRTables(scaleEnvelope(300).studyData)),
    legacyAdamEnvelope: sha(legacy), legacyAdamTables: sha(buildCSRTables(legacy.studyData)),
    lmn201AdamEnvelope: sha(derived), lmn201AdamTables: sha(buildCSRTables(derived.studyData)),
  };
}

describe('a source that uses none of D10–D12 tabulates byte-identically to before', () => {
  it('matches every digest pinned before the change', () => {
    expect(currentDigests()).toEqual(BEFORE);
  });
});
