# D2 processing recovery — verified local implementation

14 October 2026. Canonical branch `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Work remains local and uncommitted. This improves D2's integrity/readability/recovery portion; it does not close the complete launch row or qualify scientific content and agency filing.

## Result

A committed capture stays pending until derived text and completion state commit together. The processor verifies the exact original upload, independent source/upload SHA-256, original path, extraction behavior, live program/workspace, currentness, dispositions and recorded lineage. It owns private byte/pre-extraction snapshots and refuses interpretation reuse when the original name/MIME differs.

Short transactions follow existing program and impact reservation order. A durable stage in existing metadata holds attempt identity, monotonic history, a 15-minute database-time lease and bounded retries. Completion and failure journaling are token and identity fenced, with actual acceptance-clock checks after waits. Late success/failure cannot overwrite a newer attempt. An unavailable failure journal leaves pending or expired ownership as the recovery signal.

The bounded sweep keeps malformed, blocked, busy, not-due and exhausted diagnostics separate from runnable slots. It uses canonical UTC timestamp round-trips, including refusal of PostgreSQL-normalized invalid hour/leap-second input. Default dry-run does no file loading, extraction, claim or write. The tenant wrapper retains canonical scope/lifecycle policy. The operator CLI validates arguments before database imports and returns only safe counts/status/reason codes; actual startup output was checked, including an inherited debug setting.

Upload, duplicate adoption and spreadsheet edits preserve their capture/audit/edit receipts when processing fails. Capture clients are released before awaiting separate processing transactions. Existing source reads and Project Home/editor/Vault/AnA projections distinguish actual stored nonblank text from capture, labels or in-memory extraction. Current eligible retained text can remain usable when its original is unavailable; superseded history cannot supply current grounding. Refresh rereads state and does not claim repair.

Real PostgreSQL sessions also reproduced a withdrawal confirmation retaining pre-wait impact. The narrow correction preserves reservation order, rereads authority while holding the exact live program row, reserves export-history fingerprints and refuses an obsolete preview. Read-only previews retain their stable snapshot; activation, blocker, reason, hash and chained-audit controls remain mandatory.

No new production dependency, schema, queue, search index, product surface or scheduler was added. PostgreSQL maintains the existing full-text expression index with the derived write.

## Final evidence

| Lane | Observed result | Practical scope |
| --- | --- | --- |
| Combined focused suite | **532/532 across 38 files**, Node 22.23.3, exit 0 | Canonical core SQL on PGlite, real caller/route/component behavior with controlled boundaries, CLI execution and disposition regressions. [Log](final-combined-green.txt), [exact manifest](final-test-manifest.json). |
| Canonical recovery | **45/45**, including original five failures and final four held-out repairs | Actual service SQL and selected existing migrations; extraction, original loading and profiling controlled. [Final core log](16-held-out-canonical-green.txt). |
| Independent adversaries | **16/16 original plus 5/5 additional**, stable inspected hashes | Separate evidence fixtures; four defects observed red before repair. [Final review](FINAL_INDEPENDENT_REVIEW.md). Counts are test cases, not customer incidents. |
| Genuine PostgreSQL | **13/13**, PostgreSQL 16.15, independent backend barriers | Claims, takeover, late outcomes, acceptance clock, supersession/deletion and both withdrawal orderings. Synthetic non-owner RLS case tests own/foreign source access. [Final log](race-postgres-03-final-source-green.txt), [observations](race-postgres-03-final-source-observations.json). |
| Final PG/source check | All **20 recorded hashes** match current code; unchanged during run | [Independent verification](final-review-postgres-current-source-verification.json). Initial owner is SUPERUSER/BYPASSRLS; the explicitly tested runtime role is NOSUPERUSER/NOBYPASSRLS. |
| Core types/lint | Seven selected targets: zero type diagnostics; seven files: zero lint errors/warnings | [Type result](final-core-target-typecheck.txt), [checker](owned-target-typecheck.cjs), [lint](final-core-eslint.json). Imported dependencies and existing ambient declarations load; this is not whole-repository semantic validation. |
| Other affected targets | Caller scoped tsc passes; read-side 21 selected targets pass; AnA response targets pass; no new lint warning | [Caller verification](CALLER_OWNER_VERIFICATION.md), [read-side type result](read-side-rooted-typescript-complete.log), [lint comparison](read-side-lint-comparison.json), [AnA verification](ANA_SPREADSHEET_RESPONSE_VERIFICATION.md), [CLI note](CLI_OWNER_NOTE.md). |

The final combined run includes the 151 caller/admission cases, 104 read-side cases, 53 CLI cases, 18 registered spreadsheet-response cases and 161 disposition cases. Those component counts are portions of the combined total, not additional tests to sum again. The isolated whole-database `tests/db/data-room-processing.dbtest.ts` was extended and selected-target typechecked; its full provisioned database suite was not run against this minimal fixture.

## Fail-first and scope records

- [Approved contract and integration addenda](CONTRACT.md), published before each production scope.
- [Original five reds and three controls](01-core-original-red.txt); [expanded 27 reds/three controls](02-core-extended-red.txt).
- Final canonical held-out repairs: [four reds](15-held-out-canonical-red.txt) followed by [45-case green](16-held-out-canonical-green.txt). Independent evidence retains its own four reds and final fifth diagnostic control.
- Actual PostgreSQL adjacent defect: [12 passing/one failing](race-postgres-01-adjacent-red.txt), [failed impact observation](race-postgres-01-adjacent-red-observations.json). Earlier 13-case green remains a historical log; explicit **03** artifacts qualify final store/sweep sources.
- [Read-side proposal and original baseline](READ_SIDE_PROPOSAL.md). Its interim lease fixture exceeded the real 15-minute contract and was corrected without weakening admission; the failed intermediate log remains.
- [Caller proof](CALLER_OWNER_VERIFICATION.md) retains the original incomplete adoption SQL authorization fixture failure and its explicit test-only seam; separate real admission tests pass.
- [Export-history review and open writer concern](EXPORT_HISTORY_LOCK_REVIEW.md).
- [Historical recovery preparation](../../D2-PROCESSING-RECOVERY-STUDY/2026-10-14/README.md) is pinned baseline evidence. Its opt-in original probe is not the current green regression suite.

Both disposable containers used synthetic data, tmpfs storage, bounded resources, loopback-only published ports and no application/config/client-data mounts. The first launcher's deadline cleanup did not survive the resumed environment; root removed its exact verified owned identity and independently verified absence ([record](race-root-cleanup.json), [first state](race-fixture-first-state.json)). The final launcher completed its own cleanup ([state](race-fixture-state.json), [runtime](race-fixture-runtime.txt)). No fixture remains running.

## Reproduction

Use Node 22 and the repository's locked dependencies from the full checkout:

```sh
node docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/run-final-combined.mjs
node docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/run-independent-review.mjs --label reproduced
node --import tsx scripts/process-data-room-captures.mjs --org 42
```

The last command is an operator example, not a repair performed here. It requires a correctly configured authorized tenant database and defaults to report-only. `--apply` must be chosen explicitly. Do not point concurrency fixtures at an arbitrary or client database. The retained PostgreSQL launcher/runner document their owned local setup and cleanup; start a new disposable fixture to rerun genuine sessions.

## Remaining limits

No live backlog repair, deployment, scheduler activation, model/vendor validation call or agency transmission occurred. OCR quality, scientific applicability, expert fact qualification, real cloud recovery, deployed runtime/RLS privileges and production workloads remain separately qualified. Download auditing retains its previously documented durability limit.

The pre-existing adoption loader can request a pool query while its capture client is still held before COMMIT; this slice fixes post-COMMIT processor retention and records the earlier static pool concern separately. A separate authoring `recordFiling` REPEATABLE READ wait-snapshot concern is static and unreproduced. Audit-history archival is outside global reservations. No claim that every source-linked writer or concurrent cold-history archival is qualified follows from these tests.

Next work remains the published scientific fact frames/per-fact review contract and precise versioned retrieval receipts, followed by expert/client benchmarks and scoped regional filing qualification. The broader 90-case competitive benchmark remains proposed, not executed.
