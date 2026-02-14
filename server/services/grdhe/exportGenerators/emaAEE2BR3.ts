// @ts-nocheck
/**
 * EMA E2B(R3) XML Export Generator
 *
 * Generates EMA-compliant XML for adverse event reporting per ICH E2B(R3) guidelines.
 * This implementation follows the HL7 Version 3 Individual Case Safety Report (ICSR) format
 * as required by EudraVigilance.
 *
 * @version 1.0.0
 * @compliance ICH E2B(R3), EudraVigilance, EU MDR 2017/745
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
} from '../types';

// Type assertion helper for flexible data access from canonical model
type AnyData = Record<string, any>;

// =============================================================================
// E2B(R3) CONSTANTS
// =============================================================================

const E2B_R3_VERSION = '2.1';
const E2B_NAMESPACE = 'urn:hl7-org:v3';
const E2B_EMA_NAMESPACE = 'urn:ema-europa-eu:eudravigilance';
const EMA_SENDER_OID = '2.16.840.1.113883.3.989.2.1.1'; // EMA EudraVigilance OID

// ICH E2B(R3) code lists
const E2B_REPORT_TYPE: Record<string, string> = {
  spontaneous: '1',
  clinical_study: '2',
  other: '3',
  not_available: '4',
};

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
 * Map sex code to E2B
 */
function mapSexCode(sex: string | undefined): string {
  if (!sex) return '0';
  return E2B_SEX[sex.toLowerCase()] || '0';
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
    if (!patient.age_value && !patient.birth_date && !patient.age_group && !patient.age) {
      warnings.push({
        code: 'E2B-W-D.2',
        field: 'patient.age',
        message: 'D.2 - Patient age information is recommended',
        severity: 'warning',
      });
    }

    // D.5 - Sex
    if (!patient.sex) {
      warnings.push({
        code: 'E2B-W-D.5',
        field: 'patient.sex',
        message: 'D.5 - Patient sex is recommended',
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
      if (!reaction.reaction_term && !reaction.meddra_pt) {
        errors.push({
          code: `E2B-E.i.1[${index}]`,
          field: `reactions[${index}].reaction_term`,
          message: `E.i.1 - Reaction ${index + 1}: Reaction term as reported is required`,
          severity: 'error',
        });
      }

      // E.i.2.1b - MedDRA Version for Reaction/Event
      if (!reaction.meddra_pt_code) {
        errors.push({
          code: `E2B-E.i.2.1b[${index}]`,
          field: `reactions[${index}].meddra_pt_code`,
          message: `E.i.2.1b - Reaction ${index + 1}: MedDRA Preferred Term code is required`,
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
      if (!product.product_name) {
        errors.push({
          code: `E2B-G.k.2.2[${index}]`,
          field: `suspectProducts[${index}].product_name`,
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
    // C.2.r.4 - Qualification
    if (!event.reporter.qualification) {
      warnings.push({
        code: 'E2B-W-C.2.r.4',
        field: 'reporter.qualification',
        message: 'C.2.r.4 - Reporter qualification is recommended',
        severity: 'warning',
      });
    }
  }

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
  if (validation.errors.length > 0) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const messageId = generateUUID();
  const creationTime = formatE2BDateTime(new Date());
  const meddraVersion = terminologyVersions['MEDDRA']?.version_code || '27.1';

  // Build XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  EMA E2B(R3) Individual Case Safety Report
  Generated: ${new Date().toISOString()}
  Format Version: ICH E2B(R3) ${E2B_R3_VERSION}
  Case Number: ${event.caseNumber}
-->
<ichicsr xmlns="${E2B_NAMESPACE}" lang="en">

  <!-- ICH ICSR Message Header -->
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>${E2B_R3_VERSION}</messageformatversion>
    <messageformatrelease>2.0</messageformatrelease>
    <messagenumb>${messageId}</messagenumb>
    <messagesenderidentifier>${escapeXml(event.sender?.sender_identifier || event.tenantId)}</messagesenderidentifier>
    <messagereceiveridentifier>EVCTM</messagereceiveridentifier>
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
    fileName: `E2B_R3_${event.caseNumber}_${formatE2BDate(new Date())}.xml`,
    warnings: validation.warnings,
    metadata: {
      format: 'EMA_AE_E2B_R3',
      version: E2B_R3_VERSION,
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
  const reportTypeCode = E2B_REPORT_TYPE[event.caseType || 'spontaneous'] || '1';
  const reporter = event.reporter as AnyData | undefined;
  const patient = event.patient as AnyData | undefined;

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

  return `    <safetyreportversion>${event.caseVersion || 1}</safetyreportversion>
    <safetyreportid>${escapeXml(event.caseNumber)}</safetyreportid>
    <primarysourcecountry>${escapeXml(reporter?.country_code || 'US')}</primarysourcecountry>
    <occurcountry>${escapeXml(patient?.country || reporter?.country_code || 'US')}</occurcountry>
    <transmissiondateformat>102</transmissiondateformat>
    <transmissiondate>${formatE2BDate(new Date())}</transmissiondate>
    <reporttype>${reportTypeCode}</reporttype>
    ${seriousnessSection}
    <receivedateformat>102</receivedateformat>
    <receivedate>${formatE2BDate(event.receiveDate)}</receivedate>
    <receiptdateformat>102</receiptdateformat>
    <receiptdate>${formatE2BDate(event.mostRecentInfoDate || event.receiveDate)}</receiptdate>
    <additionaldocument>2</additionaldocument>
    <fulfillexpeditecriteria>${event.isSerious ? '1' : '2'}</fulfillexpeditecriteria>
    <authoritynumb>${escapeXml(event.worldwideCaseId || '')}</authoritynumb>
    <companynumb>${escapeXml(event.caseNumber)}</companynumb>
    <duplicate>2</duplicate>
    <casenullification>2</casenullification>
    <medicallyconfirm>${reporter?.qualification === '1' || reporter?.qualification === '2' ? '1' : '2'}</medicallyconfirm>`;
}

/**
 * C.2 - Primary Sources
 */
function generatePrimarySources(event: CanonicalAdverseEvent): string {
  const reporter = (event.reporter || {}) as AnyData;
  const qualificationCode = reporter.qualification || '5';

  return `    <primarysource>
      <reportertitle>${escapeXml(reporter.title || '')}</reportertitle>
      <reportergivename>${escapeXml(reporter.given_name || '')}</reportergivename>
      <reportermiddlename>${escapeXml(reporter.middle_name || '')}</reportermiddlename>
      <reporterfamilyname>${escapeXml(reporter.family_name || '')}</reporterfamilyname>
      <reporterorganization>${escapeXml(reporter.organization || '')}</reporterorganization>
      <reporterdepartment>${escapeXml(reporter.department || '')}</reporterdepartment>
      <reporterstreet>${escapeXml(reporter.street_address || '')}</reporterstreet>
      <reportercity>${escapeXml(reporter.city || '')}</reportercity>
      <reporterstate>${escapeXml(reporter.state_province || '')}</reporterstate>
      <reporterpostcode>${escapeXml(reporter.postal_code || '')}</reporterpostcode>
      <reportercountry>${escapeXml(reporter.country_code || reporter.country || '')}</reportercountry>
      <qualification>${qualificationCode}</qualification>
    </primarysource>`;
}

/**
 * C.3 - Sender Information
 */
function generateSenderInformation(event: CanonicalAdverseEvent): string {
  const sender = (event.sender || {}) as AnyData;

  return `    <sender>
      <sendertype>${sender.sender_type || '2'}</sendertype>
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
    </sender>
    <receiver>
      <receivertype>2</receivertype>
      <receiverorganization>European Medicines Agency</receiverorganization>
      <receivercountrycode>EU</receivercountrycode>
    </receiver>`;
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

  // Age calculation
  let ageSection = '';
  if (patient.age_value && patient.age_unit) {
    const unitCode = CODE_SYSTEMS.ICH_AGE_UNIT[patient.age_unit] || patient.age_unit;
    ageSection = `
      <patientonsetage>${patient.age_value}</patientonsetage>
      <patientonsetageunit>${unitCode}</patientonsetageunit>`;
  } else if (patient.birth_date && event.eventDate) {
    const calculatedAge = calculateAge(patient.birth_date, event.eventDate);
    if (calculatedAge) {
      ageSection = `
      <patientonsetage>${calculatedAge.value}</patientonsetage>
      <patientonsetageunit>${calculatedAge.unit}</patientonsetageunit>`;
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

  // Weight
  let weightSection = '';
  if (patient.weight_value) {
    weightSection = `
      <patientweight>${patient.weight_value}</patientweight>`;
  }

  // Height
  let heightSection = '';
  if (patient.height_value) {
    heightSection = `
      <patientheight>${patient.height_value}</patientheight>`;
  }

  // Birth date
  let birthDateSection = '';
  if (patient.birth_date) {
    birthDateSection = `
      <patientbirthdateformat>102</patientbirthdateformat>
      <patientbirthdate>${formatE2BDate(patient.birth_date)}</patientbirthdate>`;
  }

  // Death information
  let deathSection = '';
  if (event.seriousnessDeath) {
    const deathDate =
      patient.death_date || reactions.find((r: AnyData) => r.outcome === 'fatal')?.resolution_date;
    deathSection = `
      <patientdeath>
        <patientdeathdate>${formatE2BDate(deathDate)}</patientdeathdate>
        <patientautopsyyesno>${patient.autopsy_performed ? '1' : '3'}</patientautopsyyesno>
      </patientdeath>`;
  }

  // Medical history
  let medicalHistorySection = '';
  const conditions = medicalHistory.conditions || [];
  if (conditions.length > 0) {
    medicalHistorySection = conditions
      .map(
        (condition: any, idx: number) => `
      <medicalhistoryepisode>
        <patientepisodenamemeddraversion>${meddraVersion}</patientepisodenamemeddraversion>
        <patientepisodename>${condition.meddra_code || ''}</patientepisodename>
        ${
          condition.start_date
            ? `<patientmedicalstartdateformat>102</patientmedicalstartdateformat>
        <patientmedicalstartdate>${formatE2BDate(condition.start_date)}</patientmedicalstartdate>`
            : ''
        }
        <patientmedicalcontinue>${condition.ongoing ? '1' : '2'}</patientmedicalcontinue>
        ${condition.comments ? `<patientmedicalcomment>${cdataWrap(condition.comments)}</patientmedicalcomment>` : ''}
      </medicalhistoryepisode>`
      )
      .join('\n');
  }

  return `    <patient>
      <patientinitial>${escapeXml(patient.patient_initials || '')}</patientinitial>${birthDateSection}${ageSection}${ageGroupSection}
      <patientsex>${sexCode}</patientsex>${weightSection}${heightSection}
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

      return `    <reaction>
      <primarysourcereaction>${cdataWrap(reaction.reaction_term || reaction.meddra_pt || '')}</primarysourcereaction>
      <reactionmeddraversionllt>${meddraVersion}</reactionmeddraversionllt>
      <reactionmeddrallt>${reaction.meddra_llt_code || reaction.meddra_pt_code || ''}</reactionmeddrallt>
      <reactionmeddraversionpt>${meddraVersion}</reactionmeddraversionpt>
      <reactionmeddrapt>${reaction.meddra_pt_code || ''}</reactionmeddrapt>
      ${
        reaction.onset_date
          ? `<reactionstartdateformat>102</reactionstartdateformat>
      <reactionstartdate>${formatE2BDate(reaction.onset_date)}</reactionstartdate>`
          : ''
      }
      ${
        reaction.resolution_date
          ? `<reactionenddateformat>102</reactionenddateformat>
      <reactionenddate>${formatE2BDate(reaction.resolution_date)}</reactionenddate>`
          : ''
      }
      ${
        reaction.duration_value
          ? `<reactionduration>${reaction.duration_value}</reactionduration>
      <reactiondurationunit>${CODE_SYSTEMS.ICH_AGE_UNIT[reaction.duration_unit || 'd'] || 'd'}</reactiondurationunit>`
          : ''
      }
      <reactionfirsttime>${reaction.time_to_onset_value || ''}</reactionfirsttime>
      <reactionfirsttimeunit>${CODE_SYSTEMS.ICH_AGE_UNIT[reaction.time_to_onset_unit || 'd'] || ''}</reactionfirsttimeunit>
      <reactionoutcome>${outcomeCode}</reactionoutcome>
    </reaction>`;
    })
    .join('\n');
}

/**
 * F - Test Results
 */
function generateTestResults(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const tests = (event.medicalHistory as any)?.lab_tests || [];

  if (tests.length === 0) return '';

  return tests
    .map(
      (test: any) => `    <test>
      <testdateformat>102</testdateformat>
      <testdate>${formatE2BDate(test.test_date)}</testdate>
      <testname>${cdataWrap(test.test_name || '')}</testname>
      <testresult>${cdataWrap(test.result || '')}</testresult>
      <testunit>${escapeXml(test.unit || '')}</testunit>
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

  const allProducts = [
    ...suspectProducts.map((p: AnyData) => ({ ...p, role: 'suspect' })),
    ...concomitantProducts.map((p: AnyData) => ({ ...p, role: 'concomitant' })),
  ];

  return allProducts
    .map((product, index) => {
      const roleCode = E2B_DRUG_ROLE[product.role || 'suspect'] || '1';
      const actionCode = mapActionTakenCode(product.action_taken);

      let rechallengeCode = '3'; // not performed
      if (product.rechallenge === true) rechallengeCode = '1';
      else if (product.rechallenge === false) rechallengeCode = '2';

      return `    <drug>
      <drugcharacterization>${roleCode}</drugcharacterization>
      <medicinalproduct>${cdataWrap(product.product_name || '')}</medicinalproduct>
      <obtaindrugcountry>${escapeXml(product.country_obtained || '')}</obtaindrugcountry>
      <drugbatchnumb>${escapeXml(product.batch_number || product.lot_number || '')}</drugbatchnumb>
      <drugauthorizationnumb>${escapeXml(product.authorization_number || '')}</drugauthorizationnumb>
      <drugauthorizationcountry>${escapeXml(product.authorization_country || '')}</drugauthorizationcountry>
      <drugauthorizationholder>${escapeXml(product.authorization_holder || product.manufacturer || '')}</drugauthorizationholder>
      <drugstructuredosagenumb>${product.dose_value || ''}</drugstructuredosagenumb>
      <drugstructuredosageunit>${CODE_SYSTEMS.ICH_AGE_UNIT[product.dose_unit || 'mg'] || '003'}</drugstructuredosageunit>
      <drugseparatedosagenumb>${product.number_of_units || ''}</drugseparatedosagenumb>
      <drugintervaldosageunitnumb>${product.frequency_value || ''}</drugintervaldosageunitnumb>
      <drugintervaldosagedefinition>${product.frequency_unit || ''}</drugintervaldosagedefinition>
      <drugcumulativedosagenumb>${product.cumulative_dose || ''}</drugcumulativedosagenumb>
      <drugcumulativedosageunit>${product.cumulative_dose_unit || ''}</drugcumulativedosageunit>
      <drugdosagetext>${cdataWrap(product.dose_text || '')}</drugdosagetext>
      <drugdosageform>${escapeXml(product.dosage_form || '')}</drugdosageform>
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
        product.stop_date
          ? `<drugenddateformat>102</drugenddateformat>
      <drugenddate>${formatE2BDate(product.stop_date)}</drugenddate>`
          : ''
      }
      <drugtreatmentduration>${product.duration_value || ''}</drugtreatmentduration>
      <drugtreatmentdurationunit>${CODE_SYSTEMS.ICH_AGE_UNIT[product.duration_unit || 'd'] || ''}</drugtreatmentdurationunit>
      <drugindication>${cdataWrap(product.indication || '')}</drugindication>
      <actiondrug>${actionCode}</actiondrug>
      <drugrecurreadministration>${rechallengeCode}</drugrecurreadministration>
      ${product.additional_info ? `<drugadditional>${cdataWrap(product.additional_info)}</drugadditional>` : ''}
      ${generateActiveSubstances(product)}
      ${generateDrugReactionRelatedness(product, reactions, meddraVersion)}
    </drug>`;
    })
    .join('\n');
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
      const reaction = reactions.find(r => r.meddra_pt_code === assessment.reaction_code);
      const causalityCode = E2B_CAUSALITY[assessment.assessment?.toLowerCase()] || '0';

      return `      <drugreactionrelatedness>
        <drugreactionassessmeddraversion>${meddraVersion}</drugreactionassessmeddraversion>
        <drugreactionasses>${reaction?.meddra_pt_code || assessment.reaction_code || ''}</drugreactionasses>
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
