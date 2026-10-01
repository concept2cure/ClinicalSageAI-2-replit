# D6 — Audit & compliance reports: client surface (2026-09-30)

Founder request, 2026-09-26: security and compliance audit reports that clients
can run themselves, reached from Reporting & analytics. This folder covers the
client half. The server half (`GET /api/audit/reports`,
`GET /api/audit/reports/:id`) is in `../server/`.

## What was missing

- No screen could run a compliance report. The only audit output a client could
  produce was the whole signed audit trail, from the Admin audit-trail screen.
- Reporting & analytics (Insights) had no route to audit or compliance reports.
  An organisation with no lead program got "No program readiness yet" and
  nothing to click, although audit reports read the organisation's records, not a
  program.

## What is true now

- New surface `compliance-reports`
  (`client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`, pure helpers in
  `complianceReportsModel.ts`), registered in `surfaceViews.ts` as its own lazy
  chunk. It does not own the conversation.
- On mount it reads the catalog through `apiCall`. While the read is in flight it
  shows a loading state. A failed read, or a 200 that is not the catalog shape,
  shows `ErrorState` with a retry. It never shows an empty catalog in place of a
  failure.
- Every member sees every report: its title, its purpose and its basis tags. A
  member who cannot run reports (`canRun: false`) sees "Available to organisation
  owners, admins and managers." and no Run control.
- Range reports take From and To dates. As-of reports take one date. The dates
  default to today (UTC) and 90 days before it. When From is after To, the screen
  shows a message next to the dates and sends no request.
- Run: `GET /api/audit/reports/:id?from&to&format=json`, or only `to` for an
  as-of report. The full audit trail runs through the `endpoint` named in its
  catalog row (the existing signed export) with `start_date`/`end_date`. The end
  date is sent as `T23:59:59.999Z` because that route compares timestamps with
  `<=`, and this keeps the end date inclusive.
- Errors: 403 shows the readers notice. 400 shows the server's sentence. 503 shows
  "The report was not produced because it could not be recorded on the audit
  trail. Nothing was exported.", or the server's sentence when it sends one, and
  no table. Any other failure shows `ErrorState` with a retry.
- Result:
  - Each section is a `reg-tbl` table named by its heading, with its row count,
    a notice when it is truncated, and its notes.
  - An empty section says "No records in this period."
  - At most 200 rows show on screen, with "Showing 200 of N — the download
    contains all rows."
  - "Not recorded by the platform" lists what the platform does not record.
  - The chain verdict reads verified, break found (warning) or not verified
    (with a reason only if it passes `redactInternals`). For the full audit
    trail the verdict comes from the manifest's two chain statuses: verified
    only if both are intact.
  - The manifest strip shows when the report was generated, rows per section,
    the SHA-256 (first 12 characters, the full value in a `title`), the signing
    key id and the export id.
- Downloads go through `download.ts` `downloadText`:
  - "Download JSON" saves `{ data, manifest, signature, verification }`.
  - "Download CSV" runs the report again with `format=csv`. It saves
    `export.data` exactly as the server sent it (the manifest's SHA-256 covers
    that string) and saves `<name>.manifest.json` beside it.
  - If the browser refuses a download, the screen reports a failure.
- Store names (`audit_logs`, `audit_events`) in the audit trail's `source` column
  show as "Audit ledger" and "Event chain".
- The surface publishes its state to AnA (`usePublishSurfaceContext`): counts,
  the chain verdict and the export id, never row content. A failed catalog read
  is published as a failure.
- Entry points:
  - Insights left pane header: a quiet "Audit & compliance reports" link.
  - Insights "No program readiness yet": the same link as the empty state's
    action.
  - Audit trail header: "Compliance reports" next to "Export signed bundle".

## Tests — red, then green

`client/src/concept2cure/v2/__tests__/complianceReports.test.tsx` mocks
`apiCall` and `downloadText`. The entry-point tests mount the real
`InsightsCanvas` and `AuditTrail` with `apiRequest` stubbed. 21 tests:

| Test | Red | Green |
|---|---|---|
| catalog lists every report with purpose and basis, from the catalog route | fail: report not found | pass |
| `canRun:false` shows readers notice, no Run | fail | pass |
| failed catalog read shows ErrorState with retry, never an empty list | fail: no `alert` | pass |
| 200 that is not the catalog shape is a failed read | fail: no `alert` | pass |
| run renders sections, the empty-section sentence, not-recorded list, chain verdict, manifest strip | fail | pass |
| chain verdict: break found | fail | pass |
| chain verdict: not verified, with reason | fail | pass |
| as-of report sends only `to` | fail | pass |
| From after To: inline message, no request | fail | pass |
| 503: not-recorded refusal, no table, no download | fail | pass |
| 503 with server sentence uses it | fail | pass |
| 403 shows readers notice; 400 shows server message | fail | pass |
| at most 200 rows on screen with the download note | fail | pass |
| CSV download saves `export.data` byte for byte, plus manifest | fail | pass |
| JSON download is `{data, manifest, signature, verification}` | fail | pass |
| refused download is reported as a failure | fail | pass |
| full audit trail calls its signed-export endpoint, one table | fail | pass |
| a11y audit of populated catalog, period form and result (added after the red run, see mutation below) | — | pass |
| Insights with no lead program reaches the reports | fail: no button | pass |
| Insights left pane header link | fail: no button | pass |
| Audit trail "Compliance reports" link | fail: no button | pass |

- `red/complianceReports.red.txt` — 20 of 20 fail. This run used the final
  20-test file, before the a11y test was added. The surface was a stub that
  renders nothing, and `Insights.tsx` and `AdminSurfaces.tsx` were at HEAD.
- `green/complianceReports.green.txt` — 21 of 21 pass, with no act warnings.
- `red/csv-byte-for-byte.mutation.txt` — the surface was changed to save
  `exp.data` with CRLF normalised to LF. The byte-for-byte test fails on it.
  The original was then restored.
- `red/a11y-unlabelled-input.mutation.txt` — the From `<label>` was replaced with
  a `<span>`. The a11y test fails with "3.3.2 form field has no label". The
  original was then restored.
- `red/ana-surface-context.before-baseline.txt` → `green/ana-surface-context.txt`
  — the ratchet fails at 114 ("ROSE to 115") and passes once `ID_BASELINE` is
  115.

## Other checks

| Check | Result |
|---|---|
| `npx eslint` on the new files and `surfaceViews.ts` | clean (`green/eslint-new-files.txt`) |
| `npx eslint` on `Insights.tsx`, `AdminSurfaces.tsx`, HEAD vs now | unchanged: 0e/9w and 0e/17w (`green/eslint-edited-files-head-vs-now.txt`) |
| `node scripts/ci/check-internals-in-copy.mjs` | pass (`green/internals-in-copy.txt`) |
| related suites: insightsNotAna, insightsExportProducesFile, noFabricatedProgramIdentity, auditTrailSignedRow, auditTrailHeadersAndCopy, auditRailIntegrity, anaSeesScreens, anaAskDestination, tests/ui/one-shell | 9 files, 65 tests pass (`green/related-suites.txt`) |
| `tests/ui/shell-kit-lazy.test.ts`, `tests/ui/one-shell.test.ts` | pass |

## Pending the control tower's registry row (`pending/`)

These checks fail only because `compliance-reports` is not yet in
`UI_SURFACES` and not yet declared CONTEXTUAL. The control tower owns both
changes.

| Check | Result now |
|---|---|
| surfaceRender, a11ySemantics, hostilePayloadProbe, surface-registry-coverage | 513 of 514 pass. `compliance-reports` passes in all three render suites. The one failure is `surface-registry-coverage`: "no ui-surface-registry entry: compliance-reports" (`pending/every-surface-suites.results.txt`, filtered from the full log with `grep -E "^ +(✓|×) \|Test Files\|Tests  \|EXIT=\|FAIL \|AssertionError\|^ +→"`; everything else in the full log was act-warning stderr) |
| `node scripts/ci/check-surface-discoverability.mjs` | fail: "compliance-reports: renders but is in neither the Apps catalog nor the CONTEXTUAL list" |
| `node scripts/ci/check-launch-scope.mjs` | fail: "SURFACE_VIEWS key 'compliance-reports' is outside the launch scope and not in UI_SURFACES" |

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run client/src/concept2cure/v2/__tests__/complianceReports.test.tsx
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run client/src/concept2cure/v2/__tests__/surfaceRender.test.tsx client/src/concept2cure/v2/__tests__/a11ySemantics.test.tsx client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx tests/ui/surface-registry-coverage.test.ts
node scripts/ci/check-ana-surface-context.mjs
node scripts/ci/check-surface-discoverability.mjs
node scripts/ci/check-launch-scope.mjs
node scripts/ci/check-internals-in-copy.mjs
npx eslint client/src/concept2cure/v2/surfaces/ComplianceReports.tsx client/src/concept2cure/v2/surfaces/complianceReportsModel.ts client/src/concept2cure/v2/__tests__/complianceReports.test.tsx client/src/concept2cure/v2/surfaceViews.ts
```

`npm run typecheck` / `tsc` were not run, as the brief requires. That run
belongs to the control tower.

---

## Review round 1 (2026-10-01)

Three adversarial reviews (honest state, Part 11 UX, security) sent nine
must-fix items. The server helper changed the chain contract at the same time:
`data.chain` / `manifest.chainAtGeneration` is now
`{ ok, scope: 'integrity-checks' | 'not-checked', rowsChecked?, reason?, checks? }`.
The run route can also answer 429 `REPORT_IN_PROGRESS`, and `readers` became
"organisation owners, admins and managers, and platform administrators".
Where this section and the round-0 sections above disagree, this section is
current.

### What changed, by item

1. **Chain statement.** The statement now covers only what was checked.
   - **Integrity attestation (`integrity-checks`):** the line reads "All *n*
     integrity checks passed at generation", or "A break was found at
     generation" (error tone), or "*x* of *n* checks could not verify" with the
     reason. `ok: true` with `rowsChecked: 0` reads "No chained rows were
     checked, so nothing was verified at generation".
   - **Every other report (`not-checked`):** the line reads "This report does
     not verify the audit chain." in a neutral tone. A button beside it selects
     the integrity attestation.
   - **Verdict cells:** in the attestation's verdict column the word is always
     shown, with a tone (`broken` → error, `not verified` → muted).
   - **Full audit trail:** one line per store, "Event chain: …" and "Audit
     ledger: …". Each line gives the status, the rows checked and the reason.
     The two are never merged.
   - **Store names:** `audit_logs` / `audit_events` in any cell or reason are
     shown in words.
2. **Seal.**
   - **"What the seal means":** the report was sealed by the platform with
     HMAC-SHA256 under a platform-held key (key id shown). It is recorded on
     the audit trail as export *id*, and was run by *name (role)* at *time
     UTC*. The seal is tamper-evidence, not an electronic signature.
   - **"Copy SHA-256":** copies the full hash. If the browser refuses, the
     screen says so and shows the full hash.
   - **"Verify a saved report"** is always on the surface:
     - Accepted files: one JSON bundle, or a CSV together with its
       `.manifest.json`.
     - The control posts `{ data, manifest, signature }` to the existing
       verifier. For a CSV, `data` is the file text exactly as read
       (FileReader).
     - The result reads "verifies … key k1" or "does not verify", with the
       server's errors.
     - Any other set of files is refused with no request.
3. **As-of copy.**
   - The user access review reads: "Membership is taken as of one date; other
     fields are shown as they are when the report is run, as each section
     notes."
   - For an as-of date before the run, the result header adds "Status and
     roles are shown as they are now, not as of this date."
   - **Deviation:** the controlled document register is the other as-of
     report, and "Membership" and "roles" would be false there. It reads
     "Records are taken as of one date; …" and "Status is shown as it is now,
     not as of this date." This matches the server's own section notes.
4. **Strict parsing.**
   - A section whose `rows` is missing or not an array of records reads "This
     section could not be read." So does a section whose `rowCount` is missing
     or differs from `rows.length`. Such a section never reads "No records in
     this period."
   - The audit trail's rows follow the same rule against `manifest.rowCount`.
   - One malformed catalog entry, or a duplicate id, fails the whole catalog
     read, which then shows `ErrorState`.
5. **CSV.**
   - The success note names the second run's export id and generation time,
     and says Download CSV ran the report again.
   - A warning lists any section whose row count differs from the screen, for
     example "Events: 2 in the CSV, 1 on screen".
   - New footnote: "Each run is recorded on the audit trail. Download CSV runs
     the report again and is recorded as its own run."
6. **Timestamps.**
   - ISO instants in cells read `YYYY-MM-DD HH:MM:SS UTC`.
   - A column of instants, or a column whose key ends `_at` or is
     `timestamp`, has a header ending "(UTC)".
   - Date-only values are left as they are.
7. **Actors.** On the full audit trail, a "User id" column appears beside "Who"
   whenever any row has a blank user name.
8. **Readers.**
   - The readers notice is "Available to *readers*.", using the server's
     `readers` string.
   - A 403 shows that notice only when its code is `AUDIT_READ_RESTRICTED`.
     Any other 403 shows the server's message.
   - A 429 `REPORT_IN_PROGRESS` reads "A report is already running for your
     organisation. Try again when it finishes." A different 429, such as the
     rate limit, shows the server's message.
9. **Insights 503.**
   - Insights' existing error branch already renders a 503 overview as "Couldn't
     load the reporting canvas", not "No program readiness yet". The new test
     pins that.
   - The error state had no way through to the reports. It now has an "Audit &
     compliance reports" button.

### Files

- Surfaces:
  - `ComplianceReports.tsx` (266 lines): the surface.
  - **new** `ComplianceReportResult.tsx` (278): the result, seal, downloads and sections.
  - **new** `ComplianceReportsVerify.tsx` (156): the verify control.
  - `complianceReportsModel.ts` (289): catalog, period, run, refusals, AnA context.
  - **new** `complianceReportData.ts` (340): run data, chain statement, tables, manifest.
  - `Insights.tsx`: the link on the error state.
- Tests:
  - `__tests__/complianceReports.test.tsx`: updated to the new contract.
  - **new** `__tests__/complianceReportsReview.test.tsx`: one describe per item.
  - **new** `__tests__/_compliance-reports-fixtures.tsx`: shared fixtures and
    mount helpers.

### Red then green

- `review-round-1/red/review-and-base.red.results.txt`: the final test files run
  against the round-0 implementation. 27 of 43 fail:
  - 23 round-1 tests (every item);
  - 4 base tests whose assertions moved with the contract: the readers text;
    the chain statement and "When (UTC)" in "renders sections"; the 403
    readers text; and the a11y test, which waits on the new chain line.
  - Filtered with `awk '/^ +(✓|×) |Test Files|Tests  /{print; next} /^ FAIL /{print; getline; print}'`;
    the rest of the log was DOM dumps.
  - One assertion was tightened after the red run, in "ok:true over zero
    rows". The regex went from `/passed at generation|verified at generation/`
    to `/passed at generation|^Audit chain verified/`, because the honest
    sentence itself contains "nothing was verified at generation". The red
    failure was the round-0 line "Audit chain verified at generation", which
    the tightened regex also catches.
- `review-round-1/red/insights-503-falls-to-no-program.mutation.txt`: Insights'
  error branch was changed to let a 503 fall through to the no-program state.
  The item-9 test fails ("Unable to find role=alert"). The original was then
  restored.
- `review-round-1/green/review-and-base.green.txt`: 43 of 43 pass, with no act
  warnings.

### Other runs (all in `review-round-1/green/`)

| Check | Result |
|---|---|
| surfaceRender, a11ySemantics, hostilePayloadProbe, surface-registry-coverage | 514 / 514 pass; registry coverage is green now that the registry row exists (`every-surface-suites.results.txt`, filtered to result lines) |
| Insights and related: insightsNotAna, insightsExportProducesFile, insightsHonestCopy, noFabricatedProgramIdentity, anaAskDestination, anaSeesScreens, auditTrailSignedRow, auditTrailHeadersAndCopy, auditRailIntegrity, one-shell, shell-kit-lazy | 76 / 76 pass |
| `check-internals-in-copy` | pass |
| `check-ana-surface-context` | pass, 115 (baseline unchanged) |
| `check-surface-discoverability` | pass (CONTEXTUAL entry now present) |
| `check-launch-scope` | pass |
| ESLint, all compliance-report files and `surfaceViews.ts` | 0 errors, 0 warnings |
| ESLint `Insights.tsx`, `AdminSurfaces.tsx`, HEAD vs now | 0e/9w and 0e/17w, unchanged |

The three round-0 checks in `pending/` are now green (see the table).
