/**
 * useStudyArchetypes — live adapter for the context-adaptive study-design
 * zone of the Clinical studies surface (MDX-STUDY-02).
 *
 * Two sources compose the zone:
 *
 *   - `GET /api/mdx/effective-context?programId=` resolves the project's
 *     (or, without a program, the organization's) specialization —
 *     medical_device, ivd_diagnostics, samd, companion_diagnostic,
 *     combination_product, or both.
 *   - `GET /api/mdx/study-archetypes?specialization=` serves the versioned
 *     archetype registry (shared/regulatory/study-archetypes.ts), filtered
 *     to that specialization.
 *
 * The sequencing rule lives in `archetypeQueryForContext`, kept pure so it
 * is unit-testable: hold the archetype fetch until the context resolves,
 * then narrow to the resolved specialization. A tenant with no
 * specialization on file — and a context resolve that errors — both fall
 * back to the full registry, because the registry is static regulatory
 * reference content, not tenant data, and hiding it behind a tenant-context
 * failure would help no one.
 *
 * Both sources return `DataState`, so the surface renders them through
 * `DataGate` and must say which of idle / loading / error / empty / ready
 * it is showing.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

/* ─── Client-side registry types (mirror of the server registry) ──── */

/** Specializations an archetype can apply to (server: StudySpecialization). */
export type ArchetypeSpecialization =
  | 'medical_device'
  | 'ivd_diagnostics'
  | 'samd'
  | 'companion_diagnostic'
  | 'combination_product'
  | 'both';

export type ArchetypeDomain = 'device' | 'ivd';

/**
 * One study archetype as served by /api/mdx/study-archetypes. Client-side
 * mirror of `StudyArchetype` in shared/regulatory/study-archetypes.ts —
 * type-only, no registry content is duplicated here.
 */
export interface Archetype {
  id: string;
  label: string;
  domain: ArchetypeDomain;
  applicability: ArchetypeSpecialization[];
  requiredSections: string[];
  designQuestions: string[];
  endpoints: string[];
  typicalAcceptanceCriteria: string[];
  statisticalMethods: string[];
  supportingPlans: string[];
  filingMappings: string[];
  approvalRequirements: string[];
}

export const SPECIALIZATION_LABEL: Record<ArchetypeSpecialization, string> = {
  medical_device: 'Medical device',
  ivd_diagnostics: 'IVD / diagnostics',
  samd: 'Software as a Medical Device',
  companion_diagnostic: 'Companion diagnostic',
  combination_product: 'Combination product',
  both: 'Device + IVD',
};

/* ─── Effective specialization (tenant context) ───────────────────── */

/** The slice of the effective-context payload this zone consumes. */
export interface EffectiveSpecialization {
  specialization: ArchetypeSpecialization | null;
  /** Where the value came from: project profile, org profile, or license default. */
  source: 'project' | 'organization' | 'license_default' | null;
}

interface EffectiveContextPayload {
  data: {
    specialization?: ArchetypeSpecialization | null;
    source?: 'project' | 'organization' | 'license_default';
    [k: string]: unknown;
  };
}

/** The route 422s on a non-UUID programId, so gate what we forward. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseEffectiveSpecializationResult {
  context: DataState<EffectiveSpecialization>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Resolve the effective specialization for a program, or for the
 * organization when no program (or a non-UUID kit program id) is in
 * scope — the Clinical studies surface is org-scoped by default.
 */
export function useEffectiveSpecialization(
  programId?: string | null,
): UseEffectiveSpecializationResult {
  const url =
    programId && UUID_RE.test(programId)
      ? `/api/mdx/effective-context?programId=${encodeURIComponent(programId)}`
      : '/api/mdx/effective-context';
  const { data, loading, error, refresh } =
    useFetchJson<EffectiveContextPayload>(url);

  const slice: EffectiveSpecialization | null = data?.data
    ? {
        specialization: data.data.specialization ?? null,
        source: data.data.source ?? null,
      }
    : null;

  return {
    context: toDataState(slice, loading, error),
    loading,
    error,
    refresh,
  };
}

/* ─── Archetype list ──────────────────────────────────────────────── */

/**
 * What to ask the registry for:
 *   - a specialization → the archetypes applicable to it
 *   - 'all'            → the full registry (no specialization on file)
 *   - null             → do not fetch yet (context still resolving)
 */
export type ArchetypeQuery = ArchetypeSpecialization | 'all' | null;

/**
 * Derive the archetype query from the effective-context state. Pure and
 * exported for unit tests — this is the sequencing rule for the zone.
 *
 *   ready with a specialization → filter to it
 *   ready with none on file     → full registry
 *   error                       → full registry (static reference content
 *                                 must not be hidden by a tenant-context
 *                                 failure; the surface captions the state)
 *   idle / loading              → hold the fetch
 */
export function archetypeQueryForContext(
  context: DataState<EffectiveSpecialization>,
): ArchetypeQuery {
  switch (context.status) {
    case 'ready':
      return context.data.specialization ?? 'all';
    case 'error':
      return 'all';
    default:
      return null;
  }
}

/**
 * Group archetypes by domain for display — device studies first, IVD
 * performance studies second, each preserving registry order. Pure and
 * exported for unit tests.
 */
export function groupArchetypesByDomain(rows: Archetype[]): {
  device: Archetype[];
  ivd: Archetype[];
} {
  const device: Archetype[] = [];
  const ivd: Archetype[] = [];
  for (const a of rows) (a.domain === 'ivd' ? ivd : device).push(a);
  return { device, ivd };
}

interface ArchetypesPayload {
  data: Archetype[];
  meta?: {
    registryVersion?: string;
    count?: number;
    specialization?: ArchetypeSpecialization | null;
  };
}

export interface UseStudyArchetypesResult {
  archetypes: DataState<Archetype[]>;
  /** Registry semver from the response meta, for provenance display. */
  registryVersion: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch the study archetypes for a query (see {@link ArchetypeQuery}).
 * Pass the output of `archetypeQueryForContext` so the list is narrowed
 * to the project's specialization once the context has resolved; `null`
 * issues no request and the state is `idle`.
 */
export function useStudyArchetypes(query: ArchetypeQuery): UseStudyArchetypesResult {
  const url =
    query === null
      ? null
      : query === 'all'
        ? '/api/mdx/study-archetypes'
        : `/api/mdx/study-archetypes?specialization=${encodeURIComponent(query)}`;
  const { data, loading, error, refresh } = useFetchJson<ArchetypesPayload>(url);

  return {
    archetypes: toDataState(data?.data ?? null, loading, error, {
      idleReason: 'Resolving the project context to select applicable study designs…',
    }),
    registryVersion: data?.meta?.registryVersion ?? null,
    loading,
    error,
    refresh,
  };
}
