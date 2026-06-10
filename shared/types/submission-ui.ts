/**
 * Submission Center — UI scaffolding data (framework-agnostic)
 *
 * Pure data the UI uses to build navigation, route, and handle errors
 * consistently. No React, no styling — just the workspace map and the error
 * catalog. Components stay in the UI layer; this is the contract they read.
 */

// ── Error catalog ─────────────────────────────────────────────────────────────
// Every `error.code` an /api/submissions or /api/ectd-documents endpoint can
// return, with a calm, sentence-case default message (the UI may override).
export const SUBMISSION_ERROR_CODES = {
  AUTH_REQUIRED: 'You need to sign in to do this.',
  BAD_REQUEST: 'That request was malformed.',
  VALIDATION: 'Some fields need attention.',
  NOT_FOUND: 'That item was not found.',
  INVALID_STATE: 'That action is not allowed in the current state.',
  RATE_LIMITED: 'Too many requests. Try again in a moment.',
  PROVIDER_UNAVAILABLE: 'The AI service is temporarily unavailable.',
  INVALID_AI_RESPONSE: 'The AI returned an unexpected result. Try again.',
  TOKEN_LIMIT_EXCEEDED: 'The document is too large for a single request.',
  INTERNAL: 'Something went wrong on our end.',
} as const;

export type SubmissionErrorCode = keyof typeof SUBMISSION_ERROR_CODES;

/** Resolve a server error code to a display message (falls back to INTERNAL). */
export function submissionErrorMessage(code: string | undefined): string {
  return (code && SUBMISSION_ERROR_CODES[code as SubmissionErrorCode]) || SUBMISSION_ERROR_CODES.INTERNAL;
}

// ── Workspace map ─────────────────────────────────────────────────────────────
// The seven workspaces (spec §4) as data: route pattern, the primary endpoints
// each consumes, and the AnA tools surfaced there. The UI scaffolds nav + routing
// from this; it does not hard-code the list.
export interface WorkspaceDef {
  id: string;
  label: string;
  routePattern: string; // wouter/react-router style
  endpoints: string[]; // primary endpoints (see SUBMISSION_CENTER_API.md)
  anaTools: string[];
}

export const SUBMISSION_WORKSPACES: WorkspaceDef[] = [
  {
    id: 'portfolio',
    label: 'Submissions',
    routePattern: '/submissions',
    endpoints: ['GET /api/submissions', 'POST /api/submissions'],
    anaTools: ['plan_submission'],
  },
  {
    id: 'planner',
    label: 'Planner',
    routePattern: '/submissions/:id/plan',
    endpoints: ['POST /api/submissions/:id/plan', 'GET /api/region-profiles'],
    anaTools: ['plan_submission'],
  },
  {
    id: 'builder',
    label: 'Builder',
    routePattern: '/submissions/:id/builder',
    endpoints: [
      'GET /api/submissions/sequences/:seqId/leaves',
      'PUT /api/submissions/sequences/:seqId/leaves',
      'POST /api/ectd-documents/:id/classify',
      'POST /api/ectd-documents/:id/extract',
      'GET /api/submissions/:id/provenance',
    ],
    anaTools: ['classify_submission_document', 'extract_submission_document', 'compute_lifecycle_operations', 'check_ectd_cross_references', 'generate_stf', 'trace_provenance'],
  },
  {
    id: 'sequences',
    label: 'Sequences',
    routePattern: '/submissions/:id/sequences',
    endpoints: ['GET /api/submissions/:id/sequences', 'POST /api/submissions/:id/sequences', 'POST /api/submissions/sequences/:seqId/transition'],
    anaTools: ['compute_lifecycle_operations'],
  },
  {
    id: 'validation',
    label: 'Validation',
    routePattern: '/submissions/:id/validation',
    endpoints: ['POST /api/submissions/:id/validation/explain'],
    anaTools: ['validate_ectd_package', 'explain_validation_findings'],
  },
  {
    id: 'shadow-review',
    label: 'Shadow review',
    routePattern: '/submissions/:id/shadow-review',
    endpoints: [
      'POST /api/submissions/sequences/:seqId/shadow-review',
      'GET /api/submissions/sequences/:seqId/shadow-review',
      'GET /api/submissions/shadow-review/:runId/findings',
    ],
    anaTools: ['run_shadow_review'],
  },
  {
    id: 'cross-region',
    label: 'Cross-region',
    routePattern: '/submissions/:id/cross-region',
    endpoints: ['POST /api/submissions/:id/cross-region', 'GET /api/region-profiles'],
    anaTools: ['cross_region_gap_analysis'],
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    routePattern: '/submissions/:id/dispatch',
    endpoints: ['POST /api/submissions/:id/dispatch-qc'],
    anaTools: ['dispatch_qc_check'],
  },
];
