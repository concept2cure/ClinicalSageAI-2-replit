/**
 * Fixtures for the CDx claim-concordance surface (E12). These stand in for the
 * live tenant-linkage join until the server-side cross-dossier extractor lands.
 *
 * // INTEGRATION: replace these with the real join — given a `cdx_pairings` row
 * (from `pair_companion_diagnostic`), read the drug-labeling artifact and the
 * device IFU/intended-use artifact for the two tenant-linked submissions and
 * emit {category, text, source} records. The fixtures below model exactly that
 * output shape so the panel and diff are exercised today, green-in-isolation.
 *
 * Marked as a non-exportable SAMPLE: this data must never be sealed or exported
 * as if it were a real submission record (21 CFR Part 11 honesty contract).
 */
import type { PairedDossierClaims } from './cdxConcordance';

/**
 * Provenance marker. `sample` fixtures are NOT sealable / NOT exportable — they
 * are illustrative data, not assessed against a real dossier. The UI must
 * refuse to seal or export anything carrying this status.
 */
export type ConcordanceDataStatus = 'sample' | 'not_assessed' | 'assessed';

export interface SampleConcordanceFixture {
  /** Always 'sample' here — these are illustrative, not from a real submission. */
  status: Extract<ConcordanceDataStatus, 'sample'>;
  label: string;
  paired: PairedDossierClaims;
}

/**
 * Honesty guard: only an 'assessed' verdict drawn from real submission data may
 * be sealed or exported. 'sample' and 'not_assessed' are never sealable/
 * exportable. Pure + exported so the UI and tests share one source of truth.
 */
export function isSealable(status: ConcordanceDataStatus): boolean {
  return status === 'assessed';
}

/** A fully concordant pairing — every claim reads verbatim-identical. */
export const CONCORDANT_SAMPLE: SampleConcordanceFixture = {
  status: 'sample',
  label: 'Sample — concordant pairing (illustrative, not assessed)',
  paired: {
    pairingId: 'sample-concordant',
    drugClaims: [
      {
        category: 'intended_use',
        text: 'For the treatment of adult patients with metastatic non-small cell lung cancer whose tumors have EGFR exon 19 deletions or exon 21 (L858R) substitution mutations.',
        source: { side: 'drug', submission: 'BLA 761234', locator: 'Label §1 Indications and Usage' },
      },
      {
        category: 'biomarker',
        text: 'EGFR exon 19 deletions or exon 21 (L858R) substitution mutations',
        source: { side: 'drug', submission: 'BLA 761234', locator: 'Label §1 Indications and Usage' },
      },
      {
        category: 'population',
        text: 'adult patients with metastatic non-small cell lung cancer',
        source: { side: 'drug', submission: 'BLA 761234', locator: 'Label §1 Indications and Usage' },
      },
    ],
    deviceClaims: [
      {
        category: 'intended_use',
        text: 'For the treatment of adult patients with metastatic non-small cell lung cancer whose tumors have EGFR exon 19 deletions or exon 21 (L858R) substitution mutations.',
        source: { side: 'device', submission: 'PMA P210000', locator: 'IFU Intended Use' },
      },
      {
        category: 'biomarker',
        text: 'EGFR exon 19 deletions or exon 21 (L858R) substitution mutations',
        source: { side: 'device', submission: 'PMA P210000', locator: 'IFU Intended Use' },
      },
      {
        category: 'population',
        text: 'adult patients with metastatic non-small cell lung cancer',
        source: { side: 'device', submission: 'PMA P210000', locator: 'IFU Intended Use' },
      },
    ],
  },
};

/**
 * A discordant pairing exhibiting the three realistic failure modes:
 *   - biomarker: a glyph difference (≥ vs >=) — verbatim DISCORDANT, the exact
 *     kind of difference a fuzzy matcher would wrongly wave through;
 *   - population: the device side is narrower (adds "previously treated");
 *   - intended_use: present on the drug side, absent on the device side.
 */
export const DISCORDANT_SAMPLE: SampleConcordanceFixture = {
  status: 'sample',
  label: 'Sample — discordant pairing (illustrative, not assessed)',
  paired: {
    pairingId: 'sample-discordant',
    drugClaims: [
      {
        category: 'intended_use',
        text: 'For the treatment of adult patients with metastatic urothelial carcinoma whose tumors express PD-L1 (≥1%).',
        source: { side: 'drug', submission: 'BLA 761555', locator: 'Label §1 Indications and Usage' },
      },
      {
        category: 'biomarker',
        text: 'PD-L1 (≥1%)',
        source: { side: 'drug', submission: 'BLA 761555', locator: 'Label §1 Indications and Usage' },
      },
      {
        category: 'population',
        text: 'adult patients with metastatic urothelial carcinoma',
        source: { side: 'drug', submission: 'BLA 761555', locator: 'Label §1 Indications and Usage' },
      },
    ],
    deviceClaims: [
      // intended_use deliberately omitted on the device side.
      {
        category: 'biomarker',
        text: 'PD-L1 (>=1%)',
        source: { side: 'device', submission: 'PMA P210555', locator: 'IFU Intended Use' },
      },
      {
        category: 'population',
        text: 'previously treated adult patients with metastatic urothelial carcinoma',
        source: { side: 'device', submission: 'PMA P210555', locator: 'IFU Intended Use' },
      },
    ],
  },
};

export const CONCORDANCE_SAMPLES: SampleConcordanceFixture[] = [
  CONCORDANT_SAMPLE,
  DISCORDANT_SAMPLE,
];
