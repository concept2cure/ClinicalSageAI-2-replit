/**
 * ICH E2B(R2) ICSR XML Export Generator (EMA export jobs)
 *
 * Writes one case as an ICH ICSR message in the E2B(R2) element vocabulary of
 * the ichicsr DTD 2.1 (ichicsr, safetyreport, primarysource, drug, ...). It is
 * not an E2B(R3) HL7 v3 message and is not validated against any schema.
 * 2026-10-15: this header, the XML, the file name and the format list called it
 * E2B(R3) and it declared the HL7 v3 namespace. The job format key
 * EMA_AE_E2B_R3 and the exported function names stay: stored jobs and the
 * routes use them.
 *
 * @version 1.0.0
 * @reference https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance/eudravigilance
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
  doseUnit,
  timeUnit,
  doseNumber,
  meddraCode,
  qualificationCode,
} from '../types';

// Type assertion helper for flexible data access from canonical model
type AnyData = Record<string, any>;

// =============================================================================
// ICHICSR (E2B(R2)) CONSTANTS
// =============================================================================

/** The ichicsr DTD message format version and release this generator writes. */
const ICHICSR_MESSAGE_FORMAT_VERSION = '2.1';
const ICHICSR_MESSAGE_FORMAT_RELEASE = '2.0';
const E2B_EMA_NAMESPACE = 'urn:ema-europa-eu:eudravigilance';
const EMA_SENDER_OID = '2.16.840.1.113883.3.989.2.1.1'; // EMA EudraVigilance OID

// Report type (A.1.4). 2026-10-15: a case type missing here fell back to 1, so
// every clinical-trial case was filed as spontaneous. Literature and solicited
// cases have no single report type and are refused, not assumed.
const E2B_REPORT_TYPE: Record<string, string> = {
  spontaneous: '1',
  clinical_trial: '2',
  clinical_study: '2',
  other: '3',
  not_available: '4',
};

const reportTypeCode = (caseType: unknown): string | null =>
  typeof caseType === 'string' && Object.prototype.hasOwnProperty.call(E2B_REPORT_TYPE, caseType)
    ? E2B_REPORT_TYPE[caseType]
    : null;

/** The E2B(R2) dose-unit code for a recorded unit, or null when it has none here. */
const e2bDoseUnitCode = (unit: unknown): string | null => doseUnit(unit)?.e2bR2 ?? null;

/** The E2B(R2) time-unit code (801-805) for a recorded unit, or null. */
function e2bTimeUnitCode(unit: unknown): string | null {
  const key = timeUnit(unit);
  return key ? CODE_SYSTEMS.ICH_AGE_UNIT[key] : null;
}

/**
 * B.1.3 is in kg and B.1.4 in cm. A recorded weight or height is converted
 * only by an exact power of ten (g to kg; m and mm to cm), computed on its
 * decimal digits; any other unit, or none, is not converted. 2026-10-15: the
 * recorded number was written whatever its unit, so 154 lb filed as 154 kg.
 */
const POWER_OF_TEN_TO: Record<'weight' | 'height', Record<string, number>> = {
  weight: { kg: 0, g: -3 },
  height: { cm: 0, m: 2, mm: -1 },
};

function bodyMeasure(kind: 'weight' | 'height', value: unknown, unit: unknown): string | null {
  const key = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(POWER_OF_TEN_TO[kind], key)) return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = Number(`${n}e${POWER_OF_TEN_TO[kind][key]}`);
  return Number.isFinite(scaled) ? String(scaled) : null;
}

/** Report types that are recorded and are not a nullification: casenullification 2. */
const NOT_A_NULLIFICATION = new Set(['initial', 'followup', 'amendment', 'final']);

const E2B_SERIOUSNESS: Record<string, string> = {
  death: '1',
  life_threatening: '2',
  hospitalization: '3',
  prolonged_hospitalization: '3',
  disability: '4',
  congenital_anomaly: '5',
  other_medically_important: '6',
};

const E2B_SEX: Record<string, string> = {
  male: '1',
  female: '2',
  unknown: '0',
};

const E2B_AGE_GROUP: Record<string, string> = {
  neonate: '1',
  infant: '2',
  child: '3',
  adolescent: '4',
  adult: '5',
  elderly: '6',
};

const E2B_OUTCOME: Record<string, string> = {
  recovered: '1',
  recovering: '2',
  not_recovered: '3',
  recovered_with_sequelae: '4',
  fatal: '5',
  unknown: '6',
};

const E2B_CAUSALITY: Record<string, string> = {
  certain: '1',
  probable: '2',
  possible: '3',
  unlikely: '4',
  conditional: '5',
  unassessable: '6',
  not_assessed: '0',
};

const E2B_ACTION_TAKEN: Record<string, string> = {
  withdrawn: '1',
  dose_reduced: '2',
  dose_increased: '3',
  dose_not_changed: '4',
  unknown: '5',
  not_applicable: '6',
};

const E2B_RECHALLENGE: Record<string, string> = {
  positive: '1',
  negative: '2',
  not_performed: '3',
  unknown: '4',
};

const E2B_DRUG_ROLE: Record<string, string> = {
  suspect: '1',
  concomitant: '2',
  interacting: '3',
  not_administered: '4',
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format date for E2B(R3) submission (CCYYMMDD or CCYYMM or CCYY)
 */
function formatE2BDate(date: Date | string | undefined, precision: string = 'day'): string {
  if (!date) return '';
  const d = new Date(date);

  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');

  switch (precision) {
    case 'year':
      return year;
    case 'month':
      return year + month;
    case 'day':
    default:
      return year + month + day;
  }
}

/**
 * Format datetime for E2B(R3) submission (CCYYMMDDHHMMSS)
 */
function formatE2BDateTime(date: Date | string | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d{3}Z/, '');
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
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
    .toUpperCase();
}

/**
 * Calculate age from birthdate
 */
function calculateAge(
  birthDate: Date | string | undefined,
  eventDate: Date | string | undefined
): { value: number; unit: string } | null {
  if (!birthDate || !eventDate) return null;

  const birth = new Date(birthDate);
  const event = new Date(eventDate);

  let years = event.getFullYear() - birth.getFullYear();
  const monthDiff = event.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && event.getDate() < birth.getDate())) {
    years--;
  }

  if (years >= 1) {
    return { value: years, unit: 'a' }; // years
  }

  // Calculate months for infants
  let months =
    (event.getFullYear() - birth.getFullYear()) * 12 + (event.getMonth() - birth.getMonth());
  if (event.getDate() < birth.getDate()) months--;

  if (months >= 1) {
    return { value: months, unit: 'mo' }; // months
  }

  // Calculate days for neonates
  const days = Math.floor((event.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  return { value: days, unit: 'd' }; // days
}

/**
 * The patientsex code for a recorded sex: the canonical M / F / U through
 * CODE_SYSTEMS.ICH_SEX, or a spelled-out word; null when nothing codes.
 * 2026-10-15: only the words were mapped, so the canonical 'F' was filed as 0
 * (unknown), and an unrecorded sex as 0 too.
 */
function mapSexCode(sex: unknown): string | null {
  if (typeof sex !== 'string' || !sex.trim()) return null;
  const s = sex.trim();
  return CODE_SYSTEMS.ICH_SEX[s.toUpperCase()] ?? E2B_SEX[s.toLowerCase()] ?? null;
}

/**
 * B.4.k.17.1 for a recorded rechallenge: recurred (1) or did not (2). Other
 * outcomes are not coded here. 2026-10-15: only booleans were read (the
 * canonical field is text), and anything else was filed as 3.
 */
function rechallengeCode(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (value === true || text === 'positive') return '1';
  if (value === false || text === 'negative') return '2';
  return null;
}

/**
 * Map outcome to E2B code
 */
function mapOutcomeCode(outcome: string | undefined): string {
  if (!outcome) return '6';
  const lower = outcome.toLowerCase().replace(/_/g, ' ');

  if (lower.includes('recover') && lower.includes('sequelae')) return '4';
  if (lower.includes('recover') && lower.includes('ing')) return '2';
  if (lower.includes('recover')) return '1';
  if (lower.includes('fatal') || lower.includes('death')) return '5';
  if (lower.includes('not recover')) return '3';

  return E2B_OUTCOME[outcome.toLowerCase()] || '6';
}

/**
 * Map action taken to E2B code
 */
function mapActionTakenCode(action: string | undefined): string {
  if (!action) return '5';
  const lower = action.toLowerCase();

  if (lower.includes('withdraw') || lower.includes('discontinue') || lower.includes('stop'))
    return '1';
  if (lower.includes('reduc')) return '2';
  if (lower.includes('increas')) return '3';
  if (lower.includes('not change') || lower.includes('maintain')) return '4';
  if (lower.includes('not applicable')) return '6';

  return '5';
}

// =============================================================================
// VALIDATION
// =============================================================================

const caseError = (code: string, field: string, message: string): ValidationError => ({
  code,
  field,
  message,
  severity: 'error',
});

/** Seriousness, report type and sender type: required, and coded only as recorded (2026-10-15). */
function caseFactErrors(event: CanonicalAdverseEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof event.isSerious !== 'boolean') {
    errors.push(caseError('E2B-C.1.7', 'isSerious', 'C.1.7 - Seriousness is not recorded; the case is not filed as non-serious by default'));
  }
  if (!reportTypeCode(event.caseType)) {
    errors.push(caseError(
      'E2B-C.1.3',
      'caseType',
      `C.1.3 - Case type "${String(event.caseType ?? '')}" has no single E2B report type here (spontaneous, clinical_trial, other); none is assumed`
    ));
  }
  if (!(event.sender as AnyData | undefined)?.sender_type) {
    errors.push(caseError('E2B-C.3.1', 'sender.sender_type', 'C.3.1 - Sender type is not recorded; none is assumed (code 2 is a regulatory authority)'));
  }
  // 2026-10-15: a nullification was filed with casenullification 2, "not a nullification".
  if (event.reportType === 'nullification') {
    errors.push(caseError(
      'E2B-A.1.13',
      'reportType',
      'A.1.13 - The case is recorded as a nullification; E2B(R2) needs its reason (A.1.13.1), which no field records, so it is not exported'
    ));
  }
  const patient = (event.patient || {}) as AnyData;
  // 2026-10-15: an uncoded unit ("yr", "decades") was written as the code.
  if (patient.age && !e2bTimeUnitCode(patient.age_unit)) {
    errors.push(unitError('patient.age_unit', patient.age, patient.age_unit));
  }
  return errors;
}

/** Elements omitted because the case does not record them; each warning says which. */
function unrecordedHeaderWarnings(event: CanonicalAdverseEvent): ValidationWarning[] {
  const warning = (code: string, field: string, message: string): ValidationWarning => ({ code, field, message, severity: 'warning' });
  const warnings: ValidationWarning[] = [
    warning(
      'E2B-W-A.1.9',
      'fulfillexpeditecriteria',
      'A.1.9 - Whether the case meets local expedited-reporting criteria is not recorded, and seriousness alone does not decide it (expectedness and causality do too); fulfillexpeditecriteria is omitted'
    ),
  ];
  if (!NOT_A_NULLIFICATION.has(String(event.reportType)) && event.reportType !== 'nullification') {
    warnings.push(warning(
      'E2B-W-A.1.13',
      'reportType',
      `A.1.13 - The report type "${String(event.reportType ?? '')}" does not say whether the case is a nullification; casenullification is omitted`
    ));
  }
  if (!(event.receiver as AnyData | undefined)?.receiver_identifier) {
    warnings.push(warning(
      'E2B-W-M.1.6',
      'receiver.receiver_identifier',
      'M.1.6 - The receiver is not recorded on the case; messagereceiveridentifier and the receiver block are omitted, not assumed'
    ));
  }
  const patient = (event.patient || {}) as AnyData;
  for (const [kind, element] of [['weight', 'patientweight (kg)'], ['height', 'patientheight (cm)']] as const) {
    if (patient[kind] && !bodyMeasure(kind, patient[kind], patient[`${kind}_unit`])) {
      warnings.push(warning(
        `E2B-W-${kind === 'weight' ? 'D.3' : 'D.4'}`,
        `patient.${kind}_unit`,
        `The ${kind} is recorded as ${String(patient[kind])} ${String(patient[`${kind}_unit`] ?? '(no unit)')}, which is not converted to ${element} here; it is omitted`
      ));
    }
  }
  return warnings;
}

const unitError = (field: string, value: unknown, unit: unknown): ValidationError =>
  caseError(
    'E2B-UNIT',
    field,
    `${field}: ${String(value)} is recorded ${unit ? `in "${String(unit)}", which has no E2B(R2) unit code here` : 'with no unit'}; no unit is assumed`
  );

/** Every recorded quantity's unit must code; none is assumed (2026-10-15: doses went through the age-unit table). */
function quantityUnitErrors(event: CanonicalAdverseEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  ((event.reactions || []) as AnyData[]).forEach((reaction, i) => {
    if (reaction.duration && !e2bTimeUnitCode(reaction.duration_unit)) {
      errors.push(unitError(`reactions[${i}].duration_unit`, reaction.duration, reaction.duration_unit));
    }
    if (reaction.time_to_onset_value && !e2bTimeUnitCode(reaction.time_to_onset_unit)) {
      errors.push(unitError(`reactions[${i}].time_to_onset_unit`, reaction.time_to_onset_value, reaction.time_to_onset_unit));
    }
  });
  const lists = { suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts };
  for (const [list, products] of Object.entries(lists)) {
    ((products || []) as AnyData[]).forEach((product, i) => {
      if (product.dose && !doseNumber(product.dose)) {
        errors.push(caseError(
          'E2B-DOSE',
          `${list}[${i}].dose`,
          `${list}[${i}].dose: "${String(product.dose)}" is not one number; a structured dose is not read out of text`
        ));
      } else if (product.dose && !e2bDoseUnitCode(product.dose_unit)) {
        errors.push(unitError(`${list}[${i}].dose_unit`, product.dose, product.dose_unit));
      }
      if (product.cumulative_dose && !e2bDoseUnitCode(product.cumulative_dose_unit)) {
        errors.push(unitError(`${list}[${i}].cumulative_dose_unit`, product.cumulative_dose, product.cumulative_dose_unit));
      }
      if (product.duration_value && !e2bTimeUnitCode(product.duration_unit)) {
        errors.push(unitError(`${list}[${i}].duration_unit`, product.duration_value, product.duration_unit));
      }
    });
  }
  return errors;
}

/** The reporter's qualification and name, where they cannot be written as recorded. */
function reporterWarnings(reporter: AnyData): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  // C.2.r.4 - coded or omitted (2026-10-15: the recorded text was written into the coded element)
  if (!qualificationCode(reporter)) {
    warnings.push({
      code: 'E2B-W-C.2.r.4',
      field: 'reporter.qualification',
      message: reporter.qualification || reporter.qualification_code
        ? `C.2.r.4 - Reporter qualification "${String(reporter.qualification_code ?? reporter.qualification)}" has no ICH code here; it is omitted`
        : 'C.2.r.4 - Reporter qualification is recommended',
      severity: 'warning',
    });
  }
  if (reporter.name && !reporter.given_name && !reporter.family_name) {
    warnings.push({
      code: 'E2B-W-C.2.r.1',
      field: 'reporter.name',
      message: "C.2.r.1 - The reporter's name is recorded as one string; E2B(R2) takes given and family names apart, and it is not split by guess",
      severity: 'warning',
    });
  }
  return warnings;
}

/** Countries are omitted when not recorded; this says so (2026-10-15: they were filed as 'US'). */
function omittedCountryWarnings(event: CanonicalAdverseEvent): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (!(event.reporter as AnyData | undefined)?.country_code) {
    warnings.push({
      code: 'E2B-W-C.2.r.3',
      field: 'reporter.country_code',
      message: "C.2.r.3 - Reporter's country is not recorded; primarysourcecountry is omitted, not assumed",
      severity: 'warning',
    });
  }
  if (!(event.patient as AnyData | undefined)?.country) {
    warnings.push({
      code: 'E2B-W-E.i.9',
      field: 'patient.country',
      message: 'E.i.9 - The country where the reaction occurred is not recorded; occurcountry is omitted, not assumed',
      severity: 'warning',
    });
  }
  return warnings;
}

/**
 * Validate adverse event for E2B(R3) submission
 */
export function validateForE2BR3(event: CanonicalAdverseEvent): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Cast to any for flexible property access
  const patient = event.patient as AnyData | undefined;
  const reporter = event.reporter as AnyData | undefined;

  // Required fields per ICH E2B(R3)

  // C.1.1 - Sender's Safety Report Unique Identifier
  if (!event.caseNumber) {
    errors.push({
      code: 'E2B-C.1.1',
      field: 'caseNumber',
      message: 'C.1.1 - Safety report unique identifier is required',
      severity: 'error',
    });
  }

  // C.1.2 - Date of Creation
  if (!event.createdAt) {
    errors.push({
      code: 'E2B-C.1.2',
      field: 'createdAt',
      message: 'C.1.2 - Date of creation is required',
      severity: 'error',
    });
  }

  // C.1.4 - Date Report Was First Received
  if (!event.receiveDate) {
    errors.push({
      code: 'E2B-C.1.4',
      field: 'receiveDate',
      message: 'C.1.4 - Date report was first received is required',
      severity: 'error',
    });
  }

  // C.1.8.1 - Worldwide Unique Case Identification
  if (!event.worldwideCaseId && !event.caseNumber) {
    warnings.push({
      code: 'E2B-W-C.1.8.1',
      field: 'worldwideCaseId',
      message: 'C.1.8.1 - Worldwide unique case identification is recommended',
      severity: 'warning',
    });
  }

  // D - Patient Information
  if (!patient) {
    errors.push({
      code: 'E2B-D',
      field: 'patient',
      message: 'D - Patient information section is required',
      severity: 'error',
    });
  } else {
    // D.2 - Age Information
    if ([patient.age, patient.date_of_birth, patient.age_group].every(v => v === undefined || v === null || v === '')) {
      warnings.push({
        code: 'E2B-W-D.2',
        field: 'patient.age',
        message: 'D.2 - Patient age information is recommended',
        severity: 'warning',
      });
    }

    // D.5 - Sex: omitted unless it codes (2026-10-15: written as 0, unknown).
    if (!mapSexCode(patient.sex)) {
      warnings.push({
        code: 'E2B-W-D.5',
        field: 'patient.sex',
        message: patient.sex
          ? `D.5 - Patient sex is recorded as "${String(patient.sex)}", which has no code here; patientsex is omitted`
          : 'D.5 - Patient sex is not recorded; patientsex is omitted, not assumed',
        severity: 'warning',
      });
    }
  }

  // E - Reaction(s)/Event(s)
  const reactions = (event.reactions || []) as AnyData[];
  if (reactions.length === 0) {
    errors.push({
      code: 'E2B-E',
      field: 'reactions',
      message: 'E - At least one reaction/event is required',
      severity: 'error',
    });
  } else {
    // E.i.1 - Reaction/Event as Reported by Primary Source
    reactions.forEach((reaction: AnyData, index: number) => {
      if (!reaction.term) {
        errors.push({
          code: `E2B-E.i.1[${index}]`,
          field: `reactions[${index}].term`,
          message: `E.i.1 - Reaction ${index + 1}: Reaction term as reported is required`,
          severity: 'error',
        });
      }

      // E.i.2.1b - the reaction's MedDRA code (term_code, in MedDRA)
      if (reaction.term_code && !meddraCode(reaction)) {
        errors.push({
          code: `E2B-E.i.2.1b[${index}]`,
          field: `reactions[${index}].term_system`,
          message: `E.i.2.1b - Reaction ${index + 1}: term_code is a ${String(reaction.term_system)} code; it is not filed as a MedDRA code`,
          severity: 'error',
        });
      } else if (!reaction.term_code) {
        errors.push({
          code: `E2B-E.i.2.1b[${index}]`,
          field: `reactions[${index}].term_code`,
          message: `E.i.2.1b - Reaction ${index + 1}: MedDRA code is required`,
          severity: 'error',
        });
      }
    });
  }

  // G - Suspect/Interacting Drug(s)
  const suspectProducts = (event.suspectProducts || []) as AnyData[];
  if (suspectProducts.length === 0) {
    errors.push({
      code: 'E2B-G',
      field: 'suspectProducts',
      message: 'G - At least one suspect drug is required',
      severity: 'error',
    });
  } else {
    // G.k.1 - Characterisation of Drug Role
    suspectProducts.forEach((product: AnyData, index: number) => {
      if (!product.name) {
        errors.push({
          code: `E2B-G.k.2.2[${index}]`,
          field: `suspectProducts[${index}].name`,
          message: `G.k.2.2 - Product ${index + 1}: Medicinal product name is required`,
          severity: 'error',
        });
      }
    });
  }

  // C.2 - Primary Source
  if (!reporter) {
    errors.push({
      code: 'E2B-C.2',
      field: 'reporter',
      message: 'C.2 - Primary source (reporter) information is required',
      severity: 'error',
    });
  } else {
    warnings.push(...reporterWarnings(reporter));
  }

  // G.k.9.i.4 - Rechallenge, coded only for a recorded outcome that codes
  [...suspectProducts, ...((event.concomitantProducts || []) as AnyData[])].forEach((product: AnyData) => {
    if (product.rechallenge !== undefined && product.rechallenge !== null && product.rechallenge !== '' && !rechallengeCode(product.rechallenge)) {
      warnings.push({
        code: 'E2B-W-G.k.9.i.4',
        field: 'rechallenge',
        message: `Rechallenge for ${String(product.name ?? 'a product')} is recorded as "${String(product.rechallenge)}", which has no code here; drugrecurreadministration is omitted`,
        severity: 'warning',
      });
    }
  });

  // C.1.7 - Seriousness
  if (event.isSerious) {
    const hasCriteria =
      event.seriousnessDeath ||
      event.seriousnessLifeThreatening ||
      event.seriousnessHospitalization ||
      event.seriousnessDisability ||
      event.seriousnessCongenitalAnomaly ||
      event.seriousnessOtherMedicallyImportant;

    if (!hasCriteria) {
      errors.push({
        code: 'E2B-C.1.7',
        field: 'seriousness',
        message: 'C.1.7 - At least one seriousness criterion must be specified when serious',
        severity: 'error',
      });
    }
  }

  errors.push(...caseFactErrors(event), ...quantityUnitErrors(event));
  warnings.push(...omittedCountryWarnings(event), ...unrecordedHeaderWarnings(event));
  return { errors, warnings };
}

// =============================================================================
// XML GENERATION
// =============================================================================

/**
 * Generate EMA E2B(R3) XML
 */
export function generateE2BR3XML(
  event: CanonicalAdverseEvent,
  job: ExportJob,
  terminologyVersions: Record<string, TerminologyVersionLock>
): ExportResult {
  // Validate first
  const validation = validateForE2BR3(event);
  // 2026-10-15: this fell back to MedDRA '27.1' when the job locked no version.
  const meddraVersion = terminologyVersions['MEDDRA']?.version_code;
  if (!meddraVersion) {
    validation.errors.push(caseError(
      'E2B-MEDDRA-VERSION',
      'terminologyVersions.MEDDRA',
      'No MedDRA version is locked on this export job; every MedDRA code is versioned from that lock, and none is assumed'
    ));
  }
  if (!meddraVersion || validation.errors.length > 0) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const messageId = generateUUID();
  const creationTime = formatE2BDateTime(new Date());
  // The recorded receiver, or none (2026-10-15: EVCTM, the clinical-trial
  // module, for every case; validateForE2BR3 warns, M.1.6).
  const receiverId = (event.receiver as AnyData | undefined)?.receiver_identifier;
  const receiverIdElement = receiverId
    ? `\n    <messagereceiveridentifier>${escapeXml(String(receiverId))}</messagereceiveridentifier>`
    : '';

  // Build XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ICH E2B(R2) Individual Case Safety Report (ichicsr DTD ${ICHICSR_MESSAGE_FORMAT_VERSION} vocabulary; not R3 / HL7 v3)
  Generated: ${new Date().toISOString()}
  Case Number: ${event.caseNumber}
-->
<ichicsr lang="en">

  <!-- ICH ICSR Message Header -->
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>${ICHICSR_MESSAGE_FORMAT_VERSION}</messageformatversion>
    <messageformatrelease>${ICHICSR_MESSAGE_FORMAT_RELEASE}</messageformatrelease>
    <messagenumb>${messageId}</messagenumb>
    <messagesenderidentifier>${escapeXml(event.sender?.sender_identifier || event.tenantId)}</messagesenderidentifier>${receiverIdElement}
    <messagedateformat>204</messagedateformat>
    <messagedate>${creationTime}</messagedate>
  </ichicsrmessageheader>

  <!-- Safety Report -->
  <safetyreport>

    <!-- C.1 - Identification of the Case Safety Report -->
${generateSafetyReportId(event, meddraVersion)}

    <!-- C.2 - Primary Source(s) of Information -->
${generatePrimarySources(event)}

    <!-- C.3 - Information on Sender of Case Safety Report -->
${generateSenderInformation(event)}

    <!-- C.4 - Literature Reference(s) -->
${generateLiteratureReferences(event)}

    <!-- D - Patient Characteristics -->
${generatePatientInformation(event, meddraVersion)}

    <!-- E - Reaction(s)/Event(s) -->
${generateReactions(event, meddraVersion)}

    <!-- F - Results of Tests and Procedures -->
${generateTestResults(event, meddraVersion)}

    <!-- G - Drug(s) Information -->
${generateDrugInformation(event, meddraVersion)}

    <!-- H - Narrative Case Summary and Further Information -->
${generateNarrativeSummary(event)}

  </safetyreport>
</ichicsr>`;

  return {
    success: true,
    content: xml,
    contentType: 'application/xml',
    fileName: `E2B_R2_${event.caseNumber}_${formatE2BDate(new Date())}.xml`,
    warnings: validation.warnings,
    metadata: {
      format: 'ICH_E2B_R2',
      version: ICHICSR_MESSAGE_FORMAT_VERSION,
      jurisdiction: 'EMA',
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
 * C.1 - Safety Report Identification
 */
function generateSafetyReportId(event: CanonicalAdverseEvent, meddraVersion: string): string {
  // Validated before generation: the case type maps, seriousness is a boolean.
  const reportType = reportTypeCode(event.caseType) ?? '';
  const reporter = event.reporter as AnyData | undefined;
  const patient = event.patient as AnyData | undefined;
  // 2026-10-15: both countries fell back to 'US', occurcountry through the
  // reporter's country first; each is now written only as recorded.
  const sourceCountry = reporter?.country_code
    ? `\n    <primarysourcecountry>${escapeXml(reporter.country_code)}</primarysourcecountry>`
    : '';
  const occurCountry = patient?.country ? `\n    <occurcountry>${escapeXml(patient.country)}</occurcountry>` : '';

  // C.1.7 Seriousness
  let seriousnessSection = '';
  if (event.isSerious) {
    seriousnessSection = `
      <serious>1</serious>
      <seriousnessdeath>${event.seriousnessDeath ? '1' : '2'}</seriousnessdeath>
      <seriousnesslifethreatening>${event.seriousnessLifeThreatening ? '1' : '2'}</seriousnesslifethreatening>
      <seriousnesshospitalization>${event.seriousnessHospitalization ? '1' : '2'}</seriousnesshospitalization>
      <seriousnessdisabling>${event.seriousnessDisability ? '1' : '2'}</seriousnessdisabling>
      <seriousnesscongenitalanomali>${event.seriousnessCongenitalAnomaly ? '1' : '2'}</seriousnesscongenitalanomali>
      <seriousnessother>${event.seriousnessOtherMedicallyImportant ? '1' : '2'}</seriousnessother>`;
  } else {
    seriousnessSection = `
      <serious>2</serious>`;
  }

  // <medicallyconfirm> is not written (2026-10-15): no field records medical
  // confirmation, and the value derived from the reporter's qualification said
  // "not confirmed" for every case not reported by a physician or pharmacist,
  // including one whose qualification nobody recorded.
  // <fulfillexpeditecriteria> is not written either (2026-10-15): it was 1 for
  // every serious case, but expectedness and causality decide it too, and no
  // field records it. <casenullification> is 2 only for a recorded report type
  // that is not a nullification (it was 2 for every case; a nullification is
  // refused in validation).
  const nullification = NOT_A_NULLIFICATION.has(String(event.reportType))
    ? '\n    <casenullification>2</casenullification>'
    : '';
  return `    <safetyreportversion>${event.caseVersion || 1}</safetyreportversion>
    <safetyreportid>${escapeXml(event.caseNumber)}</safetyreportid>${sourceCountry}${occurCountry}
    <transmissiondateformat>102</transmissiondateformat>
    <transmissiondate>${formatE2BDate(new Date())}</transmissiondate>
    <reporttype>${reportType}</reporttype>
    ${seriousnessSection}
    <receivedateformat>102</receivedateformat>
    <receivedate>${formatE2BDate(event.receiveDate)}</receivedate>
    <receiptdateformat>102</receiptdateformat>
    <receiptdate>${formatE2BDate(event.mostRecentInfoDate || event.receiveDate)}</receiptdate>
    <additionaldocument>2</additionaldocument>
    <authoritynumb>${escapeXml(event.worldwideCaseId || '')}</authoritynumb>
    <companynumb>${escapeXml(event.caseNumber)}</companynumb>
    <duplicate>2</duplicate>${nullification}`;
}

/**
 * C.2 - Primary Sources
 */
function generatePrimarySources(event: CanonicalAdverseEvent): string {
  const reporter = (event.reporter || {}) as AnyData;
  // 2026-10-15: an unrecorded qualification was filed as 5 (consumer), and a
  // recorded one ("physician") was written uncoded. It is the ICH code, or
  // omitted, and validateForE2BR3 warns (C.2.r.4).
  const code = qualificationCode(reporter);
  const qualification = code ? `\n      <qualification>${code}</qualification>` : '';

  return `    <primarysource>
      <reportertitle>${escapeXml(reporter.title || '')}</reportertitle>
      <reportergivename>${escapeXml(reporter.given_name || '')}</reportergivename>
      <reportermiddlename>${escapeXml(reporter.middle_name || '')}</reportermiddlename>
      <reporterfamilyname>${escapeXml(reporter.family_name || '')}</reporterfamilyname>
      <reporterorganization>${escapeXml(reporter.organization || '')}</reporterorganization>
      <reporterdepartment>${escapeXml(reporter.department || '')}</reporterdepartment>
      <reporterstreet>${escapeXml(reporter.address || '')}</reporterstreet>
      <reportercity>${escapeXml(reporter.city || '')}</reportercity>
      <reporterstate>${escapeXml(reporter.state || '')}</reporterstate>
      <reporterpostcode>${escapeXml(reporter.postal_code || '')}</reporterpostcode>
      <reportercountry>${escapeXml(reporter.country_code || reporter.country || '')}</reportercountry>${qualification}
    </primarysource>`;
}

/**
 * C.3 - Sender Information
 */
/**
 * The receiver block, from the receiver the case records, or nothing.
 * 2026-10-15: type 2, the EMA and EU were written for every case.
 */
function receiverBlock(event: CanonicalAdverseEvent): string {
  const receiver = (event.receiver || {}) as AnyData;
  const recorded: Array<[string, unknown]> = [
    ['receivertype', receiver.receiver_type],
    ['receiverorganization', receiver.receiver_organization],
    ['receivercountrycode', receiver.receiver_country],
  ];
  const fields = recorded
    .filter(([, value]) => value)
    .map(([element, value]) => `\n      <${element}>${escapeXml(String(value))}</${element}>`)
    .join('');
  return fields ? `\n    <receiver>${fields}\n    </receiver>` : '';
}

function generateSenderInformation(event: CanonicalAdverseEvent): string {
  const sender = (event.sender || {}) as AnyData;

  // Validated before generation. 2026-10-15: an unrecorded sender type was
  // filed as 2, which is a regulatory authority.
  return `    <sender>
      <sendertype>${escapeXml(String(sender.sender_type))}</sendertype>
      <senderorganization>${escapeXml(sender.sender_organization || '')}</senderorganization>
      <senderdepartment>${escapeXml(sender.sender_department || '')}</senderdepartment>
      <sendertitle>${escapeXml(sender.sender_title || '')}</sendertitle>
      <sendergivename>${escapeXml(sender.sender_given_name || '')}</sendergivename>
      <sendermiddlename>${escapeXml(sender.sender_middle_name || '')}</sendermiddlename>
      <senderfamilyname>${escapeXml(sender.sender_family_name || '')}</senderfamilyname>
      <senderstreetaddress>${escapeXml(sender.sender_street || '')}</senderstreetaddress>
      <sendercity>${escapeXml(sender.sender_city || '')}</sendercity>
      <senderstate>${escapeXml(sender.sender_state || '')}</senderstate>
      <senderpostcode>${escapeXml(sender.sender_postcode || '')}</senderpostcode>
      <sendercountrycode>${escapeXml(sender.sender_country || '')}</sendercountrycode>
      <sendertel>${escapeXml(sender.sender_telephone || '')}</sendertel>
      <senderfax>${escapeXml(sender.sender_fax || '')}</senderfax>
      <senderemailaddress>${escapeXml(sender.sender_email || '')}</senderemailaddress>
    </sender>${receiverBlock(event)}`;
}

/**
 * C.4 - Literature References
 */
function generateLiteratureReferences(event: CanonicalAdverseEvent): string {
  // Literature references from medical history or case metadata
  const refs = (event.medicalHistory as any)?.literature_references || [];

  if (refs.length === 0) return '';

  return refs
    .map(
      (ref: any) => `    <literaturereference>
      <literaturereference>${cdataWrap(ref.citation || ref)}</literaturereference>
    </literaturereference>`
    )
    .join('\n');
}

/**
 * D - Patient Characteristics
 */
function generatePatientInformation(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const patient = (event.patient || {}) as AnyData;
  const reactions = (event.reactions || []) as AnyData[];
  const medicalHistory = (event.medicalHistory || {}) as AnyData;
  const sexCode = mapSexCode(patient.sex);

  // Age, its unit as the E2B(R2) code (validated: a recorded age's unit
  // codes). 2026-10-15: the recorded unit was written uncoded ("yr"), and an
  // age computed from the birth date carried the UCUM 'a', 'mo' or 'd'.
  let ageSection = '';
  const ageUnit = patient.age ? e2bTimeUnitCode(patient.age_unit) : null;
  if (patient.age && ageUnit) {
    ageSection = `
      <patientonsetage>${patient.age}</patientonsetage>
      <patientonsetageunit>${ageUnit}</patientonsetageunit>`;
  } else if (patient.date_of_birth && event.eventDate) {
    const calculatedAge = calculateAge(patient.date_of_birth, event.eventDate);
    const calculatedUnit = calculatedAge ? e2bTimeUnitCode(calculatedAge.unit) : null;
    if (calculatedAge && calculatedUnit) {
      ageSection = `
      <patientonsetage>${calculatedAge.value}</patientonsetage>
      <patientonsetageunit>${calculatedUnit}</patientonsetageunit>`;
    }
  }

  // Age group
  let ageGroupSection = '';
  if (patient.age_group) {
    const ageGroupCode = E2B_AGE_GROUP[patient.age_group.toLowerCase()] || '';
    if (ageGroupCode) {
      ageGroupSection = `
      <patientagegroup>${ageGroupCode}</patientagegroup>`;
    }
  }

  // Weight in kg and height in cm, from the recorded unit (bodyMeasure), or
  // omitted with a warning.
  const weight = bodyMeasure('weight', patient.weight, patient.weight_unit);
  const weightSection = weight ? `
      <patientweight>${weight}</patientweight>` : '';
  const height = bodyMeasure('height', patient.height, patient.height_unit);
  const heightSection = height ? `
      <patientheight>${height}</patientheight>` : '';

  // Birth date
  let birthDateSection = '';
  if (patient.date_of_birth) {
    birthDateSection = `
      <patientbirthdateformat>102</patientbirthdateformat>
      <patientbirthdate>${formatE2BDate(patient.date_of_birth)}</patientbirthdate>`;
  }

  // Death information
  let deathSection = '';
  if (event.seriousnessDeath) {
    const deathDate =
      patient.death_date || reactions.find((r: AnyData) => r.outcome === 'fatal')?.end_date;
    deathSection = `
      <patientdeath>
        <patientdeathdate>${formatE2BDate(deathDate)}</patientdeathdate>
        <patientautopsyyesno>${patient.autopsy_performed ? '1' : '3'}</patientautopsyyesno>
      </patientdeath>`;
  }

  // Medical history. <patientmedicalcontinue> only when recorded (2026-10-15:
  // an unrecorded `ongoing` was filed as 2, not continuing).
  let medicalHistorySection = '';
  const conditions = medicalHistory.conditions || [];
  if (conditions.length > 0) {
    medicalHistorySection = conditions
      .map(
        (condition: any, idx: number) => `
      <medicalhistoryepisode>
        <patientepisodenamemeddraversion>${meddraVersion}</patientepisodenamemeddraversion>
        <patientepisodename>${escapeXml(meddraCode(condition) ?? '')}</patientepisodename>
        ${
          condition.start_date
            ? `<patientmedicalstartdateformat>102</patientmedicalstartdateformat>
        <patientmedicalstartdate>${formatE2BDate(condition.start_date)}</patientmedicalstartdate>`
            : ''
        }
        ${typeof condition.ongoing === 'boolean' ? `<patientmedicalcontinue>${condition.ongoing ? '1' : '2'}</patientmedicalcontinue>` : ''}
        ${
          condition.end_date
            ? `<patientmedicalenddateformat>102</patientmedicalenddateformat>
        <patientmedicalenddate>${formatE2BDate(condition.end_date)}</patientmedicalenddate>`
            : ''
        }
        ${condition.comments ? `<patientmedicalcomment>${cdataWrap(condition.comments)}</patientmedicalcomment>` : ''}
      </medicalhistoryepisode>`
      )
      .join('\n');
  }

  const sexSection = sexCode ? `\n      <patientsex>${sexCode}</patientsex>` : '';
  return `    <patient>
      <patientinitial>${escapeXml(patient.initials || '')}</patientinitial>${birthDateSection}${ageSection}${ageGroupSection}${sexSection}${weightSection}${heightSection}
      <gestationperiod>${patient.gestation_weeks || ''}</gestationperiod>
      <patientmedicalhistorytext>${cdataWrap(medicalHistory.summary || '')}</patientmedicalhistorytext>
      ${medicalHistorySection}${deathSection}
    </patient>`;
}

/**
 * E - Reactions/Events
 */
function generateReactions(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const reactions = (event.reactions || []) as AnyData[];

  return reactions
    .map((reaction: AnyData, index: number) => {
      const outcomeCode = mapOutcomeCode(reaction.outcome);

      // Validated before generation: term_code is MedDRA's (meddraCode).
      const code = escapeXml(meddraCode(reaction) ?? '');
      return `    <reaction>
      <primarysourcereaction>${cdataWrap(reaction.term || '')}</primarysourcereaction>
      <reactionmeddraversionllt>${meddraVersion}</reactionmeddraversionllt>
      <reactionmeddrallt>${escapeXml(reaction.meddra_llt_code) || code}</reactionmeddrallt>
      <reactionmeddraversionpt>${meddraVersion}</reactionmeddraversionpt>
      <reactionmeddrapt>${code}</reactionmeddrapt>
      ${
        reaction.onset_date
          ? `<reactionstartdateformat>102</reactionstartdateformat>
      <reactionstartdate>${formatE2BDate(reaction.onset_date)}</reactionstartdate>`
          : ''
      }
      ${
        reaction.end_date
          ? `<reactionenddateformat>102</reactionenddateformat>
      <reactionenddate>${formatE2BDate(reaction.end_date)}</reactionenddate>`
          : ''
      }
      ${
        reaction.duration
          ? `<reactionduration>${reaction.duration}</reactionduration>
      <reactiondurationunit>${e2bTimeUnitCode(reaction.duration_unit) ?? ''}</reactiondurationunit>`
          : ''
      }
      <reactionfirsttime>${reaction.time_to_onset_value || ''}</reactionfirsttime>
      <reactionfirsttimeunit>${e2bTimeUnitCode(reaction.time_to_onset_unit) ?? ''}</reactionfirsttimeunit>
      <reactionoutcome>${outcomeCode}</reactionoutcome>
    </reaction>`;
    })
    .join('\n');
}

/**
 * F - Test Results
 */
function generateTestResults(event: CanonicalAdverseEvent, meddraVersion: string): string {
  // MedicalHistory.relevant_tests (2026-10-15: read as lab_tests, which no field defines).
  const tests = event.medicalHistory?.relevant_tests || [];

  if (tests.length === 0) return '';

  return tests
    .map(
      (test: any) => `    <test>
      <testdateformat>102</testdateformat>
      <testdate>${formatE2BDate(test.date)}</testdate>
      <testname>${cdataWrap(test.test_name || '')}</testname>
      <testresult>${cdataWrap(test.result || '')}</testresult>
      <testunit>${escapeXml(test.result_unit || '')}</testunit>
      <lowtestrange>${test.low_range || ''}</lowtestrange>
      <hightestrange>${test.high_range || ''}</hightestrange>
      <moreinformation>${test.abnormal ? '1' : '2'}</moreinformation>
    </test>`
    )
    .join('\n');
}

/**
 * G - Drug Information
 */
function generateDrugInformation(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const suspectProducts = (event.suspectProducts || []) as AnyData[];
  const concomitantProducts = (event.concomitantProducts || []) as AnyData[];
  const reactions = (event.reactions || []) as AnyData[];

  const allProducts: AnyData[] = [
    ...suspectProducts.map((p: AnyData) => ({ ...p, role: 'suspect' })),
    ...concomitantProducts.map((p: AnyData) => ({ ...p, role: 'concomitant' })),
  ];

  return allProducts
    .map((product, index) => {
      const roleCode = E2B_DRUG_ROLE[product.role || 'suspect'] || '1';
      const actionCode = mapActionTakenCode(product.action_taken);
      const units = drugQuantityUnits(product);
      // 2026-10-15: an unrecorded rechallenge was filed as 3.
      const recurred = rechallengeCode(product.rechallenge);

      return `    <drug>
      <drugcharacterization>${roleCode}</drugcharacterization>
      <medicinalproduct>${cdataWrap(product.name || '')}</medicinalproduct>
      <obtaindrugcountry>${escapeXml(product.country_obtained || '')}</obtaindrugcountry>
      <drugbatchnumb>${escapeXml(product.batch_number || product.lot_number || '')}</drugbatchnumb>
      <drugauthorizationnumb>${escapeXml(product.authorization_number || '')}</drugauthorizationnumb>
      <drugauthorizationcountry>${escapeXml(product.authorization_country || '')}</drugauthorizationcountry>
      <drugauthorizationholder>${escapeXml(product.authorization_holder || product.manufacturer || '')}</drugauthorizationholder>
      <drugstructuredosagenumb>${doseNumber(product.dose) ?? ''}</drugstructuredosagenumb>
      <drugstructuredosageunit>${units.dose}</drugstructuredosageunit>
      <drugseparatedosagenumb>${product.number_of_units || ''}</drugseparatedosagenumb>
      <drugintervaldosageunitnumb>${product.frequency_value || ''}</drugintervaldosageunitnumb>
      <drugintervaldosagedefinition>${product.frequency_unit || ''}</drugintervaldosagedefinition>
      <drugcumulativedosagenumb>${product.cumulative_dose || ''}</drugcumulativedosagenumb>
      <drugcumulativedosageunit>${units.cumulative}</drugcumulativedosageunit>
      <drugdosagetext>${cdataWrap(product.dose_text || '')}</drugdosagetext>
      <drugdosageform>${escapeXml(product.dose_form || '')}</drugdosageform>
      <drugadministrationroute>${CODE_SYSTEMS.FDA_ROUTE[product.route?.toLowerCase()] || escapeXml(product.route || '')}</drugadministrationroute>
      <drugparadministration>${escapeXml(product.parent_route || '')}</drugparadministration>
      ${
        product.start_date
          ? `<drugstartdateformat>102</drugstartdateformat>
      <drugstartdate>${formatE2BDate(product.start_date)}</drugstartdate>`
          : ''
      }
      ${product.start_date_precision ? `<drugstartperiod>${product.start_date_precision}</drugstartperiod>` : ''}
      ${
        product.end_date
          ? `<drugenddateformat>102</drugenddateformat>
      <drugenddate>${formatE2BDate(product.end_date)}</drugenddate>`
          : ''
      }
      <drugtreatmentduration>${product.duration_value || ''}</drugtreatmentduration>
      <drugtreatmentdurationunit>${units.duration}</drugtreatmentdurationunit>
      <drugindication>${cdataWrap(product.indication || '')}</drugindication>
      <actiondrug>${actionCode}</actiondrug>${recurred ? `\n      <drugrecurreadministration>${recurred}</drugrecurreadministration>` : ''}
      ${product.additional_info ? `<drugadditional>${cdataWrap(product.additional_info)}</drugadditional>` : ''}
      ${generateActiveSubstances(product)}
      ${generateDrugReactionRelatedness(product, reactions, meddraVersion)}
    </drug>`;
    })
    .join('\n');
}

/**
 * A drug's unit codes, each from its recorded unit (validated before
 * generation), and empty where no quantity is recorded. 2026-10-15: the dose
 * unit was looked up in the age-unit table and fell back to 003 (mg) for every
 * drug, with or without a dose; the cumulative unit was written uncoded.
 */
function drugQuantityUnits(product: AnyData): { dose: string; cumulative: string; duration: string } {
  return {
    dose: product.dose ? e2bDoseUnitCode(product.dose_unit) ?? '' : '',
    cumulative: product.cumulative_dose ? e2bDoseUnitCode(product.cumulative_dose_unit) ?? '' : '',
    duration: product.duration_value ? e2bTimeUnitCode(product.duration_unit) ?? '' : '',
  };
}

/**
 * Generate active substances for a drug
 */
function generateActiveSubstances(product: any): string {
  const substances = product.active_substances || product.active_ingredients || [];

  if (substances.length === 0) {
    return product.generic_name
      ? `      <activesubstance>
        <activesubstancename>${escapeXml(product.generic_name)}</activesubstancename>
      </activesubstance>`
      : '';
  }

  return substances
    .map(
      (substance: any) => `      <activesubstance>
        <activesubstancename>${escapeXml(typeof substance === 'string' ? substance : substance.name || '')}</activesubstancename>
      </activesubstance>`
    )
    .join('\n');
}

/**
 * Generate drug-reaction relatedness assessment
 */
function generateDrugReactionRelatedness(
  product: any,
  reactions: any[],
  meddraVersion: string
): string {
  const assessments = product.causality_assessments || [];

  if (assessments.length === 0) return '';

  return assessments
    .map((assessment: any, idx: number) => {
      const reaction = reactions.find(r => meddraCode(r) === assessment.reaction_code);
      const causalityCode = E2B_CAUSALITY[assessment.assessment?.toLowerCase()] || '0';

      return `      <drugreactionrelatedness>
        <drugreactionassessmeddraversion>${meddraVersion}</drugreactionassessmeddraversion>
        <drugreactionasses>${escapeXml(meddraCode(reaction) ?? assessment.reaction_code ?? '')}</drugreactionasses>
        <drugassessmentsource>${escapeXml(assessment.source || '')}</drugassessmentsource>
        <drugassessmentmethod>${escapeXml(assessment.method || '')}</drugassessmentmethod>
        <drugresult>${escapeXml(assessment.result || assessment.assessment || '')}</drugresult>
      </drugreactionrelatedness>`;
    })
    .join('\n');
}

/**
 * H - Narrative Summary
 */
function generateNarrativeSummary(event: CanonicalAdverseEvent): string {
  const narrativeParts: string[] = [];

  if (event.caseNarrative) {
    narrativeParts.push(event.caseNarrative);
  }

  if (event.reporterComments) {
    narrativeParts.push(`Reporter Comments: ${event.reporterComments}`);
  }

  if (event.senderComments) {
    narrativeParts.push(`Sender Comments: ${event.senderComments}`);
  }

  const fullNarrative = narrativeParts.join('\n\n');

  return `    <summary>
      <narrativeincludeclinical>${cdataWrap(fullNarrative)}</narrativeincludeclinical>
      <reportercomment>${cdataWrap(event.reporterComments || '')}</reportercomment>
      <senderdiagnosismeddraversion></senderdiagnosismeddraversion>
      <senderdiagnosis></senderdiagnosis>
      <sendercomment>${cdataWrap(event.senderComments || '')}</sendercomment>
    </summary>`;
}
