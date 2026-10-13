# Reporting UI completion evidence

Workstream W1 / launch row D2. Target: `concept2cure-v2`, extending Claude's
existing reporting panels on baseline `cd0140cbd21df44b804f793940f324f14607d48b`.
The existing two-pane layout, v2 colors and controls, bundles, market assessments,
seal/source disclosure and electronic-signature ceremony are retained.

## Verified behavior

- Organization reports and saved history remain reachable without a product
  program. Catalog filters expose region, reporting role, data scope and precise
  availability. Organization totals are labelled as such.
- Document traces select an artifact from the owned program's canonical document
  endpoint. Disabled or unregistered report types cannot be enabled by selection.
- History consumes SQL pagination totals and continuation, resets offsets when
  filters change, and discloses missing pagination information.
- Program changes invalidate old reports, seals, selections and pending reads.
  A signature that finishes after a replacement report cannot mark that report
  final. Initial bootstrap does not discard a user's first search.
- Portfolio cards expose status, risk and critical blockers, and open the matching
  program. The board and history describe the member's accessible subset rather
  than every program or report in the organization. Unknown readiness remains
  unknown; an anchor alone draws no forecast.
- Platform schedules retain the chosen IANA timezone. Inbox links open the actual
  stored report, including query-only navigation on an already open reporting
  screen. External email is not advertised as available.
- Quarterly review status is read on arrival; completion still requires a human
  signature. CSV conversion submits the exact sealed snapshot on screen and
  saves the returned bytes and signature manifest.
- Audit attestation pulls work under the application's StrictMode lifecycle.
  Browser download refusals are reported without a success claim.

## Automated checks

Node 22, Vitest 4.1.7: **28 suites / 258 tests passed**. The command covered all
`insights*.test.*`, `compliance*.test.*`, `reportingContextIntegrity.test.tsx`
and `taskTrayHonestReads.test.tsx` in the v2 test directory. See
[focused-tests.txt](focused-tests.txt). Transport is mocked in these component
tests; they verify requests, scope, refusal handling and rendered behavior.
Existing asynchronous test `act(...)` notices are retained in the log.

After the server's project-sharing filter was integrated, a focused follow-up
passed **four suites / 50 tests**, including the new accessible-subset wording
regression. See [accessible-scope-tests.txt](accessible-scope-tests.txt) and
[accessible-scope-lint.txt](accessible-scope-lint.txt). This follow-up adds one
case to the 258-case full run above; it does not assert a second full run.

Focused ESLint: **zero errors**, ten existing size/complexity warnings in
`Insights.tsx` and `TaskTray.tsx`; no new panel or test warnings. See
[focused-lint.txt](focused-lint.txt). `git diff --check` passed for the v2 changes.
Logs have terminal colors removed, repository paths normalized and credential
patterns redacted. No browser session credentials are included.

## Live runtime checks

The control tower separately reviewed the actual authenticated application with
PostgreSQL and application-role RLS enabled. All four library tabs passed at
1440px in light/dark themes and 390px in light theme, with no page errors,
API failures or body overflow. A real account-scoped inspection report returned
201 and its rendered document returned 200; zero records remained a partial /
missing result with sources and blockers. Browser/export/history artifacts are
filed separately by the control tower.

These checks cover supported computations and UI integration. A listed but
uncomputed report is still unavailable; the UI does not create a regional or
compliance verdict in its place.
