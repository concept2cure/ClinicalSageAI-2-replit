# Receipt, source ancestry and step-title reconciliation

The receipt owner reconciled stages 1/2/3 in the five assigned conflicted files and three approved fixture extensions. No staging, commit, push, provider operation or cross-owner application edit was performed by this owner.

## Preserved behavior

- `read-receipts.ts` retains private synchronous deferral IDs, exact unchanged payload selection, the default-off selected durable writer, typed source-refusal callbacks, round termination, cancellation, idempotent logical counts and acknowledgement only after the guarded writer's actual COMMIT. The upstream request executor field remains read context; it cannot replace the canonical writer's fresh short transaction or authorize a receipt.
- `source-context-admission.ts` retains current actor identity, creator and upload ownership, and upstream canonical CRE/artifact parent admission. Its narrowed SQL projects both necessary creator fields and the exact authoring/artifact association fields. An unbound-chat exception must also pass the upstream checksum/artifact ancestry check; it cannot erase a private or deleted recorded parent.
- `step-presentation.ts` resolves titles on the request executor using both reviewed source and current-program scopes. Canonical allowed programs, recorded organization, the live program parent and source data eligibility constrain SQL. Canonical source access is revalidated before the query and after the upstream current-program recheck. Missing or inconsistent pins, changed access and unverifiable returned row identities produce generic step titles.
- No V2 delivery, comprehension, replay or provider-service claim is introduced. Legacy and durable history retain their distinct meanings.

## Verification and limits

The first partial combined probe recorded 108 passing tests and three handler fixture failures, with the source-context suite still blocked by an unresolved cross-owner disposition conflict. A later source-context probe exposed the upstream fixture's newly existing actor tables; the fixture now extends those tables instead of duplicating them. The next probe demonstrated the changed controlled refusal code: `ANA_SOURCE_ACCESS_DENIED`, still HTTP 403. Its one exact-code assertion was reconciled after that observation.

The focused eight-suite cohort then passed **134/134 tests**. After extracting the composed title guards into small helpers, the four affected title suites passed **46/46 tests**. Final scoped ESLint and `git diff --check` reported no errors or warnings. Logs are `receipts-focused-initial.txt`, `source-context-initial.txt`, `source-context-fixture-reconciled.txt`, `receipts-focused-final.txt`, `title-helper-final.txt` and `receipts-eslint-final.txt`.

The four new source-context controls exercise real PGlite SQL: a genuinely unbound creator/owner positive case, a foreign capture-creator denial, and same-checksum private-parent denials both before and after that parent is deleted. The step-title composition fixture preserves the upstream request/current-program controls and adds missing canonical-pin and post-query canonical revocation controls.

The delivery-budget unit fixture explicitly stands in successful actor admission through the common fixture helper; it is not an authorization or RLS qualification. PGlite title/source ancestry cases are SQL evidence, not native PostgreSQL or deployed-RLS evidence. Root-owned current-source combined, independent, PostgreSQL, type and pre-push gates remain the publication qualification. No historical evidence directory was changed.

## Whole-typecheck fixture correction

Root's whole typecheck exposed eight call-site errors in the title SQL fixture. Its request-executor callback required a parameter array, whereas the real request/Csr query contract permits omitted parameters. The fixture now provides the actual callable signature with `params: unknown[] = []`; no baseline or new cast was introduced. The three affected SQL/current-access/mounted-stream suites passed **22/22 tests**, and that fixture's final ESLint reported no errors or warnings. Logs are `title-query-typing-final.txt` and `title-query-typing-eslint.txt`. Root's next whole typecheck is the semantic publication gate. The earlier owner hash manifest remains historical; the corrected fixture is bound in `receipts-owned-source-hashes-typing-final.json`.

The first root combined regression log contained no failed tests in the eight receipt-owner paths. Other tool/source fixture failures are coordinated by their designated owners; this owner did not modify those paths or relax production source guards.
