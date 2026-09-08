/**
 * PDEV closed-enum surface — port of ui_kits/pdev/data.jsx
 * with fixture rows stripped per CLAUDE.md ("Seed data fixtures must not
 * land in v2"). Runtime data comes from /api/pdev/* endpoints.
 *
 * Workstreams, stages, lifecycle states, and label maps are the source
 * of truth for the UI layer. Server enums live at
 * shared/.. and server/services/pdev/pdev-activity-registry.ts and must
 * stay in lockstep with these values — drift is a schema bug.
 */

export type PdevWorkstream = 'cmc' | 'nonclinical' | 'clinical' | 'regulatory';

export const PDEV_WORKSTREAMS: readonly PdevWorkstream[] = [
  'cmc',
  'nonclinical',
  'clinical',
  'regulatory',
];

export const PDEV_WORKSTREAM_LABELS: Record<PdevWorkstream, string> = {
  cmc: 'CMC',
  nonclinical: 'Nonclinical',
  clinical: 'Clinical',
  regulatory: 'Regulatory',
};

export type PdevStage =
  | 'early_pdev'
  | 'late_pdev'
  | 'pre_ind_meeting'
  | 'ind_package'
  | 'post_ind';

export const PDEV_STAGES: readonly PdevStage[] = [
  'early_pdev',
  'late_pdev',
  'pre_ind_meeting',
  'ind_package',
  'post_ind',
];

export const PDEV_STAGE_LABELS: Record<PdevStage, string> = {
  early_pdev: 'Early PDEV',
  late_pdev: 'Late PDEV',
  pre_ind_meeting: 'Pre-IND meeting',
  ind_package: 'IND package',
  post_ind: 'Post-IND',
};

export type PdevActivityState =
  | 'not_started'
  | 'drafting'
  | 'ai_draft_generated'
  | 'evidence_linked'
  | 'human_review_required'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'locked'
  | 'submission_ready'
  | 'submitted'
  | 'agency_feedback_received'
  | 'revision_required'
  | 'superseded';

export const PDEV_ACTIVITY_STATES: readonly PdevActivityState[] = [
  'not_started',
  'drafting',
  'ai_draft_generated',
  'evidence_linked',
  'human_review_required',
  'in_review',
  'changes_requested',
  'approved',
  'locked',
  'submission_ready',
  'submitted',
  'agency_feedback_received',
  'revision_required',
  'superseded',
];

export const PDEV_COMPLETED_STATES: readonly PdevActivityState[] = [
  'approved',
  'locked',
  'submission_ready',
  'submitted',
];

export const PDEV_BLOCKED_STATES: readonly PdevActivityState[] = ['revision_required'];

export const PDEV_STATE_LABELS: Record<PdevActivityState, string> = {
  not_started: 'Not started',
  drafting: 'Drafting',
  ai_draft_generated: 'AI draft ready',
  evidence_linked: 'Evidence linked',
  human_review_required: 'Review required',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  locked: 'Locked',
  submission_ready: 'Submission ready',
  submitted: 'Submitted',
  agency_feedback_received: 'Agency feedback',
  revision_required: 'Revision required',
  superseded: 'Superseded',
};

/** Per-surface AnA suggestions. Capped at 3 in the dock per brief §9 Q6. */
export const PDEV_SUGGESTIONS: Record<string, readonly string[]> = {
  overview: [
    'What is blocking IND for this program?',
    'Snapshot readiness now',
    'Show me the critical contradictions',
  ],
  cmc: [
    'What is the CMC status?',
    'Draft cmc.formulation_development',
    'Show overdue CMC activities',
  ],
  nonclinical: [
    'What is the nonclinical status?',
    'Draft my GLP toxicology summary into Module 4',
    'What evidence is attached to nonclinical.glp_tox?',
  ],
  clinical: [
    'What is the clinical status?',
    'Show me protocol risk assessment progress',
    'Roll up FDA commitments into clinical activities',
  ],
  regulatory: [
    'What is the regulatory status?',
    'Walk me through every FDA interaction',
    'Compile the IND assembly readiness',
  ],
};

/** Tone categories for state pills — mirrors the kit's statePillClass. */
export function statePillTone(state: PdevActivityState):
  | 'done'
  | 'blocked'
  | 'ai'
  | 'warn-strong'
  | 'warn'
  | 'flight'
  | 'neutral'
  | 'idle' {
  if ((PDEV_COMPLETED_STATES as readonly string[]).includes(state)) return 'done';
  if ((PDEV_BLOCKED_STATES as readonly string[]).includes(state)) return 'blocked';
  if (state === 'ai_draft_generated' || state === 'evidence_linked') return 'ai';
  if (state === 'changes_requested') return 'warn-strong';
  if (
    state === 'human_review_required' ||
    state === 'in_review' ||
    state === 'agency_feedback_received'
  )
    return 'warn';
  if (state === 'drafting') return 'flight';
  if (state === 'superseded') return 'neutral';
  return 'idle';
}
