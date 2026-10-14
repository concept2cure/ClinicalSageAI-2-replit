/* global structuredClone: readonly */
/** Independent, synthetic expectations fixed before invoking the new verifier.
 * This corpus is not a domain-expert approval or an original-page attestation.
 */
import { createHash } from 'node:crypto';
import type { CatalogFactAnchor, CatalogFactCandidate, CatalogFactMeaning, CatalogFactSource, CatalogWrittenValue } from '@shared/ana/catalog-facts';

export type ScientificFixtureExpectation = 'pass' | 'context_refused' | 'not_established' | 'transcription_refused' | 'schema_refused';
export interface ScientificSourceFactFixture {
  id: string;
  title: string;
  source: CatalogFactSource;
  candidate: unknown;
  expected: ScientificFixtureExpectation;
  rationale: string;
}

const DOCUMENT_ID = '86e5e193-d230-4b12-9bd6-2d9d99a2fcb3';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function source(text: string, caveat?: CatalogFactSource['extractionCaveat']): CatalogFactSource {
  return {
    documentId: DOCUMENT_ID,
    // Synthetic fixture bytes only; not a real uploaded original's identity.
    contentHash: sha256(`synthetic-source-bytes:${text}`),
    extractedText: text,
    extractedTextSha256: sha256(text),
    ...(caveat ? { extractionCaveat: caveat } : {}),
  };
}

function anchor(doc: CatalogFactSource, quote: string): CatalogFactAnchor {
  const start = (doc.extractedText ?? '').indexOf(quote);
  if (start < 0) throw new Error('Fixture quote must be an actual exact source substring.');
  return {
    documentId: doc.documentId, contentHash: doc.contentHash, extractedTextSha256: doc.extractedTextSha256,
    range: { start, end: start + quote.length }, exactQuote: quote,
  };
}

function candidate(doc: CatalogFactSource, quote: string, meaning: CatalogFactMeaning, value: CatalogWrittenValue, witnessPaths?: string[]): CatalogFactCandidate {
  const a = anchor(doc, quote);
  const paths = witnessPaths ?? Object.keys(meaning).filter((key) => key !== 'kind' && meaning[key as keyof CatalogFactMeaning] != null).map((key) => `meaning.${key}`);
  return { schemaVersion: 1, meaning, value, origin: { kind: 'source_statement', valueAnchor: a, witnesses: paths.map((path) => ({ path, anchor: structuredClone(a) })) } };
}

interface ScientificFixtureInput {
  id: string; title: string; text: string; quote: string;
  meaning: CatalogFactMeaning; value: CatalogWrittenValue;
  expected: ScientificFixtureExpectation; rationale: string;
  witnessPaths?: string[]; caveat?: CatalogFactSource['extractionCaveat'];
}
function fixture({ id, title, text, quote, meaning, value, expected, rationale, witnessPaths, caveat }: ScientificFixtureInput): ScientificSourceFactFixture {
  const doc = source(text, caveat);
  return { id, title, source: doc, candidate: candidate(doc, quote, meaning, value, witnessPaths), expected, rationale };
}

interface ScientificFixtureAlteration {
  id: string; title: string; mutate: (candidate: CatalogFactCandidate) => void;
  expected: ScientificFixtureExpectation; rationale: string;
}
function alter(base: ScientificSourceFactFixture, { id, title, mutate, expected, rationale }: ScientificFixtureAlteration): ScientificSourceFactFixture {
  const c = structuredClone(base.candidate) as CatalogFactCandidate;
  mutate(c);
  return { ...base, id, title, candidate: c, expected, rationale };
}

const scalar = (asWritten: string, unitAsWritten: string | null): CatalogWrittenValue => ({ kind: 'scalar', asWritten, unitAsWritten });

const clinicalRandomized: CatalogFactMeaning = {
  kind: 'pharma_clinical', component: 'count', frameState: 'complete',
  frame: { study: { kind: 'study', aliases: ['DPL-301'] }, population: { set: 'randomized', stated: true, allRandomized: true }, arm: { kind: 'total' }, measure: { family: 'n', key: { pop: 'randomized' } }, scope: { subgroups: [] }, analysis: {} },
};
const clinicalPaths = ['meaning.frame.study', 'meaning.frame.population', 'meaning.frame.arm', 'meaning.frame.measure'];
const clinicalRow = 'In Study DPL-301, a total of 300 patients were randomized.';
const treatedRow = 'In Study DPL-301, a total of 292 patients received at least one dose of study drug.';
const clinicalText = `${clinicalRow}\n${treatedRow}`;
const clinicalControl = fixture({ id: 'SF01', title: 'Explicit randomized total', text: clinicalText, quote: clinicalRow, meaning: clinicalRandomized, value: scalar('300', null), expected: 'pass', rationale: 'Existing clinical engine must bind study, population, total arm and count.', witnessPaths: clinicalPaths });
const clinicalSwap = fixture({ id: 'SF02', title: 'Randomized count cannot use treated count', text: clinicalText, quote: treatedRow, meaning: clinicalRandomized, value: scalar('292', null), expected: 'context_refused', rationale: 'The source count belongs to the treated population.', witnessPaths: clinicalPaths });
const clinicalArmRow = 'In Study DPL-301, 150 patients were randomized to Drug X and 145 patients were randomized to placebo.';
const clinicalArm: CatalogFactMeaning = { ...clinicalRandomized, frameState: 'complete', frame: { ...(clinicalRandomized.frameState === 'complete' ? clinicalRandomized.frame : {}), study: { kind: 'study', aliases: ['DPL-301'] }, population: { set: 'randomized', stated: true, allRandomized: true }, arm: { kind: 'arm', drug: 'drug x', label: 'Drug X' }, measure: { family: 'n', key: { pop: 'randomized' } }, scope: { subgroups: [] }, analysis: {} } };
const clinicalArmSwap = fixture({ id: 'SF03', title: 'Drug arm cannot use placebo count', text: clinicalArmRow, quote: clinicalArmRow, meaning: clinicalArm, value: scalar('145', null), expected: 'context_refused', rationale: 'Exact source value is the placebo arm count, not Drug X.', witnessPaths: clinicalPaths });
const incompleteClinical = fixture({ id: 'SF04', title: 'Incomplete clinical frame', text: clinicalText, quote: clinicalRow, meaning: { kind: 'pharma_clinical', component: 'count', frameState: 'incomplete', partialFrame: { study: { kind: 'study', aliases: ['DPL-301'] }, measure: { family: 'n', key: { pop: 'randomized' } } }, missing: ['population'] }, value: scalar('300', null), expected: 'not_established', rationale: 'Explicit missing population must not be filled by candidate status.', witnessPaths: [] });

const cmcMeaning: CatalogFactMeaning = { kind: 'cmc_result', property: 'assay', productRef: 'Product P', batchAsWritten: 'L1', materialAsWritten: 'API', methodAsWritten: 'HPLC', resultRole: 'measured_result' };
const cmcRow = 'Product: Product P; Batch: L1; Material: API; Method: HPLC; Result role: measured result; Assay: 99.20 %';
const cmcOther = 'Product: Product P; Batch: L2; Material: API; Method: titration; Result role: measured result; Assay: 99.2 %';
const cmcText = `${cmcRow}\n${cmcOther}`;
const cmcControl = fixture({ id: 'SF05', title: 'CMC batch/method result', text: cmcText, quote: cmcRow, meaning: cmcMeaning, value: scalar('99.20', '%'), expected: 'pass', rationale: 'Product, batch, material, method and measured-result role are explicit.' });
const cmcLotSwap = fixture({ id: 'SF06', title: 'CMC batch substitution', text: cmcText, quote: cmcOther, meaning: { ...cmcMeaning, methodAsWritten: 'titration' }, value: scalar('99.2', '%'), expected: 'context_refused', rationale: 'A result from batch L2 cannot establish batch L1.' });
const cmcMethodSwap = fixture({ id: 'SF07', title: 'CMC method substitution', text: cmcText, quote: cmcOther, meaning: { ...cmcMeaning, batchAsWritten: 'L2' }, value: scalar('99.2', '%'), expected: 'context_refused', rationale: 'A titration result cannot establish an HPLC result.' });
const impurityRow = 'Product: Product P; Batch: L1; Material: API; Method: HPLC; Result role: measured result; Impurity: 0.08 %';
const limitRow = 'Product: Product P; Batch: L1; Material: API; Method: HPLC; Result role: specification limit; Impurity: <=0.10 %';
const impurityText = `${impurityRow}\n${limitRow}`;
const impurityMeaning: CatalogFactMeaning = { ...cmcMeaning, property: 'impurity' };
const cmcCriterionSwap = fixture({ id: 'SF08', title: 'CMC scalar cannot strip criterion bound', text: impurityText, quote: limitRow, meaning: impurityMeaning, value: scalar('0.10', '%'), expected: 'transcription_refused', rationale: 'Written <=0.10% is not an exact measured scalar.' });
const cmcLimit = fixture({ id: 'SF09', title: 'CMC specification bound preserved', text: impurityText, quote: limitRow, meaning: { ...impurityMeaning, resultRole: 'specification_limit' }, value: { kind: 'bound', asWritten: '<=0.10', relation: '<=', unitAsWritten: '%' }, expected: 'pass', rationale: 'Bound and specification role remain present; no acceptance calculation.' });
const cmcPrecision = alter(cmcControl, { id: 'SF10', title: 'Source precision retained', mutate: (c) => { c.value.asWritten = '99.2'; }, expected: 'transcription_refused', rationale: 'Source has 99.20; preview cannot rewrite it as 99.2.' });

const deviceMeaning: CatalogFactMeaning = { kind: 'device_test', property: 'bench_result', deviceRef: 'Device D1', configurationAsWritten: 'Rev A', testMethodAsWritten: 'P-17', endpointAsWritten: 'leakage', resultRole: 'measured_result', softwareVersionAsWritten: '1.2' };
const deviceRow = 'Device: Device D1; Configuration: Rev A; Software version: 1.2; Test method: P-17; Endpoint: leakage; Result role: measured result; Bench result: 0.8 mL/min';
const deviceOther = 'Device: Device D1; Configuration: Rev B; Software version: 1.3; Test method: P-17; Endpoint: leakage; Result role: measured result; Bench result: 1.1 mL/min';
const deviceText = `${deviceRow}\n${deviceOther}`;
const deviceControl = fixture({ id: 'SF11', title: 'Device configuration/software result', text: deviceText, quote: deviceRow, meaning: deviceMeaning, value: scalar('0.8', 'mL/min'), expected: 'pass', rationale: 'The exact device, configuration, software, method and endpoint are identified.' });
const deviceConfigSwap = fixture({ id: 'SF12', title: 'Device configuration substitution', text: deviceText, quote: deviceOther, meaning: { ...deviceMeaning, softwareVersionAsWritten: '1.3' }, value: scalar('1.1', 'mL/min'), expected: 'context_refused', rationale: 'Rev B evidence cannot establish a Rev A result.' });
const deviceSoftwareSwap = fixture({ id: 'SF13', title: 'Device software substitution', text: deviceText, quote: deviceOther, meaning: { ...deviceMeaning, configurationAsWritten: 'Rev B' }, value: scalar('1.1', 'mL/min'), expected: 'context_refused', rationale: 'Software 1.3 evidence cannot establish a 1.2 result.' });
const burstRow = 'Device: Device D1; Configuration: Rev A; Software version: 1.2; Test method: P-17; Endpoint: burst; Result role: measured result; Bench result: 450 kPa';
const criterionRow = 'Device: Device D1; Configuration: Rev A; Software version: 1.2; Test method: P-17; Endpoint: burst; Result role: acceptance criterion; Acceptance criterion: >=400 kPa';
const deviceCriterionText = `${burstRow}\n${criterionRow}`;
const burstMeaning: CatalogFactMeaning = { ...deviceMeaning, endpointAsWritten: 'burst' };
const deviceCriterionSwap = fixture({ id: 'SF14', title: 'Device criterion cannot become measured scalar', text: deviceCriterionText, quote: criterionRow, meaning: burstMeaning, value: scalar('400', 'kPa'), expected: 'transcription_refused', rationale: 'A written >=400 criterion does not state measured 400.' });
const deviceCriterion = fixture({ id: 'SF15', title: 'Device criterion bound preserved', text: deviceCriterionText, quote: criterionRow, meaning: { ...burstMeaning, property: 'acceptance_criterion', resultRole: 'acceptance_criterion' }, value: { kind: 'bound', asWritten: '>=400', relation: '>=', unitAsWritten: 'kPa' }, expected: 'pass', rationale: 'This records the source criterion, not a device qualification verdict.' });

const ivdMeaning: CatalogFactMeaning = { kind: 'ivd_diagnostic', property: 'sensitivity', assayRef: 'Assay A', analyteAsWritten: 'marker M', specimenAsWritten: 'serum', referenceAsWritten: 'Standard R1', referenceBasis: 'reference_standard', cutoffAsWritten: '0.4', populationAsWritten: 'symptomatic adults', denominatorAsWritten: '200' };
const ivdRow = 'Assay: Assay A; Analyte: marker M; Specimen: serum; Reference: Standard R1; Reference basis: reference standard; Cutoff: 0.4; Population: symptomatic adults; Denominator: 200; Sensitivity: 95.0 %';
const ivdOther = 'Assay: Assay B; Analyte: marker M; Specimen: serum; Reference: Standard R1; Reference basis: reference standard; Cutoff: 0.4; Population: symptomatic adults; Denominator: 200; Sensitivity: 99.2 %';
const ivdText = `${ivdRow}\n${ivdOther}`;
const ivdControl = fixture({ id: 'SF16', title: 'Complete diagnostic sensitivity', text: ivdText, quote: ivdRow, meaning: ivdMeaning, value: scalar('95.0', '%'), expected: 'pass', rationale: 'Full diagnostic subject, reference, population, cutoff and denominator are explicit.' });
const ivdAssaySwap = fixture({ id: 'SF17', title: 'Diagnostic assay substitution', text: ivdText, quote: ivdOther, meaning: ivdMeaning, value: scalar('99.2', '%'), expected: 'context_refused', rationale: 'Assay B sensitivity must not be labelled Assay A.' });
const ivdVariant = (id: string, title: string, changedText: string, rationale: string): ScientificSourceFactFixture => fixture({ id, title, text: changedText, quote: changedText, meaning: ivdMeaning, value: scalar(changedText.endsWith('92.0 %') ? '92.0' : changedText.endsWith('90.0 %') ? '90.0' : '95.0', '%'), expected: 'context_refused', rationale });
const ivdSpecimenSwap = ivdVariant('SF18', 'Diagnostic specimen substitution', ivdRow.replace('Specimen: serum', 'Specimen: plasma').replace('95.0 %', '92.0 %'), 'Plasma result cannot establish serum performance.');
const ivdCutoffSwap = ivdVariant('SF19', 'Diagnostic cutoff substitution', ivdRow.replace('Cutoff: 0.4', 'Cutoff: 0.8').replace('95.0 %', '90.0 %'), 'Different decision cutoff cannot inherit the candidate cutoff.');
const ivdDenominatorSwap = ivdVariant('SF20', 'Diagnostic denominator substitution', ivdRow.replace('Denominator: 200', 'Denominator: 180'), 'Reference-positive denominator cannot be inferred or exchanged.');
const ivdReferenceSwap = ivdVariant('SF21', 'Diagnostic reference substitution', ivdRow.replace('Standard R1', 'Standard R2'), 'Reference identity is a required part of the diagnostic result.');
const ivdPopulationSwap = ivdVariant('SF22', 'Diagnostic population substitution', ivdRow.replace('symptomatic adults', 'asymptomatic adults'), 'A symptomatic-population candidate cannot use asymptomatic-population evidence.');
const agreementRow = 'Assay: Assay A; Analyte: marker M; Specimen: serum; Reference: PCR-X; Reference basis: comparison method; Cutoff: 0.4; Population: symptomatic adults; Denominator: 200; Positive agreement: 95.0 %';
const agreementMeaning: CatalogFactMeaning = { ...ivdMeaning, property: 'positive_agreement', referenceAsWritten: 'PCR-X', referenceBasis: 'comparison_method' };
const ivdAgreement = fixture({ id: 'SF23', title: 'Comparator agreement remains agreement', text: agreementRow, quote: agreementRow, meaning: agreementMeaning, value: scalar('95.0', '%'), expected: 'pass', rationale: 'Comparison-method positive agreement remains distinct from sensitivity.' });
const agreementPromoted = fixture({ id: 'SF24', title: 'Agreement cannot establish sensitivity', text: agreementRow, quote: agreementRow, meaning: { ...ivdMeaning, referenceAsWritten: 'PCR-X' }, value: scalar('95.0', '%'), expected: 'context_refused', rationale: 'No clinical reference-standard sensitivity is stated.' });
const minimalIvdRow = 'Assay A sensitivity: 95.0%. Assay B sensitivity: 99.2%.';
const missingIvd = fixture({ id: 'SF25', title: 'Missing diagnostic context', text: minimalIvdRow, quote: 'Assay A sensitivity: 95.0%.', meaning: { kind: 'ivd_diagnostic', property: 'sensitivity', assayRef: 'Assay A', analyteAsWritten: null, specimenAsWritten: null, referenceAsWritten: null, referenceBasis: 'not_established', cutoffAsWritten: null, populationAsWritten: null, denominatorAsWritten: null }, value: scalar('95.0', '%'), expected: 'not_established', rationale: 'Null mandatory context cannot be filled from the model or arbitrary legacy key.' });

const analyticalMeaning: CatalogFactMeaning = { kind: 'ivd_analytical', property: 'lod', assayRef: 'Assay A', analyteAsWritten: 'marker M', specimenAsWritten: 'plasma', methodAsWritten: 'EP17', designAsWritten: 'LoD design', lotAsWritten: 'L1' };
const analyticalRow = 'Assay: Assay A; Analyte: marker M; Specimen: plasma; Method: EP17; Design: LoD design; Lot: L1; LoD: 0.2 ng/mL';
const analyticalOther = 'Assay: Assay A; Analyte: marker M; Specimen: serum; Method: EP17; Design: LoD design; Lot: L2; LoD: 0.5 ng/mL';
const analyticalText = `${analyticalRow}\n${analyticalOther}`;
const analyticalControl = fixture({ id: 'SF26', title: 'Analytical LoD design/matrix/lot', text: analyticalText, quote: analyticalRow, meaning: analyticalMeaning, value: scalar('0.2', 'ng/mL'), expected: 'pass', rationale: 'Matrix, method, design, lot and source-written unit are explicit.' });
const analyticalLotSwap = fixture({ id: 'SF27', title: 'Analytical lot/matrix substitution', text: analyticalText, quote: analyticalOther, meaning: analyticalMeaning, value: scalar('0.5', 'ng/mL'), expected: 'context_refused', rationale: 'A serum L2 LoD cannot establish plasma L1 LoD.' });
const cvRow = 'Assay: Assay A; Analyte: marker M; Specimen: plasma; Method: EP05; Design: within-laboratory precision; Lot: L1; Within lab CV: 5.0 %';
const cvSwap = fixture({ id: 'SF28', title: 'Analytical CV property substitution', text: cvRow, quote: cvRow, meaning: { ...analyticalMeaning, property: 'repeatability_cv', methodAsWritten: 'EP05', designAsWritten: 'within-laboratory precision' }, value: scalar('5.0', '%'), expected: 'context_refused', rationale: 'Within-laboratory CV is not repeatability CV.' });
const exponentRow = analyticalRow.replace('0.2 ng/mL', '2.0e-1 ng/mL');
const exponentRewrite = fixture({ id: 'SF29', title: 'Scientific notation cannot be rewritten', text: exponentRow, quote: exponentRow, meaning: analyticalMeaning, value: scalar('0.2', 'ng/mL'), expected: 'transcription_refused', rationale: 'The preview must retain 2.0e-1 notation as written.' });

const rangeRow = 'Product: Product P; Batch: L1; Material: API; Method: laser diffraction; Result role: measured result; Particle size: 10-20 um';
const rangeMeaning: CatalogFactMeaning = { ...cmcMeaning, property: 'particle_size', methodAsWritten: 'laser diffraction' };
const rangeControl = fixture({ id: 'SF30', title: 'Range preserved', text: rangeRow, quote: rangeRow, meaning: rangeMeaning, value: { kind: 'range', asWritten: '10-20', unitAsWritten: 'um' }, expected: 'pass', rationale: 'A range remains a range, with no arithmetic or conversion.' });
const rangeScalar = alter(rangeControl, { id: 'SF31', title: 'Range endpoint cannot establish scalar', mutate: (c) => { c.value = scalar('10', 'um'); }, expected: 'transcription_refused', rationale: 'A range endpoint is not the source-stated scalar result.' });
const approximationRow = 'Product: Product P; Batch: L1; Material: API; Method: HPLC; Result role: measured result; Impurity: approximately 5.0 %';
const approximationScalar = fixture({ id: 'SF32', title: 'Approximation cannot establish exact scalar', text: approximationRow, quote: approximationRow, meaning: impurityMeaning, value: scalar('5.0', '%'), expected: 'transcription_refused', rationale: 'Approximation markers cannot be stripped from source evidence.' });
const approximationControl = fixture({ id: 'SF33', title: 'Approximation preserved', text: approximationRow, quote: approximationRow, meaning: impurityMeaning, value: { kind: 'approximate', asWritten: 'approximately 5.0', unitAsWritten: '%' }, expected: 'pass', rationale: 'Source-written approximation remains explicit.' });

const remoteHeading = 'Assay A sensitivity analyte marker M specimen serum reference standard Standard R1 cutoff 0.4 population symptomatic adults denominator 200.';
const remoteValue = 'The measured value was 95.0%.';
const remoteSource = source(`${remoteHeading}\n\n${remoteValue}`);
const remoteCandidate = candidate(remoteSource, remoteValue, ivdMeaning, scalar('95.0', '%'));
remoteCandidate.origin.witnesses = remoteCandidate.origin.witnesses.map((w) => ({ ...w, anchor: anchor(remoteSource, remoteHeading) }));
const remoteContext: ScientificSourceFactFixture = { id: 'SF34', title: 'Remote heading is not a local relation', source: remoteSource, candidate: remoteCandidate, expected: 'not_established', rationale: 'No supported relation joins remote labels to this unnamed local result.' };
const multiSubject = fixture({ id: 'SF35', title: 'Large multi-subject anchor', text: ivdText, quote: ivdText, meaning: ivdMeaning, value: scalar('99.2', '%'), expected: 'not_established', rationale: 'All fields occur somewhere, but the candidate value belongs to another subject.' });
const japaneseRow = 'アッセイAの血清検体における感度は95.0%であった。';
const japanese = fixture({ id: 'SF36', title: 'Unsupported Japanese interpretation', text: japaneseRow, quote: japaneseRow, meaning: { ...ivdMeaning, assayRef: null, analyteAsWritten: null, specimenAsWritten: null, referenceAsWritten: null, referenceBasis: 'not_established', cutoffAsWritten: null, populationAsWritten: null, denominatorAsWritten: null }, value: scalar('95.0', '%'), expected: 'not_established', rationale: 'No multilingual qualification or unstated header mapping.', witnessPaths: [], caveat: 'unsupported_language_or_layout' });
const ocr = fixture({ id: 'SF37', title: 'OCR remains unqualified context', text: ivdRow, quote: ivdRow, meaning: ivdMeaning, value: scalar('95.0', '%'), expected: 'not_established', rationale: 'Exact OCR text cannot prove original number interpretation.', witnessPaths: undefined, caveat: 'ocr' });
const ordinaryNarrativeRow = 'Assay A sensitivity for analyte marker M in serum against reference standard Standard R1 at cutoff 0.4 in symptomatic adults with denominator 200 was 95.0%.';
const ordinaryNarrative = fixture({ id: 'SF41', title: 'Ordinary narrative is outside admitted row grammar', text: ordinaryNarrativeRow, quote: ordinaryNarrativeRow, meaning: ivdMeaning, value: scalar('95.0', '%'), expected: 'not_established', rationale: 'The narrow initial parser must disclose unadmitted narrative interpretation.' });

const anchorRefusals: ScientificSourceFactFixture[] = [
  alter(ivdControl, { id: 'SF38-document', title: 'Wrong source document', mutate: (c) => { c.origin.valueAnchor.documentId = '221c2d34-32b1-4fb3-a9a1-c3174d07c0a6'; }, expected: 'transcription_refused', rationale: 'Candidate anchor cannot select a different document.' }),
  alter(ivdControl, { id: 'SF38-bytes', title: 'Wrong original-byte hash', mutate: (c) => { c.origin.valueAnchor.contentHash = '1'.repeat(64); }, expected: 'transcription_refused', rationale: 'Byte identity is exact.' }),
  alter(ivdControl, { id: 'SF38-text', title: 'Wrong extraction hash', mutate: (c) => { c.origin.valueAnchor.extractedTextSha256 = '2'.repeat(64); }, expected: 'transcription_refused', rationale: 'Same byte family does not authorize another extraction.' }),
  alter(ivdControl, { id: 'SF38-range', title: 'Shifted exact quote range', mutate: (c) => { c.origin.valueAnchor.range.start += 1; c.origin.valueAnchor.range.end += 1; }, expected: 'transcription_refused', rationale: 'Exact source offsets cannot be approximate.' }),
  alter(ivdControl, { id: 'SF38-quote', title: 'Fabricated exact quote', mutate: (c) => { c.origin.valueAnchor.exactQuote = c.origin.valueAnchor.exactQuote.replace('95.0', '98.4'); }, expected: 'transcription_refused', rationale: 'Body text is not an authoritative source.' }),
];
const computation: ScientificSourceFactFixture = { ...ivdControl, id: 'SF39', title: 'Unsupported computed result', candidate: { ...(ivdControl.candidate as CatalogFactCandidate), origin: { kind: 'computed', expression: '190/200*100', result: '95.0' } }, expected: 'schema_refused', rationale: 'No admitted deterministic computation branch in this preview.' };
const injectionRefusals: ScientificSourceFactFixture[] = [
  { ...ivdControl, id: 'SF40-status', title: 'Candidate cannot claim acceptance', candidate: { ...(ivdControl.candidate as CatalogFactCandidate), reviewState: 'accepted', context: { state: 'passed' } }, expected: 'schema_refused', rationale: 'A model cannot attest to results or acceptance.' },
  { ...ivdControl, id: 'SF40-actor', title: 'Candidate cannot supply authority', candidate: { ...(ivdControl.candidate as CatalogFactCandidate), actorId: 1, organizationId: 1 }, expected: 'schema_refused', rationale: 'Server context owns actor and scope.' },
  alter(ivdControl, { id: 'SF40-locator', title: 'Unsupported fabricated original locator', mutate: (c) => { (c.origin.valueAnchor as unknown as Record<string, unknown>).original = { page: 1, table: '14.3', cell: 'B2', verified: true }; }, expected: 'schema_refused', rationale: 'No original page/table/cell provenance is fabricated.' }),
];

export const scientificSourceFactFixtures: readonly ScientificSourceFactFixture[] = [
  clinicalControl, clinicalSwap, clinicalArmSwap, incompleteClinical,
  cmcControl, cmcLotSwap, cmcMethodSwap, cmcCriterionSwap, cmcLimit, cmcPrecision,
  deviceControl, deviceConfigSwap, deviceSoftwareSwap, deviceCriterionSwap, deviceCriterion,
  ivdControl, ivdAssaySwap, ivdSpecimenSwap, ivdCutoffSwap, ivdDenominatorSwap, ivdReferenceSwap, ivdPopulationSwap, ivdAgreement, agreementPromoted, missingIvd,
  analyticalControl, analyticalLotSwap, cvSwap, exponentRewrite,
  rangeControl, rangeScalar, approximationScalar, approximationControl,
  remoteContext, multiSubject, japanese, ocr, ordinaryNarrative,
  ...anchorRefusals, computation, ...injectionRefusals,
];
