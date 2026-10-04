# D2 / D6: three more broad API claims that let hidden apps answer as launch

**Row:** D2 / D6, the launch-scope API lane (`…session_01E8btkB8mcLirW4rNvsMNxK`).
**Date:** 2026-09-29.

## How they were found

The `/api/mdx` defect (2026-09-26) had a shape a check can look for. A launch
surface claims a whole prefix, and a hidden app's routes live under it. So
every route production mounts was listed from the running registration
(`scripts/ci/launch-scope-route-inventory.ts --rows`), and each one answering
"launch" was grouped by its claiming prefix plus the next segment. Those
groups were compared with every API literal in launch and shell screen code.
223 sub-namespaces answered as launch with no launch literal reaching them.
Most are the launch apps' own endpoints. These three were not:

| Claim | Claimed by (launch) | Who calls it | What it is |
|---|---|---|---|
| `/api/global-ri` (whole) | `dossier-map` | only `GlobalRiBrowser`, the hidden `global-ri` surface | the Global RI capability catalog and its routes |
| `/api/rim` (whole) | `dossier-map`, `project-home`, `program-journey` | only `Registrations.tsx`, the hidden `registrations` surface | RIM products and registrations |
| `/api/510k/estar` (whole) | `submission-center` | Submission Center uses `estar/submissions` and `estar/assemble` only | the device 510(k) kit's eSTAR build, official fields, registration, filing readiness |

All three pre-date launch scope at the API (2026-09-25). The `dossier-map`
and `project-home` claims date from 2026-06-16 (`f1078f82a`),
`program-journey`'s `/api/rim` from 2026-07-07 (`75bc5f6b4`), and
`submission-center`'s eSTAR claim from 2026-09-23 (`8783028e7`). None has a
server-side HTTP caller or an MCP caller.

A check of the MCP server (`server/mcp`, `/mcp`, outside the API gate) found
it clean. Its 19 tools use launch services (projects, submissions,
sequences, vault, eCTD validation, readiness) and in-scope AnA knowledge
handlers only.

## What changed

- `dossier-map` claims `/api/dossier-map` only. `project-home` and
  `program-journey` no longer claim `/api/rim`. `submission-center` claims
  `/api/510k/estar/submissions` and `/api/510k/estar/assemble`. Each change
  carries a dated comment.
- `GlobalRiBrowser` moved, unchanged, from `surfaces/Surfaces.tsx` to
  `surfaces/GlobalRiBrowser.tsx`. The shell imports `Surfaces.tsx` for `Home`,
  so the browser's `/api/global-ri` calls counted as shell calls. That
  made `ci:launch-scope-api` unable to tell that no launch screen makes them.
  Only `surfaceViews.ts` and two tests import the new file. Net ESLint
  warnings across the touched files went from 8 to 7.

## Proof

| Check | Red | Green |
|---|---|---|
| Real-registry gate test: Global RI, RIM and device eSTAR refused; `/api/dossier-map` and Submission Center's two eSTAR paths pass | 1 failed of 25: `/api/global-ri/catalog` passed (`gate-red.txt`) | 25/25 (`gate-green.txt`) |
| `ci:launch-scope-api`, registry narrowed, browser not yet moved | 2 shell literals refused (`ci-gate-red.txt`) | 266 paths, none refused (`ci-gate-green.txt`) |

Client suites: 345 files, 3,819 tests pass. `ci:launch-scope` and the
self-test pass.

**Production effect, measured:** the route inventory ran in production
posture, before and after. **Exactly 112 routes move from launch to refused
(40 writes): 92 under `/api/global-ri`, 12 under `/api/510k/estar` and 8
under `/api/rim`.** Nothing else changes (`route-verdict-diff.json`).
Before: launch 1,133 and out-of-scope 1,071. After: launch 1,021 and
out-of-scope 1,183.

## Not settled here

The other candidate sub-namespaces were not all judged. Some look like the
launch app's own endpoints, for example `/api/ana/*` (AnA), `/api/tasks/*`,
`/api/project-sections/*` and `/api/esignature/*`. A few want a closer look:
`/api/biotech-artifacts/*` (claimed by `artifacts-center`, called by no
client), `/api/corpus/*`, and `/api/regulatory-correspondence/*` (claimed by
`program-journey`; left open because the in-scope AnA command
`correspondence.ingest` calls it over HTTP). An adversarial review workflow
for all 223 was started and stopped at the usage limit before any agent
finished. The candidate list is reproducible with the inventory tool.
