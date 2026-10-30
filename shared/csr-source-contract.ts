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
    // Every optional (declared) field of the schema is named here; shared/__tests__/csr-source-contract.test.ts fails otherwise.
    validationRules: [
      'All study and protocol identifiers, StudyInfo and data-cut date must be explicitly recorded. StudyInfo’s optional comparator, secondaryEndpoints, treatmentDuration and targetAgencies are recorded as the sponsor states them; nctNumber, when present, must be a ClinicalTrials.gov identifier (NCT and eight digits) and is printed on the assembled CSR’s title page.',
      'Participant identifiers are unique across the study and belong to one known treatment arm; crossover and reassignment are not supported by this contract.',
      'Recorded arm and population counts must equal the participant listing and explicit boolean population flags. At least one participant must be randomized. The mitt and perProtocol populations are optional: once any participant of an arm carries the flag, that arm declares the count, and every participant of the arm carries the flag.',
      'StudyInfo.sampleSize, when supplied, is the randomized participant count for this contract.',
      'Every participant has exactly one final disposition. Every randomized participant has exactly one baseline demographic record; demographics describe randomized participants.',
      'Completed flags match final disposition. Randomized participants cannot be screen-failed.',
      'All adverse events name an existing participant and that participant’s safety arm. Empty events require the explicit complete-domain declaration.',
      'Optional recorded values are never imputed: a disposition reason; a demographic record’s race, ethnicity, weight and bmi; an adverse event’s outcome; an exposure record’s meanDailyDose and totalPersonYears; a concomitant medication’s atcClass. An absent one is shown as such (“not recorded” in the listings, “—” in the exposure table, “ATC class not coded” in the medications table), never as a value.',
      'aeDiscontinuationBasis says where withdrawal for an adverse event is recorded: "event" (the default), by ledToDiscontinuation on each adverse event; or "subject", for a study that did not collect the action taken per event, by discontinuedForAdverseEvent on every disposition record, true only for a safety-population subject. The two levels are never mixed: a subject-level source carries no ledToDiscontinuation, and discontinuedForAdverseEvent requires the subject basis. The AE tables then label the withdrawal rows "(subject-level)".',
      'Efficacy results (studyData.efficacy) are imported as the approved SAP output reports them; values, display strings, confidence intervals (ci), p-values (pValue) and the rest are not computed or clinically verified by this adapter. A result names its arm (armId) and, when it is a comparison, its comparatorArmId, a known arm other than its own; results are keyed by endpoint, arm and comparator, so a duplicate is refused, and reversed interval bounds are refused. A primary result must match StudyInfo.primaryEndpoint.',
      'An armless result (no armId), such as a dose-response test across all arms, states its method and population as the SAP reports them and names no comparator; two armless results of one endpoint are told apart by method. The efficacy table prints "—" in its Arm column, and shows Method and Population columns only when a result states them.',
      'efficacyStatus "not-supplied" declares that the source carries no efficacy results: studyData.efficacy is then empty and completeDomains.efficacy false, and §11.4 reads "Efficacy results not supplied", never a blank or zero row. Otherwise at least one result is required and completeDomains.efficacy is true.',
      'A Bayesian result records its credibleInterval and the posteriorProbability of a named hypothesis (for example "OR > 1") as the SAP reports them. They are recorded, never computed or verified here, and they appear in the efficacy table only when a result carries them.',
      'Exposure (studyData.exposure, one record per known arm) and lab shift summaries (studyData.labShifts, one per known arm and parameter) use known arms without duplicate summaries. Lab counts do not exceed assessed denominators, nor the arm’s safety population.',
      'Declared disposition categories (dispositionCategories, optional) list every final status the source classifies subjects into: a declared category with no subject is a recorded zero, and a status neither declared nor used by any record is reported as not recorded, never 0. dispositionBasis says whether "completed" is study or treatment completion; a source that declares it reports discontinuations other than death and loss to follow-up as "Discontinued (other reasons)".',
      'Vital signs (vitalSigns: baseline and last on-treatment value, one per subject and parameter) and concomitant medications (concomitantMedications) belong to a recorded subject in that arm’s safety population.',
      'Further named populations (studyData.additionalPopulations: a key, a label and one count per treatment arm), such as an efficacy population or the completers of a visit, have unique keys and labels, and a label may not repeat a built-in population row (Randomized, Safety, ITT, mITT, Per-Protocol or Completed, ignoring case). Every participant of an arm carries an explicit boolean for each declared key (participants[].additionalPopulations), and the arm’s count equals those flags; a flag for an undeclared key is refused. Each prints as its own row of §11.1 under its label, never mapped onto mITT or per-protocol.',
      'demographicsPresentation "descriptive" declares the descriptive §11.2 table (n, mean (SD), median, minimum and maximum, categories and a Total column), and is required for any of height, ageGroup, baselineValues or baselineCategories on a demographic record and for ageGroups or baselineCharacteristics. ageGroups lists the source’s own groups, unique, in reporting order, and a record’s ageGroup must be one of them; no band is invented. baselineCharacteristics (unique keys, each with a label and a kind) carry their values in baselineValues when continuous and in baselineCategories when categorical; a categorical one lists its categories, a continuous one lists none, and a value outside them is refused. A declared category with no subject is a recorded zero; a subject without a value counts as not recorded.',
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
      'studyInfo becomes the source’s StudyInfo unchanged, its optional comparator, secondaryEndpoints, sampleSize, treatmentDuration, targetAgencies and nctNumber included, and the derived source is held to the validation rules above (sampleSize, for one, must equal the randomized count).',
      'ADSL: one row per subject; arms from TRT01P through the manifest’s arm map; populations from RANDFL (or the flag randomizedFlag names, ITTFL where the SAP defines randomized so), SAFFL, ITTFL or FASFL, and PPROTFL, each Y, N or blank (anything else is refused); disposition from EOSSTT and DCSREAS, or from DCDECOD when conventions.disposition declares it; demographics from AGE, SEX, RACE, ETHNIC, WEIGHTBL, BMIBL. A subject ongoing at the data cut, an unmapped treatment or a reassigned actual treatment is refused.',
      'ADAE: treatment-emergent rows (TRTEMFL = Y) by AEBODSYS and AEDECOD, with ASEV/AESEV, AESER, AREL/AEREL, AEOUT or AESDTH, and AEACN (without them a fatal outcome or an AE discontinuation is unrecorded, so the file is refused rather than counted as 0). On a treatment-emergent row, AESDTH = N or a known AEOUT must establish a non-fatal event, and AEACN must not be blank or UNKNOWN unless conventions.aeDiscontinuationFlag is declared; otherwise the row is refused. A row naming a subject ADSL does not list, or a treatment-emergent row outside the safety population, is refused.',
      'Declared conventions (manifest conventions, for a define.xml that does not use ADaMIG 1.1 names; nothing is guessed without them, and each is bound by the manifest’s digest): conventions.causality maps further AREL/AEREL values (for example REMOTE) to related or not related; conventions.rangeIndicator decodes ANRIND (for example N, H, L); conventions.lastOnTreatment names the last on-treatment record by a variable and value (for example AVISIT = End of Treatment) instead of ONTRTFL, and two such records with different values are refused; conventions.exposure reads the duration in days and, optionally, the averageDailyDose with its unit from ADSL when there is no ADEX (declaring it beside an ADEX is refused, and a blank value is refused).',
      'conventions.aeDiscontinuationFlag names an ADSL Y/N/blank flag (for example DSRAEFL) that records withdrawal for an adverse event per subject, for a study that did not collect event-level AEACN: AEACN is then not required, the derived source declares aeDiscontinuationBasis "subject" with each disposition record’s discontinuedForAdverseEvent from the flag, and the AE tables say "subject-level". conventions.aeDiscontinuationDate names the ADSL date of that withdrawal (for example RFENDT); it is never guessed. A flagged subject’s narrative lists the treatment-emergent AEs with onset on or before that date, states that the data do not record which event led to withdrawal, and names none as the cause; without the date declared, that narrative is refused by name.',
      'conventions.populations declares further named populations from ADSL Y/N flags (for example EFFFL, COMP24FL), each with its define.xml label, as studyData.additionalPopulations with per-arm counts from the flags. A flag the tables already report as the randomized, safety, ITT or per-protocol population is refused (CSR_ADAM_CONVENTION_CONFLICT), a missing column is refused, and none is ever mapped onto mITT.',
      'conventions.demographics declares the descriptive §11.2 table (demographicsPresentation "descriptive"): height from HEIGHTBL (a recorded value that is not a positive number is refused, a blank one is not recorded); age groups from ADSL AGEGR1 only, ordered by AGEGR1N when ADSL has it and otherwise by the youngest age in each, with no age-group rows when ADSL has no AGEGR1; and the declared characteristics, each an ADSL variable with its define.xml label and kind, a categorical one listing its categories in reporting order. A declared variable missing from ADSL, a continuous value that is not a number, or a value outside its categories is refused.',
      'efficacyResults names the approved SAP efficacy output (format concept2cure.csr-efficacy-results.v1), whose results are imported as the source’s efficacy unchanged, including an armless result’s method and population, and its armId, comparatorArmId, ci, pValue, credibleInterval and posteriorProbability. A manifest that names no efficacy file derives a source declaring efficacyStatus "not-supplied". A named file that is not supplied is refused (CSR_ADAM_EFFICACY_MISSING), and so is a supplied file the manifest does not name (CSR_ADAM_EFFICACY_UNDECLARED) or one naming another protocol.',
      'ADEX: TRTDURD in days for every safety subject. ADLB, or ADLBC and ADLBH (a parameter in both is refused): shift from the baseline range indicator (ANRIND) to the last on-treatment one. ADVS/ADEG: baseline and last on-treatment AVAL, per analysis timepoint (ATPT) for a parameter whose baselines differ by ATPT. ADCM: concomitant (CONCOMFL or ONTRTFL) coded medications. ADMH (medical history) and ADCM feed the patient narratives only; the tables do not read ADMH.',
      'Patient narratives (§14.3.3, E3 §12.3.2) are composed for every subject who died, had any other serious adverse event, or discontinued study treatment for an adverse event, and for adverse events of special interest when adverseEventsOfSpecialInterest declares them: by an ADAE flag (flagVariable = Y) and/or MedDRA preferredTerms matched to AEDECOD, ignoring case. Absent, the protocol defines none and no subject is selected on that ground.',
      'The last on-treatment value is ordered by ADT, else ADY, else AVISITN, never by file order. Nothing is imputed: a blank required value is refused by variable and row.',
    ] };
}
