/**
 * Grants & Sponsored Programs management tool definitions.
 *
 * The sponsored-programs lifecycle AnA works end to end: proposal → award →
 * milestones/reporting → subawards → budget & expenditures → cost share →
 * no-cost extensions → closeout (2 CFR 200.344), plus funding-opportunity
 * capture and the one-shot closeout-readiness assessment.
 *
 * Extracted verbatim from notifications-study-memory-tool-defs.ts (mega-file
 * decomposition, tranche 4a). These are pure `AnaTool` definition objects;
 * their handlers live in AnaToolExecutor.ts. Re-exported from
 * notifications-study-memory-tool-defs.ts so its aggregate export surface —
 * and the import block in AnaToolDefinitions.ts — are unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

export const CREATE_GRANT_PROPOSAL: AnaTool = {
  name: 'create_grant_proposal',
  description:
    "Open a grant proposal (application) in the sponsored-programs pipeline. Optionally link the funding opportunity it responds to and the Project it belongs to. Returns the proposal id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      opportunity_id: { type: 'number' },
      project_id: { type: 'number' },
      principal_investigator: { type: 'string' },
      requested_amount: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['title'],
  },
};

export const RECORD_GRANT_AWARD: AnaTool = {
  name: 'record_grant_award',
  description:
    "Record a grant award (post-award). When linked to its proposal, the proposal is marked awarded and the proposal → award provenance link is written (preserving pre→post-award continuity). Returns the award id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      award_number: { type: 'string' },
      funding_agency: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'] },
      proposal_id: { type: 'number' },
      project_id: { type: 'number' },
      total_amount: { type: 'number' },
      period_start: { type: 'string', description: 'YYYY-MM-DD.' },
      period_end: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['award_number', 'funding_agency'],
  },
};

export const REVIEW_GRANT_REPORTING: AnaTool = {
  name: 'review_grant_reporting',
  description:
    "Compute the federal post-award reporting obligations for an award (read-only): annual RPPRs and the final performance + financial reports (2 CFR 200.344, 120 days after period end), plus where the award sits in its period of performance. Use to tell the user what reports are coming due.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' } },
    required: ['award_id'],
  },
};

export const SET_GRANT_MILESTONE_STATUS: AnaTool = {
  name: 'set_grant_milestone_status',
  description:
    "Transition a grant milestone's status (pending → in_progress → met/submitted, or missed). Met/submitted stamps the completion date. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: { milestone_id: { type: 'number' }, status: { type: 'string', enum: ['pending', 'in_progress', 'met', 'missed', 'submitted'] }, completed_date: { type: 'string', description: 'YYYY-MM-DD.' }, reason: { type: 'string' } },
    required: ['milestone_id', 'status'],
  },
};

export const OPEN_GRANT_CLOSEOUT: AnaTool = {
  name: 'open_grant_closeout',
  description:
    "Open the closeout record for a grant award. Derives the federal closeout due date (period of performance end + 120 days, 2 CFR 200.344). One closeout per award. Governed + audited, org-scoped.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, reason: { type: 'string' } }, required: ['award_id'] },
};

export const UPDATE_GRANT_CLOSEOUT: AnaTool = {
  name: 'update_grant_closeout',
  description:
    "Mark grant-closeout checklist items complete: final performance report (RPPR), final FFR (SF-425), final property/equipment inventory, and reconciliation of final invoices (2 CFR 200.344 / 200.313). Submitting an item stamps its date. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      award_id: { type: 'number' },
      final_rppr_submitted: { type: 'boolean' }, final_ffr_submitted: { type: 'boolean' },
      equipment_inventory_returned: { type: 'boolean' }, final_invoices_reconciled: { type: 'boolean' },
      deobligation_amount: { type: 'number' }, notes: { type: 'string' }, reason: { type: 'string' },
    },
    required: ['award_id'],
  },
};

export const FINALIZE_GRANT_CLOSEOUT: AnaTool = {
  name: 'finalize_grant_closeout',
  description:
    "Finalize a grant closeout. Gated: all four 2 CFR 200.344 items must be complete (final RPPR, final FFR, property inventory, invoice reconciliation); otherwise it is rejected with the outstanding items. On success the award is closed. Governed + audited (signature).",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, reason: { type: 'string' } }, required: ['award_id'] },
};

export const RECORD_SUBAWARD: AnaTool = {
  name: 'record_subaward',
  description:
    "Record a subaward to a subrecipient under a prime award (2 CFR 200.331). Capture institution type, amount, period, and an initial risk level. The subaward starts in 'draft' and cannot be executed until screened and risk-assessed. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      award_id: { type: 'number' }, subrecipient_name: { type: 'string' }, subrecipient_uei: { type: 'string' },
      institution_type: { type: 'string', enum: ['higher_ed', 'nonprofit', 'commercial', 'foreign', 'government', 'other'] },
      amount: { type: 'number' }, period_start: { type: 'string' }, period_end: { type: 'string' },
      risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }, reason: { type: 'string' },
    },
    required: ['award_id', 'subrecipient_name'],
  },
};

export const SCREEN_SUBAWARD: AnaTool = {
  name: 'screen_subaward',
  description:
    "Record the restricted-party screening result for a subaward's subrecipient (2 CFR 200.214). Use screen_restricted_party first to perform the live SAM.gov exclusions lookup, then record 'cleared' or 'excluded' here. Optionally set the risk level. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { subaward_id: { type: 'number' }, screen_status: { type: 'string', enum: ['cleared', 'excluded'] }, screen_source: { type: 'string' }, risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }, reason: { type: 'string' } },
    required: ['subaward_id', 'screen_status'],
  },
};

export const EXECUTE_SUBAWARD: AnaTool = {
  name: 'execute_subaward',
  description:
    "Execute a subaward. Gated: rejected unless the subrecipient was screened CLEAR of SAM.gov exclusions and a risk assessment is recorded (2 CFR 200.214 / 200.332). Governed + audited (signature).",
  input_schema: { type: 'object', properties: { subaward_id: { type: 'number' }, reason: { type: 'string' } }, required: ['subaward_id'] },
};

const BUDGET_CATEGORY_ENUM = ['personnel', 'fringe', 'equipment', 'travel', 'supplies', 'contractual', 'construction', 'other_direct', 'indirect'];

export const ADD_GRANT_BUDGET_LINE: AnaTool = {
  name: 'add_grant_budget_line',
  description:
    "Add a budget line to an award by cost category (2 CFR 200.308). Gated: rejected if the running total budgeted would over-allocate the award amount. On the 'indirect' line, set indirect_rate_pct for the F&A rate (2 CFR 200.414). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, category: { type: 'string', enum: BUDGET_CATEGORY_ENUM }, budgeted_amount: { type: 'number' }, indirect_rate_pct: { type: 'number' }, notes: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'category', 'budgeted_amount'],
  },
};

export const RECORD_GRANT_EXPENDITURE: AnaTool = {
  name: 'record_grant_expenditure',
  description:
    "Record an actual expenditure booked against an award, by cost category (2 CFR 200.403). Expenditures are recorded as-is; over-budget categories are surfaced by review_grant_budget, not blocked here. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, category: { type: 'string', enum: BUDGET_CATEGORY_ENUM }, amount: { type: 'number' }, expenditure_date: { type: 'string', description: 'YYYY-MM-DD.' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'category', 'amount'],
  },
};

export const REVIEW_GRANT_BUDGET: AnaTool = {
  name: 'review_grant_budget',
  description:
    "Reconcile budget vs actual for an award (read-only): per-category budgeted/spent/remaining, over-budget and over-allocation flags, a risk level, and findings citing 2 CFR 200.308/200.403. Use to tell the user how the award is tracking financially.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};

export const RECORD_COST_SHARE_CONTRIBUTION: AnaTool = {
  name: 'record_cost_share_contribution',
  description:
    "Record an actual cost-share / matching contribution against an award's committed cost share (2 CFR 200.306), by source (institutional, third-party, in-kind, other). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, source: { type: 'string', enum: ['institutional', 'third_party', 'in_kind', 'other'] }, amount: { type: 'number' }, contribution_date: { type: 'string' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'source', 'amount'],
  },
};

export const REVIEW_COST_SHARE: AnaTool = {
  name: 'review_cost_share',
  description:
    "Report cost-share status for an award (read-only): committed vs contributed, percent met, and any shortfall (2 CFR 200.306). Use to tell the user whether the match commitment is on track.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};

export const REQUEST_NO_COST_EXTENSION: AnaTool = {
  name: 'request_no_cost_extension',
  description:
    "Request a no-cost extension of an award's period of performance (2 CFR 200.308). Returns whether it is within grantee authority (first extension, ≤12 months) or requires sponsor prior approval. Governed + audited.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, new_end_date: { type: 'string', description: 'YYYY-MM-DD.' }, reason: { type: 'string' } }, required: ['award_id', 'new_end_date'] },
};

export const APPROVE_NO_COST_EXTENSION: AnaTool = {
  name: 'approve_no_cost_extension',
  description:
    "Approve a requested no-cost extension. Gated: grantee authority cannot self-approve an extension that requires sponsor prior approval (a second extension, or one over 12 months). On approval the award's period end moves out. Governed + audited (signature).",
  input_schema: { type: 'object', properties: { nce_id: { type: 'number' }, authority: { type: 'string', enum: ['grantee', 'sponsor'] }, reason: { type: 'string' } }, required: ['nce_id', 'authority'] },
};

export const RECORD_GRANT_OPPORTUNITY: AnaTool = {
  name: 'record_grant_opportunity',
  description:
    "Record a federal funding opportunity (NOFO) into the pre-award pipeline as a governed grant_opportunities row. Pairs with search_grants_gov: pass the Grants.gov opportunity id as external_id to thread the external link. Specify agency and (optionally) the mechanism (SBIR/STTR/R01…), due date, and ceiling. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      opportunity_number: { type: 'string' }, title: { type: 'string' },
      funding_agency: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'] },
      mechanism: { type: 'string', enum: ['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other'] },
      external_id: { type: 'string', description: 'Grants.gov opportunity id (from search_grants_gov).' },
      due_date: { type: 'string', description: 'YYYY-MM-DD.' }, ceiling_amount: { type: 'number' }, reason: { type: 'string' },
    },
    required: ['opportunity_number', 'title', 'funding_agency'],
  },
};

export const PREPARE_AWARD_CLOSEOUT: AnaTool = {
  name: 'prepare_award_closeout',
  description:
    "One-shot closeout-readiness assessment for a grant award (read-only orchestration): pulls the four 2 CFR 200.344 closeout items, outstanding/overdue milestones, the federal reporting obligations (final RPPR/FFR), cost-share status (200.306), and budget posture (200.403) into a single verdict with a prioritized blocker list. `readyToClose` is stricter than finalize — it also wants milestones current, cost share met, and spending within the award. Use to answer 'can we close this award and what's left?'.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};
