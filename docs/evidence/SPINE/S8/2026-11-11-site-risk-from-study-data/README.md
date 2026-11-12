# Risk-based monitoring: a study's sites are scored from its own site-level indicators (2026-11-11)

Launch row D2. Plan package S8 ("risk-based monitoring … runs over the project's study data"), done under R1
(reach) because the fix reaches data the product already stored and never used. GA ledger items **GA-S8-01** and
**GA-S8-02** (`docs/evidence/GA-READINESS/2026-11-10/`). The founder, 2026-11-11: "focus entirely on getting what we
built surfaced correctly on the UI and working for GA."

## What a person saw before

Reported on the demo-day sweep of 2026-11-06 and unfixed since:

- **"New KRI" answered 500**, every time, from the screen and from AnA's command.
- **Site risk and Site oversight read "0 sites"** for every study, and the header said "0 sites — 12 subjects
  scored". On LMN-201 the same study held 78 site-level readings for 8 sites, loaded through "Load extract…".
- Where a site was shown (only in test fixtures), its composite chip was coloured on the risk assessment's 1 to 25
  scale: a composite of 25 read red beside a "Reduced" tier.

## What already exists (RULE 3)

Nothing new: no screen, route file, service, table or mount. Every change finishes an existing file.

| Path | What it did | What it did not do |
|---|---|---|
| `server/services/rbm/rbm-actuator.ts` `defineKri` | Created a KRI for AnA's command | Its INSERT used `$11` twice with two deduced types (42P08), so it always failed |
| `server/routes/mdx-rbm.ts` `POST /rbm-kris` | A second copy of the same INSERT, for the screen | The same failure |
| `server/services/rbm/metric-ingestion.ts` | Loads an extract; stores site rows in `rbm_metric_observations` "with provenance" | By its own comment, "NOT folded into the site-risk composite, which still derives from Site Intelligence" |
| `server/services/rbm/site-risk-engine.ts` | Derives a site-risk snapshot from `site_intel.sites`, tenant-checked, in one transaction | Had no other source |
| `server/api/site-intel/routes.ts` | The only writer of `site_intel.sites` | Mounted nowhere, and Site Intelligence is outside the launch catalog. It is **not** mounted here: a mount needs a founder decision (RULE 6) |
| `server/routes/mdx-rbm-data.ts` | `POST /rbm-site-risk/recompute`, `POST /rbm-metric-ingest` | The load never rescored the sites |
| `server/routes/mdx-rbm-board.ts` | Maps the snapshot rows onto the board | Carried no source |
| `client/…/surfaces/RbmSurfacesB.tsx` `RbmSites`, `RbmOversight` | The two site tabs | Credited "site intelligence" always; coloured the composite on the wrong scale |
| `scripts/demo/launch-demo/packs/lumen-rbm.mjs` | Seeds LMN-201's monitoring, with site rows in six monthly extracts | Said in a note that the site tabs "stay empty" |

Searches run: `site_intel`, `rbm_site_risk_scores`, `recomputeSiteRisk`, `siteObservations`, `detectSiteOutliers`,
`scope_level` across `server/`, `client/src`, `migrations/`, `db/migrations/` and `scripts/demo/`; the plan and the
design records for "site risk" and "site intelligence" (none decide it).

## What changed

**"New KRI" (GA-S8-01, `c7f797d89`).** `defineKri` is the one KRI INSERT; both uses of `$11` carry its type. The
route calls it and its own copy is deleted.

**Site risk (GA-S8-02).** `site-risk-engine.ts` has a second source. The order is fixed:

1. Site Intelligence holds a site for the study: it is the source, as before.
2. It holds none, or is not installed: the study's own site-level indicator readings are the source.
3. Site Intelligence exists and cannot be read (a permission failure, a shape the engine does not know, a database
   error), or ownership cannot be proved: a failure with its reason, as before. One source is never quietly swapped
   for the other.

**The rule, decided here as the subject-matter call and recorded on every row** (`SITE_INDICATOR_RULE`):

> Each indicator is banded at the site against its own limits. Red counts 100, amber 50, green 0; the composite is
> the mean over the indicators evaluated at the site.

- The band is `kriStatus`, the same function the study-level indicator uses, with the KRI's own limits and direction.
- A reading binds to a KRI the way a study-level one does: by the KRI's name or its `metadata.metricKey`.
- The latest reading per site and KRI counts, from extracts that have not been superseded.
- An indicator with no limit is not counted. A site with nothing evaluated has no composite and stays on the
  standard tier.
- The tier is `monitoringTierFromRisk`, unchanged: 60 and above enhanced, 30 and above standard.
- Each row stores `metadata.source`, the rule, and every reading behind it (value, limits, band, cut-off). The
  drivers are the red and amber indicators in words: "Open query aging 58 days: red (limit 28 days)".
- Enrollment, quality and operational risk stay empty for such a row: the study's indicators do not carry them.

**When it is scored.** "Recompute site risk" as before; and a load that carried site rows rescores the sites after
its own commit. The load stands either way, and its outcome panel says "site risk rescored for 8 sites" or "Site
risk was not rescored from this load", with the reason.

**The screens.** Site risk says "Composite from the study's site-level indicators" or "from site intelligence",
never both; shows each site's indicators ("1 amber · 1 green") in place of the dimension bars; states the rule under
the table; and colours the composite by the tier the engine set. With no site scored it credits no source and says
how sites come to be scored. Site oversight joins the same sites to their open signals and scheduled visits.

**The seed.** `lumen-rbm.mjs` scores LMN-201's sites through "Recompute site risk" where the loads left no snapshot
(a database seeded before this), and its final check now requires the eight sites. That check also counts only the
seed's own indicators: with "New KRI" working, a person's indicator with no reading yet stopped the next seed, and
everything the pack seeds after monitoring.

## Central monitoring, found by pressing it once the sites existed

"Run central monitoring" had nothing to scan before. With eight sites scored it ran and raised nothing, although
site 104 reads 100 beside five sites at 0. Three defects, all in existing files:

1. **The scan compared only the composite.** For a snapshot scored from the study's indicators the composite is a
   three-level roll-up; most sites tie at 0, so the median absolute deviation is 0 and the engine falls back to a
   classic z-score, whose maximum is (n-1)/sqrt(n): 2.47 for eight sites, under the 3.5 threshold. No site could
   ever be flagged in a cohort under 15. `central-statistical-monitoring.ts` gains `detectSiteIndicatorOutliers`:
   each indicator is compared across the sites that have a reading, in the indicator's own direction, with no limit
   needed. Where most sites tie it takes Iglewicz and Hoaglin's mean-absolute-deviation form of the modified
   z-score, `(x - median) / (1.253314 * MeanAD)`. The route (`mdx-rbm-data.ts`) scans a study-indicator snapshot
   this way and a Site Intelligence one on its four risk scores, as before. The signal says the reading, the study
   median and the number of sites.
2. **Critical signals were listed last.** `RbmSurfacesB.tsx` ranked a severity with `rank || 3`, and Critical's
   rank is 0.
3. **A signal's title was squeezed to a few words a line** by the time beside it, which does not wrap
   (`rbm-v2.css`). The time and status now move under the title when the row is too narrow for both.

In the running app on LMN-201 (`central-monitoring-1440.png`, `central-monitoring-390.png`): two Critical signals,
listed first. "Site 104 stands apart on AE reporting lag": "at site 104, AE reporting lag is 21 days against a study
median of 3 days across 8 sites (robust score 12.141). Higher is worse for this indicator." And the same for Open
query aging, 58 days against 11.5. No failed request; the page does not scroll sideways at 390.

Tests, red first: `central-statistical-monitoring.test.ts` (5 new cases, one of which shows the composite cannot
flag anything); the route in `mdx-rbm-data-honest-outcomes.test.ts` (3 cases); the list order in
`rbmSiteRiskSource.test.tsx`.

## Verified

Red first in each case; each test fails with its fix removed.

| What | Where | Result |
|---|---|---|
| The KRI INSERT on real PostgreSQL | `server/routes/__tests__/mdx-rbm-kri-create.pglite.test.ts` | Before: 500, 42P08. After: 201, both cases |
| The rule, pure | `server/services/rbm/__tests__/site-risk-engine.test.ts` (12 new cases) | Against the old engine: "snapshotsFromSiteIndicators is not a function" |
| The read, on real PostgreSQL with RBM's own migrations | `server/services/rbm/__tests__/site-risk-study-indicators.pglite.test.ts` | Latest per site and KRI; a superseded extract, another study, another organization, study-level rows and a retired KRI left out; another organization refused before any read |
| The two routes | `server/routes/__tests__/mdx-rbm-data-honest-outcomes.test.ts` | The source in the answer; rescore after the load's commit; a load with no site rows touches nothing; a rescore that cannot run leaves the load and says why |
| The screens | `client/…/__tests__/rbmSiteRiskSource.test.tsx` (8 cases, beside `rbmSurfaceWrites.test.tsx`) | Against the old screen: 4 fail |
| The seed | `scripts/demo/launch-demo/lumen-rbm-completion.test.mjs` (5 new cases) | Found, rescored, short count refused, a person's indicator tolerated, the seed's own still required |
| Every RBM suite | 26 files, server and client | all pass |
| Seed tests | `scripts/demo/launch-demo/*.test.mjs` | 153 pass |

**In the running app**, as the Lumen lead on LMN-201, on a database seeded from zero on 2026-11-10 (`site-risk-1440.png`,
`site-oversight-1440.png`, `site-risk-390.png`):

- Before: "0 sites — 12 subjects scored"; Site risk "never scored".
- "Recompute site risk": "8 sites — 12 subjects scored". Site 104: 100, Enhanced, "AE reporting lag 21 days: red
  (limit 10 days)" and "Open query aging 58 days: red (limit 28 days)". Site 106: 50, Standard. Site 103: 25,
  Reduced. Five sites at 0.
- Site oversight: site 104 with 2 open signals, 2 high, and its scheduled visit. Overview: "Enhanced-tier sites 1 of
  8 sites".
- A one-row extract loaded through the API answered `siteRisk: { rescored: 8, source: "study_indicators" }`.
- "New KRI", "Create KRI": the row appears, "Not evaluated".
- The seed over that database with the snapshot cleared: "8 sites from the study's site-level indicators;
  enhanced: 104"; again: "found 8 sites", "created 0".
- No failed request, and at 390 the page does not scroll sideways (the table scrolls inside its card, as the other
  monitoring tables do).

## Open

- **The scoring rule is one person's call.** It is the conventional traffic-light composite and it is written on the
  screen and on every row, but nobody in clinical operations has confirmed the weights (100, 50, 0) or the tier
  cut-offs. It is two constants in `site-risk-engine.ts`.
- **The same tie problem remains where it was not changed.** The patient-profile scan and the Site Intelligence
  composite scan still fall back to the classic z-score when most values tie, so in a cohort under 15 they cannot
  flag anything on such a dimension. Changing them changes which subjects are flagged, which is the validation
  lane's to weigh (RBM has no URS or OQ yet, GA-D4-09).
- **"Run central monitoring" is not pressed by the seed.** It is left for a person: on LMN-201 it raises the two
  signals above.
- **A change to a KRI's limits does not rescore the sites.** The tab says when it was scored, and "Recompute site
  risk" rescores. A load does it by itself.
- **Site names.** The study data names a site by its number only, so the tab shows numbers.
- **The dimension bars for a Site Intelligence row** read "of 25" while the engine writes 0 to 100. No such row can
  exist while that register has no writer, so it was not changed and could not be checked.
- **Site Intelligence itself** stays unreached: its router is mounted nowhere and it is outside the launch catalog.
  Reaching or retiring it is a founder decision (RULE 6), and is listed under R1.
- **RBM at 390**: the drivers column is narrow in the table. That is the monitoring tables' layout (GA-UI-22, D7-C).
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
