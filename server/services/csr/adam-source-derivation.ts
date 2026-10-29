/**
 * Derive the concept2cure.csr-source.v1 envelope from CDISC ADaM datasets
 * (CSR slice 6, 2026-10-29). Pure and deterministic: every participant, status,
 * event and value comes from a dataset row, and nothing is defaulted, imputed
 * or invented. Anything the rows do not establish is a typed refusal
 * (AdamDerivationError, a CsrSourceInputError with code CSR_ADAM_*).
 *
 *   ADSL  participants, arms (TRT01P via the manifest's arm map), populations
 *         (RANDFL or the declared flag, SAFFL, ITTFL or FASFL, PPROTFL),
 *         disposition (EOSSTT, DCSREAS), demographics (AGE, SEX, RACE, ETHNIC,
 *         WEIGHTBL, BMIBL)
 *   ADAE  treatment-emergent events (TRTEMFL) by AEBODSYS / AEDECOD, with
 *         ASEV|AESEV, AESER, AREL|AEREL, AEOUT, AESDTH, AEACN
 *   ADEX  exposure (PARAMCD TRTDURD, days)       ADLB  shifts (ANRIND)
 *   ADVS / ADEG  change from baseline (AVAL)      ADCM  concomitant medications
 *
 * A study whose define.xml uses other names declares them in the manifest
 * (CsrAdamBundle.conventions, 2026-10-30, CDISC pilot defects D1–D9):
 * DCDECOD disposition, a subject-level AE-withdrawal flag, the SAP's causality
 * classes, the ANRIND decode, the last on-treatment record and ADSL exposure.
 * Laboratory data may be split into ADLBC and ADLBH.
 *
 * Efficacy is the approved SAP output, imported as recorded (design decision 2),
 * Bayesian fields included. The derived envelope is then held to the same
 * contract as a hand-built source (CsrSourceEnvelopeSchema).
 */
import { CSR_SOURCE_FORMAT, CsrSourceEnvelopeSchema, type CsrSourceEnvelope } from '../../../shared/csr-source-input.js';
import type { CsrAdamBundle, CsrAdamConventions, CsrEfficacyResults } from '../../../shared/csr-adam-bundle.js';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { CsrSourceInputError } from './csr-source-error.js';
import {
  checkStudy, expectDataset, flag, has, numeric, refuse, required, requireColumns, subjectFor, text, where,
  type AdamDatasets, type Participant, type Status, type StudyData, type Subject,
} from './adam-rows.js';
import { readAdslExposure, readConcomitantMedications, readExposure, readLabShifts, readVitalSigns } from './adam-safety-domains.js';

export { AdamDerivationError, type AdamDatasets } from './adam-rows.js';

// ── ADSL ────────────────────────────────────────────────────────────────────

const DISPOSITION_BY_REASON: Record<string, Status> = {
  DEATH: 'death', 'LOST TO FOLLOW-UP': 'lost-to-followup', 'SCREEN FAILURE': 'screen-failed',
};
/** DCDECOD (declared): the CDISC standardized disposition term is COMPLETED or the reason itself; there is no ongoing term. */
function dcdecodDisposition(ds: AdamDataset, row: AdamRow, i: number, subjectId: string, armId: string): Subject['disposition'] {
  const term = required(ds, row, i, 'DCDECOD');
  if (term.toUpperCase() === 'COMPLETED') return { subjectId, armId, status: 'completed' };
  return { subjectId, armId, status: DISPOSITION_BY_REASON[term.toUpperCase()] ?? 'discontinued', reason: term };
}

function dispositionOf(ds: AdamDataset, row: AdamRow, i: number, subjectId: string, armId: string): Subject['disposition'] {
  const status = required(ds, row, i, 'EOSSTT').toUpperCase();
  if (status === 'COMPLETED') return { subjectId, armId, status: 'completed' };
  if (status === 'ONGOING') return refuse('DISPOSITION_NOT_FINAL', 'A subject is ongoing (EOSSTT); a CSR source records each subject’s final disposition.', where(ds, i, 'EOSSTT'));
  if (status !== 'DISCONTINUED') return refuse('VALUE_UNMAPPED', 'EOSSTT must be COMPLETED or DISCONTINUED.', where(ds, i, 'EOSSTT'));
  const reason = has(ds, 'DCSREAS') ? text(row, 'DCSREAS') : '';
  const mapped = DISPOSITION_BY_REASON[reason.toUpperCase()];
  if (mapped) return { subjectId, armId, status: mapped, reason };
  return { subjectId, armId, status: 'discontinued', ...(reason ? { reason } : {}) };
}

const SEX: Record<string, 'M' | 'F' | 'Other'> = { M: 'M', F: 'F', UNDIFFERENTIATED: 'Other' };
function demographicOf(ds: AdamDataset, row: AdamRow, i: number, subjectId: string, armId: string): Subject['demographic'] {
  const age = numeric(row, 'AGE');
  if (age === null) return refuse('VALUE_MISSING', 'AGE is blank for a randomized subject.', where(ds, i, 'AGE'));
  const sex = SEX[required(ds, row, i, 'SEX').toUpperCase()] ?? refuse('VALUE_UNMAPPED', 'SEX must be M, F or UNDIFFERENTIATED; an unknown sex is not reported as another.', where(ds, i, 'SEX'));
  const optionalText = (v: string) => (has(ds, v) && text(row, v) ? text(row, v) : undefined);
  const optionalPositive = (v: string) => { const n = has(ds, v) ? numeric(row, v) : null; return n !== null && n > 0 ? n : undefined; };
  const record = { subjectId, armId, age, sex, race: optionalText('RACE'), ethnicity: optionalText('ETHNIC'),
    weight: optionalPositive('WEIGHTBL'), bmi: optionalPositive('BMIBL') };
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as Subject['demographic'];
}

function populationFlags(bundle: CsrAdamBundle, adsl: AdamDataset) {
  const randomized = bundle.randomizedFlag ?? 'RANDFL';
  const itt = has(adsl, 'ITTFL') ? 'ITTFL' : has(adsl, 'FASFL') ? 'FASFL' : 'ITTFL';
  const disposition = bundle.conventions?.disposition ?? 'EOSSTT';
  const aeFlag = bundle.conventions?.aeDiscontinuationFlag;
  requireColumns(adsl, 'STUDYID', 'USUBJID', 'TRT01P', 'SAFFL', disposition, 'AGE', 'SEX', randomized, itt, ...(aeFlag ? [aeFlag] : []));
  return { randomized, itt, perProtocol: has(adsl, 'PPROTFL') ? 'PPROTFL' : null, disposition, aeFlag };
}

function subjectOf(bundle: CsrAdamBundle, adsl: AdamDataset, row: AdamRow, i: number, flags: ReturnType<typeof populationFlags>): Subject {
  const subjectId = required(adsl, row, i, 'USUBJID');
  const treatment = text(row, 'TRT01P');
  const arm = bundle.arms.find(a => a.treatment === treatment)
    ?? refuse('ARM_UNMAPPED', 'A subject’s planned treatment (TRT01P) is not mapped to an arm in the manifest.', where(adsl, i, 'TRT01P'));
  const safety = flag(adsl, row, i, 'SAFFL');
  if (safety && has(adsl, 'TRT01A') && text(row, 'TRT01A') && text(row, 'TRT01A') !== treatment) {
    refuse('TREATMENT_REASSIGNED', 'A subject’s actual treatment (TRT01A) differs from the planned one; this contract covers parallel arms without reassignment.', where(adsl, i, 'TRT01A'));
  }
  const randomized = flag(adsl, row, i, flags.randomized);
  const disposition = (flags.disposition === 'DCDECOD' ? dcdecodDisposition : dispositionOf)(adsl, row, i, subjectId, arm.armId);
  if (flags.aeFlag) disposition.discontinuedForAdverseEvent = flag(adsl, row, i, flags.aeFlag);
  const perProtocol = flags.perProtocol ? flag(adsl, row, i, flags.perProtocol) : undefined;
  const participant: Participant = { subjectId, armId: arm.armId, randomized, safety, itt: flag(adsl, row, i, flags.itt),
    completed: disposition.status === 'completed', ...(perProtocol !== undefined ? { perProtocol } : {}) };
  return { participant, treatment, disposition, perProtocol,
    demographic: randomized ? demographicOf(adsl, row, i, subjectId, arm.armId) : null };
}

function readSubjects(bundle: CsrAdamBundle, adsl: AdamDataset): { studyId: string; subjects: Map<string, Subject> } {
  const flags = populationFlags(bundle, adsl);
  if (!adsl.rows.length) refuse('VALUE_MISSING', 'ADSL has no subjects.', 'ADSL');
  const studyId = required(adsl, adsl.rows[0], 0, 'STUDYID');
  checkStudy(adsl, studyId);
  const subjects = new Map<string, Subject>();
  adsl.rows.forEach((row, i) => {
    const subject = subjectOf(bundle, adsl, row, i, flags);
    if (subjects.has(subject.participant.subjectId)) refuse('DUPLICATE_SUBJECT', 'ADSL lists a subject more than once.', where(adsl, i, 'USUBJID'));
    subjects.set(subject.participant.subjectId, subject);
  });
  return { studyId, subjects };
}

// ── ADAE ────────────────────────────────────────────────────────────────────

type AdverseEvent = StudyData['adverseEvents'][number];
const SEVERITY: Record<string, AdverseEvent['severity']> = { MILD: 'mild', MODERATE: 'moderate', SEVERE: 'severe' };
const RELATED = new Set(['Y', 'RELATED', 'POSSIBLE', 'POSSIBLY RELATED', 'PROBABLE', 'PROBABLY RELATED', 'DEFINITE', 'DEFINITELY RELATED']);
const UNRELATED = new Set(['N', 'NOT RELATED', 'UNRELATED', 'NONE']);
const OUTCOME: Record<string, NonNullable<AdverseEvent['outcome']>> = {
  'RECOVERED/RESOLVED': 'recovered', 'RECOVERED/RESOLVED WITH SEQUELAE': 'recovered', 'RECOVERING/RESOLVING': 'recovering',
  'NOT RECOVERED/NOT RESOLVED': 'not-recovered', FATAL: 'fatal', UNKNOWN: 'unknown',
};

function relationOf(ds: AdamDataset, row: AdamRow, i: number, declared: Map<string, string>): AdverseEvent['related'] {
  const v = has(ds, 'AREL') ? 'AREL' : has(ds, 'AEREL') ? 'AEREL' : null;
  const value = v ? text(row, v).toUpperCase() : '';
  if (!value) return 'unknown';
  const sap = declared.get(value);
  if (sap) return sap === 'related' ? 'related' : 'unrelated';
  if (RELATED.has(value)) return 'related';
  if (UNRELATED.has(value)) return 'unrelated';
  return refuse('VALUE_UNMAPPED', `${v} holds a causality the SAP must map to related or not related.`, where(ds, i, v!));
}

/** Fatal when AESDTH = Y; established non-fatal by AESDTH = N or a recorded,
 * known AEOUT. A blank AESDTH with a blank or UNKNOWN AEOUT does not establish
 * whether the event was fatal, so it is refused, never counted as non-fatal
 * (adversarial review 2026-10-29). */
function outcomeOf(ds: AdamDataset, row: AdamRow, i: number): Pick<AdverseEvent, 'outcome'> {
  const death = has(ds, 'AESDTH') ? text(row, 'AESDTH').toUpperCase() : '';
  if (death && death !== 'Y' && death !== 'N') refuse('VALUE_UNMAPPED', 'AESDTH must be Y, N or blank.', where(ds, i, 'AESDTH'));
  if (death === 'Y') return { outcome: 'fatal' };
  const value = has(ds, 'AEOUT') ? text(row, 'AEOUT').toUpperCase() : '';
  const outcome = value ? OUTCOME[value] ?? refuse('VALUE_UNMAPPED', 'AEOUT is outside the CDISC outcome terminology.', where(ds, i, 'AEOUT')) : undefined;
  if (death !== 'N' && (outcome === undefined || outcome === 'unknown')) {
    refuse('VALUE_MISSING', 'Neither AESDTH nor AEOUT records whether a treatment-emergent event was fatal.', where(ds, i, has(ds, 'AESDTH') ? 'AESDTH' : 'AEOUT'));
  }
  return outcome ? { outcome } : {};
}

/** AEACN must record the action taken: blank or UNKNOWN does not establish
 * whether the event led to discontinuation, so it is refused, never counted 0. */
function discontinuationOf(ds: AdamDataset, row: AdamRow, i: number): boolean {
  const action = text(row, 'AEACN').toUpperCase();
  if (!action || action === 'UNKNOWN') refuse('VALUE_MISSING', 'AEACN does not record the action taken with study treatment for a treatment-emergent event.', where(ds, i, 'AEACN'));
  return action === 'DRUG WITHDRAWN';
}

interface AeRules { causality: Map<string, string>; subjectLevelDiscontinuation: boolean }

function adverseEventOf(ds: AdamDataset, row: AdamRow, i: number, subject: Subject, rules: AeRules): AdverseEvent {
  if (has(ds, 'TRTA') && text(row, 'TRTA') && text(row, 'TRTA') !== subject.treatment) {
    refuse('TREATMENT_REASSIGNED', 'An event’s actual treatment (TRTA) differs from the subject’s arm in ADSL.', where(ds, i, 'TRTA'));
  }
  const sevVar = has(ds, 'ASEV') ? 'ASEV' : 'AESEV';
  const severity = SEVERITY[required(ds, row, i, sevVar).toUpperCase()] ?? refuse('VALUE_UNMAPPED', `${sevVar} must be MILD, MODERATE or SEVERE.`, where(ds, i, sevVar));
  const serious = required(ds, row, i, 'AESER').toUpperCase();
  if (serious !== 'Y' && serious !== 'N') refuse('VALUE_UNMAPPED', 'AESER must be Y or N.', where(ds, i, 'AESER'));
  return { subjectId: subject.participant.subjectId, armId: subject.participant.armId,
    pt: required(ds, row, i, 'AEDECOD'), soc: required(ds, row, i, 'AEBODSYS'), severity, serious: serious === 'Y',
    related: relationOf(ds, row, i, rules.causality), ...outcomeOf(ds, row, i),
    // Declared subject-level basis: ADSL records the withdrawal, and an event is not attributed one.
    ...(rules.subjectLevelDiscontinuation ? {} : { ledToDiscontinuation: discontinuationOf(ds, row, i) }) };
}

function readAdverseEvents(ds: AdamDataset, subjects: Map<string, Subject>, conventions: CsrAdamConventions | undefined): AdverseEvent[] {
  // AEOUT or AESDTH, and AEACN (unless ADSL records AE withdrawal per subject),
  // are required: without them a fatal outcome or an AE discontinuation is
  // unrecorded, and §12.2/§12.3 would print it as 0.
  const rules: AeRules = { subjectLevelDiscontinuation: !!conventions?.aeDiscontinuationFlag,
    causality: new Map(Object.entries(conventions?.causality ?? {}).map(([k, v]) => [k.trim().toUpperCase(), v])) };
  requireColumns(ds, 'USUBJID', 'TRTEMFL', 'AEDECOD', 'AEBODSYS', 'AESER', has(ds, 'ASEV') ? 'ASEV' : 'AESEV',
    has(ds, 'AESDTH') ? 'AESDTH' : 'AEOUT', ...(rules.subjectLevelDiscontinuation ? [] : ['AEACN']));
  const events: AdverseEvent[] = [];
  ds.rows.forEach((row, i) => {
    const emergent = flag(ds, row, i, 'TRTEMFL');
    const subject = subjectFor(ds, row, i, subjects, emergent);
    if (emergent) events.push(adverseEventOf(ds, row, i, subject, rules));
  });
  return events;
}

// ── Envelope ────────────────────────────────────────────────────────────────


function treatmentArms(bundle: CsrAdamBundle, subjects: Subject[]): StudyData['treatmentArms'] {
  return bundle.arms.map(a => {
    const own = subjects.filter(s => s.participant.armId === a.armId).map(s => s.participant);
    const n = (k: 'randomized' | 'safety' | 'itt' | 'completed' | 'perProtocol') => own.filter(p => p[k] === true).length;
    return { armId: a.armId, armName: a.armName, randomized: n('randomized'),
      populations: { safety: n('safety'), itt: n('itt'), completed: n('completed'),
        ...(own.some(p => p.perProtocol !== undefined) ? { perProtocol: n('perProtocol') } : {}) } };
  });
}

function validated(envelope: CsrSourceEnvelope): CsrSourceEnvelope {
  const parsed = CsrSourceEnvelopeSchema.safeParse(envelope);
  if (parsed.success) return parsed.data;
  throw new CsrSourceInputError(422, 'CSR_ADAM_SOURCE_INVALID', 'The source derived from these ADaM datasets does not meet the CSR input contract. No tables were saved.',
    parsed.error.issues.slice(0, 30).map(issue => ({ path: issue.path.join('.'),
      message: issue.code === 'custom' ? issue.message : 'Invalid or missing derived value.' })));
}

/** Exposure, laboratory shifts, vital signs and concomitant medications, from whichever datasets the manifest names. */
function safetyDomains(bundle: CsrAdamBundle, datasets: AdamDatasets, byId: Map<string, Subject>) {
  const conventions = bundle.conventions;
  if (conventions?.exposure && datasets.ADEX) refuse('CONVENTION_CONFLICT', 'The manifest declares exposure from ADSL and also names an ADEX; exposure has one source.', 'conventions.exposure');
  const exposure = conventions?.exposure ? readAdslExposure(datasets.ADSL, byId, bundle, conventions.exposure)
    : datasets.ADEX ? readExposure(datasets.ADEX, byId, bundle) : undefined;
  const labs = [datasets.ADLB, datasets.ADLBC, datasets.ADLBH].filter((ds): ds is AdamDataset => !!ds);
  return { exposure, labShifts: labs.length ? readLabShifts(labs, byId, conventions) : undefined,
    vitalSigns: [datasets.ADVS, datasets.ADEG].flatMap(ds => (ds ? readVitalSigns(ds, byId, conventions) : [])),
    concomitantMedications: datasets.ADCM ? readConcomitantMedications(datasets.ADCM, byId) : undefined };
}

/** The csr-source.v1 envelope these ADaM datasets and the SAP output establish. */
export function deriveCsrSourceFromAdam(bundle: CsrAdamBundle, datasets: AdamDatasets, efficacy: CsrEfficacyResults): CsrSourceEnvelope {
  for (const [name, ds] of Object.entries(datasets)) expectDataset(ds as AdamDataset | undefined, name);
  if (efficacy.protocolNumber !== bundle.studyInfo.protocolNumber) {
    refuse('EFFICACY_PROTOCOL_MISMATCH', 'The efficacy results file names a different protocol from the manifest.', 'efficacyResults.protocolNumber');
  }
  const { studyId, subjects: byId } = readSubjects(bundle, datasets.ADSL);
  for (const ds of Object.values(datasets)) checkStudy(ds as AdamDataset, studyId);
  const subjects = [...byId.values()];
  const disposition = subjects.map(s => s.disposition);
  const used = new Set(disposition.map(d => d.status));
  const conventions = bundle.conventions;
  const adverseEvents = readAdverseEvents(datasets.ADAE, byId, conventions);
  const { exposure, labShifts, vitalSigns, concomitantMedications } = safetyDomains(bundle, datasets, byId);
  return validated({
    format: CSR_SOURCE_FORMAT, dataCutDate: bundle.dataCutDate, studyInfo: bundle.studyInfo,
    participants: subjects.map(s => s.participant),
    completeDomains: { disposition: true, demographics: true, efficacy: true, adverseEvents: true },
    studyData: { studyId, protocolNumber: bundle.studyInfo.protocolNumber, treatmentArms: treatmentArms(bundle, subjects),
      disposition, demographics: subjects.flatMap(s => (s.demographic ? [s.demographic] : [])),
      efficacy: efficacy.results, adverseEvents,
      ...(exposure ? { exposure } : {}), ...(labShifts ? { labShifts } : {}),
      // EOSSTT / DCSREAS (or the declared DCDECOD) classify every ADSL subject, so a category with no
      // subject is a recorded zero; screen failure is declared only when used,
      // since an ADSL commonly lists no screen failures at all.
      dispositionCategories: (['completed', 'discontinued', 'lost-to-followup', 'death', 'screen-failed'] as Status[])
        .filter(s => s !== 'screen-failed' || used.has(s)),
      dispositionBasis: 'end-of-study',
      ...(conventions?.aeDiscontinuationFlag ? { aeDiscontinuationBasis: 'subject' as const } : {}),
      ...(vitalSigns.length ? { vitalSigns } : {}),
      ...(concomitantMedications?.length ? { concomitantMedications } : {}) },
  });
}
