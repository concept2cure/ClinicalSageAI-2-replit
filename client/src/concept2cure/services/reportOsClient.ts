/**
 * @fileoverview Report OS client — typed access to the governed report engine.
 * @module concept2cure/services/reportOsClient
 *
 * The client half of Report OS GA (Slice 1, A1). Binds to server/routes/report-os.ts,
 * mounted at /api/report-os (server/bootstrap/register-inline-routes.ts):
 *   GET    /api/report-os/scopes                     scope enum
 *   GET    /api/report-os/taxonomy                   enabled report-type registry
 *   GET    /api/report-os/program-groups             saved program groupings (+projects)
 *   POST   /api/report-os/runs                        run a report → governed run+snapshot
 *   GET    /api/report-os/runs/:id/dependencies       per-provider dependency rows
 *   (export) GET /api/report-os/runs/:id/export.pdf   sealed PDF — use exportRunPdfUrl()
 *
 * All JSON responses use the canonical { data } envelope. Org id + auth are
 * attached by apiRequest; we never send organizationId on read paths (the server
 * resolves it from the JWT to prevent cross-tenant enumeration).
 *
 * This module is intentionally thin and pure: it shapes requests/responses and
 * does NOT fabricate values. Surfaces consume these results and must show the
 * server-computed blockers/confidence/freshness honestly (no sample-as-live).
 */

import { apiRequest } from '../../lib/queryClient';

export type ReportScope =
  | 'account'
  | 'program'
  | 'project'
  | 'study'
  | 'submission'
  | 'document';

export interface ReportType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: ReportScope[];
  allowedPersonas?: string[];
  allowedClientSegments?: string[];
  enabled?: boolean;
}

export interface ProgramGroupProject {
  groupId: number;
  projectId: number;
  projectName?: string;
  projectType?: string;
}

export interface ProgramGroup {
  id: number;
  organizationId: number;
  name: string;
  description?: string | null;
  status: 'active' | 'archived';
  projects: ProgramGroupProject[];
}

export interface ReportRunProvider {
  provider: string;
  status: 'ready' | 'partial' | 'missing' | string;
  observedAt: string;
  blocker?: string;
}

export interface ReportRun {
  id: number;
  scopeType: ReportScope;
  scopeId: string;
  reportTypeId: string;
  status: 'completed' | 'partial' | string;
  blockers: string[];
  confidence: number;
  freshness?: { generatedAt: string; freshnessBudgetMs?: number };
  dependencySummary?: {
    providers?: ReportRunProvider[];
    scopeLineage?: unknown;
    summary?: Record<string, unknown>;
  };
}

export interface ReportRunResult {
  run: ReportRun;
  snapshot: { id: number; runId: number; snapshotVersion: number; isLatest: boolean };
  blockers: string[];
  confidence: number;
}

export interface RunReportInput {
  organizationId: number;
  clientWorkspaceId?: number | null;
  scopeType: ReportScope;
  scopeId: string;
  reportTypeId: string;
  registryId?: number;
  submissionType?: string;
  requestedBy: number;
}

export interface RunDependencyRow {
  id: number;
  runId: number;
  provider: string;
  status: string;
  blocker?: string | null;
  observedAt: string;
}

const BASE = '/api/report-os';

/** Unwrap the canonical `{ data }` envelope, defaulting to `fallback`. */
async function readData<T>(res: Response, fallback: T): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { data?: T };
  return (json?.data ?? fallback) as T;
}

/** The valid report scopes (account → document). */
export async function listScopes(): Promise<ReportScope[]> {
  const res = await apiRequest('GET', `${BASE}/scopes`);
  return readData<ReportScope[]>(res, []);
}

/** Enabled report types from the governed taxonomy registry. */
export async function listReportTypes(): Promise<ReportType[]> {
  const res = await apiRequest('GET', `${BASE}/taxonomy`);
  return readData<ReportType[]>(res, []);
}

/** Saved program groupings (with their member projects). */
export async function listProgramGroups(includeArchived = false): Promise<ProgramGroup[]> {
  const qs = includeArchived ? '?includeArchived=true' : '';
  const res = await apiRequest('GET', `${BASE}/program-groups${qs}`);
  return readData<ProgramGroup[]>(res, []);
}

/** Run a report for a scope + type. Returns the governed run + snapshot. */
export async function runReport(input: RunReportInput): Promise<ReportRunResult> {
  const res = await apiRequest('POST', `${BASE}/runs`, input);
  return readData<ReportRunResult>(res, {
    run: {
      id: 0,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      reportTypeId: input.reportTypeId,
      status: 'partial',
      blockers: [],
      confidence: 0,
    },
    snapshot: { id: 0, runId: 0, snapshotVersion: 0, isLatest: false },
    blockers: [],
    confidence: 0,
  });
}

/** Per-provider dependency rows for a completed run. */
export async function getRunDependencies(runId: number): Promise<RunDependencyRow[]> {
  const res = await apiRequest('GET', `${BASE}/runs/${runId}/dependencies`);
  return readData<RunDependencyRow[]>(res, []);
}

/** URL for the sealed PDF export of a run (open/download directly). */
export function exportRunPdfUrl(runId: number): string {
  return `${BASE}/runs/${runId}/export.pdf`;
}

export default {
  listScopes,
  listReportTypes,
  listProgramGroups,
  runReport,
  getRunDependencies,
  exportRunPdfUrl,
};
