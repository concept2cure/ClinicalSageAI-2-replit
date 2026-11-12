# W1 — A frozen document can be placed into a filing (rehearsal B1, rB-F13; rehearsal lane 1)

Lane of wave B, 2026-11-12. Plan package F1 (a repair of something reached and broken). Rows: rehearsal **B1**
("A frozen, signed document can never be placed into filing") and rehearsal lane 1's second finding **rB-F13**
("Section keys 1.14.4.1:work:3" in the review dialog).

## What already exists

- The one release rule: `server/services/authoring/workflow-import-governance.ts` `assertWorkflowImportRelease`.
  Freeze (`server/routes/authoring.router.ts`, on a node-postgres client), Place into filing
  (`server/services/coauthor/coauthor-snapshot.ts` `takeAuthoringSnapshot`, on the request's Drizzle transaction),
  File to vault, export and refile all call it.
- Its ledger read, `independentLedger`, re-derives each chained row's hash with
  `server/services/audit/chain-row.ts` `verifySequencedRow` and `server/services/audit/chain.ts` `deriveChainHash`.
- The Drizzle adapter: `server/db/drizzle-queryable.ts` `queryableFromDrizzle`, over `server/db/requestDb.ts`
  (`drizzle-orm/node-postgres`).
- The review dialog: `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx`, opened from the Review board
  (`surfaces/Review.tsx`). Its existing tests: `v2/__tests__/reviewDecisionBinding.test.tsx`,
  `reviewDecisionCsrEvidence.test.tsx`.
- The section number shown to a reader: `shared/regulatory/section-code.ts` `sectionNumberLabel` (also used by the
  editor, `editor/DocumentWorkbench.tsx`). The `<number>:work:<n>` codes come from
  `server/services/authoring/ind-template-outlines-m1.ts` and `ind-template-outlines-m4-m5.ts`.
- Nothing was built new. No route, screen, table or mount was added.

## What was hidden, unreached or wrong

- **B1, the cause (proven, not the RLS hypothesis).** Drizzle's node-postgres driver asks pg to return a timestamptz
  as PostgreSQL's raw text ("2026-11-10 11:30:01.754+00"). The chain writer hashed a Date
  ("2026-11-10T11:30:01.754Z"). So on the placement's Drizzle transaction every chained ledger row re-derived as
  `broken`. On freeze's pg client the same row was `linked`. Freeze accepted; placement refused.
  - `cause-occurred-at.txt`: row 2718 of the frozen 2.4 on gademo is `linked` read as a Date and `BROKEN` read as text.
  - `gademo-release-before-after.txt`: the real rule on the real 2.4, through a Drizzle transaction as app_service
    with RLS on (read only, rolled back). Trunk code: refused 409 INDEPENDENT_CHECK_REQUIRED. Lane code: accepted.
- **B1, the words.** The ledger's `catch { return independentRefused(); }` turned every failure, including a read
  that never ran, into "Independent checks … are missing". The author was told to run checks.
- **B1, the dialog.** "Independent checks (optional)" stood beside a placement that then demanded them.
- **rB-F13.** Section headings showed the stored key "1.14.4.1:work:3", in the dialog and in each finding.
- **Why no test caught B1.** The PGlite request clients (`tests/golden-journeys/harness.ts` `makeRequestDbClient`,
  `server/routes/__tests__/_coauthor-current-source-fixture.ts` `snapshotRequestClient`) drop the driver's `types`
  option, so they return a Date where PostgreSQL returns text.

## What changed

- `workflow-import-governance.ts`:
  - the ledger reads `occurred_at` as the ISO text the writer hashed:
    `to_char(a.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`. The same text on every executor.
  - `ledgerReadRefused`: a refusal of what the ledger says stays 409 INDEPENDENT_CHECK_REQUIRED. A ledger that could
    not be read answers **503 INDEPENDENT_CHECK_LEDGER_UNREADABLE**: "The document's audit record could not be read,
    so whether it needs independent checks could not be confirmed. Nothing was released. Try again; if it persists,
    contact an administrator."
  - The independent-check rule is not weakened: a row that does not re-derive is still refused 409 (test 4).
- `section-code.ts`: `sectionNumberLabel("1.14.4.1:work:3")` is "1.14.4.1"; a named code with a suffix shows nothing.
- `ReviewDecisionDialog.tsx`: section headings and finding labels are "number · title" in words, "Untitled section"
  when neither exists. With no checks required, the step reads "Independent checks" and then "Not required for this
  document." (Repair V-W1-1: the author's second sentence, "They are required when AnA drafted any of its text", was
  not the rule. The rule also requires checks for a document built from statistical results
  (`authoring-from-draft.ts`), and an AnA edit alone does not. The dialog now states only what the server answered.) Nothing that was shown was removed: the step, its
  standing line, "Run independent checks" and the findings are all still there.
- `coauthor-snapshot.ts`: unchanged. It already passes the rule's status through (`refuse(error.status, …)`), so the
  503 reaches the person as it is.

## Proof

| Row | Before | After | Test | Screenshot |
|---|---|---|---|---|
| B1 placement | 409 INDEPENDENT_CHECK_REQUIRED (`red-placement.txt`; the diagnostic line shows `broken`, occurred_at a string) | 201, the copy carries the text | `server/services/coauthor/__tests__/coauthor-snapshot-frozen-ledger.pglite.test.ts` "places a frozen, sealed document…" | `shots/before-placed-refused.png` (rehearsal); after: needs the 5240 restart (rewalk) |
| B1 real data | refused 409 on the frozen 2.4 | accepted | `gademo-release-before-after.txt` | — |
| B1 unreadable ledger | 409 "checks missing" | 503 in words, nothing written | same file, "a ledger that cannot be read…" | — |
| B1 rule holds | 409 | 409 | same file, "a chained row that no longer derives…" | — |
| B1 dialog | "Independent checks (optional)" | "Independent checks" + "Not required for this document." (and never that line when checks are required) | `client/src/concept2cure/v2/surfaces/__tests__/reviewDecisionWords.test.tsx` | `shots/after-review-dialog-checks-1440.png`, `-390.png` |
| rB-F13 | "1.14.4.1:work:3 · …" | "1.14.4.1 · Title page with product identifier…" | same file; `shared/regulatory/__tests__/section-code.test.ts` (new case) | `shots/before-review-dialog-keys.png`; `shots/after-review-dialog-1440.png`, `-390.png` |

- Red first: `red-placement.txt`, `red-words.txt`. Green: `green-placement.txt` (4/4), `green-words.txt` (31/31).
- Mutations: `mutations.txt`, 7 of 7 caught, every file restored to its fresh sha256.
- Repair after the verifier (V-W1-1 to V-W1-4), `mutations-repair.txt` (driver `mutate-repair.py.txt`), 4 of 4 caught,
  each file restored to its fresh sha256:
  - V2, the ledger SQL without `AT TIME ZONE 'UTC'`: caught, because the placement test now runs its session in
    America/New_York (before, PGlite's UTC session hid it).
  - V6, "Not required" shown when checks are required: caught by the finding test.
  - V7, no "Untitled section" fallback: caught by a new test with a named code and no title.
  - V1, the old wrong rule sentence put back: caught.
  - Green after the repair: `green-repair.txt` (words, binding, section-code: 36/36; placement 4/4).
- Every test importing a changed module: `importers.txt`, 9 files 169/169 and 17 files 357/357.
- Running app (5240, client served live from this tree): rhea opened the Review board and the decision for
  "1.14.4.1 · Investigator's Brochure" at 1440 × 900 and 390 × 844. No `:work:` key anywhere, no HTTP error, no
  console error, no horizontal overflow (`walk-review-dialog.txt`). Walked again after the repair
  (`walk-review-dialog-repair.txt`): the step reads "Independent checks", then "Not required for this document."; the
  four `after-` screenshots were retaken. The one "(optional)" left in the dialog is "Note for the thread (optional)",
  which is true.
- Lint: no warnings or errors in the lane's six files. No file over 100,000 bytes (largest 36,066). No class names
  added (`ci:undefined-css-classes` OK).
- Typecheck, scoped, 4096 MB: the client set (the dialog, `Review.tsx`, the three dialog tests) has no error in those
  files; the shared set (`section-code.ts` and its test) has none. The server set (`workflow-import-governance.ts`
  alone, then with `coauthor-snapshot.ts`, the route and the new test) ran out of heap at 4096 MB or was killed by
  the shared machine's memory, every attempt. **Not completed: the lead runs it.** No exported signature changed.

## Not done here

- **The placement seen in the running app.** 5240 serves the server code it booted with; this lane may not restart it.
  Proven at the HTTP layer and on gademo's own rows instead. The lead's rewalk is below.
- **The request clients that hid B1** (`tests/golden-journeys/harness.ts`,
  `server/routes/__tests__/_coauthor-current-source-fixture.ts`): not this lane's files. They should honour the
  driver's `types` option, as `pgFaithfulRequestClient` in the new test does. Whoever holds the harness.
- **`server/services/audit/chain-row.ts` `verifySequencedRow`** has the same exposure for any other caller that hands
  it a Drizzle executor (for example the report seal, `report-os/sealing/run-seal.ts`, if it does). It could normalise
  a string `occurred_at` itself. Not this lane's file; the audit-chain holder.
- **"What the organisation's review policy requires" (P-116/P-117).** The dialog now says what the server answers for
  the document. Showing the organisation's `independentReviewersRequired` would need the review context
  (`server/services/authoring/peer-review.ts`) to carry it. Not this lane's file. P-117 is about reviewer counts, not
  the independent checks, so nothing on screen claims it.

## Rewalk (after 5240 restarts on this tree)

1. As ana, open the frozen "Nonclinical Overview (2.4)" in its project's editor and press Place into filing, sequence
   0000 of the C2C-101 IND. Expected: placed, no "Independent checks … missing".
2. Submission Center, that sequence: the 2.4 is listed as a leaf.
3. As rhea, Review, "Record review decision" on "1.14.4.1 · Investigator's Brochure": headings "1.14.4.1 · …", the
   checks step "Not required for this document." (already visible on 5240 today).

## Questions for the founder

- None.
