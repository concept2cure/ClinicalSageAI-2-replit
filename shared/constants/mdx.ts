/**
 * MDX taxonomy constants — single source of truth for status enums,
 * pathway codes, phase mappings, and label tables shared between the
 * server-side route handlers and the client-side adapter hooks.
 *
 * Anything that maps a backend string to a kit-shape string (or
 * vice-versa) belongs here. Both sides import from this file so a
 * change in the taxonomy can't drift between the SQL and the UI.
 *
 * Naming:
 *   - SCREAMING_SNAKE for `as const` lookup tables
 *   - CamelCase types for the closed-enum string unions
 *
 * This file has zero runtime dependencies — pure data — so it can be
 * imported from server, client, scripts, and tests without pulling in
 * a router or React.
 */

/* ─── Pathway / program type ───────────────────────────────────────── */

export const REGULATORY_PATHWAYS = ['k510', 'pma', 'cer'] as const;
export type RegulatoryPathway = typeof REGULATORY_PATHWAYS[number];

/** Backend `regulatoryPath` column → kit pathway code. */
export const REGULATORY_PATH_TO_PATHWAY: Record<string, RegulatoryPathway> = {
  '510k':    'k510',
  'de_novo': 'k510',
  'pma':     'pma',
  'cer':     'cer',
};

/** Backend `programType` column → kit pathway code (null = non-MDX type). */
export const PROGRAM_TYPE_TO_PATHWAY: Record<string, RegulatoryPathway | null> = {
  '510K':    'k510',
  '510(K)':  'k510',
  '510k':    'k510',
  'DE_NOVO': 'k510',
  'PMA':     'pma',
  'CER':     'cer',
  /* Non-MDX program types — surfaces filter these out. */
  'IND': null,
  'NDA': null,
  'BLA': null,
};

/** Display label for the kit pathway. */
export const PATHWAY_LABEL: Record<RegulatoryPathway, string> = {
  k510: '510(k)',
  pma:  'PMA',
  cer:  'CER',
};

/* ─── Program phase / stage ────────────────────────────────────────── */

export const PROGRAM_PHASES = [
  'planning',
  'evidence_collection',
  'authoring',
  'review',
  'submission',
  'post_market',
] as const;
export type ProgramPhase = typeof PROGRAM_PHASES[number];

/** Backend `phase` column → kit 0..7 stageIdx (kit's 7-stage timeline). */
export const PHASE_TO_STAGE_IDX: Record<string, number> = {
  planning:            0,
  evidence_collection: 1,
  authoring:           3,
  review:              4,
  submission:          6,
  post_market:         7,
};

/** Display labels for the kit's 7-stage timeline (closed-enum kit content). */
export const STAGE_LABELS = [
  'Intake',
  'Classify',
  'Predicate search',
  'Performance Testing',
  'Substantial Equivalence',
  'Assemble eSTAR',
  'Submit',
  'Cleared',
] as const;

/** PMA-specific 10-phase grid (kit content; mapping from kit's 7-stage to
 *  this grid lives in surfaces/PmaSurface.tsx). */
export const PMA_PHASE_IDS = [
  'presub', 'preclin', 'ide', 'mfg', 'pivotal',
  'labeling', 'module', 'panel', 'approval', 'postapp',
] as const;

/* ─── eSTAR section status ─────────────────────────────────────────── */

export const ESTAR_STATUSES = ['complete', 'review', 'draft', 'na', 'empty'] as const;
export type EstarStatus = typeof ESTAR_STATUSES[number];

/** Backend `cerv2_510k_sections.status` → kit EstarStatus. */
export const ESTAR_STATUS_MAP: Record<string, EstarStatus> = {
  validated:        'complete',
  approved:         'complete',
  ready_for_review: 'review',
  in_review:        'review',
  drafting:         'draft',
  todo:             'empty',
  not_applicable:   'na',
  na:               'na',
};

/* ─── Predicate / SE matrix ────────────────────────────────────────── */

export const PREDICATE_STATUSES = ['selected', 'candidate', 'reviewed', 'rejected'] as const;
export type PredicateStatus = typeof PREDICATE_STATUSES[number];

export const PREDICATE_STATUS_MAP: Record<string, PredicateStatus> = {
  selected:  'selected',
  candidate: 'candidate',
  reviewed:  'reviewed',
  rejected:  'rejected',
  approved:  'selected',
  pending:   'candidate',
};

export const SE_VERDICTS = ['same', 'equivalent', 'different'] as const;
export type SeVerdict = typeof SE_VERDICTS[number];

export const VERDICT_MAP: Record<string, SeVerdict> = {
  same:        'same',
  identical:   'same',
  equivalent:  'equivalent',
  similar:     'equivalent',
  different:   'different',
  diverges:    'different',
};

/* ─── Safety signals (CER pane) ────────────────────────────────────── */

export const SIGNAL_SOURCES = ['FAERS', 'MAUDE', 'Eudamed', 'Literature', 'Spontaneous'] as const;
export type SignalSource = typeof SIGNAL_SOURCES[number];

/** Backend `safety_signals.signal_source` → kit SignalSource. */
export const SIGNAL_SOURCE_MAP: Record<string, SignalSource> = {
  spontaneous:    'Spontaneous',
  clinical_trial: 'FAERS',
  literature:     'Literature',
  registry:       'Eudamed',
};

export const SIGNAL_SEVERITIES = ['critical', 'serious', 'moderate', 'low'] as const;
export type SignalSeverity = typeof SIGNAL_SEVERITIES[number];

/** Recommended regulatory action → severity tier. */
export const ACTION_TO_SEVERITY: Record<string, SignalSeverity> = {
  withdrawal:   'critical',
  rems:         'serious',
  dear_doctor:  'serious',
  label_update: 'moderate',
  none:         'low',
};

export const SIGNAL_KIT_STATUSES = ['included', 'excluded', 'review'] as const;
export type SignalKitStatus = typeof SIGNAL_KIT_STATUSES[number];

export const STATUS_TO_KIT: Record<string, SignalKitStatus> = {
  new:              'review',
  under_evaluation: 'review',
  confirmed:        'included',
  refuted:          'excluded',
  closed:           'excluded',
};

/* ─── Submission packages ──────────────────────────────────────────── */

export const SUBMISSION_PATHWAYS = ['510(k)', 'PMA', 'CER', 'EU MDR', 'IND'] as const;
export type SubmissionPathway = typeof SUBMISSION_PATHWAYS[number];

export const FAMILY_TO_SUBMISSION_PATHWAY: Record<string, SubmissionPathway> = {
  '510k':    '510(k)',
  '510(k)':  '510(k)',
  'pma':     'PMA',
  'cer':     'CER',
  'ivdr_td': 'EU MDR',
  'eu_mdr':  'EU MDR',
  'ind':     'IND',
};

/** Submission package status — backend → kit closed-enum. */
export const SUBMISSION_KIT_STATUSES = ['active', 'blocked', 'complete'] as const;
export type SubmissionKitStatus = typeof SUBMISSION_KIT_STATUSES[number];

/* ─── Tasks (Workbench Kanban) ─────────────────────────────────────── */

export const TASK_COLUMNS = ['todo', 'doing', 'review', 'blocked', 'done'] as const;
export type TaskColumn = typeof TASK_COLUMNS[number];

export const STATUS_TO_TASK_COL: Record<string, TaskColumn> = {
  todo:              'todo',
  pending:           'todo',
  in_progress:       'doing',
  doing:             'doing',
  ready_for_review:  'review',
  review:            'review',
  blocked:           'blocked',
  done:              'done',
  completed:         'done',
};

export const TASK_KINDS = ['edit', 'review', 'sign'] as const;
export type TaskKind = typeof TASK_KINDS[number];

export const TYPE_TO_TASK_KIND: Record<string, TaskKind> = {
  edit:      'edit',
  draft:     'edit',
  authoring: 'edit',
  review:    'review',
  approval:  'sign',
  sign:      'sign',
  signoff:   'sign',
};

/* ─── Audit / mutation actions ─────────────────────────────────────── */

export const AUDIT_VERBS = ['created', 'updated', 'deleted', 'approved'] as const;
export type AuditVerb = typeof AUDIT_VERBS[number];

export const ACTION_TO_VERB: Record<string, AuditVerb> = {
  create:   'created',
  created:  'created',
  insert:   'created',
  update:   'updated',
  updated:  'updated',
  edit:     'updated',
  delete:   'deleted',
  deleted:  'deleted',
  approve:  'approved',
  approved: 'approved',
};

/* ─── Tone (UI severity → token mapping) ───────────────────────────── */

export type Tone = 'ok' | 'warn' | 'err';

/** Bucketize an integer into ok / warn / err tone for KPI bars.
 *  okMin/warnMin define the ascending thresholds (0..okMin = err, etc.). */
export function bucketTone(value: number, warnMin: number, okMin: number): Tone {
  if (value >= okMin) return 'ok';
  if (value >= warnMin) return 'warn';
  return 'err';
}
