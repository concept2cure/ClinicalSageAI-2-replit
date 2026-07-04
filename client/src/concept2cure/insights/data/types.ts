/**
 * Client-side DTO mirror for the Report-OS Insights surface.
 *
 * These interfaces intentionally duplicate the shapes defined server-side in
 * `server/services/report-os/render/types.ts` (and related modules). The client
 * must NOT import server code, so the contract is re-declared here as the source
 * of truth for the Insights data layer. Keep these in sync with the server
 * render model when the report document shape changes.
 */

/** The scopes a report run can target. Mirrors `reportScopeEnum` server-side. */
export type ReportScope =
  | 'account'
  | 'program'
  | 'project'
  | 'study'
  | 'submission'
  | 'document';

/** Lifecycle status of a rendered report, post truthfulness gate. */
export type ReportRunStatus = 'draft' | 'partial' | 'final';

/**
 * A pointer back to the source data a rendered value was derived from.
 * Mirrors the server `ProvenanceRef`.
 */
export interface ProvenanceRef {
  sourceTable: string;
  sourceField?: string;
  recordId?: string | number;
  transformation?: string;
  confidence?: number;
  auditId?: string;
}

/** Result of the server-side truthfulness gate carried on a rendered report. */
export interface TruthfulnessEvaluation {
  allowedStatus: ReportRunStatus;
  downgradedFrom?: ReportRunStatus;
  reasons: string[];
}

/**
 * A single renderable block. Discriminated on `kind` — mirrors the server
 * `ReportBlock` union exactly.
 */
export type ReportBlock =
  | { kind: 'summary'; text: string }
  | { kind: 'narrative'; text: string; aiGenerated: true; disclosure: string }
  | {
      kind: 'metric';
      label: string;
      value: number | string | null;
      unit?: string;
      status?: 'ready' | 'partial' | 'missing';
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'table';
      columns: string[];
      rows: Array<Array<string | number | null>>;
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'chart';
      chartType:
        | 'readiness_ring'
        | 'bar'
        | 'trend'
        | 'stacked_bar'
        | 'forecast_band'
        | 'calibration';
      spec: Record<string, unknown>;
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'gap-list';
      items: Array<{
        title: string;
        severity?: 'critical' | 'high' | 'medium' | 'low';
        message?: string;
      }>;
    }
  | { kind: 'blocker-list'; items: string[] }
  | {
      kind: 'disclosure';
      method: string;
      confidence?: number;
      validated: boolean;
      note: string;
    };

/** An ordered group of blocks under a titled heading. */
export interface ReportSection {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

/** The full rendered report document returned by `/runs/:id/rendered`. */
export interface RenderedReport {
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  generatedAt: string;
  status: ReportRunStatus;
  sections: ReportSection[];
  truthfulness?: TruthfulnessEvaluation;
}

/**
 * A report type from the taxonomy registry (`/taxonomy`). The server row carries
 * additional dependency/governance fields; the Insights surface only needs the
 * presentational subset.
 */
export interface ReportTypeSummary {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: string[];
  allowedPersonas: string[];
  /** Client segments this type serves (empty = universal). Drives per-segment
   *  catalog anchoring; the server already filters, this is carried for UI. */
  allowedClientSegments?: string[];
  /** Entitlement verdict for the requesting org's tier (Phase 2). When
   *  `entitled` is false the catalog renders an honest Locked state instead
   *  of a Generate action. `requiredTier` names the tier that unlocks it. */
  entitled?: boolean;
  requiredTier?: string;
}

/**
 * A summarized report run row (`/runs`). The list endpoint enriches rows with a
 * `reportTypeLabel`; the core summary tracked here is sufficient for the surface.
 */
export interface ReportRunSummary {
  id: string;
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  status: string;
  confidence: number | null;
  blockers?: string[];
}

/** A program group (`/program-groups`) with its member projects. */
export interface ProgramGroupSummary {
  id: number;
  organizationId: number;
  name: string;
  description?: string | null;
  status: string;
  projects: Array<{
    projectId: number;
    projectName?: string | null;
    projectType?: string | null;
  }>;
}

/** A single dependency-provider record (`/runs/:id/dependencies`). */
export interface ReportRunDependency {
  id: number;
  runId: number;
  provider: string;
  status: string;
  blocker?: string | null;
  observedAt: string;
}

/** Input accepted by `createReportRun` / `POST /runs`. */
export interface CreateReportRunInput {
  organizationId: number;
  scopeType: ReportScope;
  scopeId: string;
  reportTypeId: string;
  clientWorkspaceId?: number;
  registryId?: string;
  submissionType?: string;
  requestedBy?: number;
}

/** Response payload from `POST /runs`. */
export interface CreateReportRunResult {
  run: ReportRunSummary & Record<string, unknown>;
  snapshot: Record<string, unknown>;
  blockers: string[];
  confidence: number | null;
}

/**
 * Request for a LIVE prediction run (`POST /api/insights/predictions/run`).
 * Discriminated on `kind`: the forecast reads from the readiness twin by scope;
 * the pre-mortem carries the submission-draft context the risk model needs.
 * The assembled report is ALWAYS `status:'partial'` with a disclosure block.
 */
export type RunPredictionInput =
  | {
      kind: 'regulatory_forecast';
      scopeType: ReportScope;
      scopeId: string;
      submissionType: string;
      agency?: string;
    }
  | {
      kind: 'crl_rtf_premortem';
      scopeType: ReportScope;
      scopeId: string;
      submissionType: string;
      targetAgency?: string;
      therapeuticArea?: string | null;
      projectId?: number;
      submissionId?: string;
      presentSections: string[];
      sectionScores?: Record<string, number>;
      harmonizeIssueCount?: number;
      openEscalations?: number;
    };

/** A scheduled-report subscription row (`GET /api/insights/subscriptions`). */
export interface ReportSubscriptionSummary {
  id: number;
  organizationId: number;
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  enabled: boolean;
  channel?: string;
  format?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
}

/** A report schedule (mirrors the server `reportScheduleSchema`). */
export interface ReportScheduleInput {
  cadence: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeZoneOffsetMinutes?: number;
}

/** Input accepted by `createSubscription` / `POST /api/insights/subscriptions`.
 *  The org is bound server-side from the JWT and is never sent in the body. */
export interface CreateSubscriptionInput {
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  schedule: ReportScheduleInput;
  clientWorkspaceId?: number | null;
  recipients?: string[];
  format?: 'pdf' | 'in_app';
  channel?: 'platform' | 'external';
  persona?: string | null;
  enabled?: boolean;
}

/** Prediction-calibration + provider-freshness summary (`GET /quality`, admin). */
export interface QualitySummary {
  organizationId: number;
  quality: Record<string, unknown>;
  freshness: Record<string, unknown>;
}

/** Query parameters accepted by `fetchRuns` / `GET /runs`. */
export interface FetchRunsParams {
  organizationId: number;
  scopeType?: string;
  scopeId?: string;
  status?: string;
  reportTypeId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'completedAt' | 'confidence' | 'status' | 'reportType' | 'scopeType';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}
