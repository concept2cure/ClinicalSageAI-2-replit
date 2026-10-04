/**
 * The `reason` input of a governed AnA tool, and the one rule for reading it.
 *
 * The handler records it as the reason for change on the audit trail
 * (recordGovernedAction -> audit_logs.reason), so it must be the person's, in
 * their words. A governed tool sent without one refuses and tells the model to
 * ask (AnaToolExecutor.ts reasonNotStated); this description says the same
 * before the call, so the model asks first instead of writing one.
 *
 * The reading lives here, not in AnaToolExecutor.ts, because not every handler
 * that records a reason is in that file: commit_document_revision is
 * registered from document-spine.ts, which cannot import the executor without
 * an import cycle. One module, so there is one minimum, one error the
 * registration wrapper recognises, and no second copy to drift.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { GOVERNED_REASON_MIN } from '../../../shared/constants/governed-reason';

export const STATED_REASON_INPUT = {
  type: 'string',
  description:
    "The person's reason for this change, in their words (at least 8 characters). It is recorded as the " +
    'reason for change on the audit trail. If they have not given one, ask them; never write one yourself.',
} as const;

/**
 * The shortest reason recorded — the rule every other path that writes these
 * rows applies (protocol-reviews.ts and financial-disclosures.ts
 * `reasonSchema`; /api/c2c/actions REASON_REQUIRED; governed-qms-write.ts
 * governedQmsReason). One value, shared/constants/governed-reason.ts.
 */
export { GOVERNED_REASON_MIN };

/**
 * The input a governed tool's reason arrives in. `reason` for every tool but
 * those whose definition names it `reason_for_change` (reasonFieldOf). A field
 * name, never a sentence: there is no parameter here a fallback reason could be
 * passed through.
 */
export type StatedReasonField = 'reason' | 'reason_for_change';

/** Governed tools whose reason input is `reason_for_change`; every other one's is `reason`. */
const REASON_FOR_CHANGE_TOOLS: ReadonlySet<string> = new Set(['commit_document_revision']);

/** The input `tool` carries the person's reason in. */
export function reasonFieldOf(tool: string): StatedReasonField {
  return REASON_FOR_CHANGE_TOOLS.has(tool) ? 'reason_for_change' : 'reason';
}

/** A stated reason, trimmed, or null when none of at least GOVERNED_REASON_MIN characters was given. */
function statedReasonText(value: unknown): string | null {
  const r = typeof value === 'string' ? value.trim() : '';
  return r.length >= GOVERNED_REASON_MIN ? r : null;
}

/** The person's stated reason in `input[field]`, trimmed, or null when none was given. */
export function statedReason(input: Record<string, unknown>, field: StatedReasonField = 'reason'): string | null {
  return statedReasonText(input[field]);
}

/** A governed write without the person's reason; the registration wrapper answers it with reasonNotStated. */
export class ReasonNotStatedError extends Error {
  constructor(readonly field: StatedReasonField = 'reason') {
    super('No reason was stated for a governed write. Nothing was recorded or changed.');
    this.name = 'ReasonNotStatedError';
  }
}

/**
 * `value` as the person's stated reason, or ReasonNotStatedError. For a core
 * that records a reason it was handed (document-spine.ts
 * commitCanonicalRevision), so a caller that is not a tool handler cannot
 * reach the ledger without one either.
 */
export function requireStatedReason(value: unknown, field: StatedReasonField = 'reason'): string {
  const reason = statedReasonText(value);
  if (!reason) throw new ReasonNotStatedError(field);
  return reason;
}

/**
 * The person's stated reason, read where a handler resolves its inputs —
 * after its own input checks, before it opens a connection or calls the
 * service that writes. Without one it throws ReasonNotStatedError, which
 * registerToolHandler's wrapper turns into the refusal (reasonNotStated): the
 * handler never reaches a write, and needs no branch of its own for it.
 */
export function gatedReason(input: Record<string, unknown>, field: StatedReasonField = 'reason'): string {
  return requireStatedReason(input[field], field);
}

/**
 * Every tool whose handler records a reason for change on a ledger row — a
 * governed action (recordGovernedAction -> audit_logs.reason), an audit row
 * (recordAuditRow), or through a service that records the reason it is handed
 * (commit_document_revision's document spine, the governed-fact orchestrator,
 * the change-control register): the person is asked for their reason before
 * they are asked to confirm. governed-reason-not-invented.test.ts holds this
 * list to the source of every module that registers a handler: a handler whose
 * path carries a reason to a write and is missing here fails it.
 */
export const REASON_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'add_amendment_change',
  'add_biological_agent',
  'add_capa_action',
  'add_committee_agenda_item',
  'add_coverage_item',
  'add_disclosure_interest',
  'add_effort_line',
  'add_eligibility_criterion',
  'add_grant_budget_line',
  'add_irb_site',
  'add_other_support_entry',
  'add_personnel_training',
  'add_protocol_budget_item',
  'add_protocol_milestone',
  'add_protocol_objective',
  'add_protocol_review_comment',
  'add_protocol_risk',
  'add_soa_assessment',
  'apply_fact_change',
  'apply_protocol_design_derivation',
  'assign_committee_member',
  'assign_protocol_reviewer',
  'bind_protocol_to_study_design',
  'cast_committee_vote',
  'classify_coverage_item',
  'classify_tmf_artifact',
  'clone_protocol_template',
  'commit_document_revision',
  'convene_committee_meeting',
  'create_biosketch',
  'create_clinical_investigator',
  'create_coi_disclosure',
  'create_consent_form',
  'create_coverage_analysis',
  'create_dms_plan',
  'create_effort_certification',
  'create_export_control_review',
  'create_financial_disclosure',
  'create_grant_proposal',
  'create_ha_interaction',
  'create_iacuc_protocol',
  'create_ibc_registration',
  'create_inspection',
  'create_invention_disclosure',
  'create_irb_submission',
  'create_lifecycle_obligation',
  'create_nonclinical_study',
  'create_other_support',
  'create_protocol_amendment',
  'create_protocol_document',
  'create_protocol_template',
  'create_qms_document',
  'create_regulatory_commitment',
  'create_research_agreement',
  'create_rim_product',
  'create_tmf',
  'establish_governed_fact',
  'fulfill_regulatory_commitment',
  'import_citi_records',
  'log_cs_transaction',
  'log_inspection_finding',
  'open_grant_closeout',
  'qms_change_create',
  'qms_change_transition',
  'record_cost_share_contribution',
  'record_grant_award',
  'record_grant_expenditure',
  'record_grant_opportunity',
  'record_subaward',
  'register_animal_cohort',
  'register_controlled_substance',
  'register_dea',
  'report_protocol_deviation',
  'request_no_cost_extension',
  'revise_qms_document',
  'save_document_as_template',
  'save_document_to_vault',
  'screen_subaward',
  'seed_tmf',
  'set_coverage_qualifying_determination',
  'set_funding_profile',
  'set_grant_milestone_status',
  'set_protocol_budget_params',
  'set_protocol_milestone_status',
  'set_registration_status',
  'set_soa_cell',
  'submit_invention_disclosure',
  'triage_compliance_attention',
  'update_biosketch_section',
  'update_consent_element',
  'update_dms_plan_element',
  'update_export_control_review',
  'update_grant_closeout',
  'update_invention_disclosure',
  'update_protocol_section',
  'update_research_agreement',
  'update_tmf_artifact_status',
  'update_vault_document',
]);
