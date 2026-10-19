/**
 * Analytics surface data — portfolio metrics, cycle times, reviewer velocity,
 * blocker root-cause aggregation, AnA usage.
 *
 * Read-only, aggregated. Sources Claude Code wires to:
 *   • Programs       — useMdxPrograms
 *   • Cycle times    — derived from audit_logs phase transitions
 *   • Blockers       — c2c_project_blockers grouped by cause
 *   • Reviewer       — public FDA 510(k)/PMA decision dates by product code
 *   • AnA usage      — ai_request_log aggregated by day × tool
 */

/* ── 2026-10-14 ───────────────────────────────────────────────────────────────
   This file held the kit's example portfolio — KPIs with deltas, cycle times
   against a "peer cohort", named blocker causes with owners, FDA reviewer
   divisions with medians, AnA tool usage and a 24-month pace series
   (ANL_KPIS … ANL_PACE_24M) — rendered under sample mode. They are deleted with
   sample mode; GET /api/mdx/analytics serves the organization's own. The row
   types they used to be inferred from are declared here. */

export interface AnalyticsKpiRow {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: string;
  delta?: string;
}

interface CycleTime {
  org: number;
  peer: number;
  units: string;
}

export interface AnalyticsPhaseRow {
  phase: string;
  k510: CycleTime;
  pma: CycleTime;
}

export interface AnalyticsBlockerRow {
  cause: string;
  count: number;
  median: number;
  owner: string;
  pathway: string;
  trend: string;
}

export interface AnalyticsReviewerRow {
  code: string;
  name: string;
  n: number;
  median: number;
  fastest: number;
  slowest: number;
  firstCycle: number;
  orgMedian: number;
  pathway: string;
}

export interface AnalyticsUsageRow {
  tool: string;
  calls: number;
  accepted: number;
  drafts: number;
  pathway: string;
}
