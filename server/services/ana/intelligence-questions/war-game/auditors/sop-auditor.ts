/**
 * SOP War Game Auditor
 *
 * Simulates an FDA GCP/GMP inspector scrutinizing a Standard Operating
 * Procedure during a facility inspection. Each rule represents a question
 * a seasoned FDA field investigator would ask when reviewing SOPs against
 * 21 CFR 211 (cGMP), 21 CFR 820 (QSR), ICH E6(R2) (GCP), and
 * 21 CFR Part 11 (electronic records).
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/sop-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the value is null, undefined, empty string, or empty array. */
function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/** Case-insensitive substring / array-includes check. */
function includes(val: unknown, search: string): boolean {
  if (typeof val === 'string') return val.toLowerCase().includes(search.toLowerCase());
  if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(search.toLowerCase()));
  return false;
}

/** Coerce a value to a trimmed string (empty string when nullish). */
function str(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

/** Coerce a value to a number (NaN-safe). */
function num(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

/** Prefixed rule ID for SOP auditor. */
const rid = (suffix: string) => 'sop_' + suffix;

// ---------------------------------------------------------------------------
// Auditor factory
// ---------------------------------------------------------------------------

export function createSopAuditor(): WarGameAuditor {
  const rules: AuditRule[] = [
    // ───────────────────────────────────────────────────────────────────────
    // sop_001 — completeness: Missing SOP title
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('001'),
      dimension: 'completeness',
      title: 'SOP title is missing or inadequate',
      question:
        'This SOP has no descriptive title. Per 21 CFR 211.186, every batch production and control record must be identifiable. How do your personnel locate and reference this procedure?',
      check(answers): WarGameFinding | null {
        const title = str(answers.sop_title);
        if (title.length >= 10) return null;
        return {
          id: rid('001'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'SOP title is missing or inadequate',
          question:
            'This SOP has no descriptive title. Per 21 CFR 211.186, every batch production and control record must be identifiable. How do your personnel locate and reference this procedure?',
          observation:
            `The SOP title is ${title.length === 0 ? 'blank' : `only ${title.length} characters ("${title}")`}. ` +
            'A clear, descriptive title is essential for document control, cross-referencing, and training records.',
          requirement:
            '21 CFR 211.186 requires that records be identifiable. ICH E6(R2) Section 5.5.3 requires that SOPs be documented, ' +
            'and an identifiable title is the baseline for any document control system.',
          reference: '21 CFR 211.186; ICH E6(R2) Section 5.5.3',
          recommendation:
            'Assign a descriptive title that identifies the process, department, and scope. ' +
            'Example: "Standard Operating Procedure for Environmental Monitoring in Aseptic Manufacturing Areas".',
          relatedFields: ['sop_title'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_002 — documentation: Missing SOP number
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('002'),
      dimension: 'documentation',
      title: 'No SOP document number assigned',
      question:
        'I do not see a document control number on this SOP. Under 21 CFR 820.40, how does your document control system track this procedure without a unique identifier?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.sop_number)) return null;
        return {
          id: rid('002'),
          dimension: 'documentation',
          severity: 'critical',
          title: 'No SOP document number assigned',
          question:
            'I do not see a document control number on this SOP. Under 21 CFR 820.40, how does your document control system track this procedure without a unique identifier?',
          observation:
            'The SOP lacks a unique document number. Without a document control number, there is no way to ensure that ' +
            'personnel are using the current approved version, and the document cannot be properly tracked in the quality system.',
          requirement:
            '21 CFR 820.40(a) requires that each manufacturer establish and maintain procedures to control all documents. ' +
            'Documents must be identified with a unique identifier. 21 CFR 211.186 also requires record identification.',
          reference: '21 CFR 820.40(a); 21 CFR 211.186',
          recommendation:
            'Assign a unique document number following your site document numbering convention (e.g., SOP-QA-001). ' +
            'Ensure the number is displayed in the header or footer of every page.',
          relatedFields: ['sop_number'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_003 — regulatory_alignment: No applicable regulations cited
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('003'),
      dimension: 'regulatory_alignment',
      title: 'No applicable regulations referenced',
      question:
        'This SOP does not reference any applicable regulations. During our inspection we need to understand which regulatory requirements this procedure is intended to satisfy. What is the regulatory basis for this SOP?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.applicable_regulations)) return null;
        return {
          id: rid('003'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'No applicable regulations referenced',
          question:
            'This SOP does not reference any applicable regulations. During our inspection we need to understand which regulatory requirements this procedure is intended to satisfy. What is the regulatory basis for this SOP?',
          observation:
            'The applicable regulations field is empty. SOPs must be traceable to the regulatory requirements they fulfill. ' +
            'Without this traceability, it is impossible to verify that the procedure adequately addresses all applicable regulatory obligations.',
          requirement:
            '21 CFR 211.22(d) requires written procedures for production and process controls. 21 CFR 820.20(a) requires a quality policy ' +
            'that includes compliance with applicable regulatory requirements. Each SOP should reference the specific regulations it implements.',
          reference: '21 CFR 211.22(d); 21 CFR 820.20(a); ICH E6(R2) Section 5.1.1',
          recommendation:
            'Add a "Regulatory References" section listing all applicable regulations (e.g., 21 CFR 211, 21 CFR 820, ICH E6(R2), ' +
            '21 CFR Part 11) and the specific sections this SOP addresses.',
          relatedFields: ['applicable_regulations'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_004 — completeness: No purpose statement
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('004'),
      dimension: 'completeness',
      title: 'Purpose statement missing or insufficient',
      question:
        'The purpose of this SOP is not clearly stated. Per 21 CFR 820.40, procedures must be adequate for their intended use. How do you demonstrate adequacy without a defined purpose?',
      check(answers): WarGameFinding | null {
        const purpose = str(answers.purpose_statement);
        if (purpose.length >= 30) return null;
        return {
          id: rid('004'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'Purpose statement missing or insufficient',
          question:
            'The purpose of this SOP is not clearly stated. Per 21 CFR 820.40, procedures must be adequate for their intended use. How do you demonstrate adequacy without a defined purpose?',
          observation:
            `The purpose statement is ${purpose.length === 0 ? 'missing entirely' : `only ${purpose.length} characters`}. ` +
            'A well-defined purpose statement establishes the intent, applicability, and expected outcome of the procedure.',
          requirement:
            '21 CFR 820.40 requires procedures to be adequate for their intended purpose. ' +
            'ICH E6(R2) Section 5.1.1 requires the sponsor to implement a system to manage quality, including documented procedures with clear objectives.',
          reference: '21 CFR 820.40; ICH E6(R2) Section 5.1.1',
          recommendation:
            'Write a purpose statement that clearly defines: (1) the objective of the procedure, ' +
            '(2) the regulatory requirement it satisfies, and (3) the expected outcome when the procedure is correctly followed.',
          relatedFields: ['purpose_statement'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_005 — documentation: No document owner assigned
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('005'),
      dimension: 'documentation',
      title: 'No document owner designated',
      question:
        'Who is the designated owner of this SOP? Under 21 CFR 211.22, the quality unit has responsibility for approving procedures. Show me the document ownership assignment.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.document_owner)) return null;
        return {
          id: rid('005'),
          dimension: 'documentation',
          severity: 'warning',
          title: 'No document owner designated',
          question:
            'Who is the designated owner of this SOP? Under 21 CFR 211.22, the quality unit has responsibility for approving procedures. Show me the document ownership assignment.',
          observation:
            'No document owner has been designated. Without a responsible owner, periodic reviews may be missed, ' +
            'training may not be assigned to appropriate personnel, and accountability for content accuracy is unclear.',
          requirement:
            '21 CFR 211.22 assigns the quality control unit responsibility for approving or rejecting procedures. ' +
            '21 CFR 820.40(a) requires designated individuals to review and approve documents. A document owner ensures ongoing maintenance.',
          reference: '21 CFR 211.22; 21 CFR 820.40(a)',
          recommendation:
            'Assign a document owner (typically a subject matter expert or department manager) who is responsible for ' +
            'content accuracy, periodic review, and coordinating revisions through the change control process.',
          relatedFields: ['document_owner'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_006 — completeness: No roles and responsibilities defined
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('006'),
      dimension: 'completeness',
      title: 'Roles and responsibilities not defined',
      question:
        'This SOP does not define who is responsible for performing each step. Per ICH E6(R2), responsibilities must be clearly assigned. Who performs this procedure, who supervises, and who approves?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.roles_responsibilities)) return null;
        return {
          id: rid('006'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'Roles and responsibilities not defined',
          question:
            'This SOP does not define who is responsible for performing each step. Per ICH E6(R2), responsibilities must be clearly assigned. Who performs this procedure, who supervises, and who approves?',
          observation:
            'The roles and responsibilities section is empty. Without clearly defined roles, ' +
            'there is no accountability for execution, verification, or approval of the process described in this SOP.',
          requirement:
            'ICH E6(R2) Section 5.1.1 requires that responsibilities be clearly assigned. ' +
            '21 CFR 211.25 requires that each person engaged in activities shall have the education, training, and experience to perform assigned functions. ' +
            'Responsibility assignment is the prerequisite for verifying qualified personnel execute each step.',
          reference: 'ICH E6(R2) Section 5.1.1; 21 CFR 211.25; 21 CFR 820.20(b)(1)',
          recommendation:
            'Add a Roles and Responsibilities section that specifies: the performing role, the reviewing/verifying role, ' +
            'the approving role, and the Quality Assurance oversight role for this procedure.',
          relatedFields: ['roles_responsibilities'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_007 — completeness: No procedure steps documented
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('007'),
      dimension: 'completeness',
      title: 'Procedure steps not documented',
      question:
        'I see no step-by-step procedure in this SOP. Under 21 CFR 211.100, written procedures must be established and followed. Where are the operational steps your personnel are expected to execute?',
      check(answers): WarGameFinding | null {
        const steps = str(answers.procedure_steps);
        if (steps.length >= 50) return null;
        return {
          id: rid('007'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'Procedure steps not documented',
          question:
            'I see no step-by-step procedure in this SOP. Under 21 CFR 211.100, written procedures must be established and followed. Where are the operational steps your personnel are expected to execute?',
          observation:
            `The procedure steps section is ${steps.length === 0 ? 'empty' : `only ${steps.length} characters, which is insufficient for an operational procedure`}. ` +
            'An SOP without detailed, sequential steps cannot serve its fundamental purpose as a controlled document.',
          requirement:
            '21 CFR 211.100(a) requires written procedures for production and process control designed to assure that drug products have the identity, strength, quality, and purity they purport to possess. ' +
            '21 CFR 820.75 requires documented procedures for process validation.',
          reference: '21 CFR 211.100(a); 21 CFR 820.75; ICH E6(R2) Section 5.5.3',
          recommendation:
            'Document every step of the procedure in sequential order. Each step should be actionable, include acceptance criteria where applicable, ' +
            'and specify the responsible role. Use numbered steps with sufficient detail that a trained operator can execute the procedure consistently.',
          relatedFields: ['procedure_steps'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_008 — risk_identification: No deviation handling procedure
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('008'),
      dimension: 'risk_identification',
      title: 'No deviation handling procedure referenced',
      question:
        'What happens when personnel deviate from this SOP? I see no deviation handling instructions. Per 21 CFR 211.192, any unexplained discrepancy must be investigated. Show me your deviation process.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.deviation_handling)) return null;
        return {
          id: rid('008'),
          dimension: 'risk_identification',
          severity: 'critical',
          title: 'No deviation handling procedure referenced',
          question:
            'What happens when personnel deviate from this SOP? I see no deviation handling instructions. Per 21 CFR 211.192, any unexplained discrepancy must be investigated. Show me your deviation process.',
          observation:
            'The SOP does not describe or reference a deviation handling process. ' +
            'When personnel cannot follow a procedure as written, there must be a defined path for documenting, investigating, and resolving the deviation.',
          requirement:
            '21 CFR 211.192 requires investigation of any unexplained discrepancy or the failure of a batch or any of its components to meet specifications. ' +
            '21 CFR 820.90(a) requires procedures for controlling nonconforming product. Deviation handling is a foundational element of both cGMP and QSR compliance.',
          reference: '21 CFR 211.192; 21 CFR 820.90(a); ICH E6(R2) Section 5.20.1',
          recommendation:
            'Add a Deviation Handling section that either describes the deviation process or references the site deviation SOP. ' +
            'Include instructions for immediate actions, documentation requirements, notification thresholds, and timelines for investigation.',
          relatedFields: ['deviation_handling'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_009 — regulatory_alignment: No CAPA reference
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('009'),
      dimension: 'regulatory_alignment',
      title: 'No CAPA reference in SOP',
      question:
        'This SOP makes no reference to your CAPA system. Per 21 CFR 820.90, you are required to establish procedures for corrective and preventive action. How are systemic failures from this process captured and remediated?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.capa_reference)) return null;
        return {
          id: rid('009'),
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'No CAPA reference in SOP',
          question:
            'This SOP makes no reference to your CAPA system. Per 21 CFR 820.90, you are required to establish procedures for corrective and preventive action. How are systemic failures from this process captured and remediated?',
          observation:
            'The SOP does not reference the site CAPA system. Deviations, out-of-specification results, and recurring issues identified during execution of this procedure ' +
            'may require corrective and preventive action, and personnel need clear direction on when and how to escalate to CAPA.',
          requirement:
            '21 CFR 820.90 requires procedures for corrective and preventive action, including analyzing processes and investigating the cause of nonconformities. ' +
            '21 CFR 211.192 requires investigation of discrepancies. The CAPA system must be linked to operational SOPs.',
          reference: '21 CFR 820.90; 21 CFR 211.192',
          recommendation:
            'Add a cross-reference to the site CAPA SOP. Define the criteria for escalating a deviation to a CAPA ' +
            '(e.g., repeat deviations, product impact, patient safety implications) and the responsible roles for initiation.',
          relatedFields: ['capa_reference'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_010 — completeness: No training requirements specified
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('010'),
      dimension: 'completeness',
      title: 'Training requirements not specified',
      question:
        'This SOP does not specify training requirements. Under 21 CFR 211.25, personnel must be trained before performing GMP activities. What training is required before an operator can execute this procedure?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.training_requirements)) return null;
        return {
          id: rid('010'),
          dimension: 'completeness',
          severity: 'critical',
          title: 'Training requirements not specified',
          question:
            'This SOP does not specify training requirements. Under 21 CFR 211.25, personnel must be trained before performing GMP activities. What training is required before an operator can execute this procedure?',
          observation:
            'No training requirements are defined. Without specified training prerequisites, there is no assurance that personnel executing this procedure ' +
            'have the necessary knowledge and skills, creating risk to product quality and patient safety.',
          requirement:
            '21 CFR 211.25(a) requires that each person engaged in manufacture, processing, packing, or holding of a drug product shall have education, training, and experience. ' +
            '21 CFR 820.25(b) requires that training be documented. ICH E6(R2) Section 5.2.1 requires that qualified individuals perform trial-related duties.',
          reference: '21 CFR 211.25(a); 21 CFR 820.25(b); ICH E6(R2) Section 5.2.1',
          recommendation:
            'Define training prerequisites including: required read-and-understand of this SOP, any prerequisite SOPs, ' +
            'hands-on demonstration requirements, initial qualification criteria, and retraining frequency.',
          relatedFields: ['training_requirements'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_011 — scientific_rigor: No competency assessment method
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('011'),
      dimension: 'scientific_rigor',
      title: 'No competency assessment defined',
      question:
        'How do you verify that personnel are competent to perform this procedure? 21 CFR 820.25 requires that training effectiveness be assessed. Show me your competency evaluation records.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.competency_assessment)) return null;
        return {
          id: rid('011'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'No competency assessment defined',
          question:
            'How do you verify that personnel are competent to perform this procedure? 21 CFR 820.25 requires that training effectiveness be assessed. Show me your competency evaluation records.',
          observation:
            'The SOP does not define a competency assessment method. Reading an SOP alone does not demonstrate competency. ' +
            'Without a practical assessment, there is no evidence that trained personnel can correctly execute the procedure.',
          requirement:
            '21 CFR 820.25(b) requires that training be documented and shall include verification of training effectiveness. ' +
            'ICH E6(R2) Section 5.2.1 requires that individuals be qualified by education, training, and experience.',
          reference: '21 CFR 820.25(b); ICH E6(R2) Section 5.2.1',
          recommendation:
            'Define a competency assessment method appropriate to the procedure complexity: written exam, practical demonstration, ' +
            'observed performance, or a combination. Include pass/fail criteria, documentation requirements, and reassessment frequency.',
          relatedFields: ['competency_assessment'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_012 — consistency: Training method not specified
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('012'),
      dimension: 'consistency',
      title: 'Training method not specified',
      question:
        'What training method is used for this SOP — read-and-understand, classroom, on-the-job, or practical demonstration? Per 21 CFR 211.25 training must be appropriate to the function performed.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.training_method)) return null;
        if (isEmpty(answers.training_requirements)) return null;
        return {
          id: rid('012'),
          dimension: 'consistency',
          severity: 'warning',
          title: 'Training method not specified despite training requirements',
          question:
            'What training method is used for this SOP — read-and-understand, classroom, on-the-job, or practical demonstration? Per 21 CFR 211.25 training must be appropriate to the function performed.',
          observation:
            'Training requirements are listed but the training method is not defined. ' +
            'Different procedures require different training modalities; a complex aseptic gowning procedure requires hands-on training, ' +
            'not just a read-and-understand.',
          requirement:
            '21 CFR 211.25(a) requires training in the particular operations performed and in cGMP as applicable. ' +
            'The training method must be commensurate with the complexity and risk of the procedure.',
          reference: '21 CFR 211.25(a); 21 CFR 820.25(a)',
          recommendation:
            'Specify the training delivery method: read-and-understand, instructor-led classroom, on-the-job training with qualified trainer, ' +
            'practical demonstration, or simulation. Match the modality to the procedure complexity and GMP criticality.',
          relatedFields: ['training_method', 'training_requirements'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_013 — documentation: No version history maintained
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('013'),
      dimension: 'documentation',
      title: 'No version history maintained',
      question:
        'Where is the revision history for this SOP? Per 21 CFR 820.40, document changes must be reviewed and approved. I need to see what was changed, when, and by whom for every revision.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.version_history)) return null;
        return {
          id: rid('013'),
          dimension: 'documentation',
          severity: 'critical',
          title: 'No version history maintained',
          question:
            'Where is the revision history for this SOP? Per 21 CFR 820.40, document changes must be reviewed and approved. I need to see what was changed, when, and by whom for every revision.',
          observation:
            'The SOP has no version history. Without a revision log, it is impossible to trace what was changed between versions, ' +
            'the reason for the change, who authored and approved each revision, and whether affected personnel were retrained.',
          requirement:
            '21 CFR 820.40(b) requires that changes to documents be reviewed and approved by the same function/organization that performed the original review. ' +
            'The approved changes must be communicated to appropriate personnel in a timely manner. A revision history is the primary evidence of compliance.',
          reference: '21 CFR 820.40(b); 21 CFR 211.186',
          recommendation:
            'Add a revision history table documenting: version number, effective date, description of changes, author, and approver for each revision. ' +
            'Reference the change control record number that authorized each revision.',
          relatedFields: ['version_history'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_014 — regulatory_alignment: No change control process
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('014'),
      dimension: 'regulatory_alignment',
      title: 'No change control process referenced',
      question:
        'How are changes to this SOP controlled? 21 CFR 820.40 requires procedures for document changes. I see no reference to a change control process. Is this a controlled document?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.change_control_process)) return null;
        return {
          id: rid('014'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'No change control process referenced',
          question:
            'How are changes to this SOP controlled? 21 CFR 820.40 requires procedures for document changes. I see no reference to a change control process. Is this a controlled document?',
          observation:
            'The SOP does not reference or describe a change control process. Without formal change control, ' +
            'modifications to the procedure could be made without proper review, approval, impact assessment, or retraining.',
          requirement:
            '21 CFR 820.40 requires document change controls including review and approval by appropriate personnel. ' +
            '21 CFR 211.100 requires that written procedures shall be followed and that any changes be drafted, reviewed, and approved. ' +
            '21 CFR Part 11.10(e) requires audit trails for electronic records to document changes.',
          reference: '21 CFR 820.40; 21 CFR 211.100; 21 CFR Part 11.10(e)',
          recommendation:
            'Reference the site change control SOP and describe the process for initiating, reviewing, approving, and implementing changes to this document. ' +
            'Include requirements for impact assessment, affected document updates, and retraining.',
          relatedFields: ['change_control_process'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_015 — documentation: No approval workflow defined
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('015'),
      dimension: 'documentation',
      title: 'No approval workflow defined',
      question:
        'Who approved this SOP and through what workflow? Per 21 CFR 820.40(a), documents must be reviewed and approved by designated individuals. Show me your approval chain.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.approval_workflow)) return null;
        return {
          id: rid('015'),
          dimension: 'documentation',
          severity: 'critical',
          title: 'No approval workflow defined',
          question:
            'Who approved this SOP and through what workflow? Per 21 CFR 820.40(a), documents must be reviewed and approved by designated individuals. Show me your approval chain.',
          observation:
            'No approval workflow is defined. SOPs must go through formal review and approval before they become effective. ' +
            'Without a defined workflow, there is no evidence that qualified individuals have reviewed the procedure for accuracy, completeness, and regulatory compliance.',
          requirement:
            '21 CFR 820.40(a) requires that each manufacturer designate individuals to review and approve all documents before issuance. ' +
            '21 CFR 211.22(c) requires the quality control unit to approve procedures impacting drug product quality.',
          reference: '21 CFR 820.40(a); 21 CFR 211.22(c)',
          recommendation:
            'Define the approval workflow specifying: the author/drafter, subject matter expert reviewer(s), QA reviewer, and final approver. ' +
            'For electronic systems, ensure the workflow complies with 21 CFR Part 11 requirements for electronic signatures.',
          relatedFields: ['approval_workflow'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_016 — consistency: No effective date
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('016'),
      dimension: 'consistency',
      title: 'No effective date on SOP',
      question:
        'When did this SOP become effective? I see no effective date. How do you know that the version in use at the time of a specific batch was the current approved version?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.effective_date)) return null;
        return {
          id: rid('016'),
          dimension: 'consistency',
          severity: 'critical',
          title: 'No effective date on SOP',
          question:
            'When did this SOP become effective? I see no effective date. How do you know that the version in use at the time of a specific batch was the current approved version?',
          observation:
            'The SOP has no effective date. Without an effective date, it is impossible to determine whether this version was in effect ' +
            'during a particular manufacturing event, making retrospective investigations and batch record reviews unreliable.',
          requirement:
            '21 CFR 820.40 requires that documents be available at locations of use and that obsolete documents be promptly removed. ' +
            'An effective date is essential for document control and compliance verification during inspections.',
          reference: '21 CFR 820.40; 21 CFR 211.186',
          recommendation:
            'Add an effective date that indicates when this version of the SOP was approved and became the current controlled version. ' +
            'The effective date should be set after all approvals and training have been completed.',
          relatedFields: ['effective_date'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_017 — regulatory_alignment: No review cycle defined
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('017'),
      dimension: 'regulatory_alignment',
      title: 'No periodic review cycle established',
      question:
        'How often is this SOP reviewed for continued adequacy? 21 CFR 820.40 requires periodic review. What is your review cycle, and can you show me evidence that the last review was conducted on schedule?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.review_cycle)) return null;
        return {
          id: rid('017'),
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'No periodic review cycle established',
          question:
            'How often is this SOP reviewed for continued adequacy? 21 CFR 820.40 requires periodic review. What is your review cycle, and can you show me evidence that the last review was conducted on schedule?',
          observation:
            'No periodic review cycle is defined. SOPs can become outdated as regulations change, processes evolve, or equipment is replaced. ' +
            'Without a review cycle, there is no mechanism to ensure the SOP remains current and accurate.',
          requirement:
            '21 CFR 820.40 implicitly requires periodic review through its requirement for document adequacy. ' +
            'ICH E6(R2) Section 5.1.1 requires that the sponsor implement systems to ensure the quality of every aspect of the trial, ' +
            'which includes keeping procedures current. Industry standard is a review cycle of no more than 2-3 years.',
          reference: '21 CFR 820.40; ICH E6(R2) Section 5.1.1',
          recommendation:
            'Establish a periodic review cycle (typically every 2 years for GMP SOPs, annually for high-risk procedures). ' +
            'Document the review date, reviewer, and outcome (no change needed, revision initiated, or SOP retired).',
          relatedFields: ['review_cycle'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_018 — completeness: No definitions section
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('018'),
      dimension: 'completeness',
      title: 'No definitions or abbreviations section',
      question:
        'This SOP has no definitions section. How do you ensure that all personnel interpreting this procedure understand terms the same way? Ambiguous terminology causes deviations.',
      check(answers): WarGameFinding | null {
        const defs = answers.definitions_included;
        if (defs === true || str(defs) === 'true' || str(defs) === 'yes') return null;
        if (!isEmpty(defs) && str(defs).length >= 20) return null;
        return {
          id: rid('018'),
          dimension: 'completeness',
          severity: 'info',
          title: 'No definitions or abbreviations section',
          question:
            'This SOP has no definitions section. How do you ensure that all personnel interpreting this procedure understand terms the same way? Ambiguous terminology causes deviations.',
          observation:
            'The SOP does not include a definitions or abbreviations section. Technical terms, acronyms, and process-specific language ' +
            'may be interpreted differently by different personnel, leading to inconsistent execution.',
          requirement:
            'ICH E6(R2) and cGMP best practices call for clear, unambiguous procedures. ' +
            'A definitions section reduces the risk of misinterpretation, particularly for multi-disciplinary or multi-site SOPs.',
          reference: 'ICH E6(R2); 21 CFR 211.100; FDA Guidance on Quality Systems Approach',
          recommendation:
            'Add a Definitions and Abbreviations section that defines all technical terms, abbreviations, and acronyms used in the SOP. ' +
            'Consider referencing a site-level glossary for commonly used terms.',
          relatedFields: ['definitions_included'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_019 — documentation: No record retention period defined
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('019'),
      dimension: 'documentation',
      title: 'Record retention period not defined',
      question:
        'What is the record retention period for documents generated by this procedure? 21 CFR 211.180 requires records to be retained for at least one year after the expiry date of the batch. Where is your retention schedule?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.record_retention_period)) return null;
        return {
          id: rid('019'),
          dimension: 'documentation',
          severity: 'warning',
          title: 'Record retention period not defined',
          question:
            'What is the record retention period for documents generated by this procedure? 21 CFR 211.180 requires records to be retained for at least one year after the expiry date of the batch. Where is your retention schedule?',
          observation:
            'The SOP does not specify a record retention period for the records generated during its execution. ' +
            'Records destroyed prematurely cannot support regulatory inspections, investigations, or product complaints.',
          requirement:
            '21 CFR 211.180(a) requires that records for drug products be retained for at least one year after the expiry date of the batch. ' +
            '21 CFR 820.184 requires that device records be retained for the design and expected life of the device, but no less than two years from product release. ' +
            'ICH E6(R2) Section 4.9.5 requires essential documents to be retained for at least two years after the last approval of a marketing application.',
          reference: '21 CFR 211.180(a); 21 CFR 820.184; ICH E6(R2) Section 4.9.5',
          recommendation:
            'Define the retention period for all records generated by this SOP. Reference the site record retention schedule and ensure the period meets the longest applicable regulatory requirement.',
          relatedFields: ['record_retention_period'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_020 — risk_identification: No risk assessment referenced
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('020'),
      dimension: 'risk_identification',
      title: 'No risk assessment referenced',
      question:
        'Has a risk assessment been performed for the process described in this SOP? ICH Q9 requires a systematic approach to quality risk management. Show me the risk assessment that supports this procedure.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.risk_assessment_reference)) return null;
        return {
          id: rid('020'),
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'No risk assessment referenced',
          question:
            'Has a risk assessment been performed for the process described in this SOP? ICH Q9 requires a systematic approach to quality risk management. Show me the risk assessment that supports this procedure.',
          observation:
            'The SOP does not reference a risk assessment (e.g., FMEA, HACCP, fault tree analysis) for the process it describes. ' +
            'Without a documented risk assessment, critical process parameters and risk mitigation measures may not be adequately identified.',
          requirement:
            'ICH Q9 establishes the framework for quality risk management in pharmaceutical manufacturing. ' +
            '21 CFR 820.30(g) requires risk analysis for device design. ICH E6(R2) Section 5.0 requires risk-based approaches to clinical trial quality.',
          reference: 'ICH Q9; 21 CFR 820.30(g); ICH E6(R2) Section 5.0',
          recommendation:
            'Perform and document a process risk assessment using an appropriate methodology (FMEA, HACCP, fishbone diagram). ' +
            'Reference the risk assessment document number in the SOP and ensure control measures identified in the risk assessment are reflected in the procedure steps.',
          relatedFields: ['risk_assessment_reference'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_021 — consistency: No distribution list
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('021'),
      dimension: 'consistency',
      title: 'No distribution list defined',
      question:
        'Who receives controlled copies of this SOP? Per 21 CFR 820.40, documents must be available at all locations of use. Without a distribution list, how do you ensure obsolete copies are retrieved?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.distribution_list)) return null;
        return {
          id: rid('021'),
          dimension: 'consistency',
          severity: 'info',
          title: 'No distribution list defined',
          question:
            'Who receives controlled copies of this SOP? Per 21 CFR 820.40, documents must be available at all locations of use. Without a distribution list, how do you ensure obsolete copies are retrieved?',
          observation:
            'No distribution list is defined. Without knowing which departments and roles receive this SOP, ' +
            'there is no mechanism to ensure all affected personnel have access to the current version and that obsolete copies are removed.',
          requirement:
            '21 CFR 820.40(a) requires that approved documents are available at all locations where operations essential to the effective functioning of the quality system are performed. ' +
            'Obsolete documents must be promptly removed from all points of use.',
          reference: '21 CFR 820.40(a)',
          recommendation:
            'Define a distribution list specifying all departments, roles, or work stations that must have access to this SOP. ' +
            'For electronic document management systems, define the access permissions that serve as the distribution control.',
          relatedFields: ['distribution_list'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_022 — completeness: No related documents cross-referenced
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('022'),
      dimension: 'completeness',
      title: 'No related documents cross-referenced',
      question:
        'Does this SOP operate in isolation? I see no cross-references to related SOPs, forms, or work instructions. How do your operators know which forms to complete or which upstream and downstream procedures apply?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.related_documents)) return null;
        return {
          id: rid('022'),
          dimension: 'completeness',
          severity: 'warning',
          title: 'No related documents cross-referenced',
          question:
            'Does this SOP operate in isolation? I see no cross-references to related SOPs, forms, or work instructions. How do your operators know which forms to complete or which upstream and downstream procedures apply?',
          observation:
            'The SOP does not reference any related documents such as forms, logbooks, work instructions, specifications, or upstream/downstream SOPs. ' +
            'Most procedures exist within a process chain and require associated documentation.',
          requirement:
            '21 CFR 211.186 requires complete records that trace all steps. ' +
            'A quality system must maintain traceability between procedures, and cross-references are essential for holistic process understanding.',
          reference: '21 CFR 211.186; 21 CFR 820.40; ICH E6(R2) Section 5.5.3',
          recommendation:
            'Add a Related Documents section listing all associated SOPs, work instructions, forms, templates, specifications, ' +
            'and regulatory guidance that personnel need to reference when executing this procedure.',
          relatedFields: ['related_documents'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_023 — practical_feasibility: Process scope too broad or undefined
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('023'),
      dimension: 'practical_feasibility',
      title: 'Process scope undefined or too broad',
      question:
        'What is the scope of this SOP? I cannot determine what processes are included and, more importantly, what is excluded. An SOP with unclear boundaries leads to gaps and overlaps with other procedures.',
      check(answers): WarGameFinding | null {
        const scope = str(answers.process_scope);
        if (scope.length >= 30) return null;
        return {
          id: rid('023'),
          dimension: 'practical_feasibility',
          severity: 'warning',
          title: 'Process scope undefined or too broad',
          question:
            'What is the scope of this SOP? I cannot determine what processes are included and, more importantly, what is excluded. An SOP with unclear boundaries leads to gaps and overlaps with other procedures.',
          observation:
            `The process scope is ${scope.length === 0 ? 'not defined' : `only ${scope.length} characters, which is too brief to define clear boundaries`}. ` +
            'Without a well-defined scope, personnel may not know whether a specific situation or process variant is covered by this SOP ' +
            'or by another procedure.',
          requirement:
            '21 CFR 211.100 requires written procedures for production and process control. ' +
            'The scope defines the boundaries of each procedure and prevents gaps or overlaps in the quality system.',
          reference: '21 CFR 211.100; 21 CFR 820.40',
          recommendation:
            'Define the scope clearly, including: what processes, equipment, and products are covered, ' +
            'what is explicitly excluded, the start and end points of the procedure, and any limitations or preconditions.',
          relatedFields: ['process_scope'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_024 — regulatory_alignment: Part 11 compliance gap
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('024'),
      dimension: 'regulatory_alignment',
      title: '21 CFR Part 11 compliance not addressed',
      question:
        'Does this SOP involve electronic records or electronic signatures? If so, where are your 21 CFR Part 11 controls — audit trails, access controls, and electronic signature requirements?',
      check(answers): WarGameFinding | null {
        const regs = str(answers.applicable_regulations).toLowerCase();
        if (regs.includes('part 11') || regs.includes('part11') || regs.includes('11.10')) return null;
        // Only flag if the SOP involves electronic systems
        const steps = str(answers.procedure_steps).toLowerCase();
        const scope = str(answers.process_scope).toLowerCase();
        const hasElectronic =
          steps.includes('electronic') || steps.includes('system') || steps.includes('software') ||
          steps.includes('database') || steps.includes('lims') || steps.includes('edms') ||
          scope.includes('electronic') || scope.includes('system') || scope.includes('software');
        if (!hasElectronic) return null;
        return {
          id: rid('024'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: '21 CFR Part 11 compliance not addressed',
          question:
            'Does this SOP involve electronic records or electronic signatures? If so, where are your 21 CFR Part 11 controls — audit trails, access controls, and electronic signature requirements?',
          observation:
            'The SOP references electronic systems, software, or databases in the procedure steps or scope, ' +
            'but does not reference 21 CFR Part 11 in the applicable regulations. Electronic records generated or maintained under this procedure ' +
            'must comply with Part 11 requirements for audit trails, access controls, system validation, and electronic signatures.',
          requirement:
            '21 CFR Part 11.10 requires that persons who use electronic record/electronic signature systems shall employ procedures and controls to ensure ' +
            'the authenticity, integrity, and confidentiality of electronic records, including audit trails, access controls, and operational system checks.',
          reference: '21 CFR Part 11.10; FDA Guidance on Scope and Application of 21 CFR Part 11 (2003)',
          recommendation:
            'Add 21 CFR Part 11 to the applicable regulations. Address audit trail requirements, user access controls, ' +
            'electronic signature manifest, system validation status, and backup/recovery procedures for electronic records generated by this SOP.',
          relatedFields: ['applicable_regulations', 'procedure_steps', 'process_scope'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_025 — consistency: Department not specified
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('025'),
      dimension: 'consistency',
      title: 'Responsible department not identified',
      question:
        'Which department owns and operates under this SOP? Without departmental attribution, training assignments and management review cannot be properly directed.',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.department)) return null;
        return {
          id: rid('025'),
          dimension: 'consistency',
          severity: 'warning',
          title: 'Responsible department not identified',
          question:
            'Which department owns and operates under this SOP? Without departmental attribution, training assignments and management review cannot be properly directed.',
          observation:
            'No department is identified for this SOP. Department attribution is essential for management review, ' +
            'training assignment, periodic review responsibility, and organizational accountability.',
          requirement:
            '21 CFR 211.22 requires the quality control unit to have responsibility and authority. ' +
            '21 CFR 820.20(b)(1) requires that management establish the organizational structure. Departmental ownership of SOPs supports both requirements.',
          reference: '21 CFR 211.22; 21 CFR 820.20(b)(1)',
          recommendation:
            'Identify the owning department and any supporting departments. This enables proper routing for review cycles, ' +
            'training assignments, and management responsibility for procedure compliance.',
          relatedFields: ['department'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_026 — scientific_rigor: Procedure steps lack specificity
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('026'),
      dimension: 'scientific_rigor',
      title: 'Procedure steps lack specificity',
      question:
        'Your procedure steps are vague. 21 CFR 211.100 requires procedures designed to assure that products have the required identity, strength, quality, and purity. ' +
        'Show me the specific parameters, acceptance criteria, and measurable actions in each step.',
      check(answers): WarGameFinding | null {
        const steps = str(answers.procedure_steps);
        if (steps.length === 0 || steps.length >= 200) return null;
        if (steps.length >= 50) return null;
        return {
          id: rid('026'),
          dimension: 'scientific_rigor',
          severity: 'warning',
          title: 'Procedure steps lack specificity',
          question:
            'Your procedure steps are vague. 21 CFR 211.100 requires procedures designed to assure that products have the required identity, strength, quality, and purity. ' +
            'Show me the specific parameters, acceptance criteria, and measurable actions in each step.',
          observation:
            `The procedure steps section contains only ${steps.length} characters. Brief, high-level instructions leave room for interpretation ` +
            'and inconsistent execution between operators, shifts, and sites.',
          requirement:
            '21 CFR 211.100(a) requires written procedures designed to assure quality. ' +
            '21 CFR 820.70(a) requires that process parameters be documented. Steps must be specific enough that trained personnel can reproducibly execute the procedure.',
          reference: '21 CFR 211.100(a); 21 CFR 820.70(a)',
          recommendation:
            'Expand each step with: specific actions (who does what), measurable parameters (temperatures, times, quantities), ' +
            'acceptance criteria, equipment to be used, and decision points. A procedure step like "mix the solution" should become ' +
            '"Operator adds Component B to Vessel V-100 and mixes at 200 RPM for 15 minutes at 25 +/- 2 degrees C until solution is clear."',
          relatedFields: ['procedure_steps'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_027 — practical_feasibility: Review cycle exceeds 3 years
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('027'),
      dimension: 'practical_feasibility',
      title: 'Review cycle exceeds industry standard',
      question:
        'Your review cycle exceeds 3 years. In my inspection experience, SOPs that are not reviewed regularly become outdated and lead to deviations. What justifies such a long review interval?',
      check(answers): WarGameFinding | null {
        const cycle = str(answers.review_cycle).toLowerCase();
        if (isEmpty(cycle)) return null;
        const years = num(answers.review_cycle);
        const hasLong =
          cycle.includes('5 year') || cycle.includes('4 year') ||
          cycle.includes('5-year') || cycle.includes('4-year') ||
          (years > 3 && years <= 100);
        if (!hasLong) return null;
        return {
          id: rid('027'),
          dimension: 'practical_feasibility',
          severity: 'warning',
          title: 'Review cycle exceeds industry standard',
          question:
            'Your review cycle exceeds 3 years. In my inspection experience, SOPs that are not reviewed regularly become outdated and lead to deviations. What justifies such a long review interval?',
          observation:
            `The review cycle is specified as "${str(answers.review_cycle)}". ` +
            'Industry best practice and regulatory expectations generally call for SOP review every 2-3 years at most. ' +
            'Longer intervals increase the risk of process drift, outdated regulatory references, and non-compliance.',
          requirement:
            'While no regulation specifies an exact review interval, 21 CFR 820.40 requires procedures to be adequate for their intended use. ' +
            'FDA investigators routinely cite outdated SOPs as evidence of inadequate document control systems.',
          reference: '21 CFR 820.40; FDA Compliance Program 7356.002',
          recommendation:
            'Reduce the review cycle to no more than 2-3 years. High-risk procedures (aseptic processing, sterility testing) ' +
            'should be reviewed annually. Document the rationale for the chosen review interval in the document control SOP.',
          relatedFields: ['review_cycle'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_028 — risk_identification: Deviation handling lacks severity classification
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('028'),
      dimension: 'risk_identification',
      title: 'Deviation handling lacks severity classification',
      question:
        'Your deviation handling section does not classify deviations by severity. How do you differentiate a minor procedural deviation from one with direct product impact? 21 CFR 211.192 requires that deviations be investigated commensurate with their significance.',
      check(answers): WarGameFinding | null {
        const deviation = str(answers.deviation_handling).toLowerCase();
        if (isEmpty(deviation)) return null;
        if (deviation.includes('critical') || deviation.includes('major') || deviation.includes('minor') ||
            deviation.includes('severity') || deviation.includes('classification') || deviation.includes('tier')) return null;
        return {
          id: rid('028'),
          dimension: 'risk_identification',
          severity: 'warning',
          title: 'Deviation handling lacks severity classification',
          question:
            'Your deviation handling section does not classify deviations by severity. How do you differentiate a minor procedural deviation from one with direct product impact? 21 CFR 211.192 requires that deviations be investigated commensurate with their significance.',
          observation:
            'The deviation handling description does not include a severity classification system (e.g., critical, major, minor). ' +
            'Without classification, all deviations receive the same level of investigation, leading to either over-investigation of trivial issues ' +
            'or under-investigation of significant ones.',
          requirement:
            '21 CFR 211.192 requires thorough investigation of discrepancies. A risk-based classification system ensures that investigation depth ' +
            'is proportional to the potential impact on product quality and patient safety.',
          reference: '21 CFR 211.192; ICH Q9; ICH Q10',
          recommendation:
            'Implement a severity classification system: Critical (direct product quality/patient safety impact), ' +
            'Major (potential impact requiring further assessment), Minor (no product impact, procedural in nature). ' +
            'Define investigation timelines and escalation requirements for each category.',
          relatedFields: ['deviation_handling'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_029 — regulatory_alignment: Clinical SOP missing ICH E6(R2)
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('029'),
      dimension: 'regulatory_alignment',
      title: 'Clinical SOP missing ICH E6(R2) reference',
      question:
        'This appears to be a clinical operations SOP, yet it does not reference ICH E6(R2). GCP is the foundational regulation for clinical trial conduct. How do you demonstrate GCP compliance without referencing the applicable guideline?',
      check(answers): WarGameFinding | null {
        const dept = str(answers.department).toLowerCase();
        const scope = str(answers.process_scope).toLowerCase();
        const title = str(answers.sop_title).toLowerCase();
        const isClinical =
          dept.includes('clinical') || scope.includes('clinical') || scope.includes('trial') ||
          scope.includes('investigator') || title.includes('clinical') || title.includes('gcp') ||
          dept.includes('cro') || scope.includes('subject') || scope.includes('patient');
        if (!isClinical) return null;
        const regs = str(answers.applicable_regulations).toLowerCase();
        if (regs.includes('ich e6') || regs.includes('e6(r2)') || regs.includes('gcp')) return null;
        return {
          id: rid('029'),
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Clinical SOP missing ICH E6(R2) reference',
          question:
            'This appears to be a clinical operations SOP, yet it does not reference ICH E6(R2). GCP is the foundational regulation for clinical trial conduct. How do you demonstrate GCP compliance without referencing the applicable guideline?',
          observation:
            'The SOP appears to relate to clinical operations based on its title, scope, or department, ' +
            'but does not reference ICH E6(R2) Good Clinical Practice in the applicable regulations section.',
          requirement:
            'ICH E6(R2) is the international ethical and scientific quality standard for designing, conducting, recording, and reporting trials that involve human subjects. ' +
            'All clinical SOPs must be traceable to GCP requirements.',
          reference: 'ICH E6(R2); 21 CFR Part 312; 21 CFR Part 50; 21 CFR Part 56',
          recommendation:
            'Add ICH E6(R2) to the applicable regulations. Map specific GCP requirements to the relevant procedure steps ' +
            'to demonstrate that the SOP fulfills its intended GCP obligations.',
          relatedFields: ['applicable_regulations', 'department', 'process_scope', 'sop_title'],
        };
      },
    },

    // ───────────────────────────────────────────────────────────────────────
    // sop_030 — documentation: Training records not linked to SOP revisions
    // ───────────────────────────────────────────────────────────────────────
    {
      id: rid('030'),
      dimension: 'documentation',
      title: 'Training records not linked to SOP revisions',
      question:
        'When this SOP is revised, how do you ensure all affected personnel are retrained on the new version? I need to see the linkage between SOP revisions and retraining records. Per 21 CFR 211.25, training must be current.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.training_requirements)) return null;
        const changeControl = str(answers.change_control_process).toLowerCase();
        if (changeControl.includes('retrain') || changeControl.includes('re-train') ||
            changeControl.includes('training impact') || changeControl.includes('training assessment')) return null;
        if (isEmpty(changeControl)) return null;
        return {
          id: rid('030'),
          dimension: 'documentation',
          severity: 'warning',
          title: 'Training records not linked to SOP revisions',
          question:
            'When this SOP is revised, how do you ensure all affected personnel are retrained on the new version? I need to see the linkage between SOP revisions and retraining records. Per 21 CFR 211.25, training must be current.',
          observation:
            'The SOP defines training requirements and references a change control process, but the change control description ' +
            'does not mention retraining or training impact assessment. This gap means that revised SOPs may be issued without ensuring personnel are trained on the changes.',
          requirement:
            '21 CFR 211.25(a) requires that training be conducted in particular operations the employee performs and in cGMP as it relates to the function. ' +
            '21 CFR 820.25(b) requires documented training. When an SOP is revised, all personnel who execute the procedure must be retrained before the new version becomes effective.',
          reference: '21 CFR 211.25(a); 21 CFR 820.25(b)',
          recommendation:
            'Include retraining requirements in the change control process. The change control record should include a training impact assessment, ' +
            'identify affected personnel, and track retraining completion before the revised SOP becomes effective.',
          relatedFields: ['training_requirements', 'change_control_process'],
        };
      },
    },
  ];

  return {
    category: 'sop',
    name: 'SOP GCP/GMP Inspector',
    description:
      'Simulates an FDA GCP/GMP inspector scrutinizing a Standard Operating Procedure during a facility inspection, ' +
      'examining document control, training adequacy, deviation handling, regulatory traceability, and compliance with ' +
      '21 CFR 211 (cGMP), 21 CFR 820 (QSR), ICH E6(R2) (GCP), and 21 CFR Part 11 (electronic records).',
    rules,
  };
}
