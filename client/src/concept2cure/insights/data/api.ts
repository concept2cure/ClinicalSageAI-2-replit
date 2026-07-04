/**
 * Typed API client for the Report-OS Insights surface.
 *
 * Every function uses the app's shared `apiRequest` helper (from
 * `@/lib/queryClient`), which attaches the Bearer JWT + `x-organization-id`
 * headers and throws on non-2xx. The Report-OS routes wrap their successful
 * payloads in a `{ data }` envelope; these functions unwrap it and return the
 * typed DTO. Presentational-data-only — no caching or React concerns here.
 */

import { apiRequest } from '@/lib/queryClient';
import type {
  CreateReportRunInput,
  CreateReportRunResult,
  FetchRunsParams,
  ProgramGroupSummary,
  RenderedReport,
  ReportRunDependency,
  ReportRunSummary,
  ReportTypeSummary,
  RunPredictionInput,
} from './types';

/** Base path the Report-OS router is mounted at (server/bootstrap). */
export const REPORT_OS_BASE = '/api/report-os';

/** Base path the Insights router is mounted at (predictions/quality/subs). */
export const INSIGHTS_BASE = '/api/insights';

/**
 * Build the query string for `GET /runs` from typed params. Pure and exported
 * so it can be unit-tested without mocking the network. Omits empty/undefined
 * values; `organizationId` is always emitted.
 */
export function buildRunsQuery(params: FetchRunsParams): string {
  const search = new URLSearchParams();
  search.set('organizationId', String(params.organizationId));
  if (params.scopeType) search.set('scopeType', params.scopeType);
  if (params.scopeId) search.set('scopeId', params.scopeId);
  if (params.status) search.set('status', params.status);
  if (params.reportTypeId) search.set('reportTypeId', params.reportTypeId);
  if (params.search) search.set('search', params.search);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  return search.toString();
}

/**
 * Read a `Response` from `apiRequest` and unwrap the `{ data }` envelope.
 * Falls back to the raw payload when the server does not wrap the value.
 */
async function unwrap<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}) as unknown);
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** GET /api/report-os/taxonomy — enabled report types. */
export async function fetchReportTypes(): Promise<ReportTypeSummary[]> {
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/taxonomy`);
  return unwrap<ReportTypeSummary[]>(response);
}

/** GET /api/report-os/scopes — the allowed scope enum values. */
export async function fetchScopes(): Promise<string[]> {
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/scopes`);
  return unwrap<string[]>(response);
}

/** POST /api/report-os/runs — generate a new report run. */
export async function createReportRun(
  input: CreateReportRunInput
): Promise<CreateReportRunResult> {
  const response = await apiRequest('POST', `${REPORT_OS_BASE}/runs`, input);
  return unwrap<CreateReportRunResult>(response);
}

/** GET /api/report-os/runs — list runs for the scope/filters. */
export async function fetchRuns(params: FetchRunsParams): Promise<ReportRunSummary[]> {
  const query = buildRunsQuery(params);
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/runs?${query}`);
  return unwrap<ReportRunSummary[]>(response);
}

/** GET /api/report-os/runs/:id/rendered — the rendered report document. */
export async function fetchRenderedReport(runId: string | number): Promise<RenderedReport> {
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/runs/${runId}/rendered`);
  return unwrap<RenderedReport>(response);
}

/** GET /api/report-os/runs/:id/dependencies — provider dependency records. */
export async function fetchRunDependencies(
  runId: string | number
): Promise<ReportRunDependency[]> {
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/runs/${runId}/dependencies`);
  return unwrap<ReportRunDependency[]>(response);
}

/**
 * GET /api/report-os/program-groups — program groups for the org.
 *
 * NOTE: the server binds the org from the JWT and ignores any
 * `?organizationId=` query param; it is accepted here for call-site clarity
 * and cache keying but is not relied upon server-side for scoping.
 */
export async function fetchProgramGroups(
  organizationId: number | string
): Promise<ProgramGroupSummary[]> {
  const query = new URLSearchParams({ organizationId: String(organizationId) }).toString();
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/program-groups?${query}`);
  return unwrap<ProgramGroupSummary[]>(response);
}

/**
 * GET /api/report-os/portfolio?programGroupId= — the enterprise board-pack
 * rollup for a program group (Phase 5). 403s below the enterprise tier; the
 * caller surfaces an honest Locked state.
 */
export async function fetchPortfolio(programGroupId: number | string): Promise<RenderedReport> {
  const query = new URLSearchParams({ programGroupId: String(programGroupId) }).toString();
  const response = await apiRequest('GET', `${REPORT_OS_BASE}/portfolio?${query}`);
  return unwrap<RenderedReport>(response);
}

/**
 * POST /api/insights/predictions/run — run a LIVE, entitlement-gated prediction
 * (readiness-twin forecast or CRL/RTF pre-mortem). The server does the model IO
 * and returns an advisory report that is ALWAYS `status:'partial'` and carries a
 * mandatory disclosure block. A 403 means the org's tier does not unlock the
 * prediction; a 422 means no readiness assessment exists yet (forecast only) —
 * `apiRequest` throws on both, so callers surface the honest state.
 */
export async function runPrediction(input: RunPredictionInput): Promise<RenderedReport> {
  const response = await apiRequest('POST', `${INSIGHTS_BASE}/predictions/run`, input);
  return unwrap<RenderedReport>(response);
}
