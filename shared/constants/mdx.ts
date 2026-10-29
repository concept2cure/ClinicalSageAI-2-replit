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

export const REGULATORY_PATHWAYS = [
  'k510', 'pma', 'cer', 'ivdr', 'ide', 'device', 'hde', 'mdl',
  'ivd_licence', 'shonin', 'ninsho', 'todokede', 'ivd_approval', 'jp_cdx', 'other',
] as const;
export type RegulatoryPathway = typeof REGULATORY_PATHWAYS[number];

/** A portfolio classification, not admission to a pathway authoring feature. */
export const PATHWAY_LABEL: Record<RegulatoryPathway, string> = {
  k510: '510(k)', pma: 'PMA', cer: 'CER', ivdr: 'IVDR', ide: 'IDE',
  device: 'Device', hde: 'HDE', mdl: 'MDL', ivd_licence: 'IVD licence',
  shonin: 'Shonin', ninsho: 'Ninsho', todokede: 'Todokede',
  ivd_approval: 'IVD approval', jp_cdx: 'Japan CDx', other: 'Other',
};

/** Backend regulatory_path aliases. Unknown values are retained as Other. */
export const REGULATORY_PATH_TO_PATHWAY: Readonly<Record<string, RegulatoryPathway>> = {
  '510k': 'k510', '510(k)': 'k510', k510: 'k510', de_novo: 'k510',
  pma: 'pma', cer: 'cer', mdr: 'cer', mdr_td: 'cer', eu_mdr: 'cer',
  ivd: 'ivdr', ivdr: 'ivdr', ivdr_td: 'ivdr', ide: 'ide', device: 'device',
  hde: 'hde', mdl: 'mdl', ivd_licence: 'ivd_licence', shonin: 'shonin',
  ninsho: 'ninsho', todokede: 'todokede', ivd_approval: 'ivd_approval', jp_cdx: 'jp_cdx',
};

/** Exact evaluation/regional filing identity wins over a separately recorded
 * US route. Generic IVD/device programs may still carry their actual route. */
export const PATHWAY_IDENTITY_PROGRAM_TYPES = [
  'cer', 'mdr', 'mdr_td', 'eu_mdr', 'ivdr', 'ivdr_td', 'ide', 'hde',
  'mdl', 'ivd_licence', 'shonin', 'ninsho', 'todokede', 'ivd_approval', 'jp_cdx',
] as const;

/** Compatibility program-type lookup, derived from the canonical aliases. */
export const PROGRAM_TYPE_TO_PATHWAY: Readonly<Record<string, RegulatoryPathway | null>> =
  Object.freeze(Object.fromEntries([
    ...Object.entries(REGULATORY_PATH_TO_PATHWAY).map(([key, value]) => [key.toUpperCase(), value]),
    ['IND', null], ['NDA', null], ['BLA', null],
  ]));

export function pathwayKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** The same precedence is rendered by pathwaySqlCase for portfolio SQL. */
export function pathwayForProgram(programType: string | null | undefined,
  regulatoryPath: string | null | undefined): RegulatoryPathway {
  const type = pathwayKey(programType);
  if ((PATHWAY_IDENTITY_PROGRAM_TYPES as readonly string[]).includes(type)) {
    return REGULATORY_PATH_TO_PATHWAY[type];
  }
  const path = pathwayKey(regulatoryPath);
  if (Object.hasOwn(REGULATORY_PATH_TO_PATHWAY, path)) return REGULATORY_PATH_TO_PATHWAY[path];
  return Object.hasOwn(REGULATORY_PATH_TO_PATHWAY, type) ? REGULATORY_PATH_TO_PATHWAY[type] : 'other';
}

export const MDX_DIAGNOSTICS_SURFACE_ID = 'device-diagnostics-workbench' as const;

/** The only compatibility boundary for historical MDx surface identifiers. */
export function resolveMdxSurfaceId(value: string): string {
  return value === 'ivd' || value === 'ivdr' ? MDX_DIAGNOSTICS_SURFACE_ID : value;
}

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

/** PMA-specific 10-phase grid (kit content). It carries no position: a
 *  project records a generic project phase (PROGRAM_PHASES), not a PMA phase,
 *  and the kit-stage-to-PMA mapping was deleted in slice 0 (PmaSurface.tsx). */
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

export const SUBMISSION_PATHWAYS = ['510(k)', 'PMA', 'CER', 'IVDR', 'EU MDR', 'IND'] as const;
export type SubmissionPathway = typeof SUBMISSION_PATHWAYS[number];

export const FAMILY_TO_SUBMISSION_PATHWAY: Record<string, SubmissionPathway> = {
  '510k':    '510(k)',
  '510(k)':  '510(k)',
  'pma':     'PMA',
  'cer':     'CER',
  'ivdr_td': 'IVDR',
  'eu_mdr':  'EU MDR',
  'ind':     'IND',
};

/** Submission package status — backend → kit closed-enum. */
export const SUBMISSION_KIT_STATUSES = ['active', 'blocked', 'complete'] as const;
export type SubmissionKitStatus = typeof SUBMISSION_KIT_STATUSES[number];

/* No Workbench Kanban maps. Their one reader, the kit's task panel, folded into
   Tasks (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/). */

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

/* ─── HTTP envelope ─────────────────────────────────────────────────
   Standard response shape for every MDX-owned API endpoint. All routes
   under /api/regulatory-programs and /api/saved-precedent-queries
   return this envelope so client adapters can unwrap consistently:

     { data: T | T[], meta?: { ... } }

   `data` carries the resource (single object for /:id endpoints, array
   for list endpoints). `meta` is an optional object with sibling
   metadata (totals, related-resource summaries, pagination cursors)
   that the response shape needs to carry alongside the primary
   resource. Examples in current code:
     - /literature      → meta: { total, productName }
     - /pma-trial-metrics → meta: { study | null } */

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/* ─── HTTP error envelope ───────────────────────────────────────────
   Standard error shape:

     { error: string, details?: object }

   `error` is a human-readable message. `details` carries structured
   field-level errors (e.g. Zod's flatten().fieldErrors output) for
   422 responses. 500-class errors omit `details`. */

export interface ApiErrorEnvelope {
  error: string;
  details?: Record<string, unknown>;
  /* Human-readable sentence for the screen, when `error` carries a
     machine-readable CODE rather than prose. The client prefers `message` and
     refuses to display anything that looks like a code or an internal
     (client/src/lib/queryClient.ts extractApiError), so a 500 can name its
     failure to an operator without naming it to whoever holds the session. */
  message?: string;
  /* The request id, echoed as X-Request-Id, that the log line is keyed by.
     Quoting it is how an operator finds the real error the client never saw. */
  correlationId?: string;
}
