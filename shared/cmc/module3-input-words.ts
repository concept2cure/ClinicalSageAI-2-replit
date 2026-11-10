/**
 * What a Module 3 section still needs, in a reader's words (P-122 defects, item 3, 2026-11-10).
 *
 * The composer scores each section against the payload fields its rule requires (MODULE3_SECTION_RULES in
 * server/services/module3Composer.ts; the appendix and regional rules in server/services/module3-extensions.ts) and
 * reports the absent ones as the section's `missingInputs`: a field key such as `formulationCompositionComplete`, or,
 * where no record of a kind feeds the section at all, a source type such as `impurity_profile`. CMC printed those keys
 * ("missing: formulationCompositionComplete"). This is the one vocabulary that says each in words, used by the CMC
 * screens and the approve route's refusal (server/api/cmc/module3OperatingSystemRoutes.ts).
 *
 * The words say what to record, as the write-through emits each field (server/services/cmc-write-through.ts): a
 * "…Complete" key is present only when the whole record is (a CURRENT formulation with named components; a PRIMARY
 * container closure described with its suitability). The three characterisation fields keep the register's words
 * (./characterization-type.ts), and a source type the write-through's own labels (CMC_SOURCE_TYPE_LABELS, moved here
 * from that file). A key this vocabulary does not know is said as words, never printed as a key; the composer's
 * rules are held to it by server/services/__tests__/module3-input-words.test.ts.
 */
import { CHARACTERIZATION_TYPE_LABEL } from './characterization-type';

/** Labels for the CMC source types, as the write-through titles a record's review task. */
export const CMC_SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  drug_substance: 'Drug Substance',
  drug_product: 'Drug Product',
  method: 'Analytical Method',
  stability: 'Stability Study',
  specification: 'Specification',
  batch: 'Batch Record',
  change_control: 'Change Control',
  comparability: 'Comparability Assessment',
  process_validation: 'Process Validation',
  manufacturing_process: 'Manufacturing Process',
  characterization: 'Characterization',
  reference_standard: 'Reference Standard',
  container_closure: 'Container Closure',
  excipient: 'Excipient',
  impurity_profile: 'Impurity Profile',
  dissolution_profile: 'Dissolution Profile',
  material_spec: 'Material Specification',
  qc_result: 'QC Result',
  raw_material_spec: 'Raw Material Specification',
  formulation_record: 'Formulation Record',
});

const firstLower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Each payload field the composer requires, as what is still to be recorded. */
export const MODULE3_INPUT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  name: 'the name of the drug substance or product',
  manufacturer: 'the manufacturer',
  manufacturingRoute: 'the manufacturing route',
  processDescription: 'a description of the manufacturing process',
  processControls: 'the process controls',
  manufacturingProcessComplete: 'a described drug substance manufacturing process',
  structuralElucidation: firstLower(CHARACTERIZATION_TYPE_LABEL.structural),
  physicochemicalProperties: firstLower(CHARACTERIZATION_TYPE_LABEL.physicochemical),
  biologicalActivity: firstLower(CHARACTERIZATION_TYPE_LABEL.biological),
  acceptanceCriteria: 'the specification’s acceptance criteria',
  validationStatus: 'the analytical method’s validation status',
  drugSubstanceBatchAnalyses: 'batch analysis results for the drug substance',
  drugSubstanceImpurityProfileComplete: 'an assessed impurity profile for the drug substance',
  drugSubstanceReferenceStandard: 'a reference standard for the drug substance',
  drugSubstanceReferenceStandardCoA: 'the drug substance reference standard’s certificate of analysis',
  drugSubstanceReferenceStandardComplete: 'a drug substance reference standard described with its certificate of analysis',
  drugSubstanceContainerDescription: 'the drug substance’s container',
  drugSubstanceClosureDescription: 'the drug substance container’s closure',
  drugSubstanceSuitabilityJustification: 'why the drug substance’s container closure is suitable',
  drugSubstanceContainerClosureComplete: 'the drug substance’s primary container closure, described with why it is suitable',
  drugSubstanceTimePoints: 'the drug substance stability study’s time points',
  drugSubstanceStorageCondition: 'the drug substance stability study’s storage conditions',
  dosageFormDescription: 'a description of the dosage form',
  composition: 'the composition',
  strength: 'the strength',
  formulationCompositionComplete: 'a current formulation with its named components',
  formulationDevelopment: 'the formulation development rationale',
  manufacturingProcessDev: 'the drug product’s manufacturing process development',
  containerClosureStudies: 'the drug product’s container closure studies',
  formulation: 'the batch formula',
  batchNumber: 'a batch number',
  batchSize: 'the batch size',
  drugProductProcessComplete: 'a described drug product manufacturing process',
  excipientSpecifications: 'the excipients’ specifications',
  excipientAnalyticalProcedures: 'the excipients’ analytical procedures',
  excipientControlComplete: 'a described excipient',
  releaseCriteria: 'the drug product’s release acceptance criteria',
  methodName: 'an analytical method',
  drugProductBatchAnalyses: 'batch analysis results for the drug product',
  drugProductImpurityProfileComplete: 'an assessed impurity profile for the drug product',
  drugProductReferenceStandard: 'a reference standard for the drug product',
  drugProductReferenceStandardCoA: 'the drug product reference standard’s certificate of analysis',
  drugProductReferenceStandardComplete: 'a drug product reference standard described with its certificate of analysis',
  drugProductContainerDescription: 'the drug product’s container',
  drugProductClosureDescription: 'the drug product container’s closure',
  drugProductSuitabilityJustification: 'why the drug product’s container closure is suitable',
  drugProductContainerClosureComplete: 'the drug product’s primary container closure, described with why it is suitable',
  drugProductShelfLifeClaim: 'the drug product’s shelf-life claim',
  comparabilityStatus: 'the comparability assessment’s outcome',
  manufacturingSite: 'the manufacturing site',
  containerDescription: 'a description of the container',
});

/** A source type's label as a phrase: "QC Result" → "a QC result record", "Batch Record" → "a batch record". */
function sourceTypeWords(label: string): string {
  const words = label.split(' ').map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
  const noun = /record$/i.test(words) ? words : `${words} record`;
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** A key nobody worded yet, as words: never printed as a key ("someNewField" → "some new field"). */
function keyAsWords(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').toLowerCase().trim();
}

/** One missing input in words, lower case first so it reads inside a sentence. */
export function module3InputWords(key: string): string {
  const k = String(key ?? '').trim();
  if (Object.prototype.hasOwnProperty.call(MODULE3_INPUT_WORDS, k)) return MODULE3_INPUT_WORDS[k];
  if (Object.prototype.hasOwnProperty.call(CMC_SOURCE_TYPE_LABELS, k)) return sourceTypeWords(CMC_SOURCE_TYPE_LABELS[k]);
  return keyAsWords(k);
}

/** Missing inputs as one list in words, separated by semicolons (a phrase may hold a comma). */
export function module3InputList(keys: readonly string[]): string {
  return keys.map(module3InputWords).join('; ');
}

/** Whether a key has words of its own (not the fallback). */
export function hasModule3InputWords(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODULE3_INPUT_WORDS, key)
    || Object.prototype.hasOwnProperty.call(CMC_SOURCE_TYPE_LABELS, key);
}
