import { z } from 'zod';
import { CsrEfficacyResultSchema, CsrSourceSelectionSchema, CsrStudyInfoSchema } from './csr-source-input.js';

/**
 * CSR slice 6 (2026-10-29): an approved Vault manifest that names the study's
 * CDISC ADaM datasets and its approved SAP efficacy output, each by Vault
 * document and exact SHA-256. The engine derives the concept2cure.csr-source.v1
 * envelope from them (server/services/csr/adam-source-derivation.ts), so the
 * manifest's own digest binds every dataset byte. Efficacy is imported as the
 * SAP reports it (design decision 2), never computed here.
 */
export const CSR_ADAM_BUNDLE_FORMAT = 'concept2cure.csr-adam-bundle.v1' as const;
export const CSR_EFFICACY_RESULTS_FORMAT = 'concept2cure.csr-efficacy-results.v1' as const;
export const ADAM_DATASET_NAMES = ['ADSL', 'ADAE', 'ADEX', 'ADLB', 'ADVS', 'ADEG', 'ADCM'] as const;
export type AdamDatasetName = typeof ADAM_DATASET_NAMES[number];

const text = z.string().trim().min(1).max(2_000);
const id = z.string().trim().min(1).max(120);
const ref = CsrSourceSelectionSchema;

export const CsrAdamBundleSchema = z.object({
  format: z.literal(CSR_ADAM_BUNDLE_FORMAT),
  dataCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studyInfo: CsrStudyInfoSchema,
  /** Each planned treatment (ADSL TRT01P) mapped to the arm the CSR reports; an unmapped TRT01P is refused. */
  arms: z.array(z.object({ treatment: text, armId: id, armName: text }).strict()).min(1).max(100),
  /** The ADSL flag that marks randomized subjects: RANDFL unless the SAP defines randomized as ITTFL. */
  randomizedFlag: z.enum(['RANDFL', 'ITTFL']).optional(),
  datasets: z.object({ ADSL: ref, ADAE: ref, ADEX: ref.optional(), ADLB: ref.optional(), ADVS: ref.optional(),
    ADEG: ref.optional(), ADCM: ref.optional() }).strict(),
  efficacyResults: ref,
}).strict();
export type CsrAdamBundle = z.infer<typeof CsrAdamBundleSchema>;

export const CsrEfficacyResultsSchema = z.object({
  format: z.literal(CSR_EFFICACY_RESULTS_FORMAT),
  protocolNumber: id,
  results: z.array(CsrEfficacyResultSchema).min(1).max(10_000),
}).strict();
export type CsrEfficacyResults = z.infer<typeof CsrEfficacyResultsSchema>;
