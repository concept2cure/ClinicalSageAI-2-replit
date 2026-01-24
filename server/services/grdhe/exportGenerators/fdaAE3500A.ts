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
  CODE_SYSTEMS
} from '../types';

// Type assertion helper for flexible data access from canonical model
type AnyData = Record<string, any>;

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
  other_medically_important: 'OT'
};

// Patient sex mapping
const FDA_SEX_CODES: Record<string, string> = {
  male: '1',
  female: '2',
  unknown: '0'
};

// Report type mapping
const FDA_REPORT_TYPE_CODES: Record<string, string> = {
  initial: '1',
  followup: '2',
  final: '3'
};

// Causality assessment mapping
const FDA_CAUSALITY_CODES: Record<string, string> = {
  certain: '1',
  probable: '2',
  possible: '3',
  unlikely: '4',
  conditional: '5',
  unassessable: '6'
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format date for FDA submission
 */
function formatFDADate(date: Date | string | undefined, includeTime: boolean = false): string {
  if (!date) return '';
  const d = new Date(date);
  
  if (includeTime) {
    return d.toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z/, '');
  }
  
  return d.toISOString().split('T')[0].replace(/-/g, '');
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
  return 'urn:uuid:' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Map ICH sex code to FDA sex code
 */
function mapSexCode(sex: string | undefined): string {
  if (!sex) return '0';
  const ichCode = CODE_SYSTEMS.ICH_SEX[sex.toLowerCase()] || sex;
  return FDA_SEX_CODES[sex.toLowerCase()] || ichCode || '0';
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

/**
 * Validate adverse event for FDA submission
 */
export function validateForFDA(event: CanonicalAdverseEvent): { errors: ValidationError[]; warnings: ValidationWarning[] } {
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
      severity: 'error'
    });
  }

  if (!event.receiveDate) {
    errors.push({
      code: 'FDA-002',
      field: 'receiveDate',
      message: 'Receive date is required for FDA submission',
      severity: 'error'
    });
  }

  if (!patient) {
    errors.push({
      code: 'FDA-003',
      field: 'patient',
      message: 'Patient information is required for FDA submission',
      severity: 'error'
    });
  } else {
    // Patient validation
    if (!patient.age_value && !patient.birth_date && !patient.age) {
      warnings.push({
        code: 'FDA-W001',
        field: 'patient.age',
        message: 'Patient age or birth date is recommended for FDA submission',
        severity: 'warning'
      });
    }
  }

  if (!event.reactions || (event.reactions as any[]).length === 0) {
    errors.push({
      code: 'FDA-004',
      field: 'reactions',
      message: 'At least one reaction is required for FDA submission',
      severity: 'error'
    });
  } else {
    // Validate each reaction
    (event.reactions as any[]).forEach((reaction: AnyData, index: number) => {
      if (!reaction.meddra_pt_code && !reaction.reaction_term && !reaction.term) {
        errors.push({
          code: 'FDA-005',
          field: `reactions[${index}].meddra_pt_code`,
          message: `Reaction ${index + 1}: MedDRA preferred term code is required`,
          severity: 'error'
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
      severity: 'error'
    });
  } else {
    // Validate each product
    suspectProducts.forEach((product: AnyData, index: number) => {
      if (!product.product_name && !product.name) {
        errors.push({
          code: 'FDA-007',
          field: `suspectProducts[${index}].product_name`,
          message: `Product ${index + 1}: Product name is required`,
          severity: 'error'
        });
      }
    });
  }

  if (!event.reporter) {
    errors.push({
      code: 'FDA-008',
      field: 'reporter',
      message: 'Reporter information is required for FDA submission',
      severity: 'error'
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
        severity: 'warning'
      });
    }
  }

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
  if (validation.errors.length > 0) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings
    };
  }

  const messageId = generateMessageId();
  const creationTime = formatFDADate(new Date(), true);
  const meddraVersion = terminologyVersions['MEDDRA']?.version_code || '27.1';

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
      <id root="2.16.840.1.113883.3.0" extension="${event.tenantId}"/>
      <name>${escapeXml(event.sender?.sender_organization || 'Unknown Organization')}</name>
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
        meddra: meddraVersion
      }
    }
  };
}

/**
 * Generate report type section
 */
function generateReportTypeSection(event: CanonicalAdverseEvent): string {
  const reportTypeCode = FDA_REPORT_TYPE_CODES[event.reportType || 'initial'] || '1';
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
    seriousnessComponents.push(generateSeriousnessComponent('OT', 'Other medically important', event.seriousnessOtherDetails));
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
    const weightUnit = patient.weight_unit || 'kg';
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
    const conditions = medHistory.conditions.map((condition: AnyData, idx: number) => `
              <observationEvent classCode="OBS" moodCode="EVN">
                <code code="${condition.meddra_code || 'unknown'}" 
                  codeSystem="2.16.840.1.113883.6.163" 
                  codeSystemVersion="${meddraVersion}"
                  displayName="${escapeXml(condition.condition_term || condition.meddra_code)}"/>
                ${condition.start_date ? `<effectiveTime><low value="${formatFDADate(condition.start_date)}"/></effectiveTime>` : ''}
                ${condition.ongoing ? '<statusCode code="active"/>' : '<statusCode code="completed"/>'}
              </observationEvent>`).join('\n');

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
 * Generate reactions section
 */
function generateReactionsSection(event: CanonicalAdverseEvent, meddraVersion: string): string {
  const reactions = (event.reactions || []) as AnyData[];
  
  const reactionComponents = reactions.map((reaction: AnyData, index: number) => {
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
                code="${reaction.meddra_pt_code || 'unknown'}" 
                codeSystem="2.16.840.1.113883.6.163"
                codeSystemVersion="${meddraVersion}"
                displayName="${escapeXml(reaction.meddra_pt || reaction.reaction_term || '')}">
                ${reaction.meddra_llt_code ? `
                <translation code="${reaction.meddra_llt_code}" 
                  codeSystem="2.16.840.1.113883.6.163"
                  codeSystemVersion="${meddraVersion}"
                  displayName="${escapeXml(reaction.meddra_llt || '')}"/>` : ''}
              </value>
              
              <!-- Duration -->
              ${reaction.duration_value ? `
              <entryRelationship typeCode="MFST">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="DURATION" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="PQ" value="${reaction.duration_value}" unit="${reaction.duration_unit || 'd'}"/>
                </observation>
              </entryRelationship>` : ''}
              
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
  }).join('\n');

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

  const suspectComponents = suspectProducts.map((product: AnyData, index: number) => 
    generateProductComponent(product, index, 'suspect')).join('\n');
  
  const concomitantComponents = concomitantProducts.map((product: AnyData, index: number) => 
    generateProductComponent(product, index, 'concomitant')).join('\n');

  return `
        <!-- Suspect Products -->
        ${suspectComponents}
        
        <!-- Concomitant Products -->
        ${concomitantComponents}`;
}

/**
 * Generate individual product component
 */
function generateProductComponent(product: any, index: number, role: 'suspect' | 'concomitant'): string {
  const roleCode = role === 'suspect' ? '1' : '2';
  const routeCode = CODE_SYSTEMS.FDA_ROUTE[product.route?.toLowerCase()] || product.route || 'unknown';

  return `
          <!-- ${role === 'suspect' ? 'Suspect' : 'Concomitant'} Product ${index + 1} -->
          <component typeCode="COMP">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <id extension="${escapeXml(product.product_id || `PROD-${index + 1}`)}"/>
              
              <!-- Role (Suspect/Concomitant) -->
              <code code="${roleCode}" codeSystem="2.16.840.1.113883.6.163" displayName="${role}"/>
              
              <!-- Route -->
              <routeCode code="${routeCode}" codeSystem="2.16.840.1.113883.5.112" displayName="${escapeXml(product.route || '')}"/>
              
              <!-- Dosage -->
              ${product.dose_value ? `
              <doseQuantity value="${product.dose_value}" unit="${product.dose_unit || 'mg'}"/>` : ''}
              
              <!-- Frequency -->
              ${product.frequency ? `
              <effectiveTime xsi:type="PIVL_TS">
                <period value="${product.frequency_value || 1}" unit="${product.frequency_unit || 'd'}"/>
              </effectiveTime>` : ''}
              
              <!-- Dates -->
              ${product.start_date || product.stop_date ? `
              <effectiveTime xsi:type="IVL_TS">
                ${product.start_date ? `<low value="${formatFDADate(product.start_date)}"/>` : ''}
                ${product.stop_date ? `<high value="${formatFDADate(product.stop_date)}"/>` : ''}
              </effectiveTime>` : ''}
              
              <!-- Product Details -->
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <manufacturedMaterialKind>
                    <code code="${escapeXml(product.ndc_code || product.product_id || 'unknown')}" 
                      codeSystem="2.16.840.1.113883.6.69"/>
                    <name>${escapeXml(product.product_name || '')}</name>
                    ${product.manufacturer ? `
                    <manufacturerOrganization>
                      <name>${escapeXml(product.manufacturer)}</name>
                    </manufacturerOrganization>` : ''}
                  </manufacturedMaterialKind>
                </manufacturedProduct>
              </consumable>
              
              <!-- Indication -->
              ${product.indication ? `
              <entryRelationship typeCode="RSON">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="INDICATION" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="ST">${cdataWrap(product.indication)}</value>
                </observation>
              </entryRelationship>` : ''}
              
              <!-- Action Taken -->
              ${product.action_taken ? `
              <entryRelationship typeCode="COMP">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="C53254" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Action Taken"/>
                  <value xsi:type="ST">${escapeXml(product.action_taken)}</value>
                </observation>
              </entryRelationship>` : ''}
              
              <!-- Rechallenge -->
              ${product.rechallenge !== undefined ? `
              <entryRelationship typeCode="COMP">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="RECHALLENGE" codeSystem="2.16.840.1.113883.5.4"/>
                  <value xsi:type="ST">${product.rechallenge ? 'positive' : 'negative'}</value>
                </observation>
              </entryRelationship>` : ''}
            </substanceAdministration>
          </component>`;
}

/**
 * Generate reporter section
 */
function generateReporterSection(event: CanonicalAdverseEvent): string {
  const reporter = (event.reporter || {}) as AnyData;
  const qualificationCode = reporter.qualification || '5'; // 5 = Other

  return `
        <!-- Reporter Information -->
        <author typeCode="AUT">
          <time value="${formatFDADate(event.receiveDate)}"/>
          <assignedEntity classCode="ASSIGNED">
            <id extension="${escapeXml(reporter.reporter_id || 'unknown')}"/>
            <code code="${qualificationCode}" codeSystem="2.16.840.1.113883.6.163" displayName="${escapeXml(reporter.qualification_text || 'Healthcare Professional')}"/>
            
            <assignedPerson classCode="PSN" determinerCode="INSTANCE">
              ${reporter.given_name || reporter.family_name ? `
              <name>
                ${reporter.title ? `<prefix>${escapeXml(reporter.title)}</prefix>` : ''}
                ${reporter.given_name ? `<given>${escapeXml(reporter.given_name)}</given>` : ''}
                ${reporter.middle_name ? `<given>${escapeXml(reporter.middle_name)}</given>` : ''}
                ${reporter.family_name ? `<family>${escapeXml(reporter.family_name)}</family>` : ''}
              </name>` : ''}
            </assignedPerson>
            
            ${reporter.organization ? `
            <representedOrganization classCode="ORG" determinerCode="INSTANCE">
              <name>${escapeXml(reporter.organization)}</name>
              ${reporter.department ? `<desc>${escapeXml(reporter.department)}</desc>` : ''}
              ${reporter.street_address || reporter.city || reporter.country ? `
              <addr>
                ${reporter.street_address ? `<streetAddressLine>${escapeXml(reporter.street_address)}</streetAddressLine>` : ''}
                ${reporter.city ? `<city>${escapeXml(reporter.city)}</city>` : ''}
                ${reporter.state_province ? `<state>${escapeXml(reporter.state_province)}</state>` : ''}
                ${reporter.postal_code ? `<postalCode>${escapeXml(reporter.postal_code)}</postalCode>` : ''}
                ${reporter.country ? `<country>${escapeXml(reporter.country)}</country>` : ''}
              </addr>` : ''}
              ${reporter.telephone ? `
              <telecom value="tel:${escapeXml(reporter.telephone)}"/>` : ''}
              ${reporter.email ? `
              <telecom value="mailto:${escapeXml(reporter.email)}"/>` : ''}
            </representedOrganization>` : ''}
          </assignedEntity>
        </author>`;
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
            ${narrative ? `
            <text>
              <paragraph>
                <caption>Case Narrative</caption>
                ${cdataWrap(narrative)}
              </paragraph>
            </text>` : ''}
            ${reporterComments ? `
            <text>
              <paragraph>
                <caption>Reporter Comments</caption>
                ${cdataWrap(reporterComments)}
              </paragraph>
            </text>` : ''}
            ${senderComments ? `
            <text>
              <paragraph>
                <caption>Sender Comments</caption>
                ${cdataWrap(senderComments)}
              </paragraph>
            </text>` : ''}
          </section>
        </component>`;
}
