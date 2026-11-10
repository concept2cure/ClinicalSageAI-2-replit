# Study-safe Data Room capture and source lineage

Plan: **F1**. Launch workstream **W1**, row **D2**. Existing capability completed:
`server/services/clinical-regulatory-evidence/evidence-spine.service.ts` and the
capture decision in `server/routes/chat/upload.ts`.

This work starts from canonical commit `f9631c065af8760d8b879232385fb94663d19a24`
in the fresh 2026-11-08 checkout. Results from the missing earlier workspace are
not verification of these files. The lead owns Git, dependency installation,
the full compiler, integration and publication.

## What already exists

| Existing path | Current behavior | Limit relevant to this repair |
| --- | --- | --- |
| `server/routes/chat/upload.ts` | Stores the exact uploaded bytes and their SHA-256, resolves the admitted project id-space, creates or resolves one Data Room source, then runs the bound processor. | Checks checksum and same-filename predecessor separately from the capture transaction and before study matching. A failed predecessor query is silently treated as no predecessor. |
| `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` | `createSource` commits capture and audit together. `createSupersedingSource` retires exactly one current predecessor and commits its successor plus audits atomically. `findSupersededCandidate` refuses multiple filename matches. | Filename candidate filtering lacks study identity. `findSourceByChecksum` is intentionally historical and can resolve a retired row; it does not reserve the initial capture decision. |
| `server/services/clinical-regulatory-evidence/catalog-facts.ts` | Extracts labelled protocol/registry facts and `matchStudy` accepts exactly one numeric `cdisc_prm_studies.id` in the same organization and program. | The upload invokes its study matching later through processing, after a predecessor could already have been retired. The string `study_id` is a matching key, not the numeric FK. |
| `server/services/clinical-regulatory-evidence/data-room-processing.ts` | Verifies stored upload bindings and fills derived catalog facts, including `study_ref`, after capture; ambiguous study candidates are retained without selecting one. | Later processing cannot reverse an incorrect immutable predecessor link. |
| `server/services/chat-uploads/capture-scope.ts` | Maps a legacy numeric project to a program only when one live anchor exists; otherwise retains its legacy scope. | A numeric coincidence is not a study identity or a program admission. |
| `server/services/c2c/current-program-access.ts`, `server/services/report-os/project-access.ts` | Verify current organization membership, unique program anchor and private-project sharing. The write policy is distinct from read admission. | These existing policies must still govern capture when the write is serialized. |
| `server/services/document-data-disposition/program-lock.ts` | Reserves a canonical organization/program using a transaction advisory lock with a bounded lock timeout. | Chat capture does not use it, while adoption and withdrawal already do. |
| `server/routes/c2c/projects.ts` (`POST /:id/adopt`) | Takes the program disposition lock, rechecks authority, verifies original bytes, reads historical checksum identity, and creates/audits in one transaction. | Historical checksum reuse is an intentional adoption contract, retained by this repair. It already serializes with the lock chat capture will use. |
| `server/services/ana/uploaded-file-access.ts` | Authoring image and derived spreadsheet uploads already use the program disposition lock and preserve explicit derivation lineage. | They are distinct authored/derived records; this repair does not infer filename supersession for them. |
| `migrations/20260829_cre_source_versioning.sql` | Stores `previous_version_id`, currentness and a unique successor per predecessor. | It cannot decide whether two studies' same-named documents are revisions. |
| `migrations/20261001_cre_evidence_sources_capture_immutability.sql` | Protects captured bytes, original uploader, parent scope and predecessor; retired rows cannot become current again. | Minting a fresh current identity for retired bytes would evade that row-level protection. |
| `migrations/20261008d_cre_source_study_ref.sql` | Numeric `study_ref`, with a same-organization study FK. | The application must also enforce same-project and unambiguous study matching. No schema addition is needed. |
| `server/services/clinical-regulatory-evidence/source-usage.service.ts`, `server/services/vault/vault-data-room-filing.ts` | Citations expose supersession and the Vault filing path refuses obsolete sources. | Incorrect retirement contaminates these downstream decisions even when the source checksum is immutable. |
| Existing `source-versioning.pglite.integration.test.ts`, `canonical-source-identity.pglite.integration.test.ts`, `source-checksum-executor.test.ts`, route upload suites and native `data-room-*.dbtest.ts` | Exercise real SQL, immutable version chains, historical checksum semantics, capture audit, storage and catalog facts. | The current baseline lacks a study-specific filename regression and concurrent initial chat-capture proof. |
| `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`, `Surfaces.tsx`, `EctdCoauthor.tsx`, `ConversationFilesAdopt.tsx` | Reach the existing `/api/chat/upload` or project adoption endpoint. | No additional UI, route, mount, table or service is required. |

### Searches before editing

Read root `AGENTS.md`, `CLAUDE.md`, `.ai-instructions.md`, the coordination
record and the F1 plan-ledger entry. No deeper instruction file was found under
`server`, `docs` or `.design`. Searched source/caller/schema/tests for
`findSourceByChecksum`, `findSupersededCandidate`, `createSupersedingSource`,
`capture`, `study_ref`, `matchStudy`, `chat/upload`, `/adopt`, `sourceId` and
transaction/advisory/tenant-scope primitives, including the AnA derived-upload
writer and the existing client callers.

`git rev-parse --is-shallow-repository` returned `false`. Bounded deletion
history (`git log --all --diff-filter=D --format='%h %s' --name-only -20 --
'*evidence-spine*' '*source-version*' '*capture*' '*catalog-facts*'
'*chat/upload*'`) found only unrelated retired gstack capture tooling in
`7df89f4f7`; no alternate deleted Data Room capture writer was found.

## Repair contract

1. Determine the source's study before any automatic predecessor decision.
2. Automatically supersede only one current source of the same organization,
   exact project scope, source type, title and positively matched numeric study.
   Unmatched or ambiguous study context never retires a source.
3. Serialize identity lookup and capture with the existing program disposition
   reservation; keep create/audit/retirement in one transaction.
4. Preserve immutable original bytes and capture provenance. Retired or
   withdrawn bytes cannot become a new current capture through re-upload.
5. Preserve current actor and project write admission, rechecking after waits.
   Database/admission errors refuse capture, not silently widen its scope.

## Verification

The initial regressions failed on this checkout before the repair: five
study-specific predecessor cases in `01-red-study-candidates.log`, and two
multiple-protocol cases in `02-red-protocol-ambiguity.log`. These are actual
baseline failures, not reconstructed results from an earlier workspace.

| Current-code run | Result | Evidence |
| --- | --- | --- |
| `source-capture-study.pglite.integration.test.ts`, `catalog-facts.test.ts`, `source-checksum-executor.test.ts` | 31 passed in 3 files | `06-final-capture-scope.log` |
| `source-versioning.pglite.integration.test.ts`, `canonical-source-identity.pglite.integration.test.ts`, three server chat upload suites, three route chat upload suites | 121 passed in 8 files | `05-route-and-source-regressions.log` |
| `source-capture-study-concurrency.dbtest.ts`, `data-room-capture-provenance.dbtest.ts` | 10 passed in 2 native PostgreSQL files (5 independent-session capture cases and 5 existing capture/audit cases) | `07-native-capture-and-qms.log`; this combined lead-owned run also includes 7 QMS tests, counted separately |

The completed final runs cover **162 distinct source and route tests**. Earlier green runs
in logs 03 and 04 overlap and are not counted again. Focused tests run with the
installed Node 22 runtime, `vitest run --config vitest.config.ts`, the exact
files listed above, `--no-file-parallelism --maxWorkers=1 --reporter=verbose`.

The capture tests exercise real PGlite SQL, versioning and immutable capture
constraints; they verify audit rollback through the existing audit-writer
seam. They do not prove independent-connection concurrency, forced PostgreSQL
RLS, or the real chained audit writer. The native suite specifically covers
those remaining boundaries using independent `app_service` sessions, existing
native catalog fixtures and the production advisory reservation. It does not
disable immutability or audit triggers for cleanup. The lead ran native tests
sequentially through the isolated PostgreSQL wrapper. Its first setup attempt
failed with PostgreSQL `42P08` (one name/code parameter inferred as both text
and varchar), so no source assertion passed in that attempt. The recorded
green rerun follows the fixture correction to separate placeholders.

The native environment had no embedding provider. The upload remained durably
captured and its provenance/audit assertions passed; retrieval-vector success
is not claimed.

## Implemented behavior and limits

Capture now reserves the existing program disposition lock and makes current
actor admission, original-upload verification, conservative study matching,
checksum resolution, predecessor selection and audit-backed creation one
transaction. It repeats admission and study checks after awaited writes. A
lost commit acknowledgement produces a recoverable unconfirmed result with
the candidate source ID; it does not report a rollback or begin processing.

All distinct labelled protocol numbers are considered. A multi-study upload,
including one recognized protocol and one unknown protocol, remains a current
independent capture without retiring a same-named source. When two studies
have the same filename, a uniquely matched revision retires only its own
study's one current predecessor. Multiple same-study candidates are also
left unresolved. The route uses this capture facade before any downstream
Data Room processing or retrieval indexing.

Historical checksum lookup remains available to its existing callers. Only
the capture mode adds exact study identity, current data/binary eligibility
and retained-row guards. The original byte binding, uploader and capture
provenance remain unchanged when a current source is reused. Retired,
withdrawn or retained deleted bytes cannot acquire a fresh current identity
through this upload path.

No schema, public route, UI, source identifier convention or new production
file was introduced. The lead still owns the full compiler, required
`scripts/ai/verify-tests.sh` integration gate, build and publication. This
record does not claim running-app acceptance or deployment.


## Follow-up: pre-push SQL and lint repair

The integrated pre-push check found five additional counted SQL interpolations
in the evidence service and one in the statistical writer. It also found new
complexity/size warnings in the validation paths and test grouping. This repair
responds to those recorded failures; it does not treat the earlier successful
focused tests as a successful pre-push gate.

Source retirement now uses bound scope predicates. Parent admission chooses
between two literal statements for the unlocked/locked read. Capture checksum
lookup has a fixed statement with bound optional-scope switches and continues
to reuse the canonical data/binary eligibility predicates. The historical
checksum lookup retains its former query shape, visibility, argument order and
caller-transaction behavior. Three existing list queries now bind their clamped
limit independently of optional source/study/finding filters. Source admission,
reservation, byte checks and study-aware creation were extracted into private
helpers in the same existing service; their query and transaction order remain
unchanged.

Validation after this follow-up:

- `08-gate-repair-server-regressions.log`: **77 passed in 8 files**, exit 0,
  covering capture, supersession, historical checksum lookup, source lists,
  CSR/CRL ingestion, statistical source snapshots and document generation.
- `09-gate-repair-lint.log`: all 13 scoped files checked; no new warnings.
  The remaining warnings are the existing 1 in `authoringHandoff.ts`, 4 in
  `Biostatistics.tsx`, and 5 in the evidence service.
- `10-gate-repair-sql.log`: full SQL interpolation scanner passed. Evidence
  service remains at **27** counted interpolations; statistical writer has **0**.
  This lane changed no gate or baseline.

The added bound-list regression is in the existing
`server/services/clinical-regulatory-evidence/__tests__/evidence-spine.pglite.integration.test.ts`.
It exercises all three changed list queries with optional filters and explicit
or lower-clamped limits against actual PGlite SQL. The native concurrency test
only lost an unused initial assignment; its wait observation and assertions
remain intact. The lead reran the native PostgreSQL suites after this cleanup:
**15 passed in 3 files**, exit 0, comprising capture concurrency (5), capture
provenance (5), and Biostatistics authoring basis (5). See
`../2026-11-08-cross-module-data-flow/native-source-biostat-after-sql.log`.
The lead owns the remaining full integration gates.


## Follow-up: canonical program ownership reservation

The next full pre-push run stopped at the single-source program ownership gate:
the capture path's explicit program row lock repeated the ownership SQL. The
canonical `programInOrganization` already supports `forShare`; current actor
admission did not pass that option through to its own program check, so simply
removing the capture lock would have weakened the reservation.

The evidence service now calls the existing canonical helper on the same
transaction with `{ forShare: true }`. The call remains after project locking
and before project visibility locking, inside the existing program advisory
reservation and post-wait actor admission. A false result refuses with
`404 PROJECT_NOT_FOUND`; a canonical verification-unavailable error becomes
`503 PROJECT_ACCESS_UNAVAILABLE`. No canonical helper, gate or baseline was
changed, and no alternate ownership SQL was introduced.

Two regression cases were added to the existing capture PGlite suite:

1. A program made unavailable at the locked ownership read must refuse before
   any source insert. The earlier implementation ignored the empty locked read
   and reached insertion before its final admission eventually rolled back.
2. A failed locked ownership lookup must report unavailable verification
   separately from absence, while leaving no captured source.

Evidence:

- `11-red-program-reservation.log`: both new cases failed before the production
  repair; the other 22 capture cases were intentionally skipped by the filter.
- `12-program-reservation-regressions.log`: **78 passed in 4 files**, exit 0:
  capture, source versioning, historical checksum, and the canonical program
  access helper's existing tests.
- `13-program-ownership-gate.log`: single-source ownership gate passed.
- `14-program-reservation-lint.log`: the service retains its 5 existing warnings;
  the capture test has none. No new warnings.
- `15-program-reservation-sql.log`: SQL interpolation gate passed, with the
  evidence service still at 27.

The lead then reran the native source-capture suites against the frozen repair:
`16-native-canonical-program-lock.log` records **10 passed in 2 files**, including
real lock contention, separate-study identity, actor revocation during a wait,
private-project admission, immutable capture provenance and audit rollback.
The complete production build also passed (`../2026-11-08-cross-module-data-flow/build-final2.log`).

Only the evidence service and its existing capture PGlite test changed in this
follow-up. They are frozen for full integration and the complete compiler gate.
The publication manifest prepared from commit `a5086170f436fbc917d157db4f02022180a6991a`
is an exact committed-object inventory of that snapshot and must be regenerated
for the final post-repair publication head.
