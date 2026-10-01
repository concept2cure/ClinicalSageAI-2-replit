# A document's review record, as a copy an inspector can take

Launch row **D5**, 2026-10-01. Slice 4 of the AnA record work: the founder
asked for records that are immutable **and reportable to the FDA**.
21 CFR Part 11 §11.10(b) asks for *"accurate and complete copies of records in
both human readable and electronic form suitable for inspection, review, and
copying by the agency"*.

## What was wrong

Since slice 3 (`../2026-10-01-review-comments/`):

- a review-thread comment is fixed once posted;
- a retraction is recorded;
- every comment and retraction commits with its chained `audit_logs` row.

An inspector could reach none of it as a record of one document. The rows
appeared only inside the organisation's whole audit-trail export, as raw
chained rows. There was no copy of one artifact's review that showed:

- every thread;
- every comment, retracted ones included, with who retracted it and why;
- whether each still matches what was chained when it was posted.

The authoring trail and the AnA turn record each had such an export. The
Review surface, a launch surface, had none.

## What changed

**`server/routes/c2c/review-record-export.ts`** (new) is the route
`GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-record/export`.

The package holds:

- the artifact;
- every thread, with its status, who opened it and who resolved it;
- every comment, oldest first: words, kind, author, the name and role it was
  posted under, and `origin` (`ana` when AnA wrote it on the person's behalf);
- each comment's retraction: when, by whom, and the reason given.

For each comment it also carries:

- its chained posting and retraction rows;
- a verdict:
  - `intact`: the comment matches its chained rows;
  - `mismatch`, with the `fields` that differ: the row was changed after it
    was chained, past the triggers that refuse that;
  - `not_chained`: posted before comments were chained, so its words are as
    stored with nothing to check them against.

It ends with a summary, the tenant chain walked at export time, and the steps
to check it all offline.

**Reused, not rebuilt.**

- `sendAuditedExport` records the export on the chain (`review.record.exported`:
  who, which artifact, counts, verdict totals) **before** anything leaves. When
  that row cannot be written it answers 503 and sends nothing.
- `walkTenantChain` is the same walk, with the same redaction of other
  organisations' rows.
- The route reads on the request's own connection (`requestPgClient`), under RLS.

**Who may take it.** The audit readers: owners, admins, managers and platform
administrators, through the DP-18 gate (`requireAuditReader`), checked before
anything is read. Then the project's access check, then the artifact within
the organisation.

**The Review surface** (`ReviewThreads.tsx`) gains **Export review record** on
a selected thread.

- **Who sees it.** It is shown only when the server's queue says
  `canExportRecord`, which is computed by the same reader check the route
  enforces.
- **On success** it downloads exactly what the server sent, through
  `apiRequest` and `downloadBlob` as the authoring export does.
- **On refusal** it reports the refusal in the server's words, never as a
  download.

## Shown

`tests/db/review-record-export.dbtest.ts` runs on PostgreSQL 16.13, on a
database built by install-fresh + deploy-migrate. It goes through the real
router behind `authenticateToken`, with RLS enforcing. The comments and their
retraction are posted through the API, as a reviewer would.

| Case | HEAD (`red/`) | This change (`green/`) |
|---|---|---|
| An audit reader takes the record: the thread, three comments in order, the retraction with who and why, each `intact` | 404 | green |
| From the package alone, each comment's sha256, author and retraction match its chained rows | — | green |
| The export is itself a chained row: who, which artifact, what it said | none | green |
| A comment rewritten past the triggers: `mismatch`, `fields: ['body']`, only that one | — | green |
| A comment with no chained row: `not_chained`, never `intact` | — | green |
| A retraction the row shows and the chain does not: `mismatch`, `fields: ['retraction']` | — | green |
| The queue offers the export to an admin and not to a member | `undefined` | green |
| A member is refused (DP-18) | 404 (no route) | 403 |
| Another organisation's administrator | 404 (control) | 404 |
| The export cannot be recorded: 503, and none of the record's words leave | 404 | green |

HEAD: **9 failed, 1 passed** (`red/dbtest-at-head.txt`). This change: **10/10**
(`green/dbtest.txt`, run together with the slice-3 suite: 20/20).

**The control** (`client/src/concept2cure/v2/__tests__/reviewRecordExport.test.tsx`, 3/3; `green/client.txt`):

- it downloads from the artifact's export path and says the export is recorded;
- a 503 is reported in the server's words, and nothing is downloaded;
- a thread with no document offers no export.

**Mutations** (`mutations.txt`). Each was applied, run, seen red, and restored:

| # | Mutation | Red |
|---|---|---|
| e1 | The words not compared | the rewritten comment |
| e2 | A retraction on the row but not the chain not looked at | that case |
| e3 | An unchained comment counted as intact | the not-chained case |
| e4 | No reader gate on the route | the member case |
| e5 | The package sent without being recorded | the three reader cases and the 503 case |
| e6 | A retraction without who and why | the first case |
| e7 | The export offered to every role | the queue case |
| e8 | The client saves whatever came back | the refusal case |

**Also run on the final tree** (2026-10-01, ~16:40 UTC). Every step of CI's
lint job was run.

- The route gates pass for this change: requestDb coverage (it names one other
  file), the route mounts, the ownership matrix and the orphaned-endpoint
  threshold.
- Seven steps fail on trunk itself, from other lanes' commits of the same
  afternoon, none touching these files:
  - `ci:unbacked-tables`: `EXTRACT(… FROM last_seen_at)` in
    `session-inactivity.ts`;
  - `ci:compose-boot-contract`: the preflight's new `DB_AUDIT_REQUIRED` and
    `MCP_*` are not in the Compose files;
  - `ci:requestdb-coverage`: `governed-signed-act.ts`;
  - `ci:ana-surface-context`: `conversation-thread`;
  - the unkeyed-table baseline is stale;
  - `ci:pdf-runtime-canonicality`;
  - one proof-tier contract on `deploy-frontend`.
- The whole real-database tier, on this session's database, failed in
  20 files. Every failure checked reads `relation
  "organization_retention_settings" does not exist`: trunk's newest
  migrations were not on that database. Both review suites passed in it
  (20/20).
- The ESLint ratchet is unchanged. The Review pane did not grow (248 lines
  against 244): the export is its own component.

## Not done, and why

- **The export is a JSON package, not a sealed one.** It carries every chained
  link it relies on and the tenant chain verdict. The cryptographic seal is
  the signed audit-trail export's (`GET /api/audit/export/signed`), which
  holds the same rows. This matches the authoring and turn-record exports.
- **No human-readable rendering yet.** §11.10(b) asks for human-readable form
  as well. The JSON is readable, but a PDF rendering for an inspector is a
  separate item, shared by all three record exports.
- **One artifact at a time.** A project-wide review record is not built.
