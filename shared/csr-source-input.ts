import { z } from 'zod';

/** Supporting source JSON for deterministic CSR tables. This is not CDISC
 * Dataset-JSON, an analysis engine, a clinical verification or a filing leaf. */
export const CSR_SOURCE_FORMAT = 'concept2cure.csr-source.v1' as const;
const text = z.string().trim().min(1).max(2_000);
const id = z.string().trim().min(1).max(120);
const count = z.number().int().min(0).max(1_000_000);
const finite = z.number().finite();
const maxRecords = 100_000;

export const CsrSourceSelectionSchema = z.object({ documentId: z.string().uuid(), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type CsrSourceSelection = z.infer<typeof CsrSourceSelectionSchema>;

export const CsrStudyInfoSchema = z.object({
  title: text, protocolNumber: id, phase: text, indication: text, sponsor: text,
  investigationalProduct: text, studyDesign: text, primaryEndpoint: text,
  comparator: text.optional(), secondaryEndpoints: z.array(text).max(100).optional(),
  sampleSize: count.optional(), treatmentDuration: text.optional(), targetAgencies: z.array(text).max(20).optional(),
}).strict();

const participant = z.object({ subjectId: id, armId: id, randomized: z.boolean(), safety: z.boolean(), itt: z.boolean(),
  completed: z.boolean(), mitt: z.boolean().optional(), perProtocol: z.boolean().optional() }).strict();
const arm = z.object({ armId: id, armName: text, randomized: count,
  populations: z.object({ safety: count, itt: count, completed: count, mitt: count.optional(), perProtocol: count.optional() }).strict(),
}).strict();
const dispositionStatus = z.enum(['completed', 'discontinued', 'screen-failed', 'lost-to-followup', 'death', 'other']);
/** discontinuedForAdverseEvent: the subject-level record of withdrawal for an AE, present on every record when aeDiscontinuationBasis is 'subject'. */
const disposition = z.object({ subjectId: id, armId: id, status: dispositionStatus, reason: text.optional(), discontinuedForAdverseEvent: z.boolean().optional() }).strict();
const demographic = z.object({ subjectId: id, armId: id, age: finite.min(0).max(125), sex: z.enum(['M', 'F', 'Other']),
  race: text.optional(), ethnicity: text.optional(), weight: finite.positive().optional(), bmi: finite.positive().optional() }).strict();
const interval = z.object({ lower: finite, upper: finite, level: text }).strict();
/** A Bayesian analysis records its credible interval and the posterior
 * probability of a named hypothesis ("OR > 1"), as the SAP reports them. */
const efficacy = z.object({ endpointName: text, endpointType: z.enum(['primary', 'secondary', 'exploratory']), armId: id,
  value: finite, display: text, ci: interval.optional(),
  pValue: finite.min(0).max(1).optional(), comparatorArmId: id.optional(),
  credibleInterval: interval.optional(),
  posteriorProbability: z.object({ value: finite.min(0).max(1), hypothesis: text }).strict().optional() }).strict();
/** One efficacy result as the approved SAP output reports it; imported, never computed (also the ADaM bundle's efficacy file). */
export const CsrEfficacyResultSchema = efficacy;
const ae = z.object({ subjectId: id, armId: id, pt: text, soc: text, severity: z.enum(['mild', 'moderate', 'severe']),
  serious: z.boolean(), related: z.enum(['related', 'unrelated', 'unknown']),
  outcome: z.enum(['recovered', 'recovering', 'not-recovered', 'fatal', 'unknown']).optional(), ledToDiscontinuation: z.boolean().optional() }).strict();
const exposure = z.object({ armId: id, meanDailyDose: text.optional(), meanExposureDays: finite.min(0), totalPersonYears: finite.min(0).optional() }).strict();
const lab = z.object({ armId: id, parameter: text, shiftFromNormal: count, shiftToHigh: count, shiftToLow: count, totalAssessed: count }).strict();
/** §12.5: one safety subject's baseline and last on-treatment value of one parameter. */
const vitalSign = z.object({ subjectId: id, armId: id, parameter: text, baseline: finite, lastOnTreatment: finite }).strict();
const concomitantMedication = z.object({ subjectId: id, armId: id, medication: text, atcClass: text.optional() }).strict();

const CsrSourceEnvelopeFieldsSchema = z.object({
  format: z.literal(CSR_SOURCE_FORMAT),
  dataCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Use a valid YYYY-MM-DD data-cut date.'),
  studyInfo: CsrStudyInfoSchema,
  participants: z.array(participant).min(1).max(maxRecords),
  /** Explicit declarations distinguish a complete zero-event listing from
   * unavailable events. They are source declarations, never verification. */
  completeDomains: z.object({ disposition: z.literal(true), demographics: z.literal(true), efficacy: z.literal(true), adverseEvents: z.literal(true) }).strict(),
  studyData: z.object({ studyId: id, protocolNumber: id, treatmentArms: z.array(arm).min(1).max(100),
    disposition: z.array(disposition).min(1).max(maxRecords), demographics: z.array(demographic).min(1).max(maxRecords),
    efficacy: z.array(efficacy).min(1).max(10_000), adverseEvents: z.array(ae).max(maxRecords),
    exposure: z.array(exposure).max(100).optional(), labShifts: z.array(lab).max(10_000).optional(),
    /** Declared final-disposition categories: a declared category with no subject is a recorded 0; an undeclared, unused one is "not recorded". */
    dispositionCategories: z.array(dispositionStatus).min(1).max(6).optional(),
    dispositionBasis: z.enum(['end-of-study', 'end-of-treatment']).optional(),
    /** Where AE discontinuation is recorded: per event (ledToDiscontinuation, the default) or per subject (disposition.discontinuedForAdverseEvent) when the study did not collect the action taken per event. */
    aeDiscontinuationBasis: z.enum(['event', 'subject']).optional(),
    vitalSigns: z.array(vitalSign).max(maxRecords).optional(),
    concomitantMedications: z.array(concomitantMedication).max(maxRecords).optional() }).strict(),
}).strict();
type CsrSourceData = z.infer<typeof CsrSourceEnvelopeFieldsSchema>;
type ValidationFailure = (message: string, path?: (string | number)[]) => void;
function validatePopulationCounts(
  source: CsrSourceData,
  arms: Map<string, CsrSourceData['studyData']['treatmentArms'][number]>,
  fail: ValidationFailure,
) {
  for (const a of arms.values()) {
    const members = source.participants.filter(p => p.armId === a.armId);
    if (members.length === 0) fail('Every treatment arm requires recorded participants.');
    if (members.filter(p => p.randomized).length !== a.randomized) fail('Randomized count does not match the participant listing.');
    for (const key of ['safety', 'itt', 'completed', 'mitt', 'perProtocol'] as const) {
      const declared = a.populations[key];
      if (declared !== undefined && (members.some(p => typeof p[key] !== 'boolean') || members.filter(p => p[key] === true).length !== declared)) {
        fail(`The ${key} population count does not match explicit participant flags.`);
      }
      if (declared === undefined && members.some(p => p[key] !== undefined)) fail(`Declare the ${key} population count when participant flags are supplied.`);
    }
  }
}

/** CSR slice 6 (2026-10-29): the disposition declarations, vital signs and concomitant medications. */
function validateDeclaredAndSubjectDomains(source: CsrSourceData, subjects: Map<string, CsrSourceData['participants'][number]>, fail: ValidationFailure) {
  const categories = source.studyData.dispositionCategories;
  if (categories) {
    if (new Set(categories).size !== categories.length) fail('Declared disposition categories must be unique.');
    if (source.studyData.disposition.some(r => !categories.includes(r.status))) fail('A disposition record uses a status outside the declared disposition categories.');
  }
  const inSafetyArm = (r: { subjectId: string; armId: string }) => {
    const p = subjects.get(r.subjectId);
    return !!p && p.armId === r.armId && p.safety;
  };
  const vitals = new Set<string>();
  source.studyData.vitalSigns?.forEach(r => {
    if (!inSafetyArm(r)) fail('Every vital-sign record must belong to a recorded subject in that arm’s safety population.');
    const key = JSON.stringify([r.subjectId, r.parameter]);
    if (vitals.has(key)) fail('Vital signs require one baseline and last-value record per subject and parameter.');
    vitals.add(key);
  });
  source.studyData.concomitantMedications?.forEach(r => {
    if (!inSafetyArm(r)) fail('Every concomitant medication must belong to a recorded subject in that arm’s safety population.');
  });
}

/** CDISC pilot defect D2 (2026-10-30): AE discontinuation is recorded at one level only, and completely at that level. */
function validateAeDiscontinuationBasis(source: CsrSourceData, subjects: Map<string, CsrSourceData['participants'][number]>, fail: ValidationFailure) {
  const subjectLevel = source.studyData.aeDiscontinuationBasis === 'subject';
  const records = source.studyData.disposition;
  if (subjectLevel) {
    if (records.some(r => typeof r.discontinuedForAdverseEvent !== 'boolean')) fail('A subject-level AE discontinuation basis requires the flag on every disposition record.');
    if (records.some(r => r.discontinuedForAdverseEvent && !subjects.get(r.subjectId)?.safety)) fail('A subject recorded as discontinued for an AE must belong to the safety population.');
    if (source.studyData.adverseEvents.some(e => e.ledToDiscontinuation !== undefined)) fail('A subject-level AE discontinuation basis cannot also carry event-level discontinuation flags.');
  } else if (records.some(r => r.discontinuedForAdverseEvent !== undefined)) {
    fail('Declare aeDiscontinuationBasis "subject" to record AE discontinuation on disposition records.');
  }
}

export const CsrSourceEnvelopeSchema = CsrSourceEnvelopeFieldsSchema.superRefine((source, ctx) => {
  const fail = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (source.studyInfo.protocolNumber !== source.studyData.protocolNumber) fail('Study information and observations must identify the same protocol.', ['studyInfo', 'protocolNumber']);
  const arms = new Map(source.studyData.treatmentArms.map(a => [a.armId, a]));
  if (arms.size !== source.studyData.treatmentArms.length) fail('Treatment arm identifiers must be unique.');
  const subjects = new Map(source.participants.map(p => [p.subjectId, p]));
  if (subjects.size !== source.participants.length) fail('Participant identifiers must be unique across the study.');
  source.participants.forEach(p => { if (!arms.has(p.armId)) fail('A participant names an unknown treatment arm.'); });
  validatePopulationCounts(source, arms, fail);
  validateDeclaredAndSubjectDomains(source, subjects, fail);
  validateAeDiscontinuationBasis(source, subjects, fail);
  const randomized = source.participants.filter(p => p.randomized);
  if (randomized.length === 0) fail('This tabulation contract requires recorded randomized participants.');
  if (source.studyInfo.sampleSize !== undefined && source.studyInfo.sampleSize !== randomized.length) fail('Study sample size must match the randomized participant count.');
  for (const [kind, records] of [['disposition', source.studyData.disposition], ['demographics', source.studyData.demographics]] as const) {
    const seen = new Set<string>();
    records.forEach(r => {
      const p = subjects.get(r.subjectId);
      if (!p || p.armId !== r.armId) fail(`A ${kind} record does not match its participant and arm.`);
      if (seen.has(r.subjectId)) fail(`Duplicate participant in ${kind} records.`);
      seen.add(r.subjectId);
      if (kind === 'demographics' && p && !p.randomized) fail('Baseline demographics in this contract describe randomized participants.');
    });
    if ((kind === 'disposition' ? source.participants : randomized).some(p => !seen.has(p.subjectId))) fail(`Complete ${kind} records are required for every ${kind === 'disposition' ? 'listed' : 'randomized'} participant.`);
  }
  source.studyData.disposition.forEach(r => {
    const p = subjects.get(r.subjectId);
    if (p && p.completed !== (r.status === 'completed')) fail('Completed participant flags must match final disposition.');
    if (p?.randomized && r.status === 'screen-failed') fail('A randomized participant cannot be recorded as screen-failed.');
  });
  source.studyData.adverseEvents.forEach(r => {
    const p = subjects.get(r.subjectId);
    if (!p || p.armId !== r.armId || !p.safety) fail('Every adverse event must belong to a recorded subject in that arm’s safety population.');
  });
  const endpoints = new Set<string>();
  source.studyData.efficacy.forEach(r => {
    if (!arms.has(r.armId) || (r.comparatorArmId && !arms.has(r.comparatorArmId))) fail('An efficacy result names an unknown arm.');
    if (r.comparatorArmId === r.armId) fail('An efficacy comparison cannot use its own arm as comparator.');
    if (r.ci && r.ci.lower > r.ci.upper) fail('Confidence interval bounds are reversed.');
    if (r.credibleInterval && r.credibleInterval.lower > r.credibleInterval.upper) fail('Credible interval bounds are reversed.');
    // A pairwise result is keyed by its comparator too (2026-10-30, CDISC pilot): high vs placebo and high vs low are two results.
    const key = JSON.stringify([r.endpointName, r.endpointType, r.armId, r.comparatorArmId ?? null]);
    if (endpoints.has(key)) fail('Duplicate efficacy endpoint result for an arm and comparator.');
    endpoints.add(key);
  });
  if (!source.studyData.efficacy.some(r => r.endpointType === 'primary' && r.endpointName === source.studyInfo.primaryEndpoint)) fail('A recorded primary endpoint result must match study information.');
  const exposureArms = new Set<string>();
  source.studyData.exposure?.forEach(r => { if (!arms.has(r.armId) || exposureArms.has(r.armId)) fail('Exposure requires one record per known arm.'); exposureArms.add(r.armId); });
  const labKeys = new Set<string>();
  source.studyData.labShifts?.forEach(r => {
    const key = JSON.stringify([r.armId, r.parameter]);
    if (!arms.has(r.armId) || labKeys.has(key)) fail('Lab shifts require one summary per known arm and parameter.');
    if (r.shiftToHigh + r.shiftToLow > r.shiftFromNormal || r.shiftFromNormal > r.totalAssessed) fail('Lab shifts from normal exceed the recorded baseline-normal or assessed denominator.');
    if (r.totalAssessed > (arms.get(r.armId)?.populations.safety ?? 0)) fail('Lab assessed count exceeds the recorded safety population.');
    labKeys.add(key);
  });
});
export type CsrSourceEnvelope = z.infer<typeof CsrSourceEnvelopeSchema>;

export const CsrSourceReceiptSchema = z.object({
  adapter: z.literal(CSR_SOURCE_FORMAT), documentId: z.string().uuid(), documentTitle: text, version: z.string().max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), dataCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), studyId: id, protocolNumber: id,
  studyInfo: CsrStudyInfoSchema, clinicalVerification: z.literal('not-established'), sourceApproval: z.enum(['canonical-lifecycle', 'not-approved']),
}).strict();
export type CsrSourceReceipt = z.infer<typeof CsrSourceReceiptSchema>;
