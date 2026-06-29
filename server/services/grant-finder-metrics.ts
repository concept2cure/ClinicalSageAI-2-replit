/**
 * Intelligent grant finder metrics (Capability C2C-14) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/grant-finder-metrics
 */

interface FinderMetricsState {
  profilesUpserted: number;
  discoveriesRun: number;
  opportunitiesScored: number;
  strongMatches: number; // fit score >= 70
}

const state: FinderMetricsState = { profilesUpserted: 0, discoveriesRun: 0, opportunitiesScored: 0, strongMatches: 0 };

export function recordFundingProfileUpserted(): void { state.profilesUpserted += 1; }
export function recordOpportunityDiscovery(scored: number, strong: number): void {
  state.discoveriesRun += 1;
  state.opportunitiesScored += scored;
  state.strongMatches += strong;
}

export function renderGrantFinderMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP grant_finder_profiles_upserted_total Funding profiles created/updated');
  lines.push('# TYPE grant_finder_profiles_upserted_total counter');
  lines.push(`grant_finder_profiles_upserted_total ${state.profilesUpserted}`);
  lines.push('# HELP grant_finder_discoveries_total Intelligent opportunity discovery runs');
  lines.push('# TYPE grant_finder_discoveries_total counter');
  lines.push(`grant_finder_discoveries_total ${state.discoveriesRun}`);
  lines.push('# HELP grant_finder_opportunities_scored_total Opportunities scored across all discoveries');
  lines.push('# TYPE grant_finder_opportunities_scored_total counter');
  lines.push(`grant_finder_opportunities_scored_total ${state.opportunitiesScored}`);
  lines.push('# HELP grant_finder_strong_matches_total Opportunities scored as a strong fit (>= 70)');
  lines.push('# TYPE grant_finder_strong_matches_total counter');
  lines.push(`grant_finder_strong_matches_total ${state.strongMatches}`);
  return lines;
}

export function snapshotGrantFinderMetrics(): FinderMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetGrantFinderMetrics(): void {
  state.profilesUpserted = 0;
  state.discoveriesRun = 0;
  state.opportunitiesScored = 0;
  state.strongMatches = 0;
}
