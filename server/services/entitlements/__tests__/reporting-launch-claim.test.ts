/**
 * Reporting & analytics claims, in production, the routes its screens call and
 * nothing else (reporting review 2026-10-01, IAM-21 / DP-64).
 *
 * The `insights` surface claimed all of /api/report-os and /api/insights, so the
 * day it joined the launch catalog every route under them became reachable in
 * production: program groups, bundles, deliveries, subscriptions, the platform
 * counts and the live prediction run, none of which a launch screen calls.
 * ci:launch-scope-api proves the called paths are not refused; this proves the
 * uncalled ones are, against the real registry and the real prefix map.
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);

/** Every reporting path a launch screen calls: Insights.tsx, and since
 *  0ce0d0bb8 (2026-10-11, "Give the reporting library its screens") the
 *  library's own screens — insightsLibraryModel.ts and
 *  InsightsSchedulesPanel.tsx. (AnaCommand.tsx and Orchestration.tsx, which
 *  read the portfolio rollup, are locked since 2026-10-08;
 *  docs/SURFACE_DECISIONS_2026-10-08.md.) */
const CALLED = [
  '/api/insights-canvas/overview',
  '/api/report-os/runs',
  '/api/report-os/runs/41/rendered',
  '/api/report-os/runs/41/finalize',
  '/api/report-os/runs/41/export.pdf',
  // The reporting library's screens, each with the call site that reaches it:
  '/api/insights/subscriptions', //        InsightsSchedulesPanel.tsx:294 (GET), insightsLibraryModel.ts (POST)
  '/api/insights/subscriptions/3', //      insightsLibraryModel.ts:562 (PATCH enabled)
  '/api/report-os/bundles', //             insightsLibraryModel.ts:579 (POST), and the catalog's listing
  '/api/report-os/bundles/b-1/export.pdf', // Insights.tsx:1155
];

/** Routes the reporting routers mount that no launch screen calls. */
const UNCALLED = [
  '/api/insights/predictions/run',
  '/api/insights/predictions',
  '/api/insights/quality',
  '/api/report-os/deliveries',
  '/api/report-os/program-groups',
  '/api/report-os/program-groups/2/snapshots',
  '/api/report-os/health',
  '/api/report-os/taxonomy',
  '/api/report-os/scopes',
  '/api/report-os/portfolio/org',
];

describe('the Reporting & analytics launch claim', () => {
  it.each(CALLED)('%s, called by a launch screen, is in launch scope', (path) => {
    expect(verdict(path)).toBe('launch');
  });

  it.each(UNCALLED)('%s, called by no launch screen, is not', (path) => {
    expect(verdict(path)).not.toBe('launch');
  });
});
