/**
 * Query key factory for the Insights (Report-OS) surface.
 *
 * Mirrors the app-wide `concept2cure/hooks/queryKeys.ts` style: a frozen object
 * of `as const` tuples / tuple-returning functions under a stable namespace.
 * Keep these factories the single source for Insights cache keys so query
 * invalidation stays correct.
 *
 * Pattern: `['concept2cure', 'insights', domain, ...params]`
 */

import type { FetchRunsParams } from '../data/types';

export const insightsKeys = {
  all: ['concept2cure', 'insights'] as const,

  /** Report taxonomy (enabled report types). */
  reportTypes: () => ['concept2cure', 'insights', 'report-types'] as const,

  /** Allowed scope enum values. */
  scopes: () => ['concept2cure', 'insights', 'scopes'] as const,

  /** Report runs list, keyed by the filter params. */
  runs: (params?: FetchRunsParams) => ['concept2cure', 'insights', 'runs', params] as const,

  /** A single rendered report document. */
  rendered: (runId: number | string) =>
    ['concept2cure', 'insights', 'rendered', runId] as const,

  /** Dependency providers for a run. */
  dependencies: (runId: number | string) =>
    ['concept2cure', 'insights', 'dependencies', runId] as const,

  /** Program groups for an organization. */
  programGroups: (organizationId: number | string) =>
    ['concept2cure', 'insights', 'program-groups', organizationId] as const,
} as const;
