/**
 * HL7 v3 ICSR-style XML export for FDA (the case content a MedWatch 3500A reports)
 *
 * Writes one case as an HL7 v3 message in the ICSR shape (MCCI_IN200100UV01
 * wrapper). It is not MedWatch Form 3500A, which is a paper/PDF form, is not
 * FDA's E2B(R3) regional implementation, and is not validated against any
 * schema. 2026-10-15: this header, the file name and the format list called it
 * "FDA MedWatch 3500A". The job format key FDA_AE_3500A and the exported
 * function names stay: stored jobs and the routes use them.
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 803, FDA MedWatch 3500A
 * @reference https://www.fda.gov/safety/medical-product-safety-information/medwatch-fda-safety-information-and-adverse-event-reporting-program
 */

import {
  CanonicalAdverseEvent,
  ExportJob,
  MappingRule,
  TerminologyVersionLock,
  ValidationError,
  ValidationWarning,
  ExportResult,
  CODE_SYSTEMS,
  TIME_UNIT_UCUM,
  doseUnit,
  timeUnit,
  doseNumber,
  meddraCode,
  qualificationCode,
  casePartyProblems,
  meddraVersionCheck,
  recordedDate,
  caseDateFields,
  isRecorded,
} from '../types';

// Type assertion helper for flexible data access from canonical model
type AnyData = Record<string, any>;

// =============================================================================
// UNITS — the UCUM code of a recorded unit, or null (2026-10-15: mg, kg and d
// were assumed when no unit was recorded)
// =============================================================================

const WEIGHT_UNIT_UCUM = new Map<string, string>([['kg', 'kg'], ['g', 'g'], ['lb', '[lb_av]'], ['lbs', '[lb_av]']]);

const ucumWeightUnit = (unit: unknown): string | null =>
  typeof unit === 'string' ? WEIGHT_UNIT_UCUM.get(unit.trim().toLowerCase()) ?? null : null;

const ucumDoseUnit = (unit: unknown): string | null => doseUnit(unit)?.ucum ?? null;

function ucumTimeUnit(unit: unknown): string | null {
  const key = timeUnit(unit);
  return key ? TIME_UNIT_UCUM[key] : null;
}

// =============================================================================
// FDA 3500A CONSTANTS
// =============================================================================

const FDA_NAMESPACE = 'urn:hl7-org:v3';
const FDA_MESSAGE_TYPE = 'PORR_MT049016UV';
const FDA_INTERACTION_ID = 'MFMI_IN200101UV';
const FDA_SENDER_OID = '2.16.840.1.113883.3.150'; // FDA OID

// Date format for FDA submissions
const FDA_DATE_FORMAT = 'YYYYMMDD';
const FDA_DATETIME_FORMAT = 'YYYYMMDDHHMMSS';

// Seriousness criteria mapping to FDA codes
const FDA_SERIOUSNESS_CODES: Record<string, string> = {
  death: 'DE',
  life_threatening: 'LT',
  hospitalization: 'HO',
  disability: 'DS',
  congenital_anomaly: 'CA',
  other_medically_important: 'OT',
};

// Patient sex mapping.
//
// The administrativeGenderCode element below is emitted with codeSystem
// 2.16.840.1.113883.5.1 (HL7 AdministrativeGender), whose ONLY defined codes are
// M / F / UN. The ICH E2B numeric codes (1=Male, 2=Female, 0=Unknown) belong to
// the bare E2B <patientsex> element (see emaAEE2BR3.ts), NOT to this OID-qualified
// HL7 v3 coded attribute — emitting them here files an undefined code against the
// gender code system. Keys cover both the canonical PatientInfo.sex ('M'/'F'/'U')
// and looser word forms; unknown/undifferentiated maps to 'UN'.
const FDA_SEX_CODES: Record<string, string> = {
  m: 'M',
  male: 'M',
  f: 'F',
  female: 'F',
  u: 'UN',
  un: 'UN',
  unknown: 'UN',
};

// Report type mapping. 2026-10-15: a type missing here (an amendment, a
// nullification) fell back to 1, "Initial". It is refused instead.
const FDA_REPORT_TYPE_CODES: Record<string, string> = {
  initial: '1',
  followup: '2',
  final: '3',
};

const fdaReportTypeCode = (reportType: unknown): string | null =>
  typeof reportType === 'string' && Object.prototype.hasOwnProperty.call(FDA_REPORT_TYPE_CODES, reportType)
    ? FDA_REPORT_TYPE_CODES[reportType]
    : null;

// Causality assessment mapping
const FDA_CAUSALITY_CODES: Record<string, string> = {
  certain: '1',
  probable: '2',
  possible: '3',
  unlikely: '4',
  conditional: '5',
  unassessable: '6',
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * A code left out: a null flavour, with the element's meaning in words.
 * 2026-10-15: the patient's age, weight and medical history were filed under
 * LOINC 3137-7, 3141-9 and 29762-2, and the action taken under C53254 in
 * 2.16.840.1.113883.3.26.1.1. The LOINC codes this repository vendors are SPL
 * document and section codes, none of these, and
 * db/migrations/057_gcc_product_master.sql names that OID as ISO 11238 substance
 * identifiers. unverifiedCodeWarnings names each code left out.
 */
const uncoded = (meaning: string): string => `<code nullFlavor="NI"><originalText>${escapeXml(meaning)}</originalText></code>`;

/**
 * A recorded date as an HL7 TS to its recorded precision (CCYY, CCYYMM or
 * CCYYMMDD, read by recordedDate without a time-zone conversion), or '' when no
 * readable date is recorded; with includeTime, a UTC timestamp CCYYMMDDHHMMSS.
 * 2026-10-15: a Date was read through local getters, so west of UTC the
 * receive date the service builds at UTC midnight was filed a day early; a
 * month ('2026-03') went through new Date() to 20260228 there; and a month or a
 * year was filed as a day.
 */
function formatFDADate(date: Date | string | undefined, includeTime: boolean = false, precision?: unknown): string {
  if (!date) return '';
  if (includeTime) {
    return new Date(date)
      .toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z/, '');
  }
  return recordedDate(date, precision)?.digits ?? '';
}

/** `<{tag} value="TS"/>` for a recorded date, or '' when none is readable (validateForFDA warns, FDA-W008). */
function tsElement(tag: string, date: unknown, precision?: unknown): string {
  const ts = formatFDADate(date as Date | string | undefined, false, precision);
  return ts ? `<${tag} value="${ts}"/>` : '';
}

/**
 * Escape XML special characters
 */
function escapeXml(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap value in CDATA if it contains special characters
 */
function cdataWrap(value: string | undefined): string {
  if (!value) return '';
  if (/[<>&]/.test(value)) {
    return `<![CDATA[${value}]]>`;
  }
  return escapeXml(value);
}

/**
 * Generate UUID for message ID
 */
function generateMessageId(): string {
  return (
    'urn:uuid:' +
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
  );
}

/**
 * Map patient sex to the HL7 AdministrativeGender code (M / F / UN) required by the
 * administrativeGenderCode element's codeSystem 2.16.840.1.113883.5.1. Returns 'UN'
 * (undifferentiated/unknown) when sex is absent or unrecognised so the emitted code
 * is always a value defined by that code system.
 */
function mapSexCode(sex: string | undefined): string {
  if (!sex) return 'UN';
  return FDA_SEX_CODES[sex.toLowerCase()] || 'UN';
}

/**
 * The ICH outcome code (CODE_SYSTEMS.ICH_OUTCOME) a reaction records: the
 * outcome named, or the code itself; null otherwise. 2026-10-15: an
 * unrecorded outcome was filed as 6 with displayName "unknown", and one that
 * did not map as 0, which is no ICH code.
 */
function fdaOutcomeCode(outcome: unknown): string | null {
  const text = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';
  const key = text.replace(/[\s-]+/g, '_');
  if (key && Object.prototype.hasOwnProperty.call(CODE_SYSTEMS.ICH_OUTCOME, key)) return CODE_SYSTEMS.ICH_OUTCOME[key];
  return text && Object.values(CODE_SYSTEMS.ICH_OUTCOME).includes(text) ? text : null;
}

/**
 * Map causality to FDA code
 */
function mapCausalityCode(causality: string | undefined): string {
  if (!causality) return '6';
  const lower = causality.toLowerCase();
  return FDA_CAUSALITY_CODES[lower] || '6';
}

// =============================================================================
// VALIDATION
// =============================================================================

const fdaError = (code: string, field: string, message: string): ValidationError => ({
  code,
  field,
  message,
  severity: 'error',
});

const fdaUnitError = (field: string, value: unknown, unit: unknown): ValidationError =>
  fdaError(
    'FDA-011',
    field,
    `${field}: ${String(value ?? '')} is recorded ${unit ? `in "${String(unit)}", which has no UCUM code here` : 'with no unit'}; no unit is assumed`
  );

/** Seriousness, report type and weight unit are coded only as recorded (2026-10-15). */
function caseFactErrors(event: CanonicalAdverseEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  const patient = (event.patient || {}) as AnyData;
  if (typeof event.isSerious !== 'boolean') {
    errors.push(fdaError('FDA-009', 'isSerious', 'Seriousness is not recorded; the case is not filed as non-serious by default'));
  }
  if (!fdaReportTypeCode(event.reportType)) {
    errors.push(fdaError(
      'FDA-010',
      'reportType',
      `Report type "${String(event.reportType ?? '')}" has no code here (initial, followup, final); none is assumed`
    ));
  }
  if (patient.weight && !ucumWeightUnit(patient.weight_unit)) {
    errors.push(fdaUnitError('patient.weight_unit', patient.weight, patient.weight_unit));
  }
  // 2026-10-15: the age unit was written as its E2B code (801) in a PQ, whose unit is UCUM.
  if (patient.age && !ucumTimeUnit(patient.age_unit)) {
    errors.push(fdaUnitError('patient.age_unit', patient.age, patient.age_unit));
  }
  return errors;
}

/** Each code left out because this repository cannot verify it (see uncoded and routeElement); the recorded value stays. */
function unverifiedCodeWarnings(event: CanonicalAdverseEvent): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message, severity: 'warning' });
  const loinc = (field: string, what: string, code: string) =>
    warn('FDA-W009', field, `${what} is written without a code: LOINC ${code}, which it was filed under, is not among the LOINC codes this repository vendors (SPL document and section codes), so it is not filed under a meaning nothing here verifies`);
  const patient = (event.patient || {}) as AnyData;
  if (patient.age && patient.age_unit) loinc('patient.age', "The patient's age at onset", '3137-7');
  if (patient.weight) loinc('patient.weight', "The patient's weight", '3141-9');
  if ((event.medicalHistory?.conditions || []).length > 0) loinc('medicalHistory.conditions', 'The medical history', '29762-2');
  for (const [list, products] of Object.entries({ suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts })) {
    ((products || []) as AnyData[]).forEach((product, i) => {
      if (product.route) {
        const nci = CODE_SYSTEMS.FDA_ROUTE[String(product.route).toLowerCase()];
        warn('FDA-W010', `${list}[${i}].route`, nci
          ? `The route "${String(product.route)}" is written as text: its NCI code ${nci} is not filed, because this repository verifies neither that code nor the code system it was filed under (2.16.840.1.113883.5.112)`
          : `The route "${String(product.route)}" is written as text, without a code`);
      }
      if (product.action_taken) {
        warn('FDA-W011', `${list}[${i}].action_taken`, `The action taken ("${String(product.action_taken)}") is written without a code: C53254 is not filed, because this repository does not verify it, and db/migrations/057_gcc_product_master.sql names the code system it was filed under, 2.16.840.1.113883.3.26.1.1, as ISO 11238 substance identifiers`);
      }
    });
  }
  return warnings;
}

/** A recorded date that is not a calendar date is omitted; this names each (2026-10-15: it was parsed by new Date()). */
const unreadableDateWarnings = (event: CanonicalAdverseEvent): ValidationWarning[] =>
  caseDateFields(event)
    .filter(([, value, precision]) => isRecorded(value) && !recordedDate(value, precision))
    .map(([field, value]) => ({
      code: 'FDA-W008',
      field,
      message: `${field} ("${String(value)}") is not a calendar date (YYYY, YYYY-MM or YYYY-MM-DD); it is omitted`,
      severity: 'warning' as const,
    }));

/** The sender is written as recorded or refused, by the rules intake applies (casePartyProblems). */
const senderErrors = (event: CanonicalAdverseEvent): ValidationError[] =>
  casePartyProblems('sender', event.sender).map(p => fdaError('FDA-013', p.field, p.message));

/** Every recorded quantity's unit must code; none is assumed. */
function quantityUnitErrors(event: CanonicalAdverseEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  ((event.reactions || []) as AnyData[]).forEach((reaction, i) => {
    if (reaction.duration && !ucumTimeUnit(reaction.duration_unit)) {
      errors.push(fdaUnitError(`reactions[${i}].duration_unit`, reaction.duration, reaction.duration_unit));
    }
  });
  const lists = { suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts };
  for (const [list, products] of Object.entries(lists)) {
    ((products || []) as AnyData[]).forEach((product, i) => {
      if (product.dose && !doseNumber(product.dose)) {
        errors.push(fdaError(
          'FDA-012',
          `${list}[${i}].dose`,
          `${list}[${i}].dose: "${String(product.dose)}" is not one number; a structured dose is not read out of text`
        ));
      } else if (product.dose && !ucumDoseUnit(product.dose_unit)) {
        errors.push(fdaUnitError(`${list}[${i}].dose_unit`, product.dose, product.dose_unit));
      }
      const periodStarted = product.frequency_value || product.frequency_unit;
      if (periodStarted && !(product.frequency_value && ucumTimeUnit(product.frequency_unit))) {
        errors.push(fdaUnitError(`${list}[${i}].frequency_unit`, product.frequency_value, product.frequency_unit));
      }
    });
  }
  return errors;
}

/**
 * The report type, seriousness criteria, reaction outcome, drug role and
 * reporter qualification are written without a codeSystem. 2026-10-15: each
 * carried 2.16.840.1.113883.6.163, which is MedDRA's, and none is a MedDRA
 * code. This repository vendors no OID for those ICH code lists (it has LOINC,
 * NDC and the eCTD v4 lists), so none is invented; this names the ones the
 * case's message carries.
 */
function codesWithoutSystemWarning(event: CanonicalAdverseEvent): ValidationWarning {
  const lists = ['report type', 'drug role'];
  const criteria = event.seriousnessDeath || event.seriousnessLifeThreatening || event.seriousnessHospitalization ||
    event.seriousnessDisability || event.seriousnessCongenitalAnomaly || event.seriousnessOtherMedicallyImportant;
  if (event.isSerious && criteria) lists.push('seriousness criterion');
  if ((event.reactions || []).some(r => fdaOutcomeCode(r.outcome))) lists.push('reaction outcome');
  if (qualificationCode(event.reporter)) lists.push('reporter qualification');
  return {
    code: 'FDA-W005',
    field: 'codeSystem',
    message: `The ${lists.join(', ')} codes are written without a codeSystem: no OID for those ICH code lists is verified here, and they are not MedDRA codes`,
    severity: 'warning',
  };
}

/** Elements now omitted rather than filled in; the warnings say which. */
function omittedPartyWarnings(event: CanonicalAdverseEvent): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (!event.sender?.sender_organization) {
    warnings.push({
      code: 'FDA-W003',
      field: 'sender.sender_organization',
      message: 'Sender organisation is not recorded; the message names none',
      severity: 'warning',
    });
  }
  if (!event.sender?.sender_identifier) {
    warnings.push({
      code: 'FDA-W006',
      field: 'sender.sender_identifier',
      message: "The sender's identifier is not recorded; the sender device id is a null flavour (the tenant id is not one)",
      severity: 'warning',
    });
  }
  ((event.reactions || []) as AnyData[]).forEach((reaction, i) => {
    if (!fdaOutcomeCode(reaction.outcome)) {
      warnings.push({
        code: 'FDA-W007',
        field: `reactions[${i}].outcome`,
        message: reaction.outcome
          ? `Reaction ${i + 1}'s outcome is recorded as "${String(reaction.outcome)}", which has no ICH code here; its outcome is omitted`
          : `Reaction ${i + 1}'s outcome is not recorded; its outcome is omitted, not filed as unknown`,
        severity: 'warning',
      });
    }
  });
  const reporter = event.reporter as AnyData | undefined;
  if (!qualificationCode(reporter)) {
    warnings.push({
      code: 'FDA-W004',
      field: 'reporter.qualification',
      message: reporter?.qualification || reporter?.qualification_code
        ? `Reporter qualification "${String(reporter.qualification_code ?? reporter.qualification)}" has no ICH code here; the reporter's role code is omitted`
        : "Reporter qualification is not recorded; the reporter's role code is omitted, not assumed",
      severity: 'warning',
    });
  }
  return warnings;
}

/**
 * Validate adverse event for FDA submission
 */
export function validateForFDA(event: CanonicalAdverseEvent): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Access patient as any for flexible property access
  const patient = event.patient as any;

  // Required fields
  if (!event.caseNumber) {
    errors.push({
      code: 'FDA-001',
      field: 'caseNumber',
      message: 'Case number is required for FDA submission',
      severity: 'error',
    });
  }

  if (!event.receiveDate || !recordedDate(event.receiveDate)) {
    errors.push({
      code: 'FDA-002',
      field: 'receiveDate',
      message: 'Receive date is required for FDA submission, as a calendar date',
      severity: 'error',
    });
  }

  if (!patient) {
    errors.push({
      code: 'FDA-003',
      field: 'patient',
      message: 'Patient information is required for FDA submission',
      severity: 'error',
    });
  } else {
    // Patient validation
    if (!patient.age && !patient.date_of_birth) {
      warnings.push({
        code: 'FDA-W001',
        field: 'patient.age',
        message: 'Patient age or birth date is recommended for FDA submission',
        severity: 'warning',
      });
    }
  }

  if (!event.reactions || (event.reactions as any[]).length === 0) {
    errors.push({
      code: 'FDA-004',
      field: 'reactions',
      message: 'At least one reaction is required for FDA submission',
      severity: 'error',
    });
  } else {
    // Validate each reaction
    (event.reactions as any[]).forEach((reaction: AnyData, index: number) => {
      // 2026-10-15: a term with no code passed this check, as its message says
      // it should not, and was filed under MedDRA as the code "unknown".
      if (reaction.term_code && !meddraCode(reaction)) {
        errors.push({
          code: 'FDA-005',
          field: `reactions[${index}].term_system`,
          message: `Reaction ${index + 1}: term_code is a ${String(reaction.term_system)} code; it is not filed as a MedDRA code`,
          severity: 'error',
        });
      } else if (!reaction.term_code) {
        errors.push({
          code: 'FDA-005',
          field: `reactions[${index}].term_code`,
          message: `Reaction ${index + 1}: MedDRA code is required`,
          severity: 'error',
        });
      }
    });
  }

  const suspectProducts = event.suspectProducts as any[];
  if (!suspectProducts || suspectProducts.length === 0) {
    errors.push({
      code: 'FDA-006',
      field: 'suspectProducts',
      message: 'At least one suspect product is required for FDA submission',
      severity: 'error',
    });
  } else {
    // Validate each product
    suspectProducts.forEach((product: AnyData, index: number) => {
      if (!product.name) {
        errors.push({
          code: 'FDA-007',
          field: `suspectProducts[${index}].name`,
          message: `Product ${index + 1}: Product name is required`,
          severity: 'error',
        });
      }
    });
  }

  if (!event.reporter) {
    errors.push({
      code: 'FDA-008',
      field: 'reporter',
      message: 'Reporter information is required for FDA submission',
      severity: 'error',
    });
  }

  // Seriousness validation
  if (event.isSerious) {
    const hasSeriousnessCriteria =
      event.seriousnessDeath ||
      event.seriousnessLifeThreatening ||
      event.seriousnessHospitalization ||
      event.seriousnessDisability ||
      event.seriousnessCongenitalAnomaly ||
      event.seriousnessOtherMedicallyImportant;

    if (!hasSeriousnessCriteria) {
      warnings.push({
        code: 'FDA-W002',
        field: 'seriousness',
        message: 'Serious case should have at least one seriousness criterion specified',
        severity: 'warning',
      });
    }
  }

  errors.push(...caseFactErrors(event), ...quantityUnitErrors(event), ...senderErrors(event));
  warnings.push(
    ...omittedPartyWarnings(event),
    codesWithoutSystemWarning(event),
    ...unreadableDateWarnings(event),
    ...unverifiedCodeWarnings(event)
  );
  return { errors, warnings };
}

/**
 * A reaction coded in another MedDRA version than the job's lock is refused;
 * one that records no version is filed under the lock, and the export says so.
 */
function meddraVersionFindings(event: CanonicalAdverseEvent, locked: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const { conflicts, unrecorded } = meddraVersionCheck(event.reactions, locked);
  return {
    errors: conflicts.map(c => fdaError(
      'FDA-MEDDRA-VERSION-MISMATCH',
      `reactions[${c.index}].term_version`,
      `Reaction ${c.index + 1} (${c.term}) is coded in MedDRA ${c.recorded}, and this export job locks MedDRA ${locked}; a code is not filed under a version it was not coded in`
    )),
    warnings: unrecorded.map(u => ({
      code: 'FDA-W-MEDDRA-VERSION',
      field: `reactions[${u.index}].term_version`,
      message: `Reaction ${u.index + 1} (${u.term}) records no MedDRA version; its code is filed under the job's lock, MedDRA ${locked}, unchecked against it`,
      severity: 'warning' as const,
    })),
  };
}

// =============================================================================
// XML GENERATION
// =============================================================================

/**
 * Generate FDA MedWatch 3500A XML
 */
export function generateFDA3500AXML(
  event: CanonicalAdverseEvent,
  job: ExportJob,
  terminologyVersions: Record<string, TerminologyVersionLock>
): ExportResult {
  // Validate first
  const validation = validateForFDA(event);
  // 2026-10-15: this fell back to MedDRA '27.1' when the job locked no version.
  const meddraVersion = terminologyVersions['MEDDRA']?.version_code;
  if (!meddraVersion) {
    validation.errors.push(fdaError(
      'FDA-MEDDRA-VERSION',
      'terminologyVersions.MEDDRA',
      'No MedDRA version is locked on this export job; every MedDRA code is versioned from that lock, and none is assumed'
    ));
  } else {
    const versions = meddraVersionFindings(event, meddraVersion);
    validation.errors.push(...versions.errors);
    validation.warnings.push(...versions.warnings);
  }
  if (!meddraVersion || validation.errors.length > 0) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const messageId = generateMessageId();
  const creationTime = formatFDADate(new Date(), true);
  // 2026-10-15: an unrecorded sender organisation was named "Unknown Organization".
  const senderName = event.sender?.sender_organization
    ? `\n      <name>${escapeXml(event.sender.sender_organization)}</name>`
    : '';
  // The recorded sender identifier, or a null flavour (FDA-W006). 2026-10-15:
  // it was the tenant id, under a root (2.16.840.1.113883.3.0) nothing here verifies.
  const senderDeviceId = event.sender?.sender_identifier
    ? `<id extension="${escapeXml(String(event.sender.sender_identifier))}"/>`
    : '<id nullFlavor="NI"/>';

  // Build XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MCCI_IN200100UV01 xmlns="${FDA_NAMESPACE}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  ITSVersion="XML_1.0">

  <!-- Message Header -->
  <id root="${messageId}"/>
  <creationTime value="${creationTime}"/>
  <interactionId root="2.16.840.1.113883.1.6" extension="${FDA_INTERACTION_ID}"/>
  <processingCode code="P"/>
  <processingModeCode code="T"/>
  <acceptAckCode code="AL"/>

  <!-- Receiver: FDA -->
  <receiver typeCode="RCV">
    <device classCode="DEV" determinerCode="INSTANCE">
      <id root="${FDA_SENDER_OID}"/>
    </device>
  </receiver>

  <!-- Sender -->
  <sender typeCode="SND">
    <device classCode="DEV" determinerCode="INSTANCE">
      ${senderDeviceId}${senderName}
    </device>
  </sender>

  <!-- Control Act -->
  <controlActProcess classCode="CACT" moodCode="EVN">
    <code code="${FDA_MESSAGE_TYPE}" codeSystem="2.16.840.1.113883.1.18"/>

    <!-- Subject: ICSR -->
    <subject typeCode="SUBJ">
      <investigationEvent classCode="INVSTG" moodCode="EVN">

        <!-- Case Identification -->
        <id root="${event.tenantId}" extension="${escapeXml(event.caseNumber)}"/>
        ${event.worldwideCaseId ? `<id root="2.16.840.1.113883.3.989.2.1.3.1" extension="${escapeXml(event.worldwideCaseId)}"/>` : ''}

        <!-- Safety Report Type -->
        <code code="PAT_ADV_EVNT" codeSystem="2.16.840.1.113883.5.4"/>

        <!-- Report Type (Initial/Followup) -->
        <activityTime value="${formatFDADate(event.receiveDate)}"/>

${generateReportTypeSection(event)}
${generateSeriousnessSection(event)}
${generatePatientSection(event, meddraVersion)}
${generateReactionsSection(event, meddraVersion)}
${generateProductsSection(event)}
${generateReporterSection(event)}
${generateNarrativeSection(event)}

      </investigationEvent>
    </subject>

  </controlActProcess>
</MCCI_IN200100UV01>`;

  return {
    success: true,
    content: xml,
    contentType: 'application/xml',
    fileName: `FDA_HL7V3_ICSR_${event.caseNumber}_${formatFDADate(new Date())}.xml`,
    warnings: validation.warnings,
    metadata: {
      format: 'FDA_AE_3500A',
      version: '1.0',
      jurisdiction: 'FDA',
      caseNumber: event.caseNumber,
      messageId,
      creationTime,
      terminologyVersions: {
        meddra: meddraVersion,
      },
    },
  };
}

/**
 * Generate report type section
 */
function generateReportTypeSection(event: CanonicalAdverseEvent): string {
  // Validated before generation (FDA-010).
  const reportTypeCode = fdaReportTypeCode(event.reportType) ?? '';
  const caseVersion = event.caseVersion || 1;

  // No codeSystem: see codesWithoutSystemWarning (2026-10-15: MedDRA's OID).
  return `
        <!-- Report Type -->
        <component typeCode="COMP">
          <adverseEventAssessment classCode="INVSTG" moodCode="EVN">
            <code code="${reportTypeCode}"
              displayName="${event.reportType === 'followup' ? 'Follow-up' : event.reportType === 'final' ? 'Final' : 'Initial'}"/>
            <effectiveTime>
              <low value="${formatFDADate(event.receiveDate)}"/>
            </effectiveTime>
            <versionNumber value="${caseVersion}"/>
          </adverseEventAssessment>
        </component>`;
}

/**
 * Generate seriousness section
 */
function generateSeriousnessSection(event: CanonicalAdverseEvent): string {
  if (!event.isSerious) {
    return `
        <!-- Seriousness: Not Serious -->
        <component typeCode="COMP">
          <observation classCode="OBS" moodCode="EVN">
            <code code="MSR" codeSystem="2.16.840.1.113883.5.4"/>
            <value xsi:type="BL" value="false"/>
          </observation>
        </component>`;
  }

  const seriousnessComponents: string[] = [];

  if (event.seriousnessDeath) {
    seriousnessComponents.push(generateSeriousnessComponent('DE', 'Results in death'));
  }
  if (event.seriousnessLifeThreatening) {
    seriousnessComponents.push(generateSeriousnessComponent('LT', 'Life-threatening'));
  }
  if (event.seriousnessHospitalization) {
    seriousnessComponents.push(generateSeriousnessComponent('HO', 'Hospitalization'));
  }
  if (event.seriousnessDisability) {
    seriousnessComponents.push(generateSeriousnessComponent('DS', 'Disability/Incapacity'));
  }
  if (event.seriousnessCongenitalAnomaly) {
    seriousnessComponents.push(generateSeriousnessComponent('CA', 'Congenital anomaly'));
  }
  if (event.seriousnessOtherMedicallyImportant) {
    seriousnessComponents.push(
      generateSeriousnessComponent('OT', 'Other medically important', event.seriousnessOtherDetails)
    );
  }

  return `
        <!-- Seriousness: Serious -->
        <component typeCode="COMP">
          <observation classCode="OBS" moodCode="EVN">
            <code code="MSR" codeSystem="2.16.840.1.113883.5.4"/>
            <value xsi:type="BL" value="true"/>
            ${seriousnessComponents.join('\n            ')}
          </observation>
        </component>`;
}

/**
 * Generate seriousness component
 */
function generateSeriousnessComponent(code: string, display: string, details?: string): string {
  // No codeSystem: see codesWithoutSystemWarning (2026-10-15: MedDRA's OID).
  return `<component typeCode="COMP">
              <observation classCode="OBS" moodCode="EVN">
                <code code="${code}" displayName="${display}"/>
                ${details ? `<text>${cdataWrap(details)}</text>` : ''}
              </observation>
            </component>`;
}

/**
 * Generate patient section
 */
function generatePatientSection(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const patient = (event.patient || {}) as AnyData;
  const sexCode = mapSexCode(patient.sex);

  let ageSection = '';
  if (patient.age && patient.age_unit) {
    // Validated before generation (UCUM). 2026-10-15: the E2B code (801) was the PQ unit.
    ageSection = `
            <component1 typeCode="COMP">
              <observationEvent classCode="OBS" moodCode="EVN">
                ${uncoded('Age at onset')}
                <value xsi:type="PQ" value="${patient.age}" unit="${ucumTimeUnit(patient.age_unit) ?? ''}"/>
              </observationEvent>
            </component1>`;
  }
  // Written beside a recorded age too (2026-10-15: an age dropped the birth date),
  // to its recorded precision.
  const birthTime = tsElement('birthTime', patient.date_of_birth, patient.date_of_birth_precision);
  if (birthTime) {
    ageSection += `
            ${birthTime}`;
  }

  let weightSection = '';
  if (patient.weight) {
    // Validated before generation. 2026-10-15: an unrecorded unit was filed as kg.
    const weightUnit = ucumWeightUnit(patient.weight_unit) ?? '';
    weightSection = `
            <component1 typeCode="COMP">
              <observationEvent classCode="OBS" moodCode="EVN">
                ${uncoded('Body weight')}
                <value xsi:type="PQ" value="${patient.weight}" unit="${weightUnit}"/>
              </observationEvent>
            </component1>`;
  }

  let medicalHistorySection = '';
  const medHistory = event.medicalHistory as AnyData | undefined;
  if (medHistory?.conditions && medHistory.conditions.length > 0) {
    const conditions = medHistory.conditions
      .map(
        (condition: AnyData, idx: number) => `
              <observationEvent classCode="OBS" moodCode="EVN">
                ${historyConditionCode(condition, meddraVersion)}
                ${conditionPeriod(condition)}
                ${typeof condition.ongoing === 'boolean' ? `<statusCode code="${condition.ongoing ? 'active' : 'completed'}"/>` : ''}
              </observationEvent>`
      )
      .join('\n');

    medicalHistorySection = `
            <!-- Medical History -->
            <component2 typeCode="COMP">
              <organizer classCode="CLUSTER" moodCode="EVN">
                ${uncoded('Medical history')}
                ${conditions}
              </organizer>
            </component2>`;
  }

  return `
        <!-- Patient Information -->
        <primaryRole classCode="INVSBJ">
          <player1 classCode="PSN" determinerCode="INSTANCE">
            ${patient.initials ? `<name>${escapeXml(patient.initials)}</name>` : ''}
            <administrativeGenderCode code="${sexCode}" codeSystem="2.16.840.1.113883.5.1"/>
            ${ageSection}
          </player1>
          ${weightSection}
          ${medicalHistorySection}
        </primaryRole>`;
}

/**
 * A medical-history condition's code: its MedDRA code under the locked version,
 * or a null flavour carrying the recorded term. 2026-10-15: an uncoded
 * condition was filed under MedDRA as the code "unknown".
 */
function historyConditionCode(condition: AnyData, meddraVersion: string): string {
  const code = meddraCode(condition);
  if (!code) {
    return `<code nullFlavor="NI"><originalText>${escapeXml(condition.term || '')}</originalText></code>`;
  }
  return `<code code="${escapeXml(code)}"
                  codeSystem="2.16.840.1.113883.6.163"
                  codeSystemVersion="${meddraVersion}"
                  displayName="${escapeXml(condition.term || code)}"/>`;
}

/**
 * The condition's recorded start and end. 2026-10-15: the end date was not
 * read, and an unrecorded `ongoing` was filed as completed.
 */
function conditionPeriod(condition: AnyData): string {
  const low = tsElement('low', condition.start_date, condition.start_date_precision);
  const high = tsElement('high', condition.end_date, condition.end_date_precision);
  return low || high ? `<effectiveTime>${low}${high}</effectiveTime>` : '';
}

/**
 * Generate reactions section
 */
function generateReactionsSection(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const reactions = (event.reactions || []) as AnyData[];

  const reactionComponents = reactions
    .map((reaction: AnyData, index: number) => {
      // Written without a codeSystem: see codesWithoutSystemWarning (2026-10-15: MedDRA's OID).
      // As recorded, or omitted (FDA-W007).
      const outcomeCode = fdaOutcomeCode(reaction.outcome);

      return `
          <!-- Reaction ${index + 1} -->
          <component typeCode="COMP">
            <adverseEffectAssessment classCode="OBS" moodCode="EVN">
              <code code="PROBLEM" codeSystem="2.16.840.1.113883.5.4"/>
              <effectiveTime>
                ${tsElement('low', reaction.onset_date, reaction.onset_date_precision)}
                ${tsElement('high', reaction.end_date, reaction.end_date_precision)}
              </effectiveTime>

              <!-- MedDRA Term (validated: term_code is MedDRA's) -->
              <value xsi:type="CD"
                code="${escapeXml(meddraCode(reaction) ?? '')}"
                codeSystem="2.16.840.1.113883.6.163"
                codeSystemVersion="${meddraVersion}"
                displayName="${escapeXml(reaction.term || '')}">
                ${
                  reaction.meddra_llt_code
                    ? `
                <translation code="${reaction.meddra_llt_code}"
                  codeSystem="2.16.840.1.113883.6.163"
                  codeSystemVersion="${meddraVersion}"
                  displayName="${escapeXml(reaction.meddra_llt || '')}"/>`
                    : ''
                }
              </value>

              <!-- Duration -->
              ${
                reaction.duration
                  ? `
              <entryRelationship typeCode="MFST">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="DURATION" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="PQ" value="${reaction.duration}" unit="${ucumTimeUnit(reaction.duration_unit) ?? ''}"/>
                </observation>
              </entryRelationship>`
                  : ''
              }

              ${
                outcomeCode
                  ? `<!-- Outcome -->
              <entryRelationship typeCode="OUTC">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="OUTCOME" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="CD" code="${outcomeCode}"
                    displayName="${escapeXml(String(reaction.outcome))}"/>
                </observation>
              </entryRelationship>`
                  : ''
              }
            </adverseEffectAssessment>
          </component>`;
    })
    .join('\n');

  return `
        <!-- Reactions -->
        ${reactionComponents}`;
}

/**
 * Generate products section
 */
function generateProductsSection(event: CanonicalAdverseEvent): string {
  const suspectProducts = (event.suspectProducts || []) as AnyData[];
  const concomitantProducts = (event.concomitantProducts || []) as AnyData[];

  const suspectComponents = suspectProducts
    .map((product: AnyData, index: number) => generateProductComponent(product, index, 'suspect'))
    .join('\n');

  const concomitantComponents = concomitantProducts
    .map((product: AnyData, index: number) =>
      generateProductComponent(product, index, 'concomitant')
    )
    .join('\n');

  return `
        <!-- Suspect Products -->
        ${suspectComponents}

        <!-- Concomitant Products -->
        ${concomitantComponents}`;
}

/**
 * Generate individual product component
 */
function generateProductComponent(
  product: any,
  index: number,
  role: 'suspect' | 'concomitant'
): string {
  // No codeSystem on the role code: see codesWithoutSystemWarning (2026-10-15: MedDRA's OID).
  const roleCode = role === 'suspect' ? '1' : '2';
  const rechallenge = rechallengeText(product.rechallenge);
  const period = tsElement('low', product.start_date, product.start_date_precision) + tsElement('high', product.end_date, product.end_date_precision);

  return `
          <!-- ${role === 'suspect' ? 'Suspect' : 'Concomitant'} Product ${index + 1} -->
          <component typeCode="COMP">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              ${product.id ? `<id extension="${escapeXml(String(product.id))}"/>` : '<id nullFlavor="NI"/>'}

              <!-- Role (Suspect/Concomitant) -->
              <code code="${roleCode}" displayName="${role}"/>

              <!-- Route -->${routeElement(product)}

              <!-- Dosage -->${doseElement(product)}

              <!-- Frequency -->${periodElement(product)}

              <!-- Dates -->
              ${
                period
                  ? `
              <effectiveTime xsi:type="IVL_TS">${period}</effectiveTime>`
                  : ''
              }

              <!-- Product Details -->
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <manufacturedMaterialKind>${ndcElement(product)}
                    <name>${escapeXml(product.name || '')}</name>
                    ${
                      product.manufacturer
                        ? `
                    <manufacturerOrganization>
                      <name>${escapeXml(product.manufacturer)}</name>
                    </manufacturerOrganization>`
                        : ''
                    }
                  </manufacturedMaterialKind>
                </manufacturedProduct>
              </consumable>

              <!-- Indication -->
              ${
                product.indication
                  ? `
              <entryRelationship typeCode="RSON">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="INDICATION" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="ST">${cdataWrap(product.indication)}</value>
                </observation>
              </entryRelationship>`
                  : ''
              }

              <!-- Action Taken -->
              ${
                product.action_taken
                  ? `
              <entryRelationship typeCode="COMP">
                <observation classCode="OBS" moodCode="EVN">
                  ${uncoded('Action taken')}
                  <value xsi:type="ST">${escapeXml(product.action_taken)}</value>
                </observation>
              </entryRelationship>`
                  : ''
              }

              <!-- Rechallenge -->
              ${
                rechallenge !== null
                  ? `
              <entryRelationship typeCode="COMP">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="RECHALLENGE" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="ST">${escapeXml(rechallenge)}</value>
                </observation>
              </entryRelationship>`
                  : ''
              }
            </substanceAdministration>
          </component>`;
}

/**
 * The route, only when recorded, as text under a null-flavoured code (FDA-W010
 * names the code left out). 2026-10-15: an unrecorded route was coded
 * "unknown"; a recorded one was filed as FDA_ROUTE's NCI C-code under
 * 2.16.840.1.113883.5.112 (HL7 RouteOfAdministration), and one with no C-code
 * as its own text in the code attribute. This repository verifies neither.
 */
function routeElement(product: AnyData): string {
  if (!product.route) return '';
  return `
              <routeCode nullFlavor="NI"><originalText>${escapeXml(String(product.route))}</originalText></routeCode>`;
}

/** The dose in its recorded unit (validated, FDA-011). 2026-10-15: an unrecorded unit was filed as mg. */
function doseElement(product: AnyData): string {
  const dose = doseNumber(product.dose);
  if (!dose) return '';
  return `
              <doseQuantity value="${dose}" unit="${ucumDoseUnit(product.dose_unit) ?? ''}"/>`;
}

/**
 * The dosing period, only when its value and unit are recorded. 2026-10-15:
 * any free-text frequency produced a period of 1 d, whatever the text said.
 */
function periodElement(product: AnyData): string {
  const unit = ucumTimeUnit(product.frequency_unit);
  if (!product.frequency_value || !unit) return '';
  return `
              <effectiveTime xsi:type="PIVL_TS">
                <period value="${product.frequency_value}" unit="${unit}"/>
              </effectiveTime>`;
}

/**
 * The NDC, only when one is recorded: a substance_code whose substance_system
 * is NDC. 2026-10-15: this fell back to the internal product id, then to
 * "unknown", in the NDC code system; and it read ndc_code, which no field defines.
 */
function ndcElement(product: AnyData): string {
  if (product.substance_system !== 'NDC' || !product.substance_code) return '';
  return `
                    <code code="${escapeXml(String(product.substance_code))}"
                      codeSystem="2.16.840.1.113883.6.69"/>`;
}

/**
 * A recorded rechallenge outcome, or null. 2026-10-15: any truthy value,
 * including the recorded string "negative", was filed as positive, and a
 * recorded null as negative.
 */
function rechallengeText(value: unknown): string | null {
  if (value === true) return 'positive';
  if (value === false) return 'negative';
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Generate reporter section
 */
function generateReporterSection(event: CanonicalAdverseEvent): string {
  const reporter = (event.reporter || {}) as AnyData;

  return `
        <!-- Reporter Information -->
        <author typeCode="AUT">
          <time value="${formatFDADate(event.receiveDate)}"/>
          <assignedEntity classCode="ASSIGNED">
            ${reporterRoleElements(reporter)}

            <assignedPerson classCode="PSN" determinerCode="INSTANCE">
              ${
                reporter.given_name || reporter.family_name
                  ? `
              <name>
                ${reporter.title ? `<prefix>${escapeXml(reporter.title)}</prefix>` : ''}
                ${reporter.given_name ? `<given>${escapeXml(reporter.given_name)}</given>` : ''}
                ${reporter.middle_name ? `<given>${escapeXml(reporter.middle_name)}</given>` : ''}
                ${reporter.family_name ? `<family>${escapeXml(reporter.family_name)}</family>` : ''}
              </name>`
                  : reporter.name
                    ? `
              <name>${escapeXml(String(reporter.name))}</name>`
                    : ''
              }
            </assignedPerson>

            ${
              reporter.organization
                ? `
            <representedOrganization classCode="ORG" determinerCode="INSTANCE">
              <name>${escapeXml(reporter.organization)}</name>
              ${reporter.department ? `<desc>${escapeXml(reporter.department)}</desc>` : ''}
              ${
                reporter.address || reporter.city || reporter.country
                  ? `
              <addr>
                ${reporter.address ? `<streetAddressLine>${escapeXml(reporter.address)}</streetAddressLine>` : ''}
                ${reporter.city ? `<city>${escapeXml(reporter.city)}</city>` : ''}
                ${reporter.state ? `<state>${escapeXml(reporter.state)}</state>` : ''}
                ${reporter.postal_code ? `<postalCode>${escapeXml(reporter.postal_code)}</postalCode>` : ''}
                ${reporter.country ? `<country>${escapeXml(reporter.country)}</country>` : ''}
              </addr>`
                  : ''
              }
              ${
                reporter.phone
                  ? `
              <telecom value="tel:${escapeXml(reporter.phone)}"/>`
                  : ''
              }
              ${
                reporter.email
                  ? `
              <telecom value="mailto:${escapeXml(reporter.email)}"/>`
                  : ''
              }
            </representedOrganization>`
                : ''
            }
          </assignedEntity>
        </author>`;
}

/**
 * The reporter's id and role code, as recorded. 2026-10-15: an unrecorded
 * reporter was id "unknown", qualification 5 (a consumer in the ICH list) and
 * displayName "Healthcare Professional". The id is now a null flavour, and the
 * role code is omitted (validateForFDA warns, FDA-W004).
 */
function reporterRoleElements(reporter: AnyData): string {
  const id = reporter.reporter_id ? `<id extension="${escapeXml(reporter.reporter_id)}"/>` : '<id nullFlavor="NI"/>';
  // The ICH code (qualification_code, or the qualification named); 2026-10-15:
  // the qualification text was written as the code.
  const code = qualificationCode(reporter);
  if (!code) return id;
  const displayName = reporter.qualification ? ` displayName="${escapeXml(String(reporter.qualification))}"` : '';
  // No codeSystem: see codesWithoutSystemWarning (2026-10-15: MedDRA's OID).
  return `${id}
            <code code="${code}"${displayName}/>`;
}

/**
 * Generate narrative section
 */
function generateNarrativeSection(event: CanonicalAdverseEvent): string {
  const narrative = event.caseNarrative || '';
  const reporterComments = event.reporterComments || '';
  const senderComments = event.senderComments || '';

  if (!narrative && !reporterComments && !senderComments) {
    return '';
  }

  return `
        <!-- Narrative Section -->
        <component typeCode="COMP">
          <section classCode="DOCSECT" moodCode="EVN">
            <code code="NARRATIVE" codeSystem="2.16.840.1.113883.5.4"/>
            ${
              narrative
                ? `
            <text>
              <paragraph>
                <caption>Case Narrative</caption>
                ${cdataWrap(narrative)}
              </paragraph>
            </text>`
                : ''
            }
            ${
              reporterComments
                ? `
            <text>
              <paragraph>
                <caption>Reporter Comments</caption>
                ${cdataWrap(reporterComments)}
              </paragraph>
            </text>`
                : ''
            }
            ${
              senderComments
                ? `
            <text>
              <paragraph>
                <caption>Sender Comments</caption>
                ${cdataWrap(senderComments)}
              </paragraph>
            </text>`
                : ''
            }
          </section>
        </component>`;
}
