import { z } from 'zod';
import { CSR_SOURCE_FORMAT, CsrSourceEnvelopeSchema } from './csr-source-input.js';
import { ADAM_DATASET_NAMES, CSR_ADAM_BUNDLE_FORMAT, CSR_EFFICACY_RESULTS_FORMAT, CsrAdamBundleSchema, CsrEfficacyResultsSchema } from './csr-adam-bundle.js';

/** Documentation is derived from the same Zod contract as the loader. Semantic
 * cross-record rules below still require server validation of actual source. */
function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) return jsonSchema(schema.innerType());
  if (schema instanceof z.ZodOptional) return jsonSchema(schema.unwrap());
  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape as Record<string, z.ZodTypeAny>);
    return { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(entries.map(([name, field]) => [name, jsonSchema(field)])),
      required: entries.filter(([, field]) => !field.isOptional()).map(([name]) => name) };
  }
  if (schema instanceof z.ZodArray) return { type: 'array', items: jsonSchema(schema.element),
    ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}),
    ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}) };
  if (schema instanceof z.ZodRecord) return { type: 'object', additionalProperties: jsonSchema(schema.valueSchema) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, const: schema.value };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodNumber) return numberSchema(schema);
  if (schema instanceof z.ZodString) return stringSchema(schema);
  throw new Error('Unsupported CSR source schema node');
}

function numberSchema(schema: z.ZodNumber): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'number' };
  for (const check of schema._def.checks) {
    if (check.kind === 'int') result.type = 'integer';
    if (check.kind === 'min') result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
    if (check.kind === 'max') result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
  }
  return result;
}
function stringSchema(schema: z.ZodString): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'string' };
  for (const check of schema._def.checks) {
    if (check.kind === 'min') result.minLength = check.value;
    if (check.kind === 'max') result.maxLength = check.value;
    if (check.kind === 'regex') result.pattern = check.regex.source;
  }
  return result;
}

export function csrSourceContract() {
  return { format: CSR_SOURCE_FORMAT,
    description: 'Explicitly recorded supporting study source for deterministic CSR tabulation. Integrity, structural consistency and platform lifecycle approval do not establish clinical verification, statistical validation or CDISC/FDA qualification. This file is not a filing leaf.',
    limits: { maximumBytes: 5 * 1024 * 1024, maximumParticipants: 100_000, maximumTreatmentArms: 100 },
    sourceSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...jsonSchema(CsrSourceEnvelopeSchema) },
    validationRules: [
      'All study and protocol identifiers, StudyInfo and data-cut date must be explicitly recorded.',
      'Participant identifiers are unique across the study and belong to one known treatment arm; crossover and reassignment are not supported by this contract.',
      'Recorded arm and population counts must equal the participant listing and explicit boolean population flags. At least one participant must be randomized.',
      'StudyInfo.sampleSize, when supplied, is the randomized participant count for this contract.',
      'Every participant has exactly one final disposition. Every randomized participant has exactly one baseline demographic record; demographics describe randomized participants.',
      'Completed flags match final disposition. Randomized participants cannot be screen-failed.',
      'All adverse events name an existing participant and that participant’s safety arm. Empty events require the explicit complete-domain declaration.',
      'Primary endpoint results match StudyInfo.primaryEndpoint; recorded result values, display strings, confidence intervals and p-values are not computed or clinically verified by this adapter.',
      'A Bayesian result records its credible interval and the posterior probability of a named hypothesis (for example "OR > 1") as the SAP reports them. They are recorded, never computed or verified here, and they appear in the efficacy table only when a result carries them.',
      'Exposure and lab summaries use known arms without duplicate summaries. Lab counts do not exceed assessed denominators.',
      'Declared disposition categories (optional) list every final status the source classifies subjects into: a declared category with no subject is a recorded zero, and a status neither declared nor used by any record is reported as not recorded, never 0. dispositionBasis says whether "completed" is study or treatment completion; a source that declares it reports discontinuations other than death and loss to follow-up as "Discontinued (other reasons)".',
      'Vital signs (baseline and last on-treatment value, one per subject and parameter) and concomitant medications belong to a recorded subject in that arm’s safety population.',
      'A new package run requires the current, nonwithdrawn Vault version, exact preview digest and existing approved canonical lifecycle bound to those bytes.',
    ],
    adamBundle: csrAdamBundleContract() };
}

/** CSR slice 6 (2026-10-29): the ADaM route to the same source. */
function csrAdamBundleContract() {
  return { format: CSR_ADAM_BUNDLE_FORMAT,
    description: 'Instead of a hand-built source, choose a manifest that names the study’s CDISC ADaM datasets (Dataset-JSON v1.0/v1.1 or SAS transport v5, one dataset per file) and the approved SAP efficacy output, each by Vault document and exact SHA-256. The engine derives the source above from them; efficacy results are imported as the SAP reports them, never computed.',
    datasets: { required: ['ADSL', 'ADAE'], optional: ADAM_DATASET_NAMES.filter(n => n !== 'ADSL' && n !== 'ADAE') },
    limits: { maximumDatasetBytes: 64 * 1024 * 1024 },
    manifestSchema: jsonSchema(CsrAdamBundleSchema),
    efficacyResults: { format: CSR_EFFICACY_RESULTS_FORMAT, schema: jsonSchema(CsrEfficacyResultsSchema) },
    derivationRules: [
      'Every named file must be the current, approved Vault version at the digest the manifest pins.',
      'ADSL: one row per subject; arms from TRT01P through the manifest’s arm map; populations from RANDFL (or the declared flag), SAFFL, ITTFL or FASFL, and PPROTFL; disposition from EOSSTT and DCSREAS, or from DCDECOD when conventions.disposition declares it; demographics from AGE, SEX, RACE, ETHNIC, WEIGHTBL, BMIBL. A subject ongoing at the data cut, an unmapped treatment or a reassigned actual treatment is refused.',
      'ADAE: treatment-emergent rows (TRTEMFL = Y) by AEBODSYS and AEDECOD, with ASEV/AESEV, AESER, AREL/AEREL, AEOUT or AESDTH, and AEACN (without them a fatal outcome or an AE discontinuation is unrecorded, so the file is refused rather than counted as 0). On a treatment-emergent row, AESDTH = N or a known AEOUT must establish a non-fatal event, and AEACN must not be blank or UNKNOWN; otherwise the row is refused. A row naming a subject ADSL does not list, or a treatment-emergent row outside the safety population, is refused.',
      'Declared conventions (manifest conventions, for a define.xml that does not use ADaMIG 1.1 names; nothing is guessed without them): aeDiscontinuationFlag reads AE withdrawal per subject from an ADSL flag instead of AEACN, and the AE tables say "subject-level"; causality maps further AREL/AEREL values to related or not related; rangeIndicator decodes ANRIND; lastOnTreatment names the last on-treatment record (for example AVISIT = End of Treatment) instead of ONTRTFL; exposure reads duration and average daily dose from ADSL when there is no ADEX.',
      'ADEX: TRTDURD in days for every safety subject. ADLB, or ADLBC and ADLBH (a parameter in both is refused): shift from the baseline range indicator (ANRIND) to the last on-treatment one. ADVS/ADEG: baseline and last on-treatment AVAL, per analysis timepoint (ATPT) for a parameter whose baselines differ by ATPT. ADCM: concomitant (CONCOMFL or ONTRTFL) coded medications.',
      'The last on-treatment value is ordered by ADT, else ADY, else AVISITN, never by file order. Nothing is imputed: a blank required value is refused by variable and row.',
    ] };
}
