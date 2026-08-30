/**
 * Specialization-track branch nodes for the SOP Development flow.
 *
 * The three conditional deep-dives the compliance node (`compliance_reqs` in
 * sop-development.ts) branches into when the user flags the corresponding
 * regime as applicable:
 *
 *   - `cfr11_details`      — 21 CFR Part 11 electronic records & signatures
 *   - `pv_requirements`    — pharmacovigilance / safety-reporting SOPs
 *   - `device_requirements`— medical-device QSR / ISO 13485 SOPs
 *
 * Every node routes back into the main flow via `defaultNext:
 * 'process_steps'`, so the branch is a detour, not a fork. Extracted verbatim
 * from sop-development.ts (flow decomposition); spread back into that flow's
 * `nodes` array at the same position, so node order and the flow schema are
 * unchanged.
 *
 * @module server/services/ana/intelligence-questions/flows/sop-development-specializations
 */

import type { QuestionNode } from '../../../../../shared/types/intelligence-questions.js';

/**
 * The specialization branch nodes, in their original order within the
 * SOP Development flow's `nodes` array.
 */
export function createSopSpecializationNodes(): QuestionNode[] {
  return [
    {
      id: 'cfr11_details',
      section: 'Compliance',
      question:
        'You indicated 21 CFR Part 11 applies. Let\'s detail the electronic records and signatures requirements.',
      guidance:
        '21 CFR Part 11 requires that electronic records are trustworthy, reliable, and equivalent to paper records. Systems must have audit trails, access controls, and validated electronic signatures. FDA has issued guidance on enforcement discretion but expects compliance for Part 11 predicate rule records.',
      provideExpertFeedback: true,
      fields: [
        {
          id: 'esig_technology',
          label: 'Electronic Signature Technology',
          type: 'select',
          required: true,
          options: [
            { value: 'biometric', label: 'Biometric' },
            { value: 'non_biometric', label: 'Non-Biometric (user ID + password)' },
            { value: 'hybrid', label: 'Hybrid' },
          ],
        },
        {
          id: 'system_validation_status',
          label: 'System Validation Status',
          type: 'select',
          required: true,
          helpText: 'All systems used for Part 11 records must be validated per GAMP 5 principles.',
          options: [
            { value: 'validated', label: 'Validated' },
            { value: 'validation_planned', label: 'Validation Planned' },
            { value: 'not_validated', label: 'Not Validated' },
          ],
        },
        {
          id: 'audit_trail_type',
          label: 'Audit Trail Type',
          type: 'select',
          required: true,
          options: [
            { value: 'system_generated', label: 'System-Generated (automated)' },
            { value: 'manual', label: 'Manual' },
            { value: 'hybrid', label: 'Hybrid' },
          ],
        },
        {
          id: 'electronic_record_types',
          label: 'Electronic Record Types',
          type: 'multi_select',
          helpText: 'Select all types of electronic records governed by this SOP.',
          options: [
            { value: 'training_records', label: 'Training Records' },
            { value: 'batch_records', label: 'Batch Records' },
            { value: 'lab_data', label: 'Laboratory Data' },
            { value: 'adverse_events', label: 'Adverse Event Reports' },
            { value: 'protocol_deviations', label: 'Protocol Deviations' },
          ],
        },
        {
          id: 'access_controls',
          label: 'Access Controls',
          type: 'multi_select',
          required: true,
          options: [
            { value: 'role_based', label: 'Role-Based Access' },
            { value: 'individual', label: 'Individual User Accounts' },
            { value: 'biometric', label: 'Biometric Authentication' },
            { value: 'mfa', label: 'Multi-Factor Authentication' },
          ],
        },
        {
          id: 'backup_and_recovery',
          label: 'Backup and Recovery',
          type: 'select',
          required: true,
          options: [
            { value: 'automated_daily', label: 'Automated Daily' },
            { value: 'automated_weekly', label: 'Automated Weekly' },
            { value: 'manual', label: 'Manual' },
            { value: 'disaster_recovery_plan', label: 'Disaster Recovery Plan' },
          ],
        },
      ],
      issueChecks: [
        {
          id: 'system_not_validated',
          condition: {
            field: 'system_validation_status',
            operator: 'eq',
            value: 'not_validated',
          },
          severity: 'critical',
          title: 'System Validation Required',
          message:
            '21 CFR Part 11 requires that electronic systems used for regulated records are validated. Using unvalidated systems for electronic records creates significant compliance risk and may result in FDA enforcement action.',
          reference: '21 CFR 11.10(a)',
        },
      ],
      defaultNext: 'process_steps',
    },

    {
      id: 'pv_requirements',
      section: 'Compliance',
      question:
        'This is a Pharmacovigilance SOP. Let\'s capture the specific safety reporting requirements.',
      guidance:
        'Pharmacovigilance SOPs must comply with ICH E2A (expedited reporting), ICH E2B (electronic transmission), ICH E2C (periodic reports), and ICH E2E (pharmacovigilance planning). EU QPPV requirements and FDA MedWatch reporting have specific timeline and format requirements.',
      provideExpertFeedback: true,
      fields: [
        {
          id: 'cioms_form_requirements',
          label: 'CIOMS Form Requirements',
          type: 'yes_no',
          required: true,
          helpText: 'Are CIOMS I forms required for individual case safety reports?',
        },
        {
          id: 'e2b_reporting',
          label: 'E2B Electronic Reporting',
          type: 'yes_no',
          required: true,
          helpText: 'Will this SOP cover E2B electronic submission of ICSRs?',
        },
        {
          id: 'e2b_version',
          label: 'E2B Version',
          type: 'select',
          visibleWhen: { field: 'e2b_reporting', operator: 'eq', value: true },
          options: [
            { value: 'r2', label: 'E2B(R2)' },
            { value: 'r3', label: 'E2B(R3)' },
          ],
        },
        {
          id: 'safety_database',
          label: 'Safety Database',
          type: 'select',
          required: true,
          options: [
            { value: 'argus', label: 'Oracle Argus' },
            { value: 'aris_g', label: 'ArisGlobal' },
            { value: 'empirica', label: 'Empirica Signal' },
            { value: 'custom', label: 'Custom / In-house' },
            { value: 'none', label: 'None' },
          ],
        },
        {
          id: 'reporting_timelines',
          label: 'Reporting Timelines',
          type: 'multi_select',
          required: true,
          helpText: 'Select all applicable expedited and periodic reporting timelines.',
          options: [
            { value: '7_day_fatal', label: '7-Day (Fatal/Life-Threatening)' },
            { value: '15_day_serious', label: '15-Day (Serious Unexpected)' },
            { value: '90_day_periodic', label: '90-Day Periodic' },
            { value: 'annual_psur', label: 'Annual PSUR/PBRER' },
          ],
        },
        {
          id: 'signal_detection_method',
          label: 'Signal Detection Method',
          type: 'select',
          options: [
            { value: 'manual_review', label: 'Manual Review' },
            { value: 'automated_disproportionality', label: 'Automated Disproportionality Analysis' },
            { value: 'bayesian', label: 'Bayesian Methods' },
            { value: 'combined', label: 'Combined Approach' },
          ],
        },
        {
          id: 'aggregate_report_types',
          label: 'Aggregate Report Types',
          type: 'multi_select',
          helpText: 'Select all aggregate safety report types covered by this SOP.',
          options: [
            { value: 'psur', label: 'PSUR' },
            { value: 'pbrer', label: 'PBRER' },
            { value: 'dsur', label: 'DSUR' },
            { value: 'addendum', label: 'Addendum to Clinical Overview' },
          ],
        },
      ],
      defaultNext: 'process_steps',
    },

    {
      id: 'device_requirements',
      section: 'Compliance',
      question:
        'This SOP supports medical device operations. Let\'s capture the device-specific regulatory requirements.',
      guidance:
        'Medical device SOPs must comply with 21 CFR 820 (QSR), ISO 13485, and EU MDR where applicable. Design control procedures (21 CFR 820.30) are particularly scrutinized during FDA inspections. Post-market surveillance obligations differ significantly between the US and EU frameworks.',
      provideExpertFeedback: true,
      fields: [
        {
          id: 'iso_13485_scope',
          label: 'ISO 13485 Scope',
          type: 'multi_select',
          required: true,
          helpText: 'Select all ISO 13485 clauses in scope for this SOP.',
          options: [
            { value: 'design_control', label: 'Design Control' },
            { value: 'production', label: 'Production' },
            { value: 'purchasing', label: 'Purchasing' },
            { value: 'monitoring', label: 'Monitoring and Measurement' },
            { value: 'corrective_action', label: 'Corrective and Preventive Action' },
          ],
        },
        {
          id: 'device_classification',
          label: 'Device Classification',
          type: 'select',
          required: true,
          options: [
            { value: 'class_i', label: 'Class I' },
            { value: 'class_ii', label: 'Class II' },
            { value: 'class_iii', label: 'Class III' },
          ],
        },
        {
          id: 'design_history_file',
          label: 'Design History File (DHF) Required',
          type: 'yes_no',
          required: true,
          helpText: 'Is a Design History File maintained per 21 CFR 820.30?',
        },
        {
          id: 'risk_management_file',
          label: 'Risk Management File Required',
          type: 'yes_no',
          required: true,
          helpText: 'Is an ISO 14971 Risk Management File maintained?',
        },
        {
          id: 'udi_requirements',
          label: 'UDI Requirements Apply',
          type: 'yes_no',
          helpText: 'Does this SOP involve Unique Device Identification labeling?',
        },
        {
          id: 'post_market_surveillance',
          label: 'Post-Market Surveillance Required',
          type: 'yes_no',
          required: true,
          helpText: 'Does this SOP cover post-market surveillance obligations?',
        },
      ],
      defaultNext: 'process_steps',
    },
  ];
}
