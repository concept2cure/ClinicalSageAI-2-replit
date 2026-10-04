# Comments, quotes and AI-suggestion decisions are an immutable, attributable, exportable record

Launch row **D5** (Part 11 evidence), slice 2 of the AnA record work. Slice 1,
every AnA turn as a retained record, is `../2026-09-26/`.

The question this slice answers: if an inspector asks who commented on what
passage, which AI suggestion a reviewer accepted, and why, can the product
show them something they can check without trusting the product? Before it,
the answer was partly no. The authoring trail existed but could be edited. It
recorded comments as made by "System". It kept the first 20 changes of an
"Accept all", cut to 200 characters each. It recorded a reason nobody gave
("Legacy audit event", "Investigator registered via AnA").

## What changed

The canonical record is the existing authoring trail (`authoring_audit_trail`)
and its hash-chained row in `audit_logs`. It was hardened, not duplicated.

- **Immutable.**
  - `authoring_audit_trail` is append-only (BEFORE UPDATE/DELETE and TRUNCATE
    triggers).
  - `authoring_comments` refuses any change to a comment's words, quoted
    passage (`anchor`), author, thread or placement. Status and resolution stay
    changeable, and a change made through the app is recorded.
  - Both were amended in place into their creating migrations with dated notes
    (CLAUDE.md Rule 1), and the boot/sweep trigger registry names them.
- **Attributable.**
  - Every trail row carries `actor_id`.
  - Its chained row carries the trail row's id, a canonical hash of its
    metadata, the actor's email and the person's stated reason
    (`audit_logs.reason`). A reason is never invented.
  - Comment create, resolve and reopen record the real actor. A comment
    records its quoted passage and that passage's hash, plus the hash of the
    section text it was made against.
  - A tracked-change decision records the whole proposed text and its hash,
    and who proposed it. It names the AnA turn record the text came from,
    verified in the tenant.
  - "Accept all" records every change.
  - The six acts the router's legacy wrapper wrote as "System" now name their
    actor: review, export-history delete, export, submit, sign, reorder.
- **Atomic.** A comment, a decision and an AI-draft accept commit together with
  their record, or none of them do.
- **Reportable.**
  - `GET /api/authoring/docs/:id/audit` returns a verdict per row, recomputed
    from the stored row against its chain entry.
  - `GET /api/authoring/docs/:id/audit/export` is a self-contained package an
    inspector can check offline. It is recorded on the chain before anything is
    sent, and refused (503, nothing sent) when that row cannot be written.
  - The editor's audit rail says when a row no longer matches its chained
    record, and downloads the package.
- **AnA does not invent a reason.** 93 governed AnA tools record their reason
  in the ledger. Without the person's reason, AnA asks for it before proposing
  the write. A handler reached without one refuses before opening a
  connection.

Commits on `concept2cure-v2`:

| Commit | Change |
|---|---|
| `7863cf830` | Core: triggers, chain details, comments, decisions, draft accept, export |
| `af58f6ae5` | Merged onto trunk's SEC-A-2 / SEC-A-7 fixes |
| `73978b83e` | Export test split for the lint ratchet |
| `0265be3cd` | Legacy wrapper removed; standalone actor; unknown document 404; IND journey repaired |
| `308bae438` | Editor: integrity note, download, turn record on suggestions, two editor defects |
| `ca8bb65e0` | AnA reason gate |
| the commit carrying this file | 404 for a malformed document id; trigger messages read "changed"/"deleted"; this evidence |

## Shown on the running system

A real server (`npx tsx server/index.ts`, at the merged commit) ran on
Postgres 16. `scripts/db/deploy-migrate.mjs` ran twice first; both runs passed,
the second being a clean replay of the amended migrations. Real auth, a real
project, document and sections, and a real AnA turn record from slice 1.
No model was needed: every act here is a person's.

Script: `live/run_live_authoring.py`. Output: `live/live-run.txt`.

| § | Case | Result |
|---|---|---|
| 2 | A comment naming another document | 400, nothing saved |
| 2 | A comment on a quoted passage, a reply, resolve, reopen | 201/201/200/200. Filed under the section's own document |
| 2 | A reply filed on another section | 400, nothing saved |
| 3 | Accept one AnA suggestion (1,200 characters, with a reason) | 200. The whole text is recorded, and the turn record reads `verified: true` |
| 3 | Reject 25 in one act, half naming a real turn | 200. 25 changes recorded with full text, 13 of 25 turns verified. The other 12 named `not-a-record` and are recorded as unverified |
| 3 | A section not in the document / a document not in the organization | 400 `SECTION_NOT_IN_DOCUMENT` / 404 |
| 3b | A review requesting changes, and a reorder | Both name the actor. The review's comments are its reason; the reorder has none |
| 4 | The trail with verdicts | 10 rows, each `chained: true, intact: true` |
| 5 | The chain rows | Every row names actor 2. Reasons appear only where one was stated. 0 rows without an actor, 0 with "Legacy audit event" |
| 6 | Export, then `live/verify-authoring-export.mjs` (Node's crypto and the file, no product code) | 200, recorded on the chain first. PASS on 10 of 10 events. Tenant chain ok |
| 7 | As the database owner: change a comment's words or quote; update, delete or truncate the trail | All refused with `IMMUTABILITY_VIOLATION`. A status change is allowed (status is current state) |
| 8 | Owner disables the trigger and rewrites a quoted passage | The API verdict for that row is `intact: false, mismatches: ["metadata"]`. The offline verifier on a new export FAILs that row (`metadata`, `quote hash`) and exits 1 |
| 9 | Boot/sweep trigger check; `npm run ops:verify-audit-chain` | 24/24 present and enabled. Verdict OK |

§8 is the case the design exists for. A person who can disable a trigger can
rewrite a row, but not its chained entry. The rewrite is then visible to the
product and to an inspector holding only the file.

## Tests

`tests.txt` lists 331 tests in 29 files, all passing. They include:

- `server/routes/__tests__/`:
  - `authoring-record-comments`, `-decisions`, `-export`,
    `authoring-draft-accept-record`, `authoring-record-attribution`: the real
    router over HTTP with real JWTs on PGlite. A wrapped pool records which
    executor and transaction each statement used.
  - `authoringTrackedChangeDecisions`, `authoringAiDraftAccept`.
- `server/services/audit/`: the trigger registry against the real catalog, and
  its drift guards.
- `server/services/ana/__tests__/governed-reason-not-invented.test.ts`. Four
  handler shapes, plus a TypeScript syntax-tree scan of `AnaToolExecutor.ts`:
  - every `recordGovernedAction` reason is a variable resolved before the
    connection;
  - every tool that records one is in `REASON_REQUIRED_TOOLS`.
- Client tests: `suggestionSourceRecord`, `documentWorkbenchDecisionPayload`,
  `auditRailIntegrity`.
- `tests/golden-journeys/ind-authoring.journey.test.ts`. Its private
  `audit_logs` lacked the `reason` column production has, and it went red with
  `7863cf830`. It is green again with `0265be3cd`.

Also run: `client/src/concept2cure` (444 files, 4843 tests) and
`server/services/ana` (263 files, 3735 tests), all passing. `tsc` reports 0
errors. The ESLint ratchet shows no file gaining a warning.

`mutations.txt`: 32 guards, each removed and seen RED, then restored.

## Found by this work and fixed here

- A person typing at the end of a pending AnA draft had their words merged
  into AnA's suggestion. A decision on it was then recorded as text that
  turn wrote (`InsertionMark` did not exclude itself).
- Identical text from two AnA turns in one minute shared a change id, so one
  verdict overwrote the other.
- A tracked-change decision on a document the tenant does not have was
  upserted, trailed and chained.
- The standalone audit path named the actor by email. `Number(email)` is
  `NaN`, so the row had no actor.
- `revise_qms_document` named a constant the reason change removed. The
  completeness scan also found it missing from the gate.
- A malformed document id answered 500 on the audit read and export. It is
  now 404.
- The record download in `AnaActivity` duplicated the canonical `downloadBlob`
  and revoked its URL synchronously, which saves zero bytes in Safari and
  Firefox.
- `fetchDocumentAttribution` accepted a 200 with no summary, and the editor
  then blanked.

## Not done, and why

- **P0-8 hand-on.** `APPEND_ONLY_TABLES` (the privilege backstop) should name
  `ana_turn_records`, `ana_record_blobs` and `authoring_audit_trail`. It
  belongs to the P0-8 lane.
- **Founder decisions.**
  - Retention and erasure of turn records (they are append-only).
  - The parallel `concept2cure_thread_comments` store: comments there are not
    on this record.
- **Status and resolution columns.** An owner can still change a comment's
  status in SQL without a trail row. The trail records every change made
  through the app; the columns hold current state, not the record.
- **Red on trunk, not this change.**
  - `tests/golden-journeys/haq-correction.journey.test.ts` (`action_state`
    'clinical' vs 'regulatory'), before and after this work.
  - `server/routes/__tests__/auth-refresh-session-currency.test.ts` (seen
    2026-09-26).
  - Seen 2026-09-29, the same on `origin/concept2cure-v2` without this work:
    `CrossReferenceMapping.no-fabricated-content` (6), `conversation-os` (3),
    `mdx-imports-routes` (2), `export-governance-fail-closed` (1),
    `document-consequence` (4).

## Review, 2026-09-29

The four review lenses that could not run on 2026-09-26 ran now. Each
finding was verified, fixed, and pinned by a test shown red with the fix
reverted.

| Finding | Fix | Commit |
|---|---|---|
| Restoring the browser's unsaved draft, or seeding a live-collaboration document, with track changes on recorded the whole section as the current person's insertion. Insertion marks exclude each other, so it also took AnA's authorship, and turn record, from pending suggestions. | `setContentUntracked` replaces content as it is; all three call sites use it (`untrackedContentReplace.test.ts`). | `e06e01963` |
| DP-42: any member of the organization could read and export a document's trail. The object authorization middleware passes every GET. | Reading needs `view` on the document and exporting needs `export`, or an organization audit reader (owner/admin/manager). The rail says "No access" on a 403, and an export over 10,000 rows says `truncated`. | `f2134ea6d` |
| DP-43: authorId `constructor` passed as a machine author. Any caller's `authorId: 'ana'` read as a verified AnA proposal. The session id came from a client header. | `Object.hasOwn`. A proposal is verified only with a turn record of the organization. The session id is the token's `sid`. | `f2134ea6d` |
| DP-44: an export's chain-break detail could name another organization's row. | `breakForTenant`: only this organization's rows are named. | `f2134ea6d` |
| DP-31: `commit_document_revision` wrote the stock reason `AnA revised "<title>"`. Four QMS and fact tools had no floor or a 3-character one. The guard scanned one file. Submit passed "Submitted for review by <email>". | Five tools join the gate (98). The rule lives once, in `stated-reason-input.ts`. The guard reads every handler module. Submit takes the submitter's optional stated reason, and without one the canonical bridge does not mirror. | `8767b89b1` |
| The reason recorded for a governed AnA write was the model's. The card could drop or truncate it, and the route ran the model's params. | A tool that records a reason is held at the reason tier. The card shows AnA's wording whole beside an empty field, with "Use AnA's wording". The route runs the tool with the person's reason and audits the proposal and whether it was adopted. | `c7691741a` |

Other results of the review:
- Security gates: all green except `ci:tenant-entry-points`, which is red on
  other lanes' files (`retentionCron.ts`, `mdx-admin.ts`).
- Migration replay: `deploy-migrate` ran twice on the live database, both
  clean.
- Regressions: `server/routes` 3,461 pass. `client/src/concept2cure` 4,883
  pass. AnA suites 4,135 pass.

Open, not this lane's:
- `execute_platform_command` task events record "Task created by AnA …" as
  the reason (`command-executor.ts` ~1162, ~1441). The tasking HTTP routes
  use `defaultReason` the same way, so this is a product decision.
