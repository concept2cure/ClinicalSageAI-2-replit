/**
 * useEstarFiling — live data hooks for the eSTAR filing journey, consuming the
 * backend endpoints landed in server/routes/510k-estar-routes.ts:
 *
 *   useEstarRegistration() — GET /api/510k/estar/registration
 *       the org's persisted eSTAR registration (the four FDA prerequisites) —
 *       the head of the journey ("clients must register").
 *
 *   useEstarSubmissions(status?) — GET /api/510k/estar/submissions
 *       the org's tracked filings with lifecycle status + FDA review clock —
 *       the tail of the journey.
 *
 * Both mirror the read-only useFetchJson pattern (useEstarReadiness in useK510):
 * cancellable, refreshable, degrade to null + error string on non-OK responses.
 */

import { useFetchJson } from './useFetchJson';

/* ─── Registration ──────────────────────────────────────────────────── */

/** The four FDA eSTAR prerequisites, in display order. Mirrors the server's
    EstarRegistrationRequirement union + labels. */
export const ESTAR_PREREQUISITES = [
  { id: 'fda_esg_account', label: 'FDA ESG account' },
  { id: 'cdrh_portal_account', label: 'CDRH Portal account' },
  { id: 'organization_identity', label: 'Org identity (DUNS/FEI)' },
  { id: 'mdufa_fee_account', label: 'MDUFA fee account' },
] as const;

export type EstarPrerequisiteId = (typeof ESTAR_PREREQUISITES)[number]['id'];

export interface EstarRegistrationView {
  registered: boolean;
  registration: Record<string, unknown> | null;
  clientRegistration: { clientId: string; satisfied: EstarPrerequisiteId[]; variants?: Array<'device' | 'ivd'> };
}

export interface PrerequisiteRow {
  id: EstarPrerequisiteId;
  label: string;
  satisfied: boolean;
}

/**
 * Pure: project a registration's satisfied[] onto the four prerequisite rows.
 * Extracted so it can be unit-tested without a DOM/fetch.
 */
export function prerequisiteRows(satisfied: readonly string[] | null | undefined): PrerequisiteRow[] {
  const set = new Set(satisfied ?? []);
  return ESTAR_PREREQUISITES.map((p) => ({ id: p.id, label: p.label, satisfied: set.has(p.id) }));
}

export interface UseEstarRegistrationResult {
  registration: EstarRegistrationView | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEstarRegistration(): UseEstarRegistrationResult {
  const { data, loading, error, refresh } = useFetchJson<EstarRegistrationView>('/api/510k/estar/registration');
  return { registration: data ?? null, loading, error, refresh };
}

/* ─── Tracked submissions ───────────────────────────────────────────── */

export interface EstarSubmissionView {
  id: string;
  catalogKey: string;
  programType: string;
  variant: string;
  title: string | null;
  status: string;
  decision: string | null;
  fdaTrackingNumber: string | null;
  filedAt: string | null;
  reviewGoalDays: number | null;
  decisionDueAt: string | null;
}

export interface UseEstarSubmissionsResult {
  submissions: EstarSubmissionView[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEstarSubmissions(status?: string): UseEstarSubmissionsResult {
  const url = status
    ? `/api/510k/estar/submissions?status=${encodeURIComponent(status)}`
    : '/api/510k/estar/submissions';
  const { data, loading, error, refresh } = useFetchJson<{ submissions: EstarSubmissionView[] }>(url);
  return { submissions: data?.submissions ?? null, loading, error, refresh };
}
