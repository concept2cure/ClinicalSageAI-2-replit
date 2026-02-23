/**
 * IVDR Evidence Binder + Pack Builder — Client API Service
 *
 * Wraps all /api/ivdr/binder/* and /api/ivdr/packs/* endpoints using
 * the centralized apiRequest() helper to ensure auth headers,
 * org context, and standard error handling.
 *
 * Types are imported from shared/ivdr/manifest.ts.
 *
 * @module services/ivdrBinderApi
 * @version 1.0.0
 */

import { apiRequest } from '@/lib/queryClient';
import type {
  BinderListResponse,
  CreateClaimRequest,
  AttachEvidenceRequest,
  ApproveClaimRequest,
  RevokeClaimRequest,
  RemoveEvidenceRequest,
  PackReadinessResponse,
  BuildPackRequest,
  PackListItem,
  PackDetailResponse,
  JobStatusResponse,
} from '../../../shared/ivdr/manifest';

const BASE = '/api/ivdr';

// ── Helper: parse JSON from Response ─────────────────────────────────────────

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE BINDER — Claims + Evidence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List all binder claims + evidence for a project.
 * @param projectId – IVDR project identifier (query param)
 */
export async function fetchBinderClaims(projectId: string): Promise<BinderListResponse> {
  const res = await apiRequest('GET', `${BASE}/binder?projectId=${encodeURIComponent(projectId)}`);
  return json<BinderListResponse>(res);
}

/**
 * Create or upsert a binder claim.
 */
export async function upsertClaim(body: CreateClaimRequest): Promise<{ claimId: string }> {
  const res = await apiRequest('POST', `${BASE}/binder/claim`, body);
  return json<{ claimId: string }>(res);
}

/**
 * Attach evidence (vault file reference) to a claim.
 */
export async function attachEvidence(
  claimId: string,
  body: AttachEvidenceRequest
): Promise<{ evidenceId: string }> {
  const res = await apiRequest('POST', `${BASE}/binder/claim/${claimId}/evidence`, body);
  return json<{ evidenceId: string }>(res);
}

/**
 * Soft-remove evidence from a claim.
 */
export async function removeEvidence(
  evidenceId: string,
  body: RemoveEvidenceRequest
): Promise<{ ok: boolean }> {
  const res = await apiRequest('POST', `${BASE}/binder/evidence/${evidenceId}/remove`, body);
  return json<{ ok: boolean }>(res);
}

/**
 * Approve a binder claim (requires ivdr:approve).
 */
export async function approveClaim(
  claimId: string,
  body: ApproveClaimRequest
): Promise<{ ok: boolean; status: string; approvedAt: string }> {
  const res = await apiRequest('POST', `${BASE}/binder/claim/${claimId}/approve`, body);
  return json<{ ok: boolean; status: string; approvedAt: string }>(res);
}

/**
 * Revoke a previously approved claim (returns to IN_REVIEW).
 */
export async function revokeClaim(
  claimId: string,
  body: RevokeClaimRequest
): Promise<{ ok: boolean; status: string }> {
  const res = await apiRequest('POST', `${BASE}/binder/claim/${claimId}/revoke`, body);
  return json<{ ok: boolean; status: string }>(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACK BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check readiness to build a pack.
 */
export async function fetchPackReadiness(
  projectId: string,
  packType: string
): Promise<PackReadinessResponse> {
  const res = await apiRequest(
    'GET',
    `${BASE}/packs/readiness?projectId=${encodeURIComponent(projectId)}&packType=${encodeURIComponent(packType)}`
  );
  return json<PackReadinessResponse>(res);
}

/**
 * Queue a new pack build job.
 */
export async function buildPack(
  body: BuildPackRequest
): Promise<{ jobId: string; status: string }> {
  const res = await apiRequest('POST', `${BASE}/packs/build`, body);
  return json<{ jobId: string; status: string }>(res);
}

/**
 * Poll a build job's status.
 */
export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await apiRequest('GET', `${BASE}/packs/build/jobs/${jobId}`);
  return json<JobStatusResponse>(res);
}

/**
 * List all completed packs for a project.
 */
export async function fetchPacks(projectId: string): Promise<{ packs: PackListItem[] }> {
  const res = await apiRequest('GET', `${BASE}/packs?projectId=${encodeURIComponent(projectId)}`);
  return json<{ packs: PackListItem[] }>(res);
}

/**
 * Get full pack details including snapshot.
 */
export async function fetchPackDetail(packId: string): Promise<PackDetailResponse> {
  const res = await apiRequest('GET', `${BASE}/packs/${packId}`);
  return json<PackDetailResponse>(res);
}

/**
 * Download pack manifest JSON.
 */
export async function downloadPackManifest(
  packId: string,
  format: 'manifest' | 'zip' = 'manifest'
): Promise<Record<string, unknown>> {
  const res = await apiRequest('GET', `${BASE}/packs/${packId}/download?format=${format}`);
  return json<Record<string, unknown>>(res);
}
