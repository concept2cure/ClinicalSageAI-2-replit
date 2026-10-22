# Independent workflow bridge review — 2026-10-13

Scope: real runtime-role/native PostgreSQL tests of canonical workflow import, review, signing, rendition, and current sharing. Production implementation belongs to the bridge/materializer/governance owners; this review owns `tests/db/workflow-import-governance.dbtest.ts` and this evidence directory.

## Environment and limits

The native lane uses `vitest.db.config.ts`, which never loads the default lane’s mocked `pg`. The fixture database is local PostgreSQL 16.15 at port 55432, provisioned with the canonical platform installer. Owner access provisions unique synthetic organization/program/users/source rows; HTTP and materialization use the actual `app_service` runtime login. The test asserts NOSUPERUSER, NOBYPASSRLS, and forced RLS. Actual JWT verification, fresh membership checks, reviewer assignments, password ceremony, signatures, immutable creation receipts, lineage, revisions, and audit SQL execute without mocks.

No original source signature, scientific qualification, serving model, generation receipt, or PQ record is minted. These tests establish implementation behavior in the local fixture, not production deployment verification or scientific/regulatory qualification. Positive controlled XML rendering is exercised; successful vault/storage transport and qualified AI generation are not exercised. Only isolated test organizations are retired after each run; their immutable audit/signature/revision QA rows remain, and no shared application fixture is edited.

## Meaningful failures found and fixed by the implementation owners

1. `native-sql-red.txt`: actual deployed `authoring_reviews.doc_id` is text, while `authoring_signatures.doc_id` is UUID. The adoption lookup joined them without a cast and PostgreSQL raised SQLSTATE 42883. This prevented the actual human acceptance path. The owner normalized the join identifiers and fresh assigned-review positives passed. Fixture setup failures and an incorrect draft-export expectation are excluded from this regression evidence.
2. `native-stale-seal-row-red.txt`: a first native concurrency attempt retained a real FROZEN document whose current section set included `98` while the frozen snapshot did not. The first attempt’s lock observer did not recognize the queued freeze, so its test assertion failed for the observer; the separately inspected persisted snapshot mismatch is the concrete integrity failure. The implementation now reserves and touches the parent document version before section writes.
3. `native-insertion-conflict-red.txt`: the corrected lock observer witnessed the real queued insertion/freeze overlap. PostgreSQL aborted the freeze with SQLSTATE 40001, but the HTTP route answered an opaque 500. The owner now returns 409 `DOCUMENT_CHANGED_DURING_GOVERNANCE`, does not emit a seal, and requires a fresh ceremony rather than automatically retrying consumed credentials.

The final race test observes PostgreSQL’s actual lock queue through `pg_stat_activity`/`pg_blocking_pids`; it does not infer overlap from a delay. Section-insertion-before-freeze must refuse stale sealing. Freeze-before-PATCH must reject the late save with no child, lineage, or revision changes.

## Threat and proof inventory

| Threat | Native proof |
| --- | --- |
| Mocked database mistaken for runtime verification | Assert actual restricted login and forced RLS; native lane checks `pg` is unmocked. |
| Private project available to any organization member | Active unassigned member gets 403 before private source/target import. |
| Stale JWT/project grant used after preview | Explicit member preview succeeds; revoked current project grant makes creation fail before authoring rows. |
| Cross-tenant source existence/prose leak | A real foreign source exists, is hidden by forced RLS, and the actual import answers 404 without prose. |
| Child rows mixed from multiple source states | One repeatable-read materialization retains its earlier coherent snapshot; a new transaction sees the inserted source child and a new fingerprint. |
| Preview fingerprint becomes stale | New source child between preview and creation gives 409 and no new authoring row. |
| Concurrent duplicate pulls or lost human edits | Two actual concurrent pulls converge on one draft; subsequent idempotent reuse preserves a real edited section. |
| Request metadata fabricates approved origin | Caller title/status/signature/model metadata cannot turn the verified import into an approved or bound document. |
| Fingerprint substitutes for human acceptance | Unknown origin cannot freeze; unassigned adoption cannot sign; actual different assigned reviewer approval plus explicit full-document credentialed signature allows freeze and controlled XML. |
| Prior adoption reused over new visible content | New section and title-only PATCH require current full-document adoption, even when prose digest remains unchanged. |
| Model name or accepted machine draft substitutes for PQ | CSR with recorded model name only, CSR model null, and accepted protocol machine spans retain qualification hold. |
| Last workflow step auto-approves machine text | Real REVIEWER `/sign` can record useful adoption and approve its step while the document remains unsealed/on hold. |
| Approved display flag bypasses qualification | A deliberately corrupt lifecycle flag on an isolated fixture still cannot render controlled XML. |
| Removed display provenance launders machine text | Immutable CREATE receipt retains the known-machine hold. |
| Historic receipt permanently blocks real human rewrite | A real content replacement plus new assigned full-document reviewer adoption allows release while original machine origin remains disclosed and PQ remains absent. |
| Machine hold makes the draft unusable | Actual working DOCX bytes carry NOT FINAL/qualification notice, produce a working-copy audit, and emit no controlled export/seal/signature. |
| Source changes after freeze | Current source child change prevents new author re-signing and controlled output without extra effects. |
| Concurrent child insertion omits unsigned content | Queue real insertion before freeze at parent lock; stale freeze must 409 and leave no frozen snapshot. |
| Editable preflight races a committed freeze | Queue actual PATCH after freeze; late save must 403 and preserve complete child/lineage/revision state. |

## Scope and snapshot contract

Current target and source sharing is evaluated by canonical project policy, using fresh active user/organization membership. A coherent retained source snapshot is not a claim that no source changed concurrently after the snapshot. A later controlled rendition or filing re-materializes and checks the exact retained origin/fingerprint with the current actor. The bridge retains original authorship and source scope; it does not transfer original approval, signatures, scientific support, or qualified generation claims.

The current known-machine hold follows affected present content. Review records can exist while the hold remains; complete actual human replacement plus current reviewer adoption can release the current copy without rewriting history. Unknown/template material still requires actual assigned reviewer adoption of the visible full document. Hashes and copied metadata are evidence links, not acceptance decisions.

## Results

`native-green-15.txt` records the initial full 15-case pass after native SQL and insertion-conflict repairs. `native-additional-green-2.txt` records both subsequently added cross-organization and visible-title cases passing. `native-final-green-19.txt` records the final complete native file: 19 passed, 0 failed, no skipped cases. It includes the broader canonical parent reservation, queued PATCH with complete child/lineage/revision equality, actual configured runtime-pool role proof under canonical tenant scope, and real DOCX working bytes with a qualification/NOT FINAL notice. The first final attempt’s new diagnostic pool probe omitted its mandatory tenant scope and correctly failed closed; that QA probe was corrected and is not counted as a production regression.

ESLint: 0 errors, 0 warnings after splitting long outer test groups; recorded in `native-lint.txt`. The governance owner subsequently tightened the parent-touch helper to require exactly one `UPDATE ... RETURNING id` receipt. The native race verifies the same successful real version-touch path; the owner’s aggregate release check covers that final receipt assertion against the frozen checkout.

Run with Node22, `TEST_DATABASE_URL` naming the isolated fixture owner, `APP_DATABASE_URL` naming the restricted application role, `RLS_ENFORCE=on`, and a synthetic test-only audit HMAC secret:

```sh
npx vitest run --config vitest.db.config.ts tests/db/workflow-import-governance.dbtest.ts
npx eslint tests/db/workflow-import-governance.dbtest.ts
```

## Independent release recheck

`native-release-recheck-green-19.txt` records a separate complete run against the
final shared checkout on 2026-10-13 at 21:59:50 UTC: 19 passed, 0 failed, 0 skipped,
exit 0, 16.40 seconds. It covers the parent reservation's exact one-row
`UPDATE ... RETURNING id` receipt and both actual FIFO concurrency cases. The
native suite and production files were unchanged by this reviewer. ESLint passed
with 0 errors and 0 warnings; `native-release-recheck.json` records the source
digests and boundaries of this result.

This recheck used the existing development audit-HMAC fallback, which emitted its
expected non-production warning. It establishes local governance behavior, not
production audit-chain integrity or signing-secret qualification. The native file
does not directly exercise the new binary image access checks or successful
coauthor/Vault storage transport; their independent tests belong to the separate
backend review. No serving model, qualified generation evidence, licensed
validator or agency gateway was supplied or certified.
