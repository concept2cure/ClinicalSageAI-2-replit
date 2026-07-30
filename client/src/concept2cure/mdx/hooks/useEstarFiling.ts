/**
 * useEstarFiling — live data + mutation hooks for the eSTAR filing journey,
 * consuming server/routes/510k-estar-routes.ts. Read hooks mirror the read-only
 * useFetchJson pattern (useEstarReadiness); mutators use the raw-fetch pattern
 * (usePrecedent/useSectionSave) and refresh() their read hook on success.
 *
 *   useEstarRegistration()  GET /registration      + save()   PUT /registration
 *   useEstarSubmissions()   GET /submissions       + startTracking() POST /submissions
 *                                                  + advance()  PATCH /submissions/:id
 *   useEstarCatalog()       GET /catalog
 *   assessFilingReadiness() POST /filing-readiness  (on-demand verdict)
 *
 * The head (register) and tail (produce/track) of the journey become clickable,
 * not just readable.
 */

import { useCallback } from 'react';
import { useFetchJson } from './useFetchJson';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/* ─── Registration ──────────────────────────────────────────────────── */

/** The four FDA eSTAR prerequisites, in display order. Mirrors the server's
    EstarRegistrationRequirement union + labels. */
export const ESTAR_PREREQUISITES = [
  { id: 'fda_esg_account', label: 'FDA ESG account', field: 'fdaEsgAccount' },
  { id: 'cdrh_portal_account', label: 'CDRH Portal account', field: 'cdrhPortalAccount' },
  { id: 'organization_identity', label: 'Org identity (DUNS/FEI)', field: 'organizationIdentity' },
  { id: 'mdufa_fee_account', label: 'MDUFA fee account', field: 'mdufaFeeAccount' },
] as const;

export type EstarPrerequisiteId = (typeof ESTAR_PREREQUISITES)[number]['id'];
/** camelCase boolean fields the PUT /registration body accepts. */
export type EstarRegistrationPatch = Partial<Record<(typeof ESTAR_PREREQUISITES)[number]['field'], boolean>>;

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

/**
 * Pure: build a PUT /registration patch that toggles one prerequisite while
 * preserving the rest from the current satisfied[]. Unit-testable.
 */
export function registrationPatchToggling(
  satisfied: readonly string[] | null | undefined,
  toggleId: EstarPrerequisiteId,
): EstarRegistrationPatch {
  const set = new Set(satisfied ?? []);
  const patch: EstarRegistrationPatch = {};
  for (const p of ESTAR_PREREQUISITES) {
    patch[p.field] = p.id === toggleId ? !set.has(p.id) : set.has(p.id);
  }
  return patch;
}

export interface UseEstarRegistrationResult {
  registration: EstarRegistrationView | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** PUT /registration — persist the prerequisite booleans; refreshes on success. */
  save: (patch: EstarRegistrationPatch) => Promise<EstarRegistrationView | null>;
}

export function useEstarRegistration(): UseEstarRegistrationResult {
  const { data, loading, error, refresh } = useFetchJson<EstarRegistrationView>('/api/510k/estar/registration');
  const save = useCallback(
    async (patch: EstarRegistrationPatch) => {
      try {
        const res = await fetch('/api/510k/estar/registration', {
          method: 'PUT',
          credentials: 'include',
          headers: JSON_HEADERS,
          body: JSON.stringify(patch),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as EstarRegistrationView;
        refresh();
        return j;
      } catch {
        return null;
      }
    },
    [refresh],
  );
  return { registration: data ?? null, loading, error, refresh, save };
}

/* ─── Catalog ───────────────────────────────────────────────────────── */

export interface EstarCatalogEntryView {
  key: string;
  label: string;
  programType: string;
  center: string;
  regulatoryRef: string;
  reviewGoalDays?: number;
}

export interface UseEstarCatalogResult {
  catalog: EstarCatalogEntryView[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEstarCatalog(): UseEstarCatalogResult {
  const { data, loading, error, refresh } = useFetchJson<{ catalog: EstarCatalogEntryView[] }>(
    '/api/510k/estar/catalog',
  );
  return { catalog: data?.catalog ?? null, loading, error, refresh };
}

/* ─── Filing-readiness (on-demand POST) ─────────────────────────────── */

export interface FilingReadinessResult {
  catalogKey: string;
  label: string;
  programType: string;
  variant: string;
  eligible: boolean;
  registrationMissing: string[];
  contentReady: boolean;
  missingSections: string[];
  completeness: number;
  templateAvailable: boolean;
  fieldMapPopulated: boolean;
  officialTemplateProducible: boolean;
  canFileNow: boolean;
  blockers: string[];
  currentVersion: string | null;
  ombNumbers: string[];
}

export interface AssessFilingReadinessBody {
  catalogKey: string;
  variant?: 'device' | 'ivd';
  /** Load the org's authored device content (cerv2_510k_sections) as leaves. */
  useProjectContent?: boolean;
  documentId?: number;
  qSubType?: string;
}

/** POST /filing-readiness — one verdict (registered? complete? producible?). */
export async function assessFilingReadiness(
  body: AssessFilingReadinessBody,
): Promise<FilingReadinessResult | null> {
  try {
    const res = await fetch('/api/510k/estar/filing-readiness', {
      method: 'POST',
      credentials: 'include',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as FilingReadinessResult;
  } catch {
    return null;
  }
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
  /** POST /submissions — start tracking a filing from a catalog key. */
  startTracking: (input: {
    catalogKey: string;
    variant?: 'device' | 'ivd';
    title?: string;
  }) => Promise<EstarSubmissionView | null>;
  /** PATCH /submissions/:id — advance the lifecycle. */
  advance: (
    id: string,
    status: string,
    extra?: { fdaTrackingNumber?: string; decision?: string },
  ) => Promise<EstarSubmissionView | null>;
}

export function useEstarSubmissions(status?: string): UseEstarSubmissionsResult {
  const url = status
    ? `/api/510k/estar/submissions?status=${encodeURIComponent(status)}`
    : '/api/510k/estar/submissions';
  const { data, loading, error, refresh } = useFetchJson<{ submissions: EstarSubmissionView[] }>(url);

  const startTracking = useCallback(
    async (input: { catalogKey: string; variant?: 'device' | 'ivd'; title?: string }) => {
      try {
        const res = await fetch('/api/510k/estar/submissions', {
          method: 'POST',
          credentials: 'include',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as EstarSubmissionView;
        refresh();
        return j;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  const advance = useCallback(
    async (id: string, nextStatus: string, extra?: { fdaTrackingNumber?: string; decision?: string }) => {
      try {
        const res = await fetch(`/api/510k/estar/submissions/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: nextStatus, ...extra }),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as EstarSubmissionView;
        refresh();
        return j;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  return { submissions: data?.submissions ?? null, loading, error, refresh, startTracking, advance };
}
