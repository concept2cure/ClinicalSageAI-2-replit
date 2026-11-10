/**
 * The distribution caveat reaches the composed section, not just the service.
 *
 * ## Why this file exists
 *
 * `process-capability.ts` states, since 2026-11-09, that Cp/Cpk/Pp/Ppk presume
 * an approximately normal distribution and says which way a skew bites
 * (`docs/evidence/F1/2026-11-09-capability-presumes-normality/`). Its own suite
 * proves the service says it.
 *
 * That is not the claim that matters. The claim that matters is that a REVIEWER
 * reads it — that the sentence travels `assessRecordedCapability` →
 * `capabilitySentence` → `batchCapabilityRendering` → the §3.2.S.4 narrative.
 * That path was verified by reading `module3Composer.ts`, and the repair's own
 * evidence said so rather than pretending otherwise. This file tests it.
 *
 * It also could not have been caught by the phase-4 acceptance fixture, which
 * records five QC results: capability refuses below six batches, so the shape
 * note never fires there. A series long enough to have a shape is a different
 * fixture, and this is it.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type ComposedSection } from '../../module3Composer';
import { mapQcTestingPayload, mapDrugSubstancePayload, mapSpecificationPayload } from '../../cmc-write-through';

const source = (id: string, sourceType: string, sourcePayload: Record<string, unknown>) => ({
  id,
  sourceType,
  sourcePayload,
  sourceHash: `hash-${id}`,
});

/** The substance, stating its modality so the boundary admits it (P-110). */
const SUBSTANCE = source('src-ds', 'drug_substance', mapDrugSubstancePayload({
  substanceName: 'C2C-210 API',
  modality: 'small_molecule',
  manufacturingRoute: 'Four-step chemical synthesis; isolated by crystallisation',
  manufacturer: 'Site A',
}));

const SPEC = source('src-spec', 'specification', mapSpecificationPayload({
  materialType: 'drug_substance',
  materialName: 'C2C-210 API',
  testParameters: [{ testParameter: 'Total impurities', acceptanceCriteria: 'NMT 0.5 %', testMethod: 'HPLC (AM-210)' }],
  testMethods: { method: 'HPLC (AM-210)' },
}));

/**
 * Ten impurity results against `NMT 0.5 %`, right-skewed: most near 0.10 with
 * a tail to 0.34. The shape a bounded-at-zero impurity actually has, and the
 * one where the normal-theory index is optimistic.
 */
const SKEWED_VALUES = [0.08, 0.09, 0.09, 0.10, 0.10, 0.11, 0.11, 0.12, 0.18, 0.26, 0.34];

const qc = (value: number, i: number) =>
  source(`src-qc-${i}`, 'qc_result', mapQcTestingPayload({
    sampleId: `DS-27${String(i + 10).padStart(2, '0')}`,
    batchNumber: `DS-27${String(i + 10).padStart(2, '0')}`,
    sampleType: 'in-process',
    testMethod: 'HPLC (AM-210)',
    testResults: { value: String(value), unit: '%' },
    specifications: { acceptanceCriteria: 'NMT 0.5 %' },
    passFailStatus: 'pass',
    reviewedBy: 11,
  }));

const SOURCES = [SUBSTANCE, SPEC, ...SKEWED_VALUES.map(qc)];

const sections = composeModule3FromCanonicalSources(SOURCES as never);
const section = (key: string): ComposedSection => {
  const found = sections.find((s) => s.sectionKey === key);
  if (!found) throw new Error(`the composer returned no ${key}`);
  return found;
};

describe('a skewed batch series is composed with its distribution caveat', () => {
  it('composes §3.2.S.4 at all, so a silent assertion below cannot pass', () => {
    expect(section('3.2.S.4').narrativeDraft.length).toBeGreaterThan(0);
  });

  it('states in the filed narrative that the indices presume approximate normality', () => {
    const narrative = section('3.2.S.4').narrativeDraft;
    expect(
      narrative,
      'the capability index reached §3.2.S.4 without the presumption it rests on',
    ).toMatch(/presume an approximately normal distribution/i);
  });

  it('names the direction in the filed narrative, not merely that it is skewed', () => {
    /* With an upper limit and a right tail the index is optimistic — the half a
       reviewer acts on. "This series is skewed" alone would leave them to work
       out which way, and the two have opposite consequences. */
    expect(section('3.2.S.4').narrativeDraft).toMatch(/OPTIMISTIC/);
  });

  it('still reports the index itself, so the caveat did not replace the number', () => {
    expect(section('3.2.S.4').narrativeDraft).toMatch(/Ppk\s/);
  });
});
