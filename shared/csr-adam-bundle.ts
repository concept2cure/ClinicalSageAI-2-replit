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
/** ADMH (medical history) joined 2026-10-29 for the slice-7 safety narratives; the tabulation does not read it.
 * ADLBC and ADLBH (2026-10-30, CDISC pilot defect D4): laboratory data split into chemistry and haematology. */
export const ADAM_DATASET_NAMES = ['ADSL', 'ADAE', 'ADEX', 'ADLB', 'ADLBC', 'ADLBH', 'ADVS', 'ADEG', 'ADCM', 'ADMH'] as const;
export type AdamDatasetName = typeof ADAM_DATASET_NAMES[number];

const text = z.string().trim().min(1).max(2_000);
const id = z.string().trim().min(1).max(120);
const ref = CsrSourceSelectionSchema;
const variable = z.string().regex(/^[A-Z][A-Z0-9]{0,7}$/);
const codes = <T extends [string, ...string[]]>(values: T) => z.record(z.string().trim().min(1).max(200), z.enum(values))
  .refine(m => Object.keys(m).length > 0 && Object.keys(m).length <= 100, { message: 'Declare between 1 and 100 coded values.' });

/**
 * The study's ADaM conventions where they differ from ADaMIG 1.1 names, as its
 * define.xml and SAP record them (2026-10-30, CDISC pilot defects D1–D3, D5,
 * D6, D9). Each one is declared, never guessed: without it the engine
 * requires the ADaMIG name and refuses as before. The manifest's digest binds
 * the declaration, so the derivation states its own basis.
 */
export const CsrAdamConventionsSchema = z.object({
  /** The ADSL variable holding each subject's end-of-study disposition: EOSSTT (default) or DCDECOD, the CDISC standardized disposition term (COMPLETED, ADVERSE EVENT, DEATH …). */
  disposition: z.enum(['EOSSTT', 'DCDECOD']).optional(),
  /** An ADSL Y/blank flag recording discontinuation for an adverse event (for example DSRAEFL), when the study did not collect event-level AEACN. */
  aeDiscontinuationFlag: variable.optional(),
  /** The ADSL date of that withdrawal (for example RFENDT, define.xml "Date of Discontinuation/Completion"); never guessed: undeclared, such a narrative is refused by name. A subject-level withdrawal narrative lists the TEAEs on or before it (D17, 2026-10-30). */
  aeDiscontinuationDate: variable.optional(),
  /** The SAP's causality class for AREL/AEREL values outside the CDISC defaults (for example REMOTE). */
  causality: codes(['related', 'not related']).optional(),
  /** The define.xml decode of ANRIND to NORMAL, HIGH or LOW (for example N, H, L). */
  rangeIndicator: codes(['NORMAL', 'HIGH', 'LOW']).optional(),
  /** The BDS record that is the last on-treatment value, named by a variable and value (for example AVISIT = End of Treatment), instead of ONTRTFL. */
  lastOnTreatment: z.object({ variable, value: text }).strict().optional(),
  /** Exposure from ADSL when the study has no ADEX: duration in days and, optionally, the average daily dose with its unit. */
  exposure: z.object({ durationDays: variable, averageDailyDose: z.object({ variable, unit: z.string().trim().min(1).max(20) }).strict().optional() }).strict().optional(),
  /** Further named analysis populations from ADSL Y/N flags (for example EFFFL, COMP24FL), each with its define.xml label (D11, 2026-10-30).
   * Shown as their own rows; never mapped onto safety, ITT, mITT or per-protocol. */
  populations: z.array(z.object({ flag: variable, label: text }).strict()).min(1).max(20)
    .refine(p => new Set(p.map(x => x.flag)).size === p.length && new Set(p.map(x => x.label)).size === p.length, { message: 'Declare each population flag and label once.' }).optional(),
  /** The descriptive §11.2 table (D12, 2026-10-30): age groups from ADSL AGEGR1 when present, height (HEIGHTBL), a Total column, and
   * any further ADSL baseline characteristics the SAP tabulates, each with its define.xml label; a categorical one lists its categories in reporting order. */
  demographics: z.object({ presentation: z.literal('descriptive'),
    characteristics: z.array(z.object({ variable, label: text, kind: z.enum(['continuous', 'categorical']), categories: z.array(text).min(1).max(100).optional() }).strict()
      .refine(c => (c.kind === 'categorical') === (c.categories !== undefined), { message: 'List the categories of a categorical characteristic, and only then.' })).min(1).max(50)
      .refine(c => new Set(c.map(x => x.variable)).size === c.length, { message: 'Declare each characteristic once.' }).optional() }).strict().optional(),
}).strict();
export type CsrAdamConventions = z.infer<typeof CsrAdamConventionsSchema>;

export const CsrAdamBundleSchema = z.object({
  format: z.literal(CSR_ADAM_BUNDLE_FORMAT),
  dataCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studyInfo: CsrStudyInfoSchema,
  /** Each planned treatment (ADSL TRT01P) mapped to the arm the CSR reports; an unmapped TRT01P is refused. */
  arms: z.array(z.object({ treatment: text, armId: id, armName: text }).strict()).min(1).max(100),
  /** The ADSL flag that marks randomized subjects: RANDFL unless the SAP defines randomized as ITTFL. */
  randomizedFlag: z.enum(['RANDFL', 'ITTFL']).optional(),
  datasets: z.object({ ADSL: ref, ADAE: ref, ADEX: ref.optional(), ADLB: ref.optional(), ADLBC: ref.optional(), ADLBH: ref.optional(), ADVS: ref.optional(),
    ADEG: ref.optional(), ADCM: ref.optional(), ADMH: ref.optional() }).strict(),
  /** The approved SAP efficacy output; absent, the source states that efficacy results were not supplied (D10, 2026-10-30). */
  efficacyResults: ref.optional(),
  /**
   * The protocol's adverse events of special interest (CSR slice 7, E3 §12.3.2):
   * an ADAE flag variable (for example AESIFL = Y) and/or MedDRA preferred terms
   * (AEDECOD, exact match). Absent means the protocol defines none, and no
   * subject is selected for a narrative on that ground.
   */
  adverseEventsOfSpecialInterest: z.object({
    flagVariable: z.string().regex(/^[A-Z][A-Z0-9]{0,7}$/).optional(),
    preferredTerms: z.array(text).min(1).max(500).optional(),
  }).strict().refine(a => a.flagVariable !== undefined || a.preferredTerms !== undefined,
    { message: 'Declare an ADAE flag variable or the preferred terms that define the protocol’s adverse events of special interest.' }).optional(),
  conventions: CsrAdamConventionsSchema.optional(),
}).strict();
export type CsrAdamBundle = z.infer<typeof CsrAdamBundleSchema>;

export const CsrEfficacyResultsSchema = z.object({
  format: z.literal(CSR_EFFICACY_RESULTS_FORMAT),
  protocolNumber: id,
  results: z.array(CsrEfficacyResultSchema).min(1).max(10_000),
}).strict();
export type CsrEfficacyResults = z.infer<typeof CsrEfficacyResultsSchema>;
