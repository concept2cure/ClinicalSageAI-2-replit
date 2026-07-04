/**
 * Canonical persona vocabulary — the single source of truth for the job/role
 * personas used across the platform.
 *
 * These are the SAME values the Report-OS taxonomy stamps onto each report type
 * as `allowedPersonas` (who a report is *for*). Historically they existed only
 * as inline free-strings on report types and were never associated with a user
 * account. This constant lifts them into one canonical list so a user can be
 * mapped to a persona (`organization_users.persona`) that drives a
 * role-personalized experience, and so the report catalog's persona filter and
 * the user's persona speak the same vocabulary — no parallel enum.
 *
 * A user's persona is OPTIONAL (null = unset); it personalizes surfaces but is
 * NOT an authorization boundary. Access control remains the coarse
 * `organization_users.role` (admin/manager/member/viewer) + platform roles.
 */

export const REPORT_PERSONAS = [
  'executive',
  'ra_lead',
  'ra_ops',
  'reg_strategy',
  'medical_writer',
  'qa',
  'auditor',
  'pm',
  'clinical_ops',
  'tmf_lead',
  'submission_coordinator',
  'compliance_officer',
  'nonclinical_lead',
  'labeling_lead',
  'biosafety_officer',
  'iacuc_coordinator',
  'pi',
  'research_admin',
  'research_ops',
  'research_security',
  'finance',
] as const;

export type ReportPersona = (typeof REPORT_PERSONAS)[number];

const PERSONA_SET: ReadonlySet<string> = new Set(REPORT_PERSONAS);

/** PURE: is a value one of the canonical personas? */
export function isReportPersona(value: unknown): value is ReportPersona {
  return typeof value === 'string' && PERSONA_SET.has(value);
}

/**
 * Human-readable labels for the personas the product surfaces most prominently
 * (RA Lead / CMC-adjacent / Exec / QA and friends). Any persona not listed here
 * falls back to a title-cased form of its key at the display layer.
 */
export const REPORT_PERSONA_LABELS: Partial<Record<ReportPersona, string>> = {
  executive: 'Executive',
  ra_lead: 'RA Lead',
  ra_ops: 'RA Operations',
  reg_strategy: 'Regulatory Strategy',
  medical_writer: 'Medical Writer',
  qa: 'Quality Assurance',
  auditor: 'Auditor',
  pm: 'Program Manager',
  clinical_ops: 'Clinical Operations',
  tmf_lead: 'TMF Lead',
  submission_coordinator: 'Submission Coordinator',
  compliance_officer: 'Compliance Officer',
};
