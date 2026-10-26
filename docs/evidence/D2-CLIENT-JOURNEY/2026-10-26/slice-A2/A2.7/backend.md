# Existing dossier readers carried into the core project read

## What already exists

`dossier-read.ts` owns governed-document readiness. The former
`dossier-readiness.ts` HTTP route owns the `concept2cure_artifacts` weakest
status/count/date rollup. `dossier-map-view-assembler.ts` owns the separate
`project_sections` tracking modules and deterministic completion calculation.
The existing canonical Projects router already admits each UUID through
`installProjectRouteAccess`, storing the exact accepted `CurrentProgramAccess`
anchor/client/actor relationship. Missing or ambiguous anchors are already a
409; no second anchor resolver or numeric parsing is needed.

Deleted-history searches for dossier, readiness and editor/canvas names found
prior consolidation. The existing readers are reused/moved, not rebuilt as a
second readiness engine. The map assembler and its SQL tests remain owners.

## Change and contract

`GET /api/c2c/projects/:id/dossier` now uses `requestPgClient` for its existing
governed read and adds optional `supportingReadiness` with two independent
branches:

- `artifactReadiness`: `state: read`, per-section artifact count, each status
  count, weakest status, section update time and the existing section totals.
  Added `unknownCount` and `unknownSections` preserve unrecognized states
  without claiming they are ready. A mixture of approved and locked artifacts
  is approved, fixing the old route's incorrect locked answer.
- `sectionTracking`: `state: read`, the existing tracked module labels,
  completion percentage, tone and section labels. The same assembler and
  formula are retained, now with a required caller-supplied database executor.
- Each failed branch is `state: unavailable`, with `STORE_UNAVAILABLE` for an
  absent table/column or `READ_FAILED` for an actual read failure. Safe reasons
  contain no driver error. A failure in one basis does not invent a zero or
  discard another readable basis.

The readers scope parent and child organisations, the accepted numeric project,
program UUID and client mapping. Archived/deleted PM rows remain excluded from
the tracking read and are also excluded from artifact supporting detail. Final
current access must still match the accepted program, anchor, client, actor and
role before any dossier payload is returned. No request context means refusal,
with no pool fallback. The governed home/market figures remain unchanged and
are never replaced by either supporting basis.

The old HTTP route files and bootstrap mounts are removed. Their outcomes are
carried by `ProjectDossier.tsx` on Author and the canonical UUID route; control
tower's reachability/browser proof is recorded in the main README. The old
HTTP-only map test was retired with its subject; its store and assembler tests
remain. No stored data, migration, seed, dependency or write path was changed
by this backend work.

## Red then green

- New supporting-reader red: **6 failed**, before the new export/contract.
- Initial canonical/readers regression: **30 passed in 4 suites**.
- Expanded request-only, safe-branch and exact-client-currentness route checks:
  **20 passed in 3 suites**.
- Golden marketing journey now calls the canonical UUID dossier route over
  canonical extracted table DDL and the real artifact/tracking/compile SQL.
  Its adaptation first exposed an expected-403 versus actual concealed-404
  fixture mismatch on missing organisation; the expected refusal was corrected.
- Final combined run: **34 passed in 5 suites**, 18.70 seconds:

```sh
npm exec --yes --package=node@22 -- node node_modules/vitest/vitest.mjs run \
  server/routes/c2c/__tests__/projects-dossier.test.ts \
  server/services/c2c/__tests__/dossier-support.pglite.test.ts \
  server/services/c2c/__tests__/dossier-read.pglite.test.ts \
  server/services/dossier/__tests__/dossier-map-view-assembler.pglite.integration.test.ts \
  tests/golden-journeys/marketing-application.journey.test.ts
```

PGlite executes real SQL, not native PostgreSQL RLS. The marketing journey
explicitly seats its actor/anchor admission double; it proves dossier and
compile data handling, not JWT/membership admission. Existing parent-access
SQL coverage and control tower's signed-in browser proof provide that boundary.
No compiler or build was run by this worker. `git diff --check` passes.
