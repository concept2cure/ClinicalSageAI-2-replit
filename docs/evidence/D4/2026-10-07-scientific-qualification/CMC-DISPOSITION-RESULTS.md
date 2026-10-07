# CMC original admission and retained-data disposition results

Date: 2026-10-07. Bounded W3/D4 existing CMC/Module 3 increment on
`concept2cure-v2`, following `CMC-DISPOSITION-PLAN.md`. Initial RED used
unchanged CMC production from source tree
`66d2598d279d44cab9b87a9ecf49ec09f71ebe79`. Production editing followed the
control tower's publication of the separate fixture correction
`9dd81408d4775b8361a96bcf5e6002955db3722e`.

## Existing handoff corrected

Canonical withdrawal records an append-only disposition and preserves the
Vault/source rows. CMC's previous document chooser and transactional admission
checked deletion/version state only, so an original withdrawn through normal
preview/apply remained selectable and could receive a new CMC evidence link.
Existing CMC evidence reads and section drift also ignored dispositions.

`server/services/cmc/source-evidence.ts` now reuses canonical projections:

- New document selection/admission requires `vaultBinaryAvailableSql`: every
  disposition refuses a new original-document link.
- Admission uses the existing refusable transaction. Its canonical program
  advisory lock precedes ROW EXCLUSIVE reservation of
  `public.cmc_source_evidence, vault.documents`, source reads, Vault FOR SHARE
  row lock and any link move/insert/audit. A visible disposed original returns
  safe 409 `DOCUMENT_WITHDRAWN` and rolls back before those consequences.
- Existing links expose `originalFileAvailable` and shared
  `DocumentDispositionChoice | null` metadata. Withdrawal state/drift uses
  `vaultDataEligibleSql`; terminal `remove_data`/`supersede` holds sections
  reading such evidence. `keep_data` retains existing current/superseded data
  grounding and approval semantics while reporting the original unavailable.

Comments describe this distinction. No source ID/hash, raw data, extraction,
historical link, lineage or approval is rewritten or deleted. Governed unlink
remains a reasoned append-only history operation. No automatic unlink, new
surface, model, tool, store, migration, dependency, baseline or suppression.

## Actual base RED and final GREEN

New test:
`server/services/cmc/__tests__/source-evidence-disposition.pglite.integration.test.ts`.
It uses the existing in-memory PGlite disposition harness, actual canonical
preview/apply, actual CMC SQL and canonical CMC/disposition migration guards.
Schema-parity additions are explicitly TEST-ONLY; no guard or eligibility check
is disabled. The transaction adapter runs real BEGIN/COMMIT/ROLLBACK against
PGlite. The audit seam records controlled fixture audit rows, rather than
independently qualifying the production chained-audit implementation.

```sh
npx vitest run --config vitest.config.ts server/services/cmc/__tests__/source-evidence-disposition.pglite.integration.test.ts
```

Before production edits: **9 failed / 4 passed (13 cases), 7.24 seconds**.
The strengthened soft-assert rerun was also **9 failed / 4 passed**, 5.79 seconds:
all three canonical choices left the original selectable and allowed real CMC
link INSERT/audit/COMMIT; expected ordered locks were absent. Policy/lock failure
controls falsely succeeded. Terminal late-link state remained current, and
`keep_data` availability/disposition metadata was absent. Existing scope,
withdrawal-blocker, audit rollback and immutable/unlink controls passed.

Initial production GREEN: **13/13**, 5.93 seconds. A further normal v1/v2 move
preservation control was then added, making the final focused set **14 cases**.

| Boundary | Final assertion |
| --- | --- |
| Normal preview/apply, all three choices | Original excluded from selection; new link refuses 409 before any move, INSERT or audit; identity rows unchanged |
| Eligible current original | Normal snapshot/link/audit succeeds; availability true and disposition null |
| Same bytes in another tenant/program | That scope remains eligible; a foreign original is still 404 |
| Existing active CMC link | Normal withdrawal still blocks governed dependencies |
| Withdrawn current v2 after available v1 was linked | Normal withdrawal of different-byte v2 succeeds; attempted move refuses and exact live v1/history/audits stay unchanged |
| Missing policy store or unavailable program lock | Admission fails closed/rolls back; no link/audit survives |
| Audit failure | Link/audit insertion rolls back |
| TEST-ONLY late/legacy terminal link | State withdrawn and affected section drift reported, with link/lineage/approval rows intact |
| TEST-ONLY late/legacy `keep_data` link | Original unavailable, disposition explicit, retained data state preserved and no disposition-only drift |
| Immutable history/governed unlink | Rewrite/DELETE refused by canonical guards; reasoned unlink retains history and cannot repeat |

Ordinary canonical apply blocks a preexisting active CMC link. The late/legacy
read/drift scenarios therefore use explicitly labelled TEST-ONLY seeds after
apply; they are defensive scenarios, not a claimed supported withdrawal bypass.

## Separate mutation RED for v1 preservation

After the initial actual-base RED/fix, the control tower requested proof that
refusing a withdrawn v2 cannot implicitly remove an already linked v1. That
new scenario uses a real available v1 link, a real different-byte current
successor v2, and successful canonical Vault-target preview/apply on v2. The
v1 link is outside v2's withdrawal impact, so no blocker is bypassed.

An approved temporary test-only `vaultBinaryAvailableSql` → `TRUE` mutation
was applied solely to its final admission attempt, without reverting shared
production. **Mutation RED: 1 failed / 13 skipped**, 4.76 seconds. Actual SQL
marked v1 unlinked, inserted v2 and added both unlink and link audit rows while
answering success. This is **predicate-removal mutation RED**, not another
exact pre-change production run. The mutation/import/probe was removed fully;
the final test contains no test mode or projection bypass. With the actual
predicate restored, the new control passed and the broader run passed all
14 focused cases.

## Canonical regression and static checks

```sh
npx vitest run --config vitest.config.ts server/services/cmc/__tests__/source-evidence-disposition.pglite.integration.test.ts server/services/document-data-disposition server/services/cmc/__tests__/final-export-gate.test.ts server/api/cmc/__tests__/module3Linkage.routes.test.ts server/api/cmc/__tests__/module3GovernedActs.test.ts
npx eslint server/services/cmc/source-evidence.ts server/services/cmc/__tests__/source-evidence-disposition.pglite.integration.test.ts
git diff --check
```

Initial regression run: **12 files passed / 1 failed; 105 passed / 3 failed (108 total),
58.43 seconds**. All 14 new cases, canonical retained citation/data/binary
semantics, runtime-role disposition checks and CMC export/governed-action
controls passed. The three remaining failures are in unchanged
`document-data-disposition/__tests__/consumers.pglite.integration.test.ts`:

- starts with a readable file and an eligible, identifiable source;
- retains extracted text and lineage while refusing original-file pins;
- withdraws new grounding without rewriting the historical captured identity.

Each fails with SQLSTATE 42703, `column c.content_hash does not exist`: the
catalog fixture lacks the column used by the existing catalog hash join.
At that run, the catalog service and consumer fixture had zero diff against
`9dd81408d4775b8361a96bcf5e6002955db3722e`; neither imports the changed CMC
service on the failing path. They were not modified in this scope. This run
is not reported as wholly green.

The control tower separately reproduced that inherited fixture gap:
**3 failed / 2 passed**, 6.07 seconds, then corrected only the shared
`document-data-disposition/__tests__/disposition-fixture.ts`: canonical catalog
`content_hash CHAR(64) NOT NULL` and an explicit-column INSERT using the
fixture's existing recorded HASH. Production/catalog readers/predicates were
unchanged. Root reported **5/5 consumer cases passed**, exit 0, 7.76 seconds,
at 10:07:19 UTC. Its separate contract/proof is `CATALOG-FIXTURE-PARITY.md`.
The same manifest after that separate correction, with `--reporter=dot`,
completed **13 files passed / 108 tests passed**, exit 0, **43.31 seconds**.
All 14 focused cases and every canonical disposition/CMC regression in that
manifest passed. The initial 105/3 result remains distinct evidence.

Final scoped ESLint: **0 errors / 0 warnings**, preserving the production
baseline of zero. `git diff --check` passed. TypeScript isolated syntax/
transform diagnostics on both changed code files: **zero errors**; this is not
a semantic/full-tree TypeScript result. Full TypeScript/exact-source GitHub
verification, integrated freeze/build and publication belong to the control
tower. No worker commit or push.

## Independent review

The original helper independently reviewed the final production diff, focused
test and approved plan read-only after implementation. **No blocking findings**:
advisory/reservation/row order matches the contract, the shared disposition
type is reused, original admission and retained-data drift are distinct, and
historical identity/lineage/approval stays intact. The reviewer performed no
edits or tests. Disclosed proof limits: advisory-lock failure is injected, but
table-lock failure is not injected separately; audit-chain internals remain
mocked while actual fixture audit INSERT rollback is tested.

## Limits

PGlite plus ordered traces proves actual SQL/refusal/rollback, not independent
connection concurrency, lock scheduling or whole CMC runtime-role RLS. Shared
program-lock tests cover canonical key normalization and unavailable locks.
No original bytes or provider credentials are read. The change neither
scientifically qualifies retained data nor validates an approved narrative's
claims; it preserves existing human review/signatures/approval and makes the
existing admission and drift boundary honor recorded withdrawal semantics.
It does not declare D4 or commercial deployment complete.
