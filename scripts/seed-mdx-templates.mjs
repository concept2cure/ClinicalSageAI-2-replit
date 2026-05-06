#!/usr/bin/env node
/**
 * seed-mdx-templates.mjs — medtech document templates for AnA
 *
 * Backs the AnA `fetch_template_and_fill` tool for the MDX module.
 * The existing eCTD seed (scripts/seed-ectd-templates.js,
 * scripts/create-complete-ectd-templates.cjs) loads pharma IND/NDA
 * Module 3/4/5 templates; this script complements it with the medtech
 * surface area the kit covers:
 *
 *   - 510(k) eSTAR sections — cover letter, IFU, SE comparison,
 *     device description, software, cybersecurity, biocompat, EMC,
 *     bench/animal/clinical performance, labeling
 *   - PMA modules — module 1–6 frames
 *   - CER (EU MDR Annex XIV) — clinical evaluation report shell
 *   - Q-Submission — pre-sub meeting deck, briefing book outline
 *
 * Idempotent: ON CONFLICT (organization_id, template_name) DO UPDATE
 * so re-runs refresh content. Templates are org-scoped to the
 * concept2cure demo org by default; pass --org=<n> to seed elsewhere.
 *
 * Prerequisites:
 *   1. seed-ga-demo.mjs has run (org + admin user)
 *   2. ectd_templates table exists (shared/schema.ts:7799)
 *
 * Usage:
 *   node scripts/seed-mdx-templates.mjs
 *   node scripts/seed-mdx-templates.mjs --org=2
 */

import pg from 'pg';

const { Pool } = pg;

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(1);
  }
  let url = raw;
  if (url.includes('-pooler.')) {
    url = url.replace(/-pooler\.[a-z0-9-]+\.neon\.tech/, (m) =>
      m.replace('-pooler.', '.'),
    );
  }
  return url;
}

const ORG_NAME = 'concept2cure';

/* ─── Template content ─────────────────────────────────────────────── */
/* Each row maps onto the kit's section_key (cerv2_510k_sections) where
   applicable so AnA can offer a section-aware fill flow:
   "I have a template for the SE discussion. Want me to draft it?" */

const TEMPLATES = [

  /* ════════════════════════════════════════════════════════════════
     510(k) — eSTAR aligned, one row per kit section_key
     ══════════════════════════════════════════════════════════════ */

  {
    templateName: '510(k) Cover Letter',
    granuleId: 'k510-cover-letter',
    moduleNumber: 'eSTAR-3',
    category: 'medtech_510k_admin',
    templateType: 'fda_estar',
    content: `[SPONSOR LETTERHEAD]

[DATE]

Document Control Center (HFZ-401)
Center for Devices and Radiological Health
Food and Drug Administration
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

RE: Traditional 510(k) Premarket Notification — [DEVICE_NAME]
    Product Code: [PRODUCT_CODE]
    Regulation Number: [REGULATION_NUMBER]
    Device Class: [DEVICE_CLASS]
    Predicate(s): [PREDICATE_510K_NUMBER]

Dear Reviewer:

[SPONSOR_NAME] is submitting this Traditional 510(k) Premarket
Notification for [DEVICE_NAME], a [DEVICE_CATEGORY] intended for
[INTENDED_USE_SUMMARY]. The subject device is substantially equivalent
to the predicate [PREDICATE_DEVICE_NAME] (510(k) Number
[PREDICATE_510K_NUMBER]) cleared by FDA on [PREDICATE_CLEARANCE_DATE].

Submission summary:
- Indications for use are unchanged from the predicate.
- Technological characteristics are equivalent to the predicate, with
  differences described in Section 11 (Substantial Equivalence).
- Performance testing demonstrates the differences do not raise new
  questions of safety or effectiveness.

Regulatory contact:
  Name: [REG_CONTACT_NAME]
  Title: [REG_CONTACT_TITLE]
  Phone: [REG_CONTACT_PHONE]
  Email: [REG_CONTACT_EMAIL]

We confirm payment of the FY[FISCAL_YEAR] Medical Device User Fee
(Payment Identification Number [PIN]).

Sincerely,

[SIGNATORY_NAME]
[SIGNATORY_TITLE]
[SPONSOR_NAME]`,
    placeholders: {
      SPONSOR_NAME: '[SPONSOR_NAME]',
      DEVICE_NAME: '[DEVICE_NAME]',
      PRODUCT_CODE: '[PRODUCT_CODE]',
      REGULATION_NUMBER: '[REGULATION_NUMBER]',
      DEVICE_CLASS: '[DEVICE_CLASS]',
      PREDICATE_510K_NUMBER: '[PREDICATE_510K_NUMBER]',
      PREDICATE_DEVICE_NAME: '[PREDICATE_DEVICE_NAME]',
      PREDICATE_CLEARANCE_DATE: '[PREDICATE_CLEARANCE_DATE]',
      INTENDED_USE_SUMMARY: '[INTENDED_USE_SUMMARY]',
      DEVICE_CATEGORY: '[DEVICE_CATEGORY]',
      REG_CONTACT_NAME: '[REG_CONTACT_NAME]',
      REG_CONTACT_TITLE: '[REG_CONTACT_TITLE]',
      REG_CONTACT_PHONE: '[REG_CONTACT_PHONE]',
      REG_CONTACT_EMAIL: '[REG_CONTACT_EMAIL]',
      FISCAL_YEAR: '[FISCAL_YEAR]',
      PIN: '[PIN]',
      SIGNATORY_NAME: '[SIGNATORY_NAME]',
      SIGNATORY_TITLE: '[SIGNATORY_TITLE]',
      DATE: '[DATE]',
    },
    ichGuidance:
      '21 CFR 807.87; FDA Guidance: Format for Traditional and Abbreviated 510(k)s. eSTAR section 3 (Cover Letter).',
    sectionKey: 'cover-letter',
    tags: ['510k', 'cover-letter', 'estar', 'admin'],
  },

  {
    templateName: '510(k) Indications for Use Statement (Form FDA 3881)',
    granuleId: 'k510-ifu',
    moduleNumber: 'eSTAR-4',
    category: 'medtech_510k_admin',
    templateType: 'fda_estar',
    content: `INDICATIONS FOR USE

510(k) Number (if known): [K_NUMBER]
Device Name: [DEVICE_NAME]

Indications for Use:
[INTENDED_USE_FULL_TEXT]

Type of Use:
[ ] Prescription Use (Part 21 CFR 801 Subpart D)
[ ] Over-the-Counter Use (21 CFR 801 Subpart C)

(Per 21 CFR 801.109, prescription devices are restricted to use under
the supervision of a licensed practitioner.)

CONTAINS NONBINDING RECOMMENDATIONS — see FDA Form 3881 instructions.`,
    placeholders: {
      K_NUMBER: '[K_NUMBER]',
      DEVICE_NAME: '[DEVICE_NAME]',
      INTENDED_USE_FULL_TEXT: '[INTENDED_USE_FULL_TEXT]',
    },
    ichGuidance:
      'FDA Form 3881; 21 CFR 801. Indications for Use must match the cleared predicate scope unless an explicit divergence is justified.',
    sectionKey: 'indications-for-use',
    tags: ['510k', 'indications', 'form-3881', 'estar'],
  },

  {
    templateName: '510(k) Summary',
    granuleId: 'k510-summary',
    moduleNumber: 'eSTAR-5',
    category: 'medtech_510k_admin',
    templateType: 'fda_estar',
    content: `510(k) SUMMARY

Per 21 CFR 807.92.

A. Submitter
   Name: [SPONSOR_NAME]
   Address: [SPONSOR_ADDRESS]
   Contact: [REG_CONTACT_NAME]
   Phone: [REG_CONTACT_PHONE]
   Date Prepared: [DATE_PREPARED]

B. Device
   Trade Name: [DEVICE_NAME]
   Common/Usual Name: [COMMON_NAME]
   Classification Name: [CLASSIFICATION_NAME]
   Regulation Number: [REGULATION_NUMBER]
   Product Code: [PRODUCT_CODE]
   Device Class: [DEVICE_CLASS]
   Review Panel: [REVIEW_PANEL]

C. Predicate Device
   Trade Name: [PREDICATE_DEVICE_NAME]
   510(k) Number: [PREDICATE_510K_NUMBER]
   Manufacturer: [PREDICATE_MANUFACTURER]

D. Device Description
   [DEVICE_DESCRIPTION_PARAGRAPH]

E. Intended Use / Indications for Use
   [INTENDED_USE_FULL_TEXT]

F. Technological Comparison
   [TECH_COMPARISON_TABLE_OR_NARRATIVE]

G. Performance Data
   Bench: [BENCH_TEST_SUMMARY]
   Biocompatibility: [BIOCOMPAT_SUMMARY]
   Sterilization: [STERILIZATION_SUMMARY]
   EMC/Electrical Safety: [EMC_SUMMARY]
   Software: [SOFTWARE_SUMMARY]
   Animal: [ANIMAL_TEST_SUMMARY]
   Clinical: [CLINICAL_SUMMARY]

H. Conclusion
   The subject device [DEVICE_NAME] is substantially equivalent to
   [PREDICATE_DEVICE_NAME] in intended use and technological
   characteristics. Differences do not raise new questions of safety
   or effectiveness.`,
    placeholders: {
      SPONSOR_NAME: '[SPONSOR_NAME]',
      SPONSOR_ADDRESS: '[SPONSOR_ADDRESS]',
      REG_CONTACT_NAME: '[REG_CONTACT_NAME]',
      REG_CONTACT_PHONE: '[REG_CONTACT_PHONE]',
      DATE_PREPARED: '[DATE_PREPARED]',
      DEVICE_NAME: '[DEVICE_NAME]',
      COMMON_NAME: '[COMMON_NAME]',
      CLASSIFICATION_NAME: '[CLASSIFICATION_NAME]',
      REGULATION_NUMBER: '[REGULATION_NUMBER]',
      PRODUCT_CODE: '[PRODUCT_CODE]',
      DEVICE_CLASS: '[DEVICE_CLASS]',
      REVIEW_PANEL: '[REVIEW_PANEL]',
      PREDICATE_DEVICE_NAME: '[PREDICATE_DEVICE_NAME]',
      PREDICATE_510K_NUMBER: '[PREDICATE_510K_NUMBER]',
      PREDICATE_MANUFACTURER: '[PREDICATE_MANUFACTURER]',
      DEVICE_DESCRIPTION_PARAGRAPH: '[DEVICE_DESCRIPTION_PARAGRAPH]',
      INTENDED_USE_FULL_TEXT: '[INTENDED_USE_FULL_TEXT]',
      TECH_COMPARISON_TABLE_OR_NARRATIVE: '[TECH_COMPARISON_TABLE_OR_NARRATIVE]',
      BENCH_TEST_SUMMARY: '[BENCH_TEST_SUMMARY]',
      BIOCOMPAT_SUMMARY: '[BIOCOMPAT_SUMMARY]',
      STERILIZATION_SUMMARY: '[STERILIZATION_SUMMARY]',
      EMC_SUMMARY: '[EMC_SUMMARY]',
      SOFTWARE_SUMMARY: '[SOFTWARE_SUMMARY]',
      ANIMAL_TEST_SUMMARY: '[ANIMAL_TEST_SUMMARY]',
      CLINICAL_SUMMARY: '[CLINICAL_SUMMARY]',
    },
    ichGuidance:
      '21 CFR 807.92; FDA Guidance: 510(k) Summary or 510(k) Statement. Must contain enough detail for a reasonable understanding of substantial equivalence basis.',
    sectionKey: '510k-summary',
    tags: ['510k', 'summary', 'estar', '807.92'],
  },

  {
    templateName: '510(k) Truthful and Accurate Statement',
    granuleId: 'k510-truthful',
    moduleNumber: 'eSTAR-6',
    category: 'medtech_510k_admin',
    templateType: 'fda_estar',
    content: `TRUTHFUL AND ACCURATE STATEMENT

Per 21 CFR 807.87(k).

I, [SIGNATORY_NAME], certify that, in my capacity as [SIGNATORY_TITLE]
of [SPONSOR_NAME], I believe to the best of my knowledge that all
data and information submitted in the premarket notification are
truthful and accurate, and that no material fact has been omitted.

Signature: _____________________________________
Printed Name: [SIGNATORY_NAME]
Title: [SIGNATORY_TITLE]
Date: [SIGNATURE_DATE]`,
    placeholders: {
      SIGNATORY_NAME: '[SIGNATORY_NAME]',
      SIGNATORY_TITLE: '[SIGNATORY_TITLE]',
      SPONSOR_NAME: '[SPONSOR_NAME]',
      SIGNATURE_DATE: '[SIGNATURE_DATE]',
    },
    ichGuidance: '21 CFR 807.87(k). Required signed statement.',
    sectionKey: 'truthful-accuracy',
    tags: ['510k', 'truthful', 'estar', '807.87'],
  },

  {
    templateName: '510(k) Device Description',
    granuleId: 'k510-device-description',
    moduleNumber: 'eSTAR-10',
    category: 'medtech_510k_device',
    templateType: 'fda_estar',
    content: `DEVICE DESCRIPTION

1. Identification
   Trade Name: [DEVICE_NAME]
   Model Number(s): [MODEL_NUMBERS]
   Common Name: [COMMON_NAME]

2. Intended Use
   [INTENDED_USE_FULL_TEXT]

3. Principles of Operation
   [PRINCIPLES_OF_OPERATION]

4. Components and Configurations
   [COMPONENT_LIST_OR_TABLE]

5. Materials of Construction
   [MATERIAL_LIST_WITH_PATIENT_CONTACT_DURATION]

6. Specifications
   Dimensions: [DIMENSIONS]
   Weight: [WEIGHT]
   Power: [POWER_SPEC]
   Operating Environment: [OPERATING_ENV]
   Storage Conditions: [STORAGE_CONDITIONS]
   Shelf Life: [SHELF_LIFE]

7. Packaging
   [PACKAGING_DESCRIPTION]

8. Reusable / Single-Use
   [REUSE_STATUS]

9. Sterility
   [STERILITY_STATUS]

10. Accessories
    [ACCESSORY_LIST]

11. Reference to Drawings/Figures
    [DRAWING_REFERENCES]`,
    placeholders: {
      DEVICE_NAME: '[DEVICE_NAME]',
      MODEL_NUMBERS: '[MODEL_NUMBERS]',
      COMMON_NAME: '[COMMON_NAME]',
      INTENDED_USE_FULL_TEXT: '[INTENDED_USE_FULL_TEXT]',
      PRINCIPLES_OF_OPERATION: '[PRINCIPLES_OF_OPERATION]',
      COMPONENT_LIST_OR_TABLE: '[COMPONENT_LIST_OR_TABLE]',
      MATERIAL_LIST_WITH_PATIENT_CONTACT_DURATION:
        '[MATERIAL_LIST_WITH_PATIENT_CONTACT_DURATION]',
      DIMENSIONS: '[DIMENSIONS]',
      WEIGHT: '[WEIGHT]',
      POWER_SPEC: '[POWER_SPEC]',
      OPERATING_ENV: '[OPERATING_ENV]',
      STORAGE_CONDITIONS: '[STORAGE_CONDITIONS]',
      SHELF_LIFE: '[SHELF_LIFE]',
      PACKAGING_DESCRIPTION: '[PACKAGING_DESCRIPTION]',
      REUSE_STATUS: '[REUSE_STATUS]',
      STERILITY_STATUS: '[STERILITY_STATUS]',
      ACCESSORY_LIST: '[ACCESSORY_LIST]',
      DRAWING_REFERENCES: '[DRAWING_REFERENCES]',
    },
    ichGuidance:
      'FDA Guidance: Refuse to Accept Policy for 510(k)s. Device description must enable a reviewer to understand what is being submitted without external references.',
    sectionKey: 'device-description',
    tags: ['510k', 'device-description', 'estar'],
  },

  {
    templateName: '510(k) Substantial Equivalence Discussion',
    granuleId: 'k510-se-discussion',
    moduleNumber: 'eSTAR-11',
    category: 'medtech_510k_device',
    templateType: 'fda_estar',
    content: `SUBSTANTIAL EQUIVALENCE DISCUSSION

1. Predicate Device Identification
   Subject Device: [DEVICE_NAME]
   Primary Predicate: [PREDICATE_DEVICE_NAME] (510(k) [PREDICATE_510K_NUMBER])
   Reference Device(s): [REFERENCE_DEVICE_LIST]

2. Comparison of Indications for Use
   Subject:    [SUBJECT_INDICATIONS]
   Predicate:  [PREDICATE_INDICATIONS]
   Conclusion: [INDICATIONS_EQUIVALENCE_NARRATIVE]

3. Technological Characteristics — Side-by-Side Table
   Characteristic | Subject Device | Predicate Device | Same? | Discussion
   ---------------+----------------+------------------+-------+------------
   Mechanism      | [...]          | [...]            | [...] | [...]
   Materials      | [...]          | [...]            | [...] | [...]
   Energy source  | [...]          | [...]            | [...] | [...]
   Software       | [...]          | [...]            | [...] | [...]
   [ADD ROWS AS NEEDED]

4. Discussion of Differences
   [DIFFERENCE_BY_DIFFERENCE_DISCUSSION]

5. Performance Data Supporting Equivalence
   Bench: [BENCH_REFERENCE]
   Biocompat: [BIOCOMPAT_REFERENCE]
   Software: [SOFTWARE_REFERENCE]
   Clinical: [CLINICAL_REFERENCE]

6. Conclusion of Substantial Equivalence
   [SE_CONCLUSION_PARAGRAPH] The subject device is substantially
   equivalent to the predicate. Differences do not raise new questions
   of safety or effectiveness.`,
    placeholders: {
      DEVICE_NAME: '[DEVICE_NAME]',
      PREDICATE_DEVICE_NAME: '[PREDICATE_DEVICE_NAME]',
      PREDICATE_510K_NUMBER: '[PREDICATE_510K_NUMBER]',
      REFERENCE_DEVICE_LIST: '[REFERENCE_DEVICE_LIST]',
      SUBJECT_INDICATIONS: '[SUBJECT_INDICATIONS]',
      PREDICATE_INDICATIONS: '[PREDICATE_INDICATIONS]',
      INDICATIONS_EQUIVALENCE_NARRATIVE: '[INDICATIONS_EQUIVALENCE_NARRATIVE]',
      DIFFERENCE_BY_DIFFERENCE_DISCUSSION: '[DIFFERENCE_BY_DIFFERENCE_DISCUSSION]',
      BENCH_REFERENCE: '[BENCH_REFERENCE]',
      BIOCOMPAT_REFERENCE: '[BIOCOMPAT_REFERENCE]',
      SOFTWARE_REFERENCE: '[SOFTWARE_REFERENCE]',
      CLINICAL_REFERENCE: '[CLINICAL_REFERENCE]',
      SE_CONCLUSION_PARAGRAPH: '[SE_CONCLUSION_PARAGRAPH]',
    },
    ichGuidance:
      'FDA Guidance: The 510(k) Program — Evaluating Substantial Equivalence (2014). Side-by-side comparison + discussion of differences is required.',
    sectionKey: 'substantial-equivalence',
    tags: ['510k', 'substantial-equivalence', 'estar', 'predicate'],
  },

  {
    templateName: '510(k) Sterilization and Shelf Life',
    granuleId: 'k510-sterilization',
    moduleNumber: 'eSTAR-12',
    category: 'medtech_510k_testing',
    templateType: 'fda_estar',
    content: `STERILIZATION AND SHELF LIFE

1. Sterilization
   Method: [STERILIZATION_METHOD]
   Validation Standard: [STERILIZATION_STANDARD]
   Sterility Assurance Level (SAL): [SAL]
   Validation Reference: [STERILIZATION_VALIDATION_REPORT]

2. Pyrogenicity (if applicable)
   Method: [PYROGEN_METHOD]
   Result: [PYROGEN_RESULT]
   Standard: [PYROGEN_STANDARD]

3. Packaging
   Primary Package: [PRIMARY_PACKAGE]
   Secondary Package: [SECONDARY_PACKAGE]
   Validation Standard: [PACKAGE_VALIDATION_STANDARD]

4. Shelf Life
   Claimed Shelf Life: [SHELF_LIFE]
   Validation Method: [SHELF_LIFE_METHOD]
   Reference Report: [STABILITY_REPORT]

5. Reprocessing (reusable devices)
   [REPROCESSING_INSTRUCTIONS_OR_NA]`,
    placeholders: {
      STERILIZATION_METHOD: '[STERILIZATION_METHOD]',
      STERILIZATION_STANDARD: '[STERILIZATION_STANDARD]',
      SAL: '[SAL]',
      STERILIZATION_VALIDATION_REPORT: '[STERILIZATION_VALIDATION_REPORT]',
      PYROGEN_METHOD: '[PYROGEN_METHOD]',
      PYROGEN_RESULT: '[PYROGEN_RESULT]',
      PYROGEN_STANDARD: '[PYROGEN_STANDARD]',
      PRIMARY_PACKAGE: '[PRIMARY_PACKAGE]',
      SECONDARY_PACKAGE: '[SECONDARY_PACKAGE]',
      PACKAGE_VALIDATION_STANDARD: '[PACKAGE_VALIDATION_STANDARD]',
      SHELF_LIFE: '[SHELF_LIFE]',
      SHELF_LIFE_METHOD: '[SHELF_LIFE_METHOD]',
      STABILITY_REPORT: '[STABILITY_REPORT]',
      REPROCESSING_INSTRUCTIONS_OR_NA: '[REPROCESSING_INSTRUCTIONS_OR_NA]',
    },
    ichGuidance:
      'ISO 11135 (EO), ISO 11137 (radiation), ISO 17665 (moist heat); ISO 11607 (packaging); ASTM F1980 (accelerated aging).',
    sectionKey: 'sterilization',
    tags: ['510k', 'sterilization', 'shelf-life', 'estar'],
  },

  {
    templateName: '510(k) Biocompatibility',
    granuleId: 'k510-biocompat',
    moduleNumber: 'eSTAR-13',
    category: 'medtech_510k_testing',
    templateType: 'fda_estar',
    content: `BIOCOMPATIBILITY

1. Patient-Contacting Materials
   Material | Component | Contact Type | Contact Duration
   ---------+-----------+--------------+------------------
   [...]    | [...]     | [...]        | [...]

2. Categorization (per ISO 10993-1)
   Contact Category: [SURFACE/EXTERNALLY_COMMUNICATING/IMPLANT]
   Contact Duration: [LIMITED/PROLONGED/PERMANENT]

3. Endpoint Evaluation Matrix
   Endpoint | Required? | Test/Reference | Result
   ---------+-----------+----------------+--------
   Cytotoxicity            | [Y/N] | ISO 10993-5  | [PASS/FAIL]
   Sensitization           | [Y/N] | ISO 10993-10 | [PASS/FAIL]
   Irritation              | [Y/N] | ISO 10993-23 | [PASS/FAIL]
   Acute Systemic Tox.     | [Y/N] | ISO 10993-11 | [PASS/FAIL]
   Subacute / Subchronic   | [Y/N] | ISO 10993-11 | [PASS/FAIL]
   Genotoxicity            | [Y/N] | ISO 10993-3  | [PASS/FAIL]
   Implantation            | [Y/N] | ISO 10993-6  | [PASS/FAIL]
   Hemocompatibility       | [Y/N] | ISO 10993-4  | [PASS/FAIL]
   Chronic Toxicity        | [Y/N] | ISO 10993-11 | [PASS/FAIL]
   Carcinogenicity         | [Y/N] | ISO 10993-3  | [PASS/FAIL]

4. Conclusion
   [BIOCOMPAT_CONCLUSION_NARRATIVE]`,
    placeholders: {
      BIOCOMPAT_CONCLUSION_NARRATIVE: '[BIOCOMPAT_CONCLUSION_NARRATIVE]',
    },
    ichGuidance:
      'FDA Guidance: Use of ISO 10993-1 (2020); ISO 10993 series. Endpoint matrix must reflect the categorization in §2.',
    sectionKey: 'biocompatibility',
    tags: ['510k', 'biocompat', 'iso-10993', 'estar'],
  },

  {
    templateName: '510(k) Software Documentation',
    granuleId: 'k510-software',
    moduleNumber: 'eSTAR-14',
    category: 'medtech_510k_software',
    templateType: 'fda_estar',
    content: `SOFTWARE DOCUMENTATION

Per FDA Guidance: Content of Premarket Submissions for Device Software
Functions (June 2023). Documentation level: [BASIC/ENHANCED]

1. Software Description
   Architecture: [ARCHITECTURE_OVERVIEW]
   Operating Environment: [OS_AND_PLATFORM]
   Programming Language(s): [LANGUAGES]
   Off-the-Shelf (OTS) Software: [OTS_LIST]
   Cybersecurity Reference: see Section 20

2. Risk Management File
   Software Hazard Analysis: [HAZARD_REPORT_REF]
   Risk Control Measures: [RISK_CONTROL_REF]
   Residual Risk Acceptability: [RESIDUAL_RISK_STATEMENT]

3. Software Requirements Specification (SRS)
   Reference: [SRS_REF]

4. System and Software Architecture Diagram
   Reference: [ARCHITECTURE_DIAGRAM_REF]

5. Software Design Specification (SDS) (Enhanced only)
   Reference: [SDS_REF]

6. Software Development and Maintenance Practices
   Standard followed: [IEC_62304_LEVEL]
   Configuration management: [CM_TOOLS]
   Issue tracking: [DEFECT_TRACKING_TOOL]

7. Software Verification and Validation Testing
   Unit test coverage: [UNIT_TEST_COVERAGE]
   Integration testing: [INTEGRATION_REPORT_REF]
   System testing: [SYSTEM_TEST_REPORT_REF]
   Pass/Fail summary: [VV_SUMMARY]

8. Revision History
   Reference: [REVISION_HISTORY_REF]

9. Unresolved Anomalies
   Reference: [ANOMALY_LIST_REF]
   Risk assessment: [ANOMALY_RISK_STATEMENT]`,
    placeholders: {
      ARCHITECTURE_OVERVIEW: '[ARCHITECTURE_OVERVIEW]',
      OS_AND_PLATFORM: '[OS_AND_PLATFORM]',
      LANGUAGES: '[LANGUAGES]',
      OTS_LIST: '[OTS_LIST]',
      HAZARD_REPORT_REF: '[HAZARD_REPORT_REF]',
      RISK_CONTROL_REF: '[RISK_CONTROL_REF]',
      RESIDUAL_RISK_STATEMENT: '[RESIDUAL_RISK_STATEMENT]',
      SRS_REF: '[SRS_REF]',
      ARCHITECTURE_DIAGRAM_REF: '[ARCHITECTURE_DIAGRAM_REF]',
      SDS_REF: '[SDS_REF]',
      IEC_62304_LEVEL: '[IEC_62304_LEVEL]',
      CM_TOOLS: '[CM_TOOLS]',
      DEFECT_TRACKING_TOOL: '[DEFECT_TRACKING_TOOL]',
      UNIT_TEST_COVERAGE: '[UNIT_TEST_COVERAGE]',
      INTEGRATION_REPORT_REF: '[INTEGRATION_REPORT_REF]',
      SYSTEM_TEST_REPORT_REF: '[SYSTEM_TEST_REPORT_REF]',
      VV_SUMMARY: '[VV_SUMMARY]',
      REVISION_HISTORY_REF: '[REVISION_HISTORY_REF]',
      ANOMALY_LIST_REF: '[ANOMALY_LIST_REF]',
      ANOMALY_RISK_STATEMENT: '[ANOMALY_RISK_STATEMENT]',
    },
    ichGuidance:
      'FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023); IEC 62304.',
    sectionKey: 'software',
    tags: ['510k', 'software', 'iec-62304', 'estar'],
  },

  {
    templateName: '510(k) Cybersecurity',
    granuleId: 'k510-cybersecurity',
    moduleNumber: 'eSTAR-20',
    category: 'medtech_510k_software',
    templateType: 'fda_estar',
    content: `CYBERSECURITY

Per FDA Guidance: Cybersecurity in Medical Devices: Quality System
Considerations and Content of Premarket Submissions (Sept 2023).

1. Security Risk Management
   Reference: [SECURITY_RISK_REPORT_REF]
   Threat Model: [THREAT_MODEL_REF]
   Standard: AAMI TIR57 / ANSI UL 2900-2-1

2. Architecture Views
   Global System View: [GLOBAL_VIEW_REF]
   Multi-Patient Harm View: [MULTI_PATIENT_VIEW_REF]
   Updatability/Patchability View: [UPDATABILITY_VIEW_REF]
   Security Use Case View: [USE_CASE_VIEW_REF]

3. Cybersecurity Controls
   Authentication: [AUTH_DESCRIPTION]
   Authorization: [AUTHZ_DESCRIPTION]
   Encryption (at rest): [ENCRYPTION_AT_REST]
   Encryption (in transit): [ENCRYPTION_IN_TRANSIT]
   Audit logging: [AUDIT_DESCRIPTION]

4. Software Bill of Materials (SBOM)
   Format: [SBOM_FORMAT (CycloneDX/SPDX)]
   Reference: [SBOM_REF]
   Known Vulnerabilities: [KNOWN_VULNS_LIST_OR_NONE]

5. Penetration Testing
   Vendor / Tester: [PENTEST_VENDOR]
   Methodology: [PENTEST_METHOD]
   Findings & Mitigations: [PENTEST_FINDINGS_REF]

6. Vulnerability Management Plan
   [VULN_MGMT_PLAN_NARRATIVE]

7. Patch and Update Process
   [PATCH_PROCESS_NARRATIVE]

8. Incident Response and Coordinated Disclosure
   Contact: [PSIRT_CONTACT]
   Disclosure Policy URL: [DISCLOSURE_POLICY_URL]

9. Labeling — Cybersecurity Information for Users
   [LABELING_SUMMARY_REF]`,
    placeholders: {
      SECURITY_RISK_REPORT_REF: '[SECURITY_RISK_REPORT_REF]',
      THREAT_MODEL_REF: '[THREAT_MODEL_REF]',
      GLOBAL_VIEW_REF: '[GLOBAL_VIEW_REF]',
      MULTI_PATIENT_VIEW_REF: '[MULTI_PATIENT_VIEW_REF]',
      UPDATABILITY_VIEW_REF: '[UPDATABILITY_VIEW_REF]',
      USE_CASE_VIEW_REF: '[USE_CASE_VIEW_REF]',
      AUTH_DESCRIPTION: '[AUTH_DESCRIPTION]',
      AUTHZ_DESCRIPTION: '[AUTHZ_DESCRIPTION]',
      ENCRYPTION_AT_REST: '[ENCRYPTION_AT_REST]',
      ENCRYPTION_IN_TRANSIT: '[ENCRYPTION_IN_TRANSIT]',
      AUDIT_DESCRIPTION: '[AUDIT_DESCRIPTION]',
      SBOM_FORMAT: '[SBOM_FORMAT]',
      SBOM_REF: '[SBOM_REF]',
      KNOWN_VULNS_LIST_OR_NONE: '[KNOWN_VULNS_LIST_OR_NONE]',
      PENTEST_VENDOR: '[PENTEST_VENDOR]',
      PENTEST_METHOD: '[PENTEST_METHOD]',
      PENTEST_FINDINGS_REF: '[PENTEST_FINDINGS_REF]',
      VULN_MGMT_PLAN_NARRATIVE: '[VULN_MGMT_PLAN_NARRATIVE]',
      PATCH_PROCESS_NARRATIVE: '[PATCH_PROCESS_NARRATIVE]',
      PSIRT_CONTACT: '[PSIRT_CONTACT]',
      DISCLOSURE_POLICY_URL: '[DISCLOSURE_POLICY_URL]',
      LABELING_SUMMARY_REF: '[LABELING_SUMMARY_REF]',
    },
    ichGuidance:
      'FDA Guidance: Cybersecurity in Medical Devices (Sept 2023); AAMI TIR57; UL 2900-2-1.',
    sectionKey: 'cybersecurity',
    tags: ['510k', 'cybersecurity', 'sbom', 'estar'],
  },

  {
    templateName: '510(k) EMC and Electrical Safety',
    granuleId: 'k510-emc',
    moduleNumber: 'eSTAR-15',
    category: 'medtech_510k_testing',
    templateType: 'fda_estar',
    content: `ELECTROMAGNETIC COMPATIBILITY AND ELECTRICAL SAFETY

1. Standards Applied
   Electrical Safety: IEC 60601-1 (Edition [EDITION])
   EMC: IEC 60601-1-2 (Edition [EDITION])
   Particular Standards: [LIST_60601_2_x]

2. Test Lab
   Lab Name: [TEST_LAB]
   Accreditation: [ISO_17025_OR_EQ]
   Report Reference: [EMC_REPORT_REF]

3. Essential Performance
   Definition: [ESSENTIAL_PERFORMANCE_DEFINITION]

4. Test Summary
   Test                          | Result | Reference
   ------------------------------+--------+----------
   Conducted Emissions           | [PASS] | [...]
   Radiated Emissions            | [PASS] | [...]
   ESD Immunity                  | [PASS] | [...]
   Radiated RF Immunity          | [PASS] | [...]
   EFT/Burst                     | [PASS] | [...]
   Surge                         | [PASS] | [...]
   Conducted Disturbance         | [PASS] | [...]
   Voltage Dips/Interruptions    | [PASS] | [...]

5. Conclusion
   [EMC_CONCLUSION_NARRATIVE]`,
    placeholders: {
      EDITION: '[EDITION]',
      LIST_60601_2_x: '[LIST_60601_2_x]',
      TEST_LAB: '[TEST_LAB]',
      ISO_17025_OR_EQ: '[ISO_17025_OR_EQ]',
      EMC_REPORT_REF: '[EMC_REPORT_REF]',
      ESSENTIAL_PERFORMANCE_DEFINITION: '[ESSENTIAL_PERFORMANCE_DEFINITION]',
      EMC_CONCLUSION_NARRATIVE: '[EMC_CONCLUSION_NARRATIVE]',
    },
    ichGuidance: 'IEC 60601-1; IEC 60601-1-2.',
    sectionKey: 'electromagnetic',
    tags: ['510k', 'emc', 'electrical-safety', 'estar', 'iec-60601'],
  },

  {
    templateName: '510(k) Performance Testing — Bench',
    granuleId: 'k510-bench',
    moduleNumber: 'eSTAR-16',
    category: 'medtech_510k_testing',
    templateType: 'fda_estar',
    content: `PERFORMANCE TESTING — BENCH

1. Performance Specifications
   Specification | Acceptance Criterion | Method | Result
   --------------+----------------------+--------+--------
   [...]         | [...]                | [...]  | [PASS]

2. Test Reports
   [LIST_REPORTS_WITH_REFERENCES]

3. Comparison to Predicate
   [BENCH_COMPARISON_TO_PREDICATE]

4. Conclusion
   [BENCH_CONCLUSION_NARRATIVE]`,
    placeholders: {
      LIST_REPORTS_WITH_REFERENCES: '[LIST_REPORTS_WITH_REFERENCES]',
      BENCH_COMPARISON_TO_PREDICATE: '[BENCH_COMPARISON_TO_PREDICATE]',
      BENCH_CONCLUSION_NARRATIVE: '[BENCH_CONCLUSION_NARRATIVE]',
    },
    ichGuidance:
      'FDA Recognized Consensus Standards Database; choose standards by product code. Acceptance criteria must trace to risk analysis or specification.',
    sectionKey: 'performance-bench',
    tags: ['510k', 'bench-testing', 'estar'],
  },

  {
    templateName: '510(k) Performance Testing — Clinical',
    granuleId: 'k510-clinical',
    moduleNumber: 'eSTAR-18',
    category: 'medtech_510k_clinical',
    templateType: 'fda_estar',
    content: `PERFORMANCE TESTING — CLINICAL

1. Rationale for Clinical Data
   [WHY_CLINICAL_DATA_IS_NEEDED]

2. Study Design
   Study ID: [STUDY_ID]
   Type: [PROSPECTIVE/RETROSPECTIVE/REGISTRY]
   Sites: [N_SITES]
   IRB / EC Approval: [IRB_REF]
   Subjects Enrolled: [N_ENROLLED]
   Subjects Analyzed: [N_ANALYZED]

3. Endpoints
   Primary: [PRIMARY_ENDPOINT]
   Secondary: [SECONDARY_ENDPOINTS]

4. Statistical Analysis Plan
   Reference: [SAP_REF]

5. Results
   Primary Endpoint Result: [PRIMARY_RESULT]
   Adverse Events: [AE_SUMMARY]
   Device Deficiencies: [DEFICIENCY_SUMMARY]

6. Discussion
   [CLINICAL_DISCUSSION_NARRATIVE]

7. Conclusion
   [CLINICAL_CONCLUSION_NARRATIVE]`,
    placeholders: {
      WHY_CLINICAL_DATA_IS_NEEDED: '[WHY_CLINICAL_DATA_IS_NEEDED]',
      STUDY_ID: '[STUDY_ID]',
      N_SITES: '[N_SITES]',
      IRB_REF: '[IRB_REF]',
      N_ENROLLED: '[N_ENROLLED]',
      N_ANALYZED: '[N_ANALYZED]',
      PRIMARY_ENDPOINT: '[PRIMARY_ENDPOINT]',
      SECONDARY_ENDPOINTS: '[SECONDARY_ENDPOINTS]',
      SAP_REF: '[SAP_REF]',
      PRIMARY_RESULT: '[PRIMARY_RESULT]',
      AE_SUMMARY: '[AE_SUMMARY]',
      DEFICIENCY_SUMMARY: '[DEFICIENCY_SUMMARY]',
      CLINICAL_DISCUSSION_NARRATIVE: '[CLINICAL_DISCUSSION_NARRATIVE]',
      CLINICAL_CONCLUSION_NARRATIVE: '[CLINICAL_CONCLUSION_NARRATIVE]',
    },
    ichGuidance:
      'FDA Guidance: Design Considerations for Pivotal Clinical Investigations for Medical Devices; ISO 14155 (GCP for medical devices).',
    sectionKey: 'performance-clinical',
    tags: ['510k', 'clinical', 'iso-14155', 'estar'],
  },

  {
    templateName: '510(k) Labeling',
    granuleId: 'k510-labeling',
    moduleNumber: 'eSTAR-19',
    category: 'medtech_510k_admin',
    templateType: 'fda_estar',
    content: `LABELING

Per 21 CFR 801.

1. Device Label (immediate container / device itself)
   [DEVICE_LABEL_REFERENCE]

2. Package Insert / Instructions for Use (IFU)
   Reference: [IFU_REFERENCE]
   Required elements:
   - Device identification & UDI
   - Indications for use
   - Contraindications
   - Warnings and precautions
   - Adverse events / known risks
   - Operating instructions
   - Maintenance / cleaning
   - Storage
   - Symbols glossary (per ISO 15223-1)

3. Patient Labeling (if OTC or patient-facing)
   Reference: [PATIENT_LABEL_REFERENCE]

4. Operator's / Service Manual
   Reference: [OPERATOR_MANUAL_REFERENCE]

5. UDI
   DI: [DEVICE_IDENTIFIER]
   Issuing Agency: [GS1/HIBCC/ICCBBA]

6. Symbols
   Per ISO 15223-1; symbols glossary: [GLOSSARY_REFERENCE]`,
    placeholders: {
      DEVICE_LABEL_REFERENCE: '[DEVICE_LABEL_REFERENCE]',
      IFU_REFERENCE: '[IFU_REFERENCE]',
      PATIENT_LABEL_REFERENCE: '[PATIENT_LABEL_REFERENCE]',
      OPERATOR_MANUAL_REFERENCE: '[OPERATOR_MANUAL_REFERENCE]',
      DEVICE_IDENTIFIER: '[DEVICE_IDENTIFIER]',
      GLOSSARY_REFERENCE: '[GLOSSARY_REFERENCE]',
    },
    ichGuidance: '21 CFR 801; ISO 15223-1; UDI Final Rule.',
    sectionKey: 'labeling',
    tags: ['510k', 'labeling', 'udi', 'estar'],
  },

  /* ════════════════════════════════════════════════════════════════
     PMA — Module 1–6 frames
     ══════════════════════════════════════════════════════════════ */

  {
    templateName: 'PMA Module 1 — Administrative Information',
    granuleId: 'pma-m1',
    moduleNumber: 'PMA-1',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 1 — ADMINISTRATIVE INFORMATION

Per 21 CFR 814.20(b)(1)–(2).

1.1 Cover Letter
1.2 Table of Contents (entire PMA)
1.3 Indications for Use Statement
1.4 Device Description Summary
1.5 Alternative Practices and Procedures
1.6 Marketing History (foreign and domestic)
1.7 Summary of Studies
1.8 Conclusions Drawn from the Studies
1.9 PMA Forms (FDA 3514 — CDRH Premarket Review Submission Cover Sheet)
1.10 Patent Information (if applicable)
1.11 Environmental Assessment / Categorical Exclusion (21 CFR 25)
1.12 Financial Disclosure (Form FDA 3454/3455)
1.13 Truthful and Accurate Statement`,
    placeholders: {},
    ichGuidance: '21 CFR 814.20(b)(1)–(2); FDA Guidance: PMA Format and Content.',
    sectionKey: 'pma-module-1',
    tags: ['pma', 'module-1', 'administrative'],
  },

  {
    templateName: 'PMA Module 2 — Summary of Safety and Effectiveness Data (SSED)',
    granuleId: 'pma-m2',
    moduleNumber: 'PMA-2',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 2 — SUMMARY OF SAFETY AND EFFECTIVENESS DATA

Per 21 CFR 814.20(b)(8).

2.1 Indications for Use
2.2 Contraindications
2.3 Warnings and Precautions
2.4 Device Description (high level)
2.5 Alternative Practices and Procedures
2.6 Marketing History
2.7 Adverse Effects of the Device on Health
2.8 Summary of Nonclinical Studies (bench, animal, biocompat)
2.9 Summary of Clinical Studies
2.10 Conclusions Drawn from the Studies
2.11 Panel Recommendations (if applicable)
2.12 CDRH Decision

Note: SSED is published by FDA after approval; sponsor drafts a
proposed SSED that supports the public summary.`,
    placeholders: {},
    ichGuidance: '21 CFR 814.20(b)(8); FDA SSED template.',
    sectionKey: 'pma-module-2',
    tags: ['pma', 'module-2', 'ssed'],
  },

  {
    templateName: 'PMA Module 3 — Device Description and Manufacturing',
    granuleId: 'pma-m3',
    moduleNumber: 'PMA-3',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 3 — DEVICE DESCRIPTION AND MANUFACTURING

Per 21 CFR 814.20(b)(3) and 814.20(b)(4)(i).

3.1 Device Description
   3.1.1 Functional components and accessories
   3.1.2 Materials
   3.1.3 Principles of operation
   3.1.4 Specifications
3.2 Manufacturing
   3.2.1 Facilities and equipment
   3.2.2 Manufacturing methods, controls, and steps
   3.2.3 Packaging and labeling operations
   3.2.4 Process validation
   3.2.5 Sterilization (if applicable)
   3.2.6 Quality control procedures
   3.2.7 Quality system description (21 CFR 820)
3.3 Component and Raw Material Specifications
3.4 Stability and Shelf Life`,
    placeholders: {},
    ichGuidance:
      '21 CFR 814.20(b)(3) and (b)(4)(i); 21 CFR 820 QSR.',
    sectionKey: 'pma-module-3',
    tags: ['pma', 'module-3', 'manufacturing', '21-cfr-820'],
  },

  {
    templateName: 'PMA Module 4 — Nonclinical Studies',
    granuleId: 'pma-m4',
    moduleNumber: 'PMA-4',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 4 — NONCLINICAL STUDIES

Per 21 CFR 814.20(b)(6)(i).

4.1 Microbiology
4.2 Toxicology / Biocompatibility (ISO 10993)
4.3 Immunology
4.4 Stress, Wear, Fatigue
4.5 Engineering Bench Testing
4.6 Sterilization Validation
4.7 Software Verification & Validation (FDA 2023 Software Guidance)
4.8 Cybersecurity (FDA 2023 Cybersecurity Guidance)
4.9 EMC and Electrical Safety (IEC 60601-1, -1-2)
4.10 Animal Studies (when required)
4.11 Reuse / Reprocessing Validation (if reusable)`,
    placeholders: {},
    ichGuidance: '21 CFR 814.20(b)(6)(i); ISO 10993; IEC 62304; IEC 60601-1.',
    sectionKey: 'pma-module-4',
    tags: ['pma', 'module-4', 'nonclinical'],
  },

  {
    templateName: 'PMA Module 5 — Clinical Investigations',
    granuleId: 'pma-m5',
    moduleNumber: 'PMA-5',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 5 — CLINICAL INVESTIGATIONS

Per 21 CFR 814.20(b)(6)(ii).

5.1 Pivotal Clinical Study Report
   5.1.1 Protocol and amendments
   5.1.2 IDE history
   5.1.3 Site list and IRB approvals
   5.1.4 Study population (enrollment, demographics)
   5.1.5 Endpoints and statistical analysis plan
   5.1.6 Results
       - Primary endpoint
       - Secondary endpoints
       - Subgroup analyses
   5.1.7 Adverse events
   5.1.8 Device deficiencies and product complaints
   5.1.9 Discussion and conclusions
5.2 Supportive Studies
5.3 Tabular Listings of Adverse Events
5.4 Patient Demographics Summary
5.5 Statistical Reports
5.6 Foreign Studies (with assertion of GCP equivalence)
5.7 Financial Disclosure of Investigators (Form FDA 3454/3455)
5.8 Bioresearch Monitoring (BIMO) Compliance Documentation`,
    placeholders: {},
    ichGuidance:
      '21 CFR 814.20(b)(6)(ii); ISO 14155; FDA Pivotal Investigations Design Guidance.',
    sectionKey: 'pma-module-5',
    tags: ['pma', 'module-5', 'clinical', 'iso-14155', 'bimo'],
  },

  {
    templateName: 'PMA Module 6 — Labeling and Other Documents',
    granuleId: 'pma-m6',
    moduleNumber: 'PMA-6',
    category: 'medtech_pma',
    templateType: 'fda_pma',
    content: `PMA MODULE 6 — LABELING

Per 21 CFR 814.20(b)(10).

6.1 Proposed Labeling
   6.1.1 Device label
   6.1.2 Package insert / Instructions for Use
   6.1.3 Patient labeling (if applicable)
   6.1.4 Operator/service manual
   6.1.5 Promotional labeling drafts
6.2 Mock-up or Final Labeling Format
6.3 UDI Information
6.4 Symbol Glossary (ISO 15223-1)
6.5 Foreign Labeling (if applicable)
6.6 Labeling Comparison to Predicate / Comparator (if any)`,
    placeholders: {},
    ichGuidance: '21 CFR 814.20(b)(10); 21 CFR 801; ISO 15223-1.',
    sectionKey: 'pma-module-6',
    tags: ['pma', 'module-6', 'labeling'],
  },

  /* ════════════════════════════════════════════════════════════════
     CER — EU MDR Annex XIV / MEDDEV 2.7/1 rev 4
     ══════════════════════════════════════════════════════════════ */

  {
    templateName: 'CER — Clinical Evaluation Report (EU MDR Annex XIV)',
    granuleId: 'cer-eu-mdr',
    moduleNumber: 'CER-MDR',
    category: 'medtech_cer',
    templateType: 'eu_mdr',
    content: `CLINICAL EVALUATION REPORT

Per EU MDR (Reg 2017/745) Annex XIV Part A, MEDDEV 2.7/1 rev 4.

1. Executive Summary
   [EXECUTIVE_SUMMARY]

2. Scope of the Clinical Evaluation
   2.1 Device identification and equivalence (per Annex XIV §3)
   2.2 Indications and intended purpose
   2.3 Risk class and rule
   2.4 Stage of life cycle (initial / on-market / PMCF update)

3. Clinical Background, State of the Art, Standards
   3.1 Disease/condition overview
   3.2 Current standard of care
   3.3 Available alternatives
   3.4 Applicable harmonised / consensus standards

4. Device Description
   [DEVICE_DESCRIPTION_REFERENCE_OR_INLINE]

5. Equivalence Demonstration (if applicable)
   5.1 Clinical equivalence
   5.2 Technical equivalence
   5.3 Biological equivalence
   (All three must be demonstrated for equivalence-based pathway.)

6. Clinical Data Identification and Appraisal
   6.1 Literature search protocol (PRISMA-style)
   6.2 Search results and selection
   6.3 Appraisal methodology (data quality grading)
   6.4 Pre-clinical and clinical investigation data
   6.5 PMS / PMCF / vigilance data

7. Clinical Data Analysis
   7.1 Performance demonstrated
   7.2 Safety profile (incidents, FSCAs, complaints)
   7.3 Benefit-risk determination
   7.4 Acceptability of side-effects
   7.5 Acceptability of undesirable side-effects vs. benefit

8. Conclusions
   [BENEFIT_RISK_CONCLUSION]

9. PMCF Plan / Justification for No PMCF
   [PMCF_PLAN_REFERENCE]

10. Date, Version, and Author Qualifications
   Author: [CER_AUTHOR_NAME], [CER_AUTHOR_QUALIFICATIONS]
   Date: [CER_DATE]
   Version: [CER_VERSION]
   CV reference: [CV_APPENDIX]`,
    placeholders: {
      EXECUTIVE_SUMMARY: '[EXECUTIVE_SUMMARY]',
      DEVICE_DESCRIPTION_REFERENCE_OR_INLINE: '[DEVICE_DESCRIPTION_REFERENCE_OR_INLINE]',
      BENEFIT_RISK_CONCLUSION: '[BENEFIT_RISK_CONCLUSION]',
      PMCF_PLAN_REFERENCE: '[PMCF_PLAN_REFERENCE]',
      CER_AUTHOR_NAME: '[CER_AUTHOR_NAME]',
      CER_AUTHOR_QUALIFICATIONS: '[CER_AUTHOR_QUALIFICATIONS]',
      CER_DATE: '[CER_DATE]',
      CER_VERSION: '[CER_VERSION]',
      CV_APPENDIX: '[CV_APPENDIX]',
    },
    ichGuidance:
      'EU MDR (Reg 2017/745) Annex XIV Part A; MEDDEV 2.7/1 rev 4; MDCG 2020-13.',
    sectionKey: 'cer-main',
    tags: ['cer', 'eu-mdr', 'meddev', 'annex-xiv'],
  },

  {
    templateName: 'CER — Post-Market Clinical Follow-up (PMCF) Plan',
    granuleId: 'cer-pmcf-plan',
    moduleNumber: 'CER-PMCF',
    category: 'medtech_cer',
    templateType: 'eu_mdr',
    content: `POST-MARKET CLINICAL FOLLOW-UP (PMCF) PLAN

Per EU MDR Annex XIV Part B; MDCG 2020-7.

1. Device Information
   Device: [DEVICE_NAME]
   UDI-DI: [UDI_DI]
   Risk Class: [RISK_CLASS]
   Manufacturer: [MANUFACTURER]

2. Objectives of the PMCF
   - Confirm safety and performance throughout expected lifetime
   - Identify previously unknown side-effects
   - Identify and analyse emergent risks based on factual evidence
   - Ensure continued acceptability of benefit-risk
   - Identify possible systematic misuse or off-label use

3. Specific Objectives Addressing Open Questions
   [OPEN_QUESTIONS_LIST]

4. Methods
   4.1 General methods (literature surveillance, vigilance, complaints)
   4.2 Specific methods (registries, surveys, PMCF studies)
   4.3 Justification for chosen methods

5. Planned Studies / Activities
   Activity | Type | Duration | N | Endpoint
   ---------+------+----------+---+----------
   [...]    | [...]| [...]    |[..]| [...]

6. Reference to Standards
   ISO 14155 for any prospective PMCF investigation
   EU MDR Article 74 (post-market clinical investigations)

7. Evaluation of Results
   - Frequency of evaluation
   - Update of CER and PSUR
   - Update of risk management file

8. Reporting and Updates
   - PMCF Evaluation Report (PMCF-ER) frequency
   - Integration into Periodic Safety Update Report (PSUR)
   - Update of SSCP (Class III/implantable)`,
    placeholders: {
      DEVICE_NAME: '[DEVICE_NAME]',
      UDI_DI: '[UDI_DI]',
      RISK_CLASS: '[RISK_CLASS]',
      MANUFACTURER: '[MANUFACTURER]',
      OPEN_QUESTIONS_LIST: '[OPEN_QUESTIONS_LIST]',
    },
    ichGuidance: 'EU MDR Annex XIV Part B; MDCG 2020-7; ISO 14155.',
    sectionKey: 'cer-pmcf',
    tags: ['cer', 'pmcf', 'eu-mdr', 'mdcg-2020-7'],
  },

  /* ════════════════════════════════════════════════════════════════
     Q-Submission — Pre-Sub
     ══════════════════════════════════════════════════════════════ */

  {
    templateName: 'Q-Submission Briefing Document (Pre-Sub)',
    granuleId: 'q-sub-briefing',
    moduleNumber: 'Q-Sub',
    category: 'medtech_qsub',
    templateType: 'fda_qsub',
    content: `Q-SUBMISSION BRIEFING DOCUMENT

Per FDA Guidance: Requests for Feedback and Meetings for Medical
Device Submissions: The Q-Submission Program (June 2023).

1. Submission Type
   [PRE-SUBMISSION / SUBMISSION ISSUE REQUEST / STUDY RISK
    DETERMINATION / INFORMATIONAL MEETING / OTHER]

2. Sponsor Information
   Sponsor: [SPONSOR_NAME]
   Address: [SPONSOR_ADDRESS]
   Regulatory Contact: [REG_CONTACT_NAME], [REG_CONTACT_EMAIL]

3. Device Description
   Trade Name: [DEVICE_NAME]
   Indications for Use: [INTENDED_USE_FULL_TEXT]
   Device Class (proposed): [DEVICE_CLASS]
   Product Code (proposed): [PRODUCT_CODE]
   Predicate(s) (if 510(k) anticipated): [PREDICATE_LIST]

4. Regulatory History
   [REGULATORY_HISTORY_PARAGRAPH]

5. Description of Issues for Discussion
   [ISSUES_NARRATIVE]

6. Specific Questions for FDA
   Q1. [QUESTION_1]
       Sponsor's position: [SPONSOR_POSITION_1]
   Q2. [QUESTION_2]
       Sponsor's position: [SPONSOR_POSITION_2]
   Q3. [QUESTION_3]
       Sponsor's position: [SPONSOR_POSITION_3]

7. Proposed Meeting Format and Date Range
   Format: [TELECONFERENCE / WRITTEN_FEEDBACK / FACE_TO_FACE]
   Proposed dates: [DATE_OPTIONS]
   Anticipated attendees (sponsor): [ATTENDEE_LIST]

8. Supporting Information
   [LIST_ATTACHMENTS_OR_REFERENCES]`,
    placeholders: {
      SPONSOR_NAME: '[SPONSOR_NAME]',
      SPONSOR_ADDRESS: '[SPONSOR_ADDRESS]',
      REG_CONTACT_NAME: '[REG_CONTACT_NAME]',
      REG_CONTACT_EMAIL: '[REG_CONTACT_EMAIL]',
      DEVICE_NAME: '[DEVICE_NAME]',
      INTENDED_USE_FULL_TEXT: '[INTENDED_USE_FULL_TEXT]',
      DEVICE_CLASS: '[DEVICE_CLASS]',
      PRODUCT_CODE: '[PRODUCT_CODE]',
      PREDICATE_LIST: '[PREDICATE_LIST]',
      REGULATORY_HISTORY_PARAGRAPH: '[REGULATORY_HISTORY_PARAGRAPH]',
      ISSUES_NARRATIVE: '[ISSUES_NARRATIVE]',
      QUESTION_1: '[QUESTION_1]',
      SPONSOR_POSITION_1: '[SPONSOR_POSITION_1]',
      QUESTION_2: '[QUESTION_2]',
      SPONSOR_POSITION_2: '[SPONSOR_POSITION_2]',
      QUESTION_3: '[QUESTION_3]',
      SPONSOR_POSITION_3: '[SPONSOR_POSITION_3]',
      DATE_OPTIONS: '[DATE_OPTIONS]',
      ATTENDEE_LIST: '[ATTENDEE_LIST]',
      LIST_ATTACHMENTS_OR_REFERENCES: '[LIST_ATTACHMENTS_OR_REFERENCES]',
    },
    ichGuidance:
      'FDA Guidance: The Q-Submission Program (2023). Specific questions with sponsor position is the FDA-preferred format.',
    sectionKey: 'qsub-briefing',
    tags: ['qsub', 'pre-sub', 'briefing'],
  },

  {
    templateName: 'Q-Submission Cover Letter',
    granuleId: 'q-sub-cover',
    moduleNumber: 'Q-Sub',
    category: 'medtech_qsub',
    templateType: 'fda_qsub',
    content: `[SPONSOR LETTERHEAD]

[DATE]

Document Control Center (HFZ-401)
Center for Devices and Radiological Health
Food and Drug Administration
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

RE: Q-Submission — Pre-Submission for [DEVICE_NAME]

Dear Reviewer:

[SPONSOR_NAME] respectfully submits this Pre-Submission to obtain
FDA feedback on [TOPIC_SUMMARY] for [DEVICE_NAME], intended for
[INTENDED_USE_SUMMARY].

We request a [TELECONFERENCE / WRITTEN_FEEDBACK] meeting and have
provided proposed dates within the briefing document. The specific
questions for which we seek feedback are enumerated in Section 6 of
the attached briefing document.

Submission contents:
- Briefing document
- [LIST_OTHER_ATTACHMENTS]

Regulatory contact:
  Name: [REG_CONTACT_NAME]
  Phone: [REG_CONTACT_PHONE]
  Email: [REG_CONTACT_EMAIL]

Sincerely,

[SIGNATORY_NAME]
[SIGNATORY_TITLE]
[SPONSOR_NAME]`,
    placeholders: {
      DEVICE_NAME: '[DEVICE_NAME]',
      SPONSOR_NAME: '[SPONSOR_NAME]',
      TOPIC_SUMMARY: '[TOPIC_SUMMARY]',
      INTENDED_USE_SUMMARY: '[INTENDED_USE_SUMMARY]',
      LIST_OTHER_ATTACHMENTS: '[LIST_OTHER_ATTACHMENTS]',
      REG_CONTACT_NAME: '[REG_CONTACT_NAME]',
      REG_CONTACT_PHONE: '[REG_CONTACT_PHONE]',
      REG_CONTACT_EMAIL: '[REG_CONTACT_EMAIL]',
      SIGNATORY_NAME: '[SIGNATORY_NAME]',
      SIGNATORY_TITLE: '[SIGNATORY_TITLE]',
      DATE: '[DATE]',
    },
    ichGuidance: 'FDA Guidance: The Q-Submission Program (2023).',
    sectionKey: 'qsub-cover',
    tags: ['qsub', 'cover-letter'],
  },
];

/* ─── Insert / upsert ─────────────────────────────────────────────── */

async function getOrgAndUser(client) {
  const { rows: orgRows } = await client.query(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    [ORG_NAME],
  );
  if (orgRows.length === 0) {
    throw new Error(`Organization '${ORG_NAME}' not found. Run seed-ga-demo.mjs first.`);
  }
  const orgId = orgRows[0].id;

  /* Pick any active user in the org as created_by (column is NOT NULL).
     Fall back to id=1 if the join is empty. */
  const { rows: userRows } = await client.query(
    `SELECT id FROM users WHERE organization_id = $1 ORDER BY id LIMIT 1`,
    [orgId],
  );
  const userId = userRows[0]?.id ?? 1;
  return { orgId, userId };
}

async function upsertTemplates(client, orgId, userId) {
  let inserted = 0;
  let updated = 0;
  for (const t of TEMPLATES) {
    const { rows } = await client.query(
      `INSERT INTO ectd_templates (
         organization_id, template_name, granule_id, module_number, category,
         template_type, content, placeholders, ich_guidance, tags,
         created_by, is_active, is_default, version, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
         $11, true, false, '1.0', NOW(), NOW()
       )
       ON CONFLICT (organization_id, template_name) DO UPDATE SET
         granule_id    = EXCLUDED.granule_id,
         module_number = EXCLUDED.module_number,
         category      = EXCLUDED.category,
         template_type = EXCLUDED.template_type,
         content       = EXCLUDED.content,
         placeholders  = EXCLUDED.placeholders,
         ich_guidance  = EXCLUDED.ich_guidance,
         tags          = EXCLUDED.tags,
         updated_at    = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        orgId,
        t.templateName,
        t.granuleId,
        t.moduleNumber,
        t.category,
        t.templateType,
        t.content,
        JSON.stringify(t.placeholders ?? {}),
        t.ichGuidance ?? null,
        t.tags ?? [],
        userId,
      ],
    );
    if (rows[0]?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/* ─── Main ───────────────────────────────────────────────────────── */

async function ensureUniqueIndex(client) {
  /* Idempotent — used as the conflict target for upsert. */
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ectd_templates_org_name_uniq
    ON ectd_templates (organization_id, template_name)
  `);
}

async function seed() {
  const pool = new Pool({ connectionString: getDbUrl() });
  const client = await pool.connect();
  try {
    await ensureUniqueIndex(client);
    await client.query('BEGIN');
    const { orgId, userId } = await getOrgAndUser(client);
    console.log(`Org: ${orgId}, created_by user: ${userId}`);
    console.log('');
    console.log(`Upserting ${TEMPLATES.length} medtech templates…`);
    const { inserted, updated } = await upsertTemplates(client, orgId, userId);
    await client.query('COMMIT');
    console.log('');
    console.log(`✓ MDX templates seed complete: ${inserted} inserted, ${updated} updated.`);
    console.log('');
    console.log('Templates loaded:');
    for (const t of TEMPLATES) {
      console.log(`  • ${t.templateName}  [${t.category}/${t.sectionKey}]`);
    }
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
