/**
 * FDA MedWatch 3500A XML Export Generator
 *
 * Generates FDA-compliant XML for adverse event reporting per FDA MedWatch 3500A form.
 * This implementation follows the FDA HL7v3 Individual Case Safety Report (ICSR) format.
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
 * Format date for FDA submission
 */
function formatFDADate(date: Date | string | undefined, includeTime: boolean = false): string {
  if (!date) return '';

  if (includeTime) {
    // Datetime (e.g. message creation time): emit as UTC CCYYMMDDHHMMSS, matching
    // the sibling EMA generator's formatE2BDateTime.
    return new Date(date)
      .toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z/, '');
  }

  // Date-only output (CCYYMMDD). Do NOT round-trip through UTC: toISOString()
  // renders a non-UTC calendar date as the previous/next day, so a stored
  // 2026-03-15 could file as 20260314 — a data-integrity defect in a safety
  // report. The date is formatted timezone-agnostically instead.
  if (typeof date === 'string') {
    // Take the calendar date verbatim from the leading ISO date (YYYY-MM-DD),
    // ignoring any time-of-day or timezone portion. Never constructs a Date, so
    // the result is identical in every runtime timezone.
    const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
    }
  }

  // Date object (or non-ISO string): use the local calendar parts, which reflect
  // the date as constructed rather than after a UTC conversion. Mirrors
  // formatE2BDate in the sibling EMA generator.
  const d = new Date(date);
  const year = d.getFullYear().toString().padStart(4, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
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
  if (patient.weight_value && !ucumWeightUnit(patient.weight_unit)) {
    errors.push(fdaUnitError('patient.weight_unit', patient.weight_value, patient.weight_unit));
  }
  return errors;
}

/** Every recorded quantity's unit must code; none is assumed. */
function quantityUnitErrors(event: CanonicalAdverseEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  ((event.reactions || []) as AnyData[]).forEach((reaction, i) => {
    if (reaction.duration_value && !ucumTimeUnit(reaction.duration_unit)) {
      errors.push(fdaUnitError(`reactions[${i}].duration_unit`, reaction.duration_value, reaction.duration_unit));
    }
  });
  const lists = { suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts };
  for (const [list, products] of Object.entries(lists)) {
    ((products || []) as AnyData[]).forEach((product, i) => {
      if (product.dose_value && !ucumDoseUnit(product.dose_unit)) {
        errors.push(fdaUnitError(`${list}[${i}].dose_unit`, product.dose_value, product.dose_unit));
      }
      const periodStarted = product.frequency_value || product.frequency_unit;
      if (periodStarted && !(product.frequency_value && ucumTimeUnit(product.frequency_unit))) {
        errors.push(fdaUnitError(`${list}[${i}].frequency_unit`, product.frequency_value, product.frequency_unit));
      }
    });
  }
  return errors;
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
  if (!(event.reporter as AnyData | undefined)?.qualification) {
    warnings.push({
      code: 'FDA-W004',
      field: 'reporter.qualification',
      message: "Reporter qualification is not recorded; the reporter's role code is omitted, not assumed",
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

  if (!event.receiveDate) {
    errors.push({
      code: 'FDA-002',
      field: 'receiveDate',
      message: 'Receive date is required for FDA submission',
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
    if (!patient.age_value && !patient.birth_date && !patient.age) {
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
      if (!reaction.meddra_pt_code) {
        errors.push({
          code: 'FDA-005',
          field: `reactions[${index}].meddra_pt_code`,
          message: `Reaction ${index + 1}: MedDRA preferred term code is required`,
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
      if (!product.product_name && !product.name) {
        errors.push({
          code: 'FDA-007',
          field: `suspectProducts[${index}].product_name`,
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

  errors.push(...caseFactErrors(event), ...quantityUnitErrors(event));
  warnings.push(...omittedPartyWarnings(event));
  return { errors, warnings };
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
      <id root="2.16.840.1.113883.3.0" extension="${event.tenantId}"/>${senderName}
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
    fileName: `FDA_3500A_${event.caseNumber}_${formatFDADate(new Date())}.xml`,
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

  return `
        <!-- Report Type -->
        <component typeCode="COMP">
          <adverseEventAssessment classCode="INVSTG" moodCode="EVN">
            <code code="${reportTypeCode}"
              codeSystem="2.16.840.1.113883.6.163"
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
  return `<component typeCode="COMP">
              <observation classCode="OBS" moodCode="EVN">
                <code code="${code}" codeSystem="2.16.840.1.113883.6.163" displayName="${display}"/>
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
  if (patient.age_value && patient.age_unit) {
    const ageUnitCode = CODE_SYSTEMS.ICH_AGE_UNIT[patient.age_unit] || patient.age_unit;
    ageSection = `
            <component1 typeCode="COMP">
              <observationEvent classCode="OBS" moodCode="EVN">
                <code code="3137-7" codeSystem="2.16.840.1.113883.6.1" displayName="Age at onset"/>
                <value xsi:type="PQ" value="${patient.age_value}" unit="${ageUnitCode}"/>
              </observationEvent>
            </component1>`;
  } else if (patient.birth_date) {
    ageSection = `
            <birthTime value="${formatFDADate(patient.birth_date)}"/>`;
  }

  let weightSection = '';
  if (patient.weight_value) {
    // Validated before generation. 2026-10-15: an unrecorded unit was filed as kg.
    const weightUnit = ucumWeightUnit(patient.weight_unit) ?? '';
    weightSection = `
            <component1 typeCode="COMP">
              <observationEvent classCode="OBS" moodCode="EVN">
                <code code="3141-9" codeSystem="2.16.840.1.113883.6.1" displayName="Body weight"/>
                <value xsi:type="PQ" value="${patient.weight_value}" unit="${weightUnit}"/>
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
                ${condition.start_date ? `<effectiveTime><low value="${formatFDADate(condition.start_date)}"/></effectiveTime>` : ''}
                ${condition.ongoing ? '<statusCode code="active"/>' : '<statusCode code="completed"/>'}
              </observationEvent>`
      )
      .join('\n');

    medicalHistorySection = `
            <!-- Medical History -->
            <component2 typeCode="COMP">
              <organizer classCode="CLUSTER" moodCode="EVN">
                <code code="29762-2" codeSystem="2.16.840.1.113883.6.1" displayName="Medical history"/>
                ${conditions}
              </organizer>
            </component2>`;
  }

  return `
        <!-- Patient Information -->
        <primaryRole classCode="INVSBJ">
          <player1 classCode="PSN" determinerCode="INSTANCE">
            ${patient.patient_initials ? `<name>${escapeXml(patient.patient_initials)}</name>` : ''}
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
  if (!condition.meddra_code) {
    return `<code nullFlavor="NI"><originalText>${escapeXml(condition.condition_term || '')}</originalText></code>`;
  }
  return `<code code="${escapeXml(condition.meddra_code)}"
                  codeSystem="2.16.840.1.113883.6.163"
                  codeSystemVersion="${meddraVersion}"
                  displayName="${escapeXml(condition.condition_term || condition.meddra_code)}"/>`;
}

/**
 * Generate reactions section
 */
function generateReactionsSection(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const reactions = (event.reactions || []) as AnyData[];

  const reactionComponents = reactions
    .map((reaction: AnyData, index: number) => {
      const outcomeCode = CODE_SYSTEMS.ICH_OUTCOME[reaction.outcome || 'unknown'] || '0';

      return `
          <!-- Reaction ${index + 1} -->
          <component typeCode="COMP">
            <adverseEffectAssessment classCode="OBS" moodCode="EVN">
              <code code="PROBLEM" codeSystem="2.16.840.1.113883.5.4"/>
              <effectiveTime>
                ${reaction.onset_date ? `<low value="${formatFDADate(reaction.onset_date)}"/>` : ''}
                ${reaction.resolution_date ? `<high value="${formatFDADate(reaction.resolution_date)}"/>` : ''}
              </effectiveTime>

              <!-- MedDRA Term -->
              <value xsi:type="CD"
                code="${escapeXml(reaction.meddra_pt_code)}"
                codeSystem="2.16.840.1.113883.6.163"
                codeSystemVersion="${meddraVersion}"
                displayName="${escapeXml(reaction.meddra_pt || reaction.reaction_term || '')}">
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
                reaction.duration_value
                  ? `
              <entryRelationship typeCode="MFST">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="DURATION" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="PQ" value="${reaction.duration_value}" unit="${ucumTimeUnit(reaction.duration_unit) ?? ''}"/>
                </observation>
              </entryRelationship>`
                  : ''
              }

              <!-- Outcome -->
              <entryRelationship typeCode="OUTC">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="OUTCOME" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="CD" code="${outcomeCode}"
                    codeSystem="2.16.840.1.113883.6.163"
                    displayName="${reaction.outcome || 'unknown'}"/>
                </observation>
              </entryRelationship>
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
  const roleCode = role === 'suspect' ? '1' : '2';
  const rechallenge = rechallengeText(product.rechallenge);

  return `
          <!-- ${role === 'suspect' ? 'Suspect' : 'Concomitant'} Product ${index + 1} -->
          <component typeCode="COMP">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <id extension="${escapeXml(product.product_id || `PROD-${index + 1}`)}"/>

              <!-- Role (Suspect/Concomitant) -->
              <code code="${roleCode}" codeSystem="2.16.840.1.113883.6.163" displayName="${role}"/>

              <!-- Route -->${routeElement(product)}

              <!-- Dosage -->${doseElement(product)}

              <!-- Frequency -->${periodElement(product)}

              <!-- Dates -->
              ${
                product.start_date || product.stop_date
                  ? `
              <effectiveTime xsi:type="IVL_TS">
                ${product.start_date ? `<low value="${formatFDADate(product.start_date)}"/>` : ''}
                ${product.stop_date ? `<high value="${formatFDADate(product.stop_date)}"/>` : ''}
              </effectiveTime>`
                  : ''
              }

              <!-- Product Details -->
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <manufacturedMaterialKind>${ndcElement(product)}
                    <name>${escapeXml(product.product_name || '')}</name>
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
                  <code code="C53254" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Action Taken"/>
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
 * The route, only when recorded. 2026-10-15: an unrecorded route was coded
 * "unknown". An unmapped recorded route is written as recorded, escaped, since
 * a quote in it broke the attribute (that note used to be an XML comment
 * emitted into every document).
 */
function routeElement(product: AnyData): string {
  if (!product.route) return '';
  const routeCode = CODE_SYSTEMS.FDA_ROUTE[String(product.route).toLowerCase()] || product.route;
  return `
              <routeCode code="${escapeXml(routeCode)}" codeSystem="2.16.840.1.113883.5.112" displayName="${escapeXml(product.route)}"/>`;
}

/** The dose in its recorded unit (validated, FDA-011). 2026-10-15: an unrecorded unit was filed as mg. */
function doseElement(product: AnyData): string {
  if (!product.dose_value) return '';
  return `
              <doseQuantity value="${product.dose_value}" unit="${ucumDoseUnit(product.dose_unit) ?? ''}"/>`;
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
 * The NDC, only when one is recorded. 2026-10-15: this fell back to the
 * internal product id, then to "unknown", in the NDC code system.
 */
function ndcElement(product: AnyData): string {
  if (!product.ndc_code) return '';
  return `
                    <code code="${escapeXml(product.ndc_code)}"
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
                reporter.street_address || reporter.city || reporter.country
                  ? `
              <addr>
                ${reporter.street_address ? `<streetAddressLine>${escapeXml(reporter.street_address)}</streetAddressLine>` : ''}
                ${reporter.city ? `<city>${escapeXml(reporter.city)}</city>` : ''}
                ${reporter.state_province ? `<state>${escapeXml(reporter.state_province)}</state>` : ''}
                ${reporter.postal_code ? `<postalCode>${escapeXml(reporter.postal_code)}</postalCode>` : ''}
                ${reporter.country ? `<country>${escapeXml(reporter.country)}</country>` : ''}
              </addr>`
                  : ''
              }
              ${
                reporter.telephone
                  ? `
              <telecom value="tel:${escapeXml(reporter.telephone)}"/>`
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
  if (!reporter.qualification) return id;
  const displayName = reporter.qualification_text ? ` displayName="${escapeXml(reporter.qualification_text)}"` : '';
  return `${id}
            <code code="${escapeXml(String(reporter.qualification))}" codeSystem="2.16.840.1.113883.6.163"${displayName}/>`;
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
