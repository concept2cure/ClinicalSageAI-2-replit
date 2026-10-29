# Two small honest-state fixes (D2, 2026-10-29)

1. The run history row says what an organization-scope run's counts cover, in the same two lines as the
   rest of Reporting. This is the "Not done" item of a61afe12
   (`docs/evidence/D2-REPORT-SCOPE-HONESTY/2026-10-29/README.md`).
2. `GET /api/mdx/engineering/:programId` refuses through the shared project-ownership refusal
   (`server/lib/admit-project.ts`). When the ownership check cannot run it now answers 503
   `VERIFICATION_UNAVAILABLE`. Before, it answered 500.

Both are completions of existing code. Neither adds a surface, a route or any wording.

## What already exists

Searches run: `Organization-wide records`, `not narrowed`, `ORGANIZATION_WIDE_RECORDS`, `COUNTS_NOT_NARROWED`,
`OrganizationCountsNote`, `computedScope === 'organization'`, `RunsPanel`, `InsightsRunsPanel`, `rl-cell-sub` in
`client/src` and its tests. `admitProject`, `admit-project`, `programInOrganization(`,
`respondVerificationUnavailable`, `VERIFICATION_UNAVAILABLE`, `mdx-engineering`, `mdx/engineering`,
`useEngineering` in `server/`, `client/src`, `tests/` and `scripts/ci`. Deleted history:
`git log --all --diff-filter=D` on `*admit-project*`, `*admitProject*`, `*RunsPanel*`, `*RunHistory*`,
`*runHistory*` finds nothing.

**Fix 1, the organization note.**

- `InsightsCatalogPanel.tsx:67-75`: `ORGANIZATION_WIDE_RECORDS`, `COUNTS_NOT_NARROWED` and
  `OrganizationCountsNote`, exported by a61afe12. The catalog card draws them when `computedScope === 'organization'`.
- `Insights.tsx:1023-1025`: `countsAreOrganizationWide`, which is `computedScope === 'organization'` and a run
  scope other than `account`. The scope line (`:1066`), the pack tile (`:1103`) and the result after a run
  (`:1337`) all use it. It is not exported.
- `server/services/report-os/run-history.ts:64-68,185`: each run history row's `computedScope`. It is the stored
  summary's `computedScope`, then its `domainScope`, then the run's `scope_type`. So an account run of an
  organization-scope type carries `'organization'` too.
- `InsightsRunsPanel.tsx:124` at head: the row drew the literal "Organization-wide records" for any
  `computedScope === 'organization'`. It never drew the second line, and it did not use the exported constant.
- Tests: `reportingContextIntegrity.test.tsx` checks the card's first line. `insightsOrganizationScopeNote.test.tsx`
  checks the tile, the scope line and the result. No test covered the run history row's note.

**Fix 2, the ownership refusal.**

- `server/services/c2c/program-access.ts:192`: `programInOrganization`, the one ownership answer. A lookup that
  cannot run throws `VerificationUnavailableError` and never answers "not yours".
- `server/lib/verification-outcome.ts:105`: `respondVerificationUnavailable` answers 503
  `VERIFICATION_UNAVAILABLE`. The store's words go to the log, not to the client.
- `server/lib/admit-project.ts`: `admitProject(res, log, programId, orgId)` answers 404 "Project not found" when
  the organization does not own the project, or 503 through the helper above when the check cannot run. The caller
  then returns. Its callers:
  - `mdx-udi.ts:89,102`;
  - `mdx-labeling.ts:28,57`;
  - `human-factors.ts:60`;
  - `mdx-engineering.ts`, from this change.
- `server/routes/q-sub.ts:133,139,181` answers the same 503 in the same words ("The project ownership check"), but
  it calls `programInOrganization` and `respondVerificationUnavailable` inline, not through `admit-project.ts`.
- `server/routes/mdx-engineering.ts:157` at head called `programInOrganization` inline. When it threw, the route's
  own `catch` passed it to `serverError`, which answers 500.
- Tests: `server/routes/__tests__/mdx-engineering.contract.test.ts` (17 cases) and the engineering block of
  `tests/mdx-beta-surfaces-routes.test.ts`. Both pin 422 and the 404, and neither tests a check that cannot run.
  The header of `server/__tests__/routes/device-project-reads-admit-program.test.ts` says mdx-engineering already
  answers "could not check is 503". At head that was not true.
- The screen: `useFetchJson.ts:143-147` turns any non-OK answer into an error (`HTTP 503: …`), and
  `useEngineering.ts` shows it ahead of any panel. A 503 is drawn as a failure, not as an empty file.

## Fix 1: the run history row

`client/src/concept2cure/v2/surfaces/InsightsRunsPanel.tsx`: a new `RunScopeNote` (`:104`), drawn in the Scope cell
(`:140`). It reads the row's carried `computedScope` and `scopeType` only, never the type id. It uses the same rule
as the scope line's `countsAreOrganizationWide`:

| Row | Scope cell under the label |
| --- | --- |
| `computedScope` `organization`, run under a project | `OrganizationCountsNote`: "Organization-wide records" and "Counts are not narrowed to the selected project." |
| `computedScope` `organization`, `account` run | `ORGANIZATION_WIDE_RECORDS` only, as before. An account run is already headed as the organization. |
| any other `computedScope` | nothing, as before |

Both lines use the existing `rl-cell-sub` class, so the first line looks as it did. No new wording.

New test: `client/src/concept2cure/v2/__tests__/insightsRunHistoryScopeNote.test.tsx`, 4 cases. It mounts
`RunsPanel` and replaces only `apiRequest`. Its rows have the shape `run-history.ts` returns: a project run of the
inspection register (organization), an account run of the same, a project run of the grants register (a domain
type whose engine computed the project) and a project run of the readiness digest.

## Fix 2: mdx-engineering through admit-project.ts

`server/routes/mdx-engineering.ts:161`: `if (!(await admitProject(res, log, programId, orgId))) return;` replaces
the inline call. The `programInOrganization` and `notFoundInTenant` imports are gone. The route has no local copy:
the 404 and the 503 are the helper's. A refusal returns before the first panel query, so nothing is read. The
endpoint only reads, so there is no write to hold back.

No existing test pinned the 500, so none was changed. Two new cases go in their own `describe` block in
`mdx-engineering.contract.test.ts`, so the existing block's length warning does not grow:

- the ownership query rejects (57P01): 503 `VERIFICATION_UNAVAILABLE`, the helper's sentence, no `57P01` or store
  text in the body, and no panel query;
- the ownership query finds no row: 404 "Project not found", and no panel query.

## Red, green, mutations

Run with `timeout 240 npx vitest run --config vitest.config.ts <file>`, one file at a time. For each mutation the
file was copied, changed by one exact replacement, tested, then restored from the copy, and `sha256sum -c` matched.
Every mutant was type-clean and lint-clean.

| File | State | Result |
| --- | --- | --- |
| `red-run-history.txt` | committed row | 1 failed, 3 passed. The project run lacks "Counts are not narrowed to the selected project." The 3 that pass are the cases that must not change. |
| `green-run-history.txt` | fix | 4 passed |
| `mutation-run-history-c1-account-guard-defeated.txt` | `=== 'account'` changed to `=== 'acount'` | 1 failed: the account run now says "not narrowed" |
| `mutation-run-history-c2-computed-scope-not-read.txt` | `!== 'organization'` changed to `!== 'organisation'` | 2 failed: neither organization row has a note |
| `mutation-run-history-c3-note-whatever-the-computed-scope.txt` | `computedScope !== 'organization'` changed to `!computedScope` | 2 failed: both project-computed rows now carry the note |
| `red-engineering.txt` | committed route | 1 failed, 18 passed: "expected 500 to be 503". The new 404 case passes at head, because the committed route already refused before reading. |
| `green-engineering.txt` | fix | 19 passed |
| `mutation-engineering-s1-refusal-ignored.txt` | `if (!(await admitProject(…))) return;` changed to `await admitProject(…);` | 2 failed: both refusals go on to read 8 panels |
| `mutation-engineering-s2-no-ownership-check.txt` | the admission line removed | 16 failed, among them the existing "404 for a program outside the caller tenant" |

## Checks

- `eslint.txt`: plain `npx eslint`, with head read through `git show HEAD:<file> | npx eslint --stdin`.
  `InsightsRunsPanel.tsx` has no problems before or after. `mdx-engineering.ts` and its contract test each keep
  their one `max-lines-per-function` warning at the same count (320 and 211). The new test has no problems.
- `types.txt`: `tsc -p` with a scratch config that extends the repo's `tsconfig.json`, limited to the repo's
  `.d.ts` files and the four files above. Their imports are checked transitively. 0 errors, exit 0.
- `gates.txt`: `npm run -s ci:program-ownership-single-source` OK. `npm run -s ci:sql-interpolation` OK, with no new
  value interpolated.
- `suites-after.txt`: 16 related files, all green. They are every test that names Run history, `RunsPanel`,
  `rl-cell-sub` or "Organization-wide records", and every test that names mdx-engineering or `useEngineering`. That
  includes `insightsLibraryReachesBackend` 30/30, `insightsOrganizationScopeNote` 7/7, `reportingContextIntegrity`
  10/10, `device-project-reads-admit-program` 20/20, `mdx-beta-surfaces-routes` 27/27,
  `useEngineering.unavailable` 6/6 and `EngineeringSurface.projectKeyed` 18/18.

## Not done

- The rule "organization-computed and not an account run" now appears twice: `countsAreOrganizationWide` in
  `Insights.tsx` and `RunScopeNote` in `InsightsRunsPanel.tsx`. To keep one copy, the predicate would move next to
  the constants in `InsightsCatalogPanel.tsx`, with `Insights.tsx` importing it. Both of those files are outside
  this change.
- `server/routes/q-sub.ts` gives the same 503 inline, not through `admit-project.ts`.
- The header of `server/lib/admit-project.ts` still names only mdx-udi and mdx-labeling as its readers.
- The engineering screen shows a 503 as `HTTP 503: …` followed by the start of the JSON body. It is an error and not
  an empty panel, but the screen does not put the refusal into words.

## One rule (the lead, on commit)

"Organization-computed and not an account run" was in `countsAreOrganizationWide` (Insights.tsx) and again in `RunScopeNote`. It is now exported once from `InsightsCatalogPanel.tsx`, beside the words it decides, and both read it. `admit-project.ts`'s header names its four readers. After the move: the run-history test 4/4, the scope-line test 7/7 and mdx-engineering's contract 19/19. ESLint is at head on every file (Insights.tsx 7).
