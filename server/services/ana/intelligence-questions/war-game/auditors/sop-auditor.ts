/**
 * SOP War Game Auditor
 *
 * Simulates FDA inspector scrutiny of a Standard Operating Procedure
 * and its supporting quality system elements. Examines document control,
 * training adequacy, 21 CFR Part 11 compliance, CAPA integration,
 * and audit readiness.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/sop-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isEmpty(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function includes(val: unknown, search: string): boolean {
  if (typeof val === 'string') return val.toLowerCase().includes(search.toLowerCase());
  if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase() === search.toLowerCase());
  return false;
}

/* ------------------------------------------------------------------ */
/*  Auditor factory                                                    */
/* ------------------------------------------------------------------ */

export function createSopAuditor(): WarGameAuditor {
  const rules: AuditRule[] = [
    /* ============================================================== */
    /*  DOCUMENT CONTROL  (sop_001 – sop_004)                         */
    /* ============================================================== */
    {
      id: 'sop_001',
      dimension: 'documentation',
      title: 'No Version Control Methodology',
      question:
        'How do you ensure only current versions of this SOP are in use at all operational sites, and that obsolete versions have been physically retrieved or electronically deactivated?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.version_control_method)) return null;
        return {
          id: 'sop_001',
          dimension: 'documentation',
          severity: 'critical',
          title: 'No Version Control Methodology',
          question:
            'How do you ensure only current versions of this SOP are in use at all operational sites, and that obsolete versions have been physically retrieved or electronically deactivated?',
          observation:
            'No version control methodology has been defined for this SOP. Without a documented version control process, there is no assurance that personnel are operating from the current approved revision. During inspection, the inability to demonstrate version control is a frequent source of FDA 483 observations.',
          requirement:
            'A documented version control system must ensure that only the current approved version of each SOP is available for use, and that previous versions are archived with full revision history.',
          reference: '21 CFR 211.186; ICH Q10 Section 2.4',
          recommendation:
            'Implement a formal version control methodology — ideally within a validated document management system — that includes sequential version numbering, effective dates, obsolescence procedures, and controlled copy distribution.',
          relatedFields: ['version_control_method', 'controlled_copy_distribution', 'dms_system'],
        };
      },
    },
    {
      id: 'sop_002',
      dimension: 'regulatory_alignment',
      title: 'Paper-Based DMS for GxP SOPs',
      question:
        'Your document management system for GxP-regulated SOPs appears to be paper-based. How do you maintain audit trails, prevent unauthorized changes, and ensure document integrity in a paper-only system?',
      check(answers): WarGameFinding | null {
        if (answers.dms_system !== 'paper_based') return null;
        if (answers.gxp_classification === 'non_gxp') return null;
        return {
          id: 'sop_002',
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'Paper-Based Document Management for GxP SOPs',
          question:
            'Your document management system for GxP-regulated SOPs appears to be paper-based. How do you maintain audit trails, prevent unauthorized changes, and ensure document integrity in a paper-only system?',
          observation:
            'A paper-based document management system is being used for GxP-classified SOPs. While not explicitly prohibited, paper-based systems present significant compliance risks around audit trail integrity, unauthorized access, version control, and disaster recovery. Modern regulatory expectations strongly favor electronic systems with built-in controls.',
          requirement:
            'GxP document management systems must ensure data integrity, provide audit trails, control access, and comply with applicable electronic records regulations when electronic systems are used.',
          reference: '21 CFR Part 11; EU Annex 11',
          recommendation:
            'Transition to a validated electronic document management system (eDMS) that provides automated version control, electronic signatures, audit trails, and role-based access controls. If paper must be retained as the interim system, implement compensating controls including sign-out logs, controlled copy registers, and periodic reconciliation.',
          relatedFields: ['dms_system', 'gxp_classification', 'audit_trail_required', 'electronic_signatures'],
        };
      },
    },
    {
      id: 'sop_003',
      dimension: 'completeness',
      title: 'No Document Numbering Convention',
      question:
        'What numbering convention do you use to uniquely identify each SOP and its revisions? Can you show me the documented scheme?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.document_numbering_convention)) return null;
        return {
          id: 'sop_003',
          dimension: 'completeness',
          severity: 'warning',
          title: 'No Document Numbering Convention Defined',
          question:
            'What numbering convention do you use to uniquely identify each SOP and its revisions? Can you show me the documented scheme?',
          observation:
            'No document numbering convention has been established. Without a standardized numbering scheme, documents cannot be reliably identified, referenced, or retrieved. This gap makes cross-referencing between SOPs unreliable and complicates regulatory submissions and inspection responses.',
          requirement:
            'All batch production and control records must be uniquely identified. By extension, the SOP system governing those records must itself be unambiguously identifiable through a documented numbering convention.',
          reference: '21 CFR 211.186',
          recommendation:
            'Establish and document a numbering convention that encodes department, document type, sequence number, and revision level (e.g., QA-SOP-001-R03). Include the convention in a master SOP-on-SOPs document and train all authors on its use.',
          relatedFields: ['document_numbering_convention', 'sop_number'],
        };
      },
    },
    {
      id: 'sop_004',
      dimension: 'risk_identification',
      title: 'No Archiving Method Defined',
      question:
        'How are superseded and retired SOPs archived? If I asked to see the version that was effective two years ago, could you retrieve it, and how long would that take?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.archiving_method)) return null;
        return {
          id: 'sop_004',
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'No Archiving Method Defined',
          question:
            'How are superseded and retired SOPs archived? If I asked to see the version that was effective two years ago, could you retrieve it, and how long would that take?',
          observation:
            'No archiving method has been defined for superseded or retired SOP versions. During an FDA inspection, investigators frequently request historical versions of procedures to reconstruct the conditions under which a batch was manufactured or a study was conducted. Inability to produce these records can escalate to a Warning Letter.',
          requirement:
            'Records must be retained for at least the required regulatory period and be readily retrievable. Archiving procedures must ensure document integrity and prevent loss or degradation.',
          reference: '21 CFR 211.180',
          recommendation:
            'Define a formal archiving method — electronic or physical — that ensures superseded versions are retained with full metadata (effective dates, approval signatures, reason for supersession) and are retrievable within a defined timeframe. Document the archiving SOP and include it in your document control system.',
          relatedFields: ['archiving_method', 'retrieval_procedures', 'record_retention_period'],
        };
      },
    },

    /* ============================================================== */
    /*  TRAINING REQUIREMENTS  (sop_005 – sop_008)                    */
    /* ============================================================== */
    {
      id: 'sop_005',
      dimension: 'regulatory_alignment',
      title: 'GxP SOP Without Training Requirement',
      question:
        'This SOP is classified as GxP, yet training is not required. How do you ensure that personnel performing these regulated activities are qualified and competent?',
      check(answers): WarGameFinding | null {
        if (answers.gxp_classification === 'non_gxp') return null;
        if (answers.training_required !== false) return null;
        return {
          id: 'sop_005',
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'GxP SOP Without Mandatory Training',
          question:
            'This SOP is classified as GxP, yet training is not required. How do you ensure that personnel performing these regulated activities are qualified and competent?',
          observation:
            'A GxP-classified SOP has been configured without a mandatory training requirement. FDA expects all personnel performing GxP activities to be trained on the applicable procedures before they execute those tasks. This gap represents a direct regulatory exposure — an inspector finding untrained personnel performing GxP operations will issue a 483 observation and may question the validity of work performed.',
          requirement:
            'Each person engaged in GxP operations shall have education, training, and experience to perform assigned functions. Training shall be conducted by qualified individuals and documented.',
          reference: '21 CFR 211.25; 21 CFR 820.25',
          recommendation:
            'Enable mandatory training for all GxP-classified SOPs. Define the training curriculum, establish read-and-understand or hands-on training requirements as appropriate, and ensure training completion is documented before personnel are authorized to perform the procedure.',
          relatedFields: ['training_required', 'gxp_classification', 'training_methods', 'competency_assessment_method'],
        };
      },
    },
    {
      id: 'sop_006',
      dimension: 'completeness',
      title: 'No Competency Assessment Method',
      question:
        'How do you verify that personnel have not only read the SOP, but actually understand and can correctly perform the procedures it describes?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.competency_assessment_method)) return null;
        return {
          id: 'sop_006',
          dimension: 'completeness',
          severity: 'warning',
          title: 'No Competency Assessment Method Defined',
          question:
            'How do you verify that personnel have not only read the SOP, but actually understand and can correctly perform the procedures it describes?',
          observation:
            'No competency assessment method has been defined. Training without competency verification provides no assurance that personnel can actually perform the procedure correctly. Mere signature on a training log ("read and understood") is increasingly viewed by regulators as insufficient evidence of competency.',
          requirement:
            'Training effectiveness must be periodically evaluated, and personnel competency must be assessed to ensure that procedures are understood and can be followed.',
          reference: 'ICH Q10 Section 1.8',
          recommendation:
            'Define a competency assessment method appropriate to the SOP complexity — written assessment, practical demonstration, observed task performance, or a combination. Document passing criteria, remediation procedures for failures, and the frequency of ongoing competency reassessment.',
          relatedFields: ['competency_assessment_method', 'assessment_types', 'passing_criteria', 'ongoing_competency_frequency'],
        };
      },
    },
    {
      id: 'sop_007',
      dimension: 'practical_feasibility',
      title: 'Excessive Training Timeline for GxP SOP',
      question:
        'You have allowed 30 days for initial training on a GxP SOP. During that window, are personnel performing the procedure without being trained? How do you manage the compliance gap?',
      check(answers): WarGameFinding | null {
        if (answers.initial_training_timeline !== '30_days') return null;
        if (answers.gxp_classification === 'non_gxp') return null;
        return {
          id: 'sop_007',
          dimension: 'practical_feasibility',
          severity: 'warning',
          title: 'Excessive Training Timeline for GxP SOP',
          question:
            'You have allowed 30 days for initial training on a GxP SOP. During that window, are personnel performing the procedure without being trained? How do you manage the compliance gap?',
          observation:
            'A 30-day training timeline has been set for a GxP-classified SOP. This extended window creates a period during which personnel may be performing regulated activities without confirmed training, representing both a compliance risk and a data integrity concern. Any work performed by untrained personnel during this gap may be called into question.',
          requirement:
            'Personnel performing GxP operations must be trained before they execute those tasks. The training timeline must be commensurate with the regulatory risk of the activity.',
          reference: '21 CFR 211.25',
          recommendation:
            'Reduce the initial training timeline for GxP SOPs to 7-14 days maximum. For critical SOPs, require training completion before the effective date. Implement a system that prevents untrained personnel from performing the procedure until training is documented as complete.',
          relatedFields: ['initial_training_timeline', 'gxp_classification', 'training_methods'],
        };
      },
    },
    {
      id: 'sop_008',
      dimension: 'documentation',
      title: 'Spreadsheet-Based Training Records for GxP',
      question:
        'You are maintaining training records in a spreadsheet for a GxP SOP. Can you demonstrate that this spreadsheet has an audit trail, access controls, and backup procedures that meet 21 CFR Part 11 requirements?',
      check(answers): WarGameFinding | null {
        if (answers.training_records_system !== 'spreadsheet') return null;
        if (answers.gxp_classification === 'non_gxp') return null;
        return {
          id: 'sop_008',
          dimension: 'documentation',
          severity: 'warning',
          title: 'Spreadsheet-Based Training Records for GxP SOP',
          question:
            'You are maintaining training records in a spreadsheet for a GxP SOP. Can you demonstrate that this spreadsheet has an audit trail, access controls, and backup procedures that meet 21 CFR Part 11 requirements?',
          observation:
            'Spreadsheet-based training records lack the audit trail and access controls required for GxP compliance. Spreadsheets can be modified without attribution, do not inherently support electronic signatures, and are prone to accidental data loss. FDA investigators routinely cite spreadsheet-based GxP records as a data integrity weakness.',
          requirement:
            'Electronic records used for GxP purposes must include audit trails that capture who made changes, when, and why. Access must be limited to authorized individuals.',
          reference: '21 CFR Part 11',
          recommendation:
            'Migrate training records to a validated Learning Management System (LMS) or Quality Management System (QMS) with built-in audit trails, role-based access, electronic signatures, and automated compliance reporting. In the interim, implement compensating controls for the spreadsheet including version tracking, access restrictions, and periodic reconciliation against paper records.',
          relatedFields: ['training_records_system', 'gxp_classification', 'audit_trail_required', 'data_integrity_alcoa'],
        };
      },
    },

    /* ============================================================== */
    /*  21 CFR PART 11 COMPLIANCE  (sop_009 – sop_011)                */
    /* ============================================================== */
    {
      id: 'sop_009',
      dimension: 'regulatory_alignment',
      title: 'Electronic Signatures Without Part 11 Compliance',
      question:
        'You have enabled electronic signatures for this SOP, but 21 CFR Part 11 is not listed among applicable regulations. Has your organization submitted the required certification to FDA, and how are you ensuring the signatures are legally binding?',
      check(answers): WarGameFinding | null {
        if (answers.electronic_signatures !== true) return null;
        if (includes(answers.applicable_regulations, '21_cfr_11')) return null;
        return {
          id: 'sop_009',
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Electronic Signatures Without 21 CFR Part 11 Coverage',
          question:
            'You have enabled electronic signatures for this SOP, but 21 CFR Part 11 is not listed among applicable regulations. Has your organization submitted the required certification to FDA, and how are you ensuring the signatures are legally binding?',
          observation:
            'Electronic signatures are enabled but 21 CFR Part 11 has not been identified as an applicable regulation. Under Part 11, electronic signatures used in GxP records must meet specific requirements for uniqueness, traceability, and non-repudiation. Organizations using electronic signatures must also certify to FDA that their electronic signatures are intended to be the legally binding equivalent of handwritten signatures.',
          requirement:
            'Electronic signatures that are intended to be equivalent to handwritten signatures must comply with 21 CFR Part 11, including certification to FDA, unique user identification, and system validation.',
          reference: '21 CFR Part 11',
          recommendation:
            'Add 21 CFR Part 11 to the applicable regulations for this SOP. Ensure the electronic signature system has been validated, that each user has a unique, non-transferable credential, and that the organization has submitted its Part 11 certification letter to FDA.',
          relatedFields: ['electronic_signatures', 'applicable_regulations', 'cfr_part_11_scope'],
        };
      },
    },
    {
      id: 'sop_010',
      dimension: 'risk_identification',
      title: 'No Audit Trail for GxP SOP',
      question:
        'This is a GxP-regulated SOP, but audit trail has not been enabled. If a change were made to a record governed by this procedure, how would you detect and investigate it?',
      check(answers): WarGameFinding | null {
        if (answers.audit_trail_required !== false) return null;
        if (answers.gxp_classification === 'non_gxp') return null;
        return {
          id: 'sop_010',
          dimension: 'risk_identification',
          severity: 'critical',
          title: 'No Audit Trail Required for GxP SOP',
          question:
            'This is a GxP-regulated SOP, but audit trail has not been enabled. If a change were made to a record governed by this procedure, how would you detect and investigate it?',
          observation:
            'Audit trail functionality has not been required for a GxP-classified SOP. Without an audit trail, there is no mechanism to detect unauthorized modifications, reconstruct the sequence of events, or demonstrate data integrity during an inspection. This is one of the most commonly cited deficiencies in FDA Warning Letters related to data integrity.',
          requirement:
            'Computer systems used for GxP purposes must generate accurate and complete audit trails that are computer-generated, time-stamped, and not alterable by the operator. The audit trail must capture the identity of the person making the change, the date/time, the old value, and the new value.',
          reference: '21 CFR 11.10(e); EU Annex 11 Section 9',
          recommendation:
            'Enable audit trail requirements for all GxP-classified SOPs. Ensure the supporting electronic systems generate audit trails that capture who, what, when, and why for every data modification. Conduct a retrospective review to assess whether data integrity has been compromised during the period without audit trail.',
          relatedFields: ['audit_trail_required', 'gxp_classification', 'data_integrity_alcoa', 'electronic_signatures'],
        };
      },
    },
    {
      id: 'sop_011',
      dimension: 'consistency',
      title: 'ALCOA+ Data Integrity Principles Not Addressed',
      question:
        'Does this SOP address ALCOA+ data integrity principles? How do you ensure that records generated under this procedure are Attributable, Legible, Contemporaneous, Original, and Accurate?',
      check(answers): WarGameFinding | null {
        if (answers.data_integrity_alcoa !== false) return null;
        return {
          id: 'sop_011',
          dimension: 'consistency',
          severity: 'warning',
          title: 'ALCOA+ Data Integrity Principles Not Addressed',
          question:
            'Does this SOP address ALCOA+ data integrity principles? How do you ensure that records generated under this procedure are Attributable, Legible, Contemporaneous, Original, and Accurate?',
          observation:
            'ALCOA+ data integrity principles have not been addressed in this SOP. Since FDA issued its Data Integrity and Compliance guidance, inspectors routinely assess whether organizations have embedded ALCOA+ principles into their procedural framework. Failure to address data integrity at the SOP level suggests a systemic gap in the quality system.',
          requirement:
            'Data integrity controls should be embedded into SOPs to ensure that all data and records are Attributable, Legible, Contemporaneous, Original, Accurate, Complete, Consistent, Enduring, and Available throughout the record retention period.',
          reference: 'FDA Data Integrity and Compliance With Drug CGMP Guidance (2018)',
          recommendation:
            'Incorporate ALCOA+ principles into the SOP by including specific instructions for how data should be recorded, reviewed, and retained. Add a data integrity section that addresses each ALCOA+ element in the context of this procedure. Train personnel on data integrity expectations.',
          relatedFields: ['data_integrity_alcoa', 'audit_trail_required', 'gxp_classification'],
        };
      },
    },

    /* ============================================================== */
    /*  AUDIT & CAPA  (sop_012 – sop_016)                             */
    /* ============================================================== */
    {
      id: 'sop_012',
      dimension: 'risk_identification',
      title: 'No Mock Audit Program',
      question:
        'Do you conduct mock audits or self-inspections to assess SOP compliance before a regulatory inspection? Show me your schedule and the results of your last mock audit.',
      check(answers): WarGameFinding | null {
        if (answers.mock_audit_schedule !== 'none') return null;
        return {
          id: 'sop_012',
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'No Mock Audit Program Established',
          question:
            'Do you conduct mock audits or self-inspections to assess SOP compliance before a regulatory inspection? Show me your schedule and the results of your last mock audit.',
          observation:
            'No mock audit or self-inspection program has been established. Organizations that do not periodically test their own inspection readiness are frequently caught off guard by FDA findings. Mock audits identify gaps in SOP compliance, training effectiveness, and documentation practices before they become regulatory citations.',
          requirement:
            'While not explicitly mandated, industry best practice and FDA inspection preparedness guidance strongly recommend periodic self-inspections and mock audits as part of a robust quality system.',
          reference: 'FDA Inspection Best Practices; ICH Q10 Section 3.2',
          recommendation:
            'Establish a mock audit program with defined frequency (at minimum annually, more frequently for high-risk areas). Use experienced quality professionals or external consultants to simulate inspection conditions. Document findings, track corrective actions, and trend results over time to measure quality system maturity.',
          relatedFields: ['mock_audit_schedule', 'inspection_readiness_score', 'previous_audit_findings', 'documentation_review_checklist'],
        };
      },
    },
    {
      id: 'sop_013',
      dimension: 'regulatory_alignment',
      title: 'No CAPA Process Defined',
      question:
        'How do you ensure corrective and preventive actions are taken when SOP deviations occur? Show me the link between your deviation system and your CAPA process.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.corrective_action_triggers) && !isEmpty(answers.capa_linkage)) return null;
        return {
          id: 'sop_013',
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'No CAPA Process Defined for SOP Deviations',
          question:
            'How do you ensure corrective and preventive actions are taken when SOP deviations occur? Show me the link between your deviation system and your CAPA process.',
          observation:
            'No corrective and preventive action (CAPA) process has been defined, or the linkage between deviations and CAPA is missing. Without a functioning CAPA system, the organization cannot systematically address the root causes of SOP non-compliance, and the same failures will recur. FDA considers the absence of an effective CAPA system a significant quality system deficiency.',
          requirement:
            'A CAPA system must be established to identify, investigate, and correct quality problems. The system must include procedures for identifying action needed, implementing corrective and preventive actions, and verifying or validating effectiveness.',
          reference: '21 CFR 820.90; ICH Q10 Section 3.2',
          recommendation:
            'Define a comprehensive CAPA process that is triggered by SOP deviations, audit findings, complaints, and trend analysis. Ensure clear linkage between the deviation management system and CAPA initiation criteria. Document root cause analysis methodology, action tracking, effectiveness verification timelines, and escalation criteria.',
          relatedFields: ['corrective_action_triggers', 'capa_linkage', 'preventive_action_methodology', 'root_cause_analysis_method', 'capa_escalation_criteria'],
        };
      },
    },
    {
      id: 'sop_014',
      dimension: 'completeness',
      title: 'No Deviation Handling Process',
      question:
        'What happens when someone deviates from this SOP? Walk me through your deviation classification, investigation, and resolution process.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.deviation_classification)) return null;
        return {
          id: 'sop_014',
          dimension: 'completeness',
          severity: 'critical',
          title: 'No Deviation Handling Process Defined',
          question:
            'What happens when someone deviates from this SOP? Walk me through your deviation classification, investigation, and resolution process.',
          observation:
            'No deviation classification or handling process has been defined. Every quality system must have a mechanism for detecting, classifying, investigating, and resolving deviations from approved procedures. The absence of this process means deviations may go unreported and uninvestigated, creating a systemic quality and safety risk.',
          requirement:
            'Any unexplained discrepancy or the failure of a batch or any of its components to meet any of its specifications shall be thoroughly investigated. By extension, deviations from approved SOPs must be documented, classified by severity, investigated, and resolved.',
          reference: '21 CFR 211.192; ICH Q10',
          recommendation:
            'Establish a deviation management process that includes: classification criteria (minor, major, critical), investigation timelines for each severity level, root cause analysis requirements, CAPA linkage, trending, and approval authority. Train all personnel on when and how to report deviations.',
          relatedFields: ['deviation_classification', 'minor_deviation_timeline', 'major_deviation_timeline', 'critical_deviation_timeline', 'investigation_requirements', 'deviation_approval_authority'],
        };
      },
    },
    {
      id: 'sop_015',
      dimension: 'practical_feasibility',
      title: 'No Root Cause Analysis Method',
      question:
        'When a deviation or CAPA is initiated, what root cause analysis methodology do you use? How do you ensure you are addressing the true root cause rather than just the symptoms?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.root_cause_analysis_method)) return null;
        return {
          id: 'sop_015',
          dimension: 'practical_feasibility',
          severity: 'warning',
          title: 'No Root Cause Analysis Methodology Defined',
          question:
            'When a deviation or CAPA is initiated, what root cause analysis methodology do you use? How do you ensure you are addressing the true root cause rather than just the symptoms?',
          observation:
            'No root cause analysis (RCA) method has been specified. Without a structured RCA approach, investigations tend to identify superficial causes rather than true root causes, leading to ineffective corrective actions and recurring deviations. FDA inspectors frequently challenge the depth and rigor of root cause investigations.',
          requirement:
            'CAPA procedures must include investigation of the cause of nonconformities and implementation of actions to prevent recurrence. Effective root cause analysis requires a documented, systematic methodology.',
          reference: 'ICH Q10 Section 3.2.1',
          recommendation:
            'Select and document one or more root cause analysis methodologies appropriate to the organization (e.g., 5 Whys, Fishbone/Ishikawa, Fault Tree Analysis). Train investigation personnel on the chosen methodology. Require documented RCA for all major and critical deviations, and include the RCA output in CAPA records.',
          relatedFields: ['root_cause_analysis_method', 'corrective_action_triggers', 'preventive_action_methodology'],
        };
      },
    },
    {
      id: 'sop_016',
      dimension: 'documentation',
      title: 'Deviation Trending Frequency Insufficient',
      question:
        'You trend deviations only annually. How can you detect emerging patterns or systemic issues in a timely manner with such infrequent analysis?',
      check(answers): WarGameFinding | null {
        if (answers.deviation_trending !== 'annual') return null;
        return {
          id: 'sop_016',
          dimension: 'documentation',
          severity: 'warning',
          title: 'Deviation Trending Too Infrequent',
          question:
            'You trend deviations only annually. How can you detect emerging patterns or systemic issues in a timely manner with such infrequent analysis?',
          observation:
            'Deviation trending is performed only on an annual basis. Annual trending is insufficient to detect emerging patterns, seasonal variations, or systemic process breakdowns in a timely manner. By the time an annual review identifies a trend, the underlying issue may have caused significant quality impact over months of undetected recurrence.',
          requirement:
            'The pharmaceutical quality system should include monitoring of process performance and product quality to ensure a state of control is maintained. Trending should be performed at a frequency sufficient to detect signals early.',
          reference: 'ICH Q10 Section 3.2.2',
          recommendation:
            'Increase deviation trending frequency to at least quarterly for routine SOPs and monthly for critical or high-risk processes. Implement statistical process control where applicable. Use dashboards or automated alerts to flag emerging trends between formal review cycles.',
          relatedFields: ['deviation_trending', 'effectiveness_metrics', 'review_frequency'],
        };
      },
    },

    /* ============================================================== */
    /*  REVIEW & RETENTION  (sop_017 – sop_020)                       */
    /* ============================================================== */
    {
      id: 'sop_017',
      dimension: 'regulatory_alignment',
      title: 'No Periodic Review Schedule',
      question:
        'This SOP is reviewed only "as needed." FDA expects SOPs to be periodically reviewed to ensure they remain current and reflect actual practice. What triggers a review, and how do you know the SOP still accurately describes what personnel are doing?',
      check(answers): WarGameFinding | null {
        if (answers.review_frequency !== 'as_needed') return null;
        return {
          id: 'sop_017',
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'No Periodic Review Schedule Defined',
          question:
            'This SOP is reviewed only "as needed." FDA expects SOPs to be periodically reviewed to ensure they remain current and reflect actual practice. What triggers a review, and how do you know the SOP still accurately describes what personnel are doing?',
          observation:
            'The SOP review frequency is set to "as needed" with no defined periodic review cycle. Without scheduled reviews, SOPs can become outdated, diverge from actual practice, and fail to incorporate regulatory changes. An inspector finding that an SOP has not been reviewed in years — while the process it describes has evolved — will question the organization\'s quality culture.',
          requirement:
            'SOPs should be periodically reviewed at defined intervals to ensure they remain current, accurate, and compliant with applicable regulations. The review frequency should be risk-based.',
          reference: 'ICH Q10 Section 3.2.5',
          recommendation:
            'Establish a periodic review schedule — typically every 2 years for standard SOPs and annually for critical or high-risk procedures. Assign review responsibility, define review criteria (regulatory changes, deviation history, process modifications), and track review completion. Document the outcome of each review, even if no changes are needed ("reviewed, no changes required").',
          relatedFields: ['review_frequency', 'review_committee_members', 'effectiveness_metrics', 'change_control_notes'],
        };
      },
    },
    {
      id: 'sop_018',
      dimension: 'risk_identification',
      title: 'Record Retention Period Too Short',
      question:
        'The retention period for records associated with this SOP is only 3 years. Can you confirm this meets the minimum retention requirements for all applicable regulations, including those that may require retention for the commercial life of the product plus additional years?',
      check(answers): WarGameFinding | null {
        if (answers.record_retention_period !== '3_years') return null;
        return {
          id: 'sop_018',
          dimension: 'risk_identification',
          severity: 'critical',
          title: 'Record Retention Period Potentially Non-Compliant',
          question:
            'The retention period for records associated with this SOP is only 3 years. Can you confirm this meets the minimum retention requirements for all applicable regulations, including those that may require retention for the commercial life of the product plus additional years?',
          observation:
            'A 3-year retention period may not meet regulatory minimums for many GxP contexts. FDA regulations require clinical investigation records to be retained for 2 years after marketing application approval or investigation discontinuation. GMP records may need to be retained for the expiry date of the last batch plus additional years. Device records may require retention for the expected life of the device. A blanket 3-year policy risks premature destruction of legally required records.',
          requirement:
            'Records must be retained for the period required by applicable regulations. For clinical investigations, records must be retained for 2 years after the date of marketing application approval or 2 years after the investigation is discontinued. Manufacturing records must be retained for at least 1 year after the expiry date of the batch.',
          reference: '21 CFR 312.62; 21 CFR 211.180',
          recommendation:
            'Conduct a retention requirements analysis mapping each record type to its applicable regulatory retention mandate. Set the retention period to the longest applicable requirement. For most GxP organizations, a minimum of 15 years or the product lifecycle plus 2 years (whichever is longer) is a defensible baseline. Document the rationale for the chosen retention period.',
          relatedFields: ['record_retention_period', 'archiving_method', 'retrieval_procedures', 'gxp_classification'],
        };
      },
    },
    {
      id: 'sop_019',
      dimension: 'completeness',
      title: 'No Effectiveness Metrics Defined',
      question:
        'How do you measure whether this SOP is effective? What key performance indicators tell you the procedure is achieving its intended purpose and the quality system is in a state of control?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.effectiveness_metrics)) return null;
        return {
          id: 'sop_019',
          dimension: 'completeness',
          severity: 'warning',
          title: 'No Effectiveness Metrics Defined',
          question:
            'How do you measure whether this SOP is effective? What key performance indicators tell you the procedure is achieving its intended purpose and the quality system is in a state of control?',
          observation:
            'No effectiveness metrics have been defined for this SOP. Without measurable outcomes, there is no objective way to assess whether the procedure is achieving its intended purpose, whether training is adequate, or whether process improvements are needed. Management review cannot meaningfully evaluate SOP performance without data.',
          requirement:
            'Management should determine and implement effective and efficient processes for identifying, gathering, and analyzing appropriate data to demonstrate the suitability and effectiveness of the quality management system and to evaluate where continual improvement can be made.',
          reference: 'ICH Q10 Section 4.1',
          recommendation:
            'Define 2-4 effectiveness metrics for this SOP, such as: deviation rate, right-first-time percentage, training completion rate, cycle time compliance, or audit finding frequency. Establish targets, track performance, and include in management review. Use the data to drive continuous improvement.',
          relatedFields: ['effectiveness_metrics', 'review_frequency', 'deviation_trending'],
        };
      },
    },
    {
      id: 'sop_020',
      dimension: 'documentation',
      title: 'No Change Impact Assessment Required',
      question:
        'When changes are made to this SOP, is an impact assessment performed? How do you evaluate whether a change affects related procedures, training, validations, or regulatory filings?',
      check(answers): WarGameFinding | null {
        if (answers.impact_assessment_required !== false) return null;
        return {
          id: 'sop_020',
          dimension: 'documentation',
          severity: 'warning',
          title: 'No Change Impact Assessment Required',
          question:
            'When changes are made to this SOP, is an impact assessment performed? How do you evaluate whether a change affects related procedures, training, validations, or regulatory filings?',
          observation:
            'Change impact assessment is not required for modifications to this SOP. Without a formal impact assessment, changes may be made in isolation without considering downstream effects on related SOPs, training curricula, validated systems, batch records, or regulatory submissions. This creates a risk of cascading non-compliance that may not surface until an inspection or quality event.',
          requirement:
            'Changes to the pharmaceutical quality system should be evaluated for their impact on product quality, regulatory filings, validated states, and other elements of the quality system. The depth of assessment should be commensurate with the level of risk.',
          reference: 'ICH Q10 Section 3.2.4',
          recommendation:
            'Require a documented impact assessment for all SOP changes. The assessment should evaluate effects on: related procedures and work instructions, training requirements, validated systems and equipment, regulatory submissions, batch records and forms, and cross-referenced documents. Define criteria for when a full impact assessment versus a simplified assessment is appropriate.',
          relatedFields: ['impact_assessment_required', 'change_request_process', 'stakeholder_notification', 'cross_reference_sops', 'change_effectiveness_review'],
        };
      },
    },
  ];

  return {
    category: 'sop',
    name: 'SOP System Auditor',
    description:
      'Simulates FDA inspector scrutiny of Standard Operating Procedures and quality system elements during a GMP/GCP inspection, examining document control, training, Part 11 compliance, CAPA integration, and audit readiness.',
    rules,
  };
}
