# Golden Journeys (WO-01)

Three repeatable, end-to-end proof journeys with real persisted data, honest
failures, and machine-readable manifests. The harness lives in
`tests/golden-journeys/harness.ts`; every journey runs REAL services against
REAL canonical DDL on an in-process Postgres (drizzle handle + a
node-postgres-compatible shim over PGlite — nothing is stubbed).

Run: `npx vitest run --config vitest.config.ts tests/golden-journeys`
Output: `tests/golden-journeys/__reports__/<slug>.manifest.json` (truth source)
plus `<slug>.report.md` (rendered from the JSON).

| Journey | Status | Spec |
|---|---|---|
| C — HA challenge → governed correction | **phase 1 PASSING** (service level, 14 steps) | `HAQ_CORRECTION_JOURNEY.md` |
| A — IND creation → governed submission package | not started | `IND_JOURNEY.md` (pending) |
| B — Marketing application authoring → release | not started | `MARKETING_APPLICATION_JOURNEY.md` (pending) |

## Honesty rules the harness enforces

- A "known-bad" step that is NOT blocked fails the journey — honest failure
  behavior is the deliverable, not an inconvenience.
- The markdown report is a rendering of the manifest JSON; the JSON is the
  truth source (same rule as the Submission Proof Packet).
- Manifests record blocked reasons, receipt hashes, audit-row counts and
  tenant-isolation outcomes as first-class evidence.

## Scope honesty (phase 1)

Service-level traversal: it exercises the governed services and canonical DDL
directly — not the HTTP/auth layer, not the UI. Phase 2 adds route-level
journeys over the dev-login path and Playwright browser journeys per the master
work order. What phase 1 already proves is the part no user or test had ever
executed: the correction spine itself.
