# A2.3 — complete pathway filters, scoped portfolio counts and honest device readiness

Launch row D2; canonical branch `concept2cure-v2`. Continuation from `5ec681d04`.
This extends the existing Projects portfolio and device portfolio. No catalog,
entitlement, schema or creation behavior changes are authorized by this slice.

## What already exists

- `server/services/c2c/project-portfolio.ts` shares GET/201 card SQL, admits exact
  verified project/client anchors, and applies the Client filter before paging.
  It does not yet project a pathway or count the complete scoped portfolio.
- `server/routes/c2c/projects.ts` bounds pages, measures dossier readiness only
  for returned rows and revalidates captured access immediately before reply.
- `shared/constants/domain/product-types.ts` provides the canonical workstream
  vocabulary and SQL generator. `shared/constants/mdx.ts` has pathway maps and
  labels, but excludes IDE and regional device types.
- `client/src/concept2cure/mdx/hooks/useMdxPrograms.ts` classifies device rows,
  drops unmapped types, and reads the unmaintained progress column as readiness.
  `mdx/surfaces/Overview.tsx` duplicates pathway labels and averages those values.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` has workstream tabs, page-only
  counts/mean, Client filtering and surface actions. `dossierReadiness.ts` already
  distinguishes missing measurements from failed reads, with older wording.
- The discovery in `.design/client-journey/SLICE_A2_PLAN.md` inventories these
  pieces and the earlier duplicate classifiers. Searches covered pathway,
  portfolio, workstream, readiness, progress_percent and deleted history on the
  same paths. Implementation extends these canonical pieces.

## Contract and verification

Retained page-length `meta.count`, page-bounded readiness and exact accepted-anchor
revalidation. Workstream and pathway filters bind before paging. Deterministic
SQL counts cover admitted rows; unknown pathways remain Other. Failed reads stay
distinct from Not recorded. See [backend.md](backend.md) and [device.md](device.md)
for the precise scopes, classifier precedence and their evidence.

Projects now consumes full counts in its summary and chips. Workstream facets
honor Client; pathway facets honor Client+workstream; the total and filing count
honor all three. Readiness, search and status remain page-local, as stated in the
page notice and AnA context. Older responses without aggregate metadata retain
page-floor counts. A selected status remains clearable after a server filter
changes the statuses on the page. Missing measurements say **Not recorded**;
failed dossier measurements remain **unavailable**, including an unmeasured mean.
The action registry and visible controls use the same pathway vocabulary.

## Verification

- New client expectations initially failed 7 cases (2 existing cases passed).
  Separate red checks catch unavailable measurements being called Not recorded
  and a selected status losing its clearing control. These are committed logs,
  not claims based solely on passing checks.
- Final Projects/home/context regression: 9 suites, **63/63 passed**. Additional
  step-return, existing Client and Mission Control integration: 3 suites,
  **29/29 passed**. These runs overlap and are not additive.
- Backend: **365/365** across 21 suites, including 60-row SQL count/paging,
  current access, foreign tenant, reanchor and GET/201 parity checks. Device and
  taxonomy: **203/203**, plus an overlapping consumer run **83/83**.
- Three real-server Chromium flows passed together (**39.1 seconds**): A2.1
  project-step return/reload, A2.2 Client filtering and A2.3 pathway filtering.
  They create fresh synthetic organizations/projects using canonical HTTP
  routes; no responses are intercepted. PostgreSQL is the deploy-shaped test
  database, connected as NOSUPERUSER/NOBYPASSRLS `app_service`, RLS enforcement on.
  The A2.3 test creates two 510(k) projects and an IND, checks a one-row API page
  with a two-project total, then filters the rendered portfolio by MDX/510(k).
  `pathway-counts.json` contains only safe count metadata; the screenshot contains
  synthetic records. No tokens or raw authenticated traces are committed.
- Production frontend/server/audit-verifier build passed (Vite **23.43 seconds**).
  Existing large-chunk notices remain. Affected lint has no errors or increased
  warning allowance; Projects retains its seven existing warnings.
- Independent backend and frontend reviews completed. The frontend status
  clearing issue found in review was reproduced red and repaired before the
  final browser run. No access, catalog or entitlement boundary was widened.

The tests do not claim a tenant-wide readiness benchmark or a complete regulatory
journey qualification. The native browser demonstrates positive runtime-role
paths; PGlite isolation tests are not native RLS proof. No AI provider is needed
for these flows. Pre-push gates run when publishing the combined commit.

The first publishing attempt passed every gate before TypeScript, which caught
two unsupported `exact` options on Testing Library role queries in the new status
test. Removed the options (the string name matcher is already exact); the same
six pathway/status tests pass. No compiler or lint baseline was expanded. The
attempt was refused before publication; `prepush-type-red.txt.gz` records it.

Concurrent work through `33694a45a` merged without source conflicts. A later
upstream merge at `785b9fbb5` retains regional draft inputs in the existing editor;
it changes no A2.3 source file. Browser/build results above precede that second
merge; publishing gates run on the final combined tree.

After the second merge, four directly interacting pathway, project-step, regional
draft-input and source-first assembly suites pass **45/45** (`merged-related.txt.gz`).
The existing surface-action bus/commit-boundary suites also pass **26/26**
(`actions.txt.gz`). These targeted runs overlap earlier evidence.
