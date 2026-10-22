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
  casePartyProblems,
  meddraVersionCheck,
  recordedDate,
  RecordedDate,
  DatePrecision,
  caseDateFields,
  isRecorded,
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
 * E2B(R2) date-format codes by recorded precision, as this repository's E2B
 * reference shows them: 102 with CCYYMMDD and 610 with CCYYMM
 * (data/test_output/ingestion_00093_7146.json, FAERS records in the E2B(R2)
 * vocabulary). It shows no year-only code, so a date recorded to the year is
 * omitted with a warning. 2026-10-15: every date was written as 102 (CCYYMMDD),
 * whatever precision was recorded, through local-time getters that filed
 * '2026-03-15' as 20260314 west of UTC.
 */
const E2B_DATE_FORMAT: Partial<Record<DatePrecision, string>> = { day: '102', month: '610' };

/** A recorded date as its E2B format code and digits, or null when it cannot be written as recorded. */
function e2bDate(value: unknown, precision?: unknown): { format: string; digits: string } | null {
  const date = recordedDate(value, precision);
  const format = date ? E2B_DATE_FORMAT[date.precision] : undefined;
  return date && format ? { format, digits: date.digits } : null;
}

/** `<{element}format>` and `<{element}>` for a recorded date, each on its own line, or '' (validateForE2BR3 warns). */
function e2bDateElements(element: string, value: unknown, precision?: unknown, indent = '      '): string {
  const date = e2bDate(value, precision);
  return date ? `\n${indent}<${element}format>${date.format}</${element}format>\n${indent}<${element}>${date.digits}</${element}>` : '';
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
 * The age at onset from a birth date and an event date, both recorded to the
 * day; null otherwise. 2026-10-15: it was computed from whatever the dates
 * parsed to, so a birth year became an age from an invented 1 January.
 */
function calculateAge(
  birth: RecordedDate | null,
  onset: RecordedDate | null
): { value: number; unit: string } | null {
  if (birth?.precision !== 'day' || onset?.precision !== 'day') return null;
  const ymd = (d: RecordedDate) => [d.digits.slice(0, 4), d.digits.slice(4, 6), d.digits.slice(6)].map(Number);
  const [by, bm, bd] = ymd(birth);
  const [ey, em, ed] = ymd(onset);
  const days = (Date.UTC(ey, em - 1, ed) - Date.UTC(by, bm - 1, bd)) / 86_400_000;
  if (days < 0) return null;

  const years = ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0);
  if (years >= 1) return { value: years, unit: 'a' };
  // Months for infants, days for neonates
  const months = (ey - by) * 12 + (em - bm) - (ed < bd ? 1 : 0);
  if (months >= 1) return { value: months, unit: 'mo' };
  return { value: days, unit: 'd' };
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
 * The code a recorded value names in `table`: the value named (spaces, hyphens
 * or underscores), or one of the table's codes; null when nothing is recorded
 * or it names none. Used for reactionoutcome (E2B_OUTCOME) and actiondrug
 * (E2B_ACTION_TAKEN). 2026-10-15: an unrecorded outcome was filed as 6 and an
 * unrecorded action as 5 (unknown), and recorded text was matched by
 * substring: not_recovered was filed as 1 (recovered), "not stopped" as 1
 * (withdrawn), and dose_not_changed as 5.
 */
function recordedCode(value: unknown, table: Record<string, string>): string | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const key = text.replace(/[\s-]+/g, '_');
  if (key && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  return text && Object.values(table).includes(text) ? text : null;
}

/**
 * drugadministrationroute for a route recorded as an E2B route code (three
 * digits, as this repository's E2B reference carries it: "048" in
 * data/test_output/ingestion_00093_7146.json), or null. 2026-10-15: FDA_ROUTE's
 * NCI C-code (C38288 for oral), or the recorded text, was written into it.
 */
const e2bRouteCode = (route: unknown): string | null => {
  const text = typeof route === 'string' ? route.trim() : '';
  return /^\d{3}$/.test(text) ? text : null;
};

/** patientautopsyyesno for a recorded autopsy: done (1) or not (2); null when not recorded (2026-10-15: 3, unknown, for both). */
const autopsyCode = (done: unknown): string | null => (done === true ? '1' : done === false ? '2' : null);

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
    // 2026-10-15: both were written as 2 for every case; no field records either.
    warning('E2B-W-duplicate', 'duplicate', 'Whether other case identifiers were sent in previous transmissions is not recorded; duplicate is omitted, not assumed'),
    warning('E2B-W-additionaldocument', 'additionaldocument', 'Whether additional documents are available is not recorded; additionaldocument is omitted, not assumed'),
  ];
  // 2026-10-15: the tenant id was written as the sender's identifier.
  if (!(event.sender as AnyData | undefined)?.sender_identifier) {
    warnings.push(warning(
      'E2B-W-M.1.5',
      'sender.sender_identifier',
      "M.1.5 - The sender's identifier is not recorded; messagesenderidentifier is omitted (the tenant id is not one)"
    ));
  }
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

/** The date of death recorded: patient.death_date, else a fatal reaction's end date, each with its recorded precision. */
function recordedDeathDate(event: CanonicalAdverseEvent): { field: string; value: unknown; precision: unknown } {
  const patient = (event.patient || {}) as AnyData;
  if (patient.death_date) return { field: 'patient.death_date', value: patient.death_date, precision: patient.death_date_precision };
  const reactions = (event.reactions || []) as AnyData[];
  const fatal = reactions.findIndex(r => r.outcome === 'fatal');
  const reaction = reactions[fatal] ?? {};
  return { field: `reactions[${fatal}].end_date`, value: reaction.end_date, precision: reaction.end_date_precision };
}

/**
 * Each recorded date the export cannot write as recorded, which it omits: one
 * recorded to the year (no year-only format code is verified here) or one that
 * is not a calendar date. The receive date is required, so it is an error.
 */
function dateFindings(event: CanonicalAdverseEvent): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const patient = (event.patient || {}) as AnyData;
  const death = event.seriousnessDeath ? recordedDeathDate(event) : null;
  const dates: Array<[string, unknown, unknown]> = [
    ...caseDateFields(event),
    ['mostRecentInfoDate', event.mostRecentInfoDate, undefined],
    ...((event.medicalHistory?.relevant_tests || []) as AnyData[]).map((t, i): [string, unknown, unknown] => [`medicalHistory.relevant_tests[${i}].date`, t.date, undefined]),
    ...(death ? [[death.field, death.value, death.precision] as [string, unknown, unknown]] : []),
  ];
  const why = (value: unknown, precision: unknown) =>
    recordedDate(value, precision)
      ? 'is recorded to the year only, and no year-only E2B date format is verified here'
      : `("${String(value)}") is not a calendar date (YYYY, YYYY-MM or YYYY-MM-DD)`;
  const warnings: ValidationWarning[] = dates
    .filter(([, value, precision]) => isRecorded(value) && !e2bDate(value, precision))
    .map(([field, value, precision]) => ({ code: 'E2B-W-DATE', field, message: `${field} ${why(value, precision)}; it is omitted`, severity: 'warning' as const }));
  if (!patient.age && patient.date_of_birth && !calculateAge(recordedDate(patient.date_of_birth, patient.date_of_birth_precision), recordedDate(event.eventDate, event.eventDatePrecision))) {
    warnings.push({ code: 'E2B-W-D.2.2', field: 'patient.date_of_birth', message: 'The age at onset is not computed: the birth date and the event date are not both recorded to the day', severity: 'warning' });
  }
  const errors = event.receiveDate && !e2bDate(event.receiveDate, 'day')
    ? [caseError('E2B-C.1.4', 'receiveDate', `C.1.4 - The receive date ${why(event.receiveDate, undefined)}; it is required`)]
    : [];
  return { errors, warnings };
}

/** Coded drug, reaction and patient values are written only as recorded; this names each one omitted (2026-10-15). */
function unrecordedCodedValueWarnings(event: CanonicalAdverseEvent): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message, severity: 'warning' });
  const omitted = (what: string, value: unknown, element: string) =>
    isRecorded(value)
      ? `${what} is recorded as "${String(value)}", which has no E2B code here; ${element} is omitted`
      : `${what} is not recorded; ${element} is omitted, not filed as unknown`;
  ((event.reactions || []) as AnyData[]).forEach((reaction, i) => {
    if (!recordedCode(reaction.outcome, E2B_OUTCOME)) {
      warn('E2B-W-reactionoutcome', `reactions[${i}].outcome`, omitted(`Reaction ${i + 1}'s outcome`, reaction.outcome, 'reactionoutcome'));
    }
  });
  const lists = { suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts };
  for (const [list, products] of Object.entries(lists)) {
    ((products || []) as AnyData[]).forEach((product, i) => {
      const name = String(product.name ?? `product ${i + 1}`);
      if (!recordedCode(product.action_taken, E2B_ACTION_TAKEN)) {
        warn('E2B-W-actiondrug', `${list}[${i}].action_taken`, omitted(`The action taken with ${name}`, product.action_taken, 'actiondrug'));
      }
      if (!product.authorization_holder) {
        warn('E2B-W-drugauthorizationholder', `${list}[${i}].authorization_holder`,
          `The authorization holder of ${name} is not recorded; drugauthorizationholder is omitted, and the manufacturer is not assumed to hold it`);
      }
      if (isRecorded(product.route) && !e2bRouteCode(product.route)) {
        warn('E2B-W-drugadministrationroute', `${list}[${i}].route`,
          `The route of ${name} is recorded as "${String(product.route)}", not as an E2B route code (three digits); drugadministrationroute is omitted, and no code is filed for it by guess`);
      }
    });
  }
  if (event.seriousnessDeath && !autopsyCode((event.patient as AnyData | undefined)?.autopsy_performed)) {
    warn('E2B-W-patientautopsyyesno', 'patient.autopsy_performed', omitted('Whether an autopsy was done (true or false)', (event.patient as AnyData | undefined)?.autopsy_performed, 'patientautopsyyesno'));
  }
  if ((event.medicalHistory?.relevant_tests || []).length > 0) {
    warn('E2B-W-moreinformation', 'moreinformation',
      'Whether more information is available for the test results is not recorded (whether a result was abnormal does not say); moreinformation is omitted');
  }
  return warnings;
}

/** The sender and receiver are written as recorded or refused, by the rules intake applies (casePartyProblems). */
const partyErrors = (event: CanonicalAdverseEvent): ValidationError[] =>
  [...casePartyProblems('sender', event.sender), ...casePartyProblems('receiver', event.receiver)].map(p =>
    caseError('E2B-PARTY', p.field, p.message)
  );

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

  const dates = dateFindings(event);
  errors.push(...caseFactErrors(event), ...quantityUnitErrors(event), ...partyErrors(event), ...dates.errors);
  warnings.push(...omittedCountryWarnings(event), ...unrecordedHeaderWarnings(event), ...unrecordedCodedValueWarnings(event), ...dates.warnings);
  return { errors, warnings };
}

/**
 * A reaction coded in another MedDRA version than the job's lock is refused;
 * one that records no version is filed under the lock, and the export says so.
 */
function meddraVersionFindings(event: CanonicalAdverseEvent, locked: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const { conflicts, unrecorded } = meddraVersionCheck(event.reactions, locked);
  return {
    errors: conflicts.map(c => caseError(
      'E2B-MEDDRA-VERSION-MISMATCH',
      `reactions[${c.index}].term_version`,
      `Reaction ${c.index + 1} (${c.term}) is coded in MedDRA ${c.recorded}, and this export job locks MedDRA ${locked}; a code is not filed under a version it was not coded in`
    )),
    warnings: unrecorded.map(u => ({
      code: 'E2B-W-MEDDRA-VERSION',
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

  const messageId = generateUUID();
  const creationTime = formatE2BDateTime(new Date());

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
    <messagenumb>${messageId}</messagenumb>${messagePartyIdentifiers(event)}
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
    fileName: `E2B_R2_${event.caseNumber}_${recordedDate(new Date())?.digits ?? ''}.xml`,
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
 * messagesenderidentifier and messagereceiveridentifier, each only as the case
 * records it (validateForE2BR3 warns, M.1.5 / M.1.6). 2026-10-15: the sender
 * was the tenant id, and the receiver EVCTM (the clinical-trial module), for
 * every case.
 */
function messagePartyIdentifiers(event: CanonicalAdverseEvent): string {
  const element = (name: string, value: unknown) => (value ? `\n    <${name}>${escapeXml(String(value))}</${name}>` : '');
  return (
    element('messagesenderidentifier', (event.sender as AnyData | undefined)?.sender_identifier) +
    element('messagereceiveridentifier', (event.receiver as AnyData | undefined)?.receiver_identifier)
  );
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
  // refused in validation). <additionaldocument> and <duplicate> are not
  // written (2026-10-15): both were 2 for every case, and no field records either.
  const nullification = NOT_A_NULLIFICATION.has(String(event.reportType))
    ? '\n    <casenullification>2</casenullification>'
    : '';
  // Dates as recorded (e2bDateElements); the transmission date is today's UTC
  // date, as messagedate is UTC.
  return `    <safetyreportversion>${event.caseVersion || 1}</safetyreportversion>
    <safetyreportid>${escapeXml(event.caseNumber)}</safetyreportid>${sourceCountry}${occurCountry}${e2bDateElements('transmissiondate', new Date(), 'day', '    ')}
    <reporttype>${reportType}</reporttype>
    ${seriousnessSection}${e2bDateElements('receivedate', event.receiveDate, undefined, '    ')}${e2bDateElements('receiptdate', event.mostRecentInfoDate || event.receiveDate, undefined, '    ')}
    <authoritynumb>${escapeXml(event.worldwideCaseId || '')}</authoritynumb>
    <companynumb>${escapeXml(event.caseNumber)}</companynumb>${nullification}`;
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
    const calculatedAge = calculateAge(
      recordedDate(patient.date_of_birth, patient.date_of_birth_precision),
      recordedDate(event.eventDate, event.eventDatePrecision)
    );
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

  // Birth date, as recorded (e2bDateElements)
  const birthDateSection = e2bDateElements('patientbirthdate', patient.date_of_birth, patient.date_of_birth_precision);

  // Death information
  let deathSection = '';
  if (event.seriousnessDeath) {
    const death = recordedDeathDate(event);
    const autopsy = autopsyCode(patient.autopsy_performed);
    deathSection = `
      <patientdeath>${e2bDateElements('patientdeathdate', death.value, death.precision, '        ')}${autopsy ? `
        <patientautopsyyesno>${autopsy}</patientautopsyyesno>` : ''}
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
        <patientepisodename>${escapeXml(meddraCode(condition) ?? '')}</patientepisodename>${e2bDateElements('patientmedicalstartdate', condition.start_date, condition.start_date_precision, '        ')}
        ${typeof condition.ongoing === 'boolean' ? `<patientmedicalcontinue>${condition.ongoing ? '1' : '2'}</patientmedicalcontinue>` : ''}${e2bDateElements('patientmedicalenddate', condition.end_date, condition.end_date_precision, '        ')}
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
      // As recorded, or omitted (validateForE2BR3 warns).
      const outcomeCode = recordedCode(reaction.outcome, E2B_OUTCOME);

      // Validated before generation: term_code is MedDRA's (meddraCode).
      const code = escapeXml(meddraCode(reaction) ?? '');
      return `    <reaction>
      <primarysourcereaction>${cdataWrap(reaction.term || '')}</primarysourcereaction>
      <reactionmeddraversionllt>${meddraVersion}</reactionmeddraversionllt>
      <reactionmeddrallt>${escapeXml(reaction.meddra_llt_code) || code}</reactionmeddrallt>
      <reactionmeddraversionpt>${meddraVersion}</reactionmeddraversionpt>
      <reactionmeddrapt>${code}</reactionmeddrapt>${e2bDateElements('reactionstartdate', reaction.onset_date, reaction.onset_date_precision)}${e2bDateElements('reactionenddate', reaction.end_date, reaction.end_date_precision)}
      ${
        reaction.duration
          ? `<reactionduration>${reaction.duration}</reactionduration>
      <reactiondurationunit>${e2bTimeUnitCode(reaction.duration_unit) ?? ''}</reactiondurationunit>`
          : ''
      }
      <reactionfirsttime>${reaction.time_to_onset_value || ''}</reactionfirsttime>
      <reactionfirsttimeunit>${e2bTimeUnitCode(reaction.time_to_onset_unit) ?? ''}</reactionfirsttimeunit>${outcomeCode ? `
      <reactionoutcome>${outcomeCode}</reactionoutcome>` : ''}
    </reaction>`;
    })
    .join('\n');
}

/**
 * F - Test Results
 */
function generateTestResults(event: CanonicalAdverseEvent, meddraVersion: string): string {
  // MedicalHistory.relevant_tests (2026-10-15: read as lab_tests, which no field defines).
  // <moreinformation> is not written (2026-10-15): it was 1 or 2 from whether
  // the result was abnormal, which is not what it says; no field records it.
  const tests = event.medicalHistory?.relevant_tests || [];

  if (tests.length === 0) return '';

  return tests
    .map(
      (test: any) => `    <test>${e2bDateElements('testdate', test.date)}
      <testname>${cdataWrap(test.test_name || '')}</testname>
      <testresult>${cdataWrap(test.result || '')}</testresult>
      <testunit>${escapeXml(test.result_unit || '')}</testunit>
      <lowtestrange>${test.low_range || ''}</lowtestrange>
      <hightestrange>${test.high_range || ''}</hightestrange>
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
      // The action taken and the authorization holder as recorded, or omitted
      // (validateForE2BR3 warns). 2026-10-15: an unrecorded action was 5
      // (unknown), and the holder was the manufacturer when none was recorded.
      // <drugstartperiod>, an interval, held the start date's precision word.
      const actionCode = recordedCode(product.action_taken, E2B_ACTION_TAKEN);
      const holder = product.authorization_holder
        ? `\n      <drugauthorizationholder>${escapeXml(String(product.authorization_holder))}</drugauthorizationholder>`
        : '';
      const routeCode = e2bRouteCode(product.route);
      const units = drugQuantityUnits(product);
      // 2026-10-15: an unrecorded rechallenge was filed as 3.
      const recurred = rechallengeCode(product.rechallenge);

      return `    <drug>
      <drugcharacterization>${roleCode}</drugcharacterization>
      <medicinalproduct>${cdataWrap(product.name || '')}</medicinalproduct>
      <obtaindrugcountry>${escapeXml(product.country_obtained || '')}</obtaindrugcountry>
      <drugbatchnumb>${escapeXml(product.batch_number || product.lot_number || '')}</drugbatchnumb>
      <drugauthorizationnumb>${escapeXml(product.authorization_number || '')}</drugauthorizationnumb>
      <drugauthorizationcountry>${escapeXml(product.authorization_country || '')}</drugauthorizationcountry>${holder}
      <drugstructuredosagenumb>${doseNumber(product.dose) ?? ''}</drugstructuredosagenumb>
      <drugstructuredosageunit>${units.dose}</drugstructuredosageunit>
      <drugseparatedosagenumb>${product.number_of_units || ''}</drugseparatedosagenumb>
      <drugintervaldosageunitnumb>${product.frequency_value || ''}</drugintervaldosageunitnumb>
      <drugintervaldosagedefinition>${product.frequency_unit || ''}</drugintervaldosagedefinition>
      <drugcumulativedosagenumb>${product.cumulative_dose || ''}</drugcumulativedosagenumb>
      <drugcumulativedosageunit>${units.cumulative}</drugcumulativedosageunit>
      <drugdosagetext>${cdataWrap(product.dose_text || '')}</drugdosagetext>
      <drugdosageform>${escapeXml(product.dose_form || '')}</drugdosageform>${routeCode ? `\n      <drugadministrationroute>${routeCode}</drugadministrationroute>` : ''}
      <drugparadministration>${escapeXml(product.parent_route || '')}</drugparadministration>${e2bDateElements('drugstartdate', product.start_date, product.start_date_precision)}${e2bDateElements('drugenddate', product.end_date, product.end_date_precision)}
      <drugtreatmentduration>${product.duration_value || ''}</drugtreatmentduration>
      <drugtreatmentdurationunit>${units.duration}</drugtreatmentdurationunit>
      <drugindication>${cdataWrap(product.indication || '')}</drugindication>${actionCode ? `\n      <actiondrug>${actionCode}</actiondrug>` : ''}${recurred ? `\n      <drugrecurreadministration>${recurred}</drugrecurreadministration>` : ''}
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
