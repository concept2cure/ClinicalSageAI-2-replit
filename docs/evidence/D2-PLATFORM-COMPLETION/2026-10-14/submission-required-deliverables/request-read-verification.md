# W1/D2 current Submission Center request reads

Observed on `concept2cure-v2`, 2026-10-14 UTC, working tree based on `d6d8c19f4ee7c3b2fb0d8a313ca8c9963387c0c9`. The six owned implementation/control/test files are frozen at the byte hashes in `request-read-source-pins.json`. This owner performed no native SQL, migration, provider call, compiler, build, staging, commit or push for this increment.

## Recorded RED and GREEN

| Check | Actual result | Retained evidence |
| --- | --- | --- |
| Initial request-read regression against the old route call sites | 12 failed, 1 genuine public/owner/member control passed; 13 total, 10.50 seconds, start 20:15:11 UTC | `request-read-red-summary.txt` |
| Final current request-read and list-envelope tests | 25 passed in two files; 11.96 seconds, start 20:40:07 UTC | `request-read-green-summary.txt` |
| Final scoped ESLint | 0 errors, two file-size warnings on the expanded existing routes/types files | `request-read-eslint.txt` |
| Canonical server-error-leak gate | Passed: 10 existing baselined sites in 10 files; no file gained a site | `request-read-error-leaks.txt` |
| `git diff --check` | Passed after frozen source changes | No emitted diagnostics |

The initial meaningful RED followed correction of two fixture setup mistakes; those setup failures are not represented as security evidence. The new helper was present but unused while the old route call sites were exercised. The RED contains actual private read/list exposure, stale actor/context and deleted-parent failures, and the absent new framework metadata. It is not an untouched full-repository baseline. Sanitized summaries retain test names and counts, without database URLs or source bodies. The later GREEN expands the same request fixtures with current evaluation/source changes and executor-binding cases.

The 25 GREEN cases comprise 22 actual-SQL PGlite route/helper cases and three mocked envelope/query-shape tests. The latter do not establish authorization behavior. The PGlite cases use the existing current programme/project policy readers and real supplied SQL; they do not mock an allow decision. Actor middleware is injected for these focused HTTP tests, so they do not prove native JWT/RLS or deployed-role behavior.

Commands used Node 22, a 4096 MB heap and one Vitest worker:

```text
npx vitest run server/routes/__tests__/submissions-request-current-access.pglite.test.ts --maxWorkers=1
npx vitest run server/routes/__tests__/submissions-request-current-access.pglite.test.ts server/routes/__tests__/submissions-list-program-scope.test.ts --maxWorkers=1
npx eslint server/services/submission-service/submission-request-read.ts server/routes/submissions.ts shared/types/submission-api.ts server/routes/__tests__/submissions-request-current-access.pglite.test.ts server/routes/__tests__/submissions-list-program-scope.test.ts
node scripts/ci/check-server-error-leaks.mjs
git diff --check
```

The full raw RED/GREEN/lint logs remain in `/tmp/submission-required-deliverables-access-{red,green,lint}.txt`. Nonfatal import-time audit setup messages in the envelope tests do not constitute successful governed audit writes or proof of an approval ceremony.

## Bounded behavior proved

The seven adopted GET readers use the caller's exact request executor: submission lists/details, sequence choices, Builder leaves, pathway readiness/manifest and technical-file reads. Canonical current actor membership, programme/project sharing, actual live sequence/submission parents and selected expected identities precede leaf/source metadata. An equivalent second executor or reconstructed admission object fails before data reads. Missing request context does not fall back to the global pool. Private rows are excluded before list labels/order, and no hidden-row total is returned.

Current managers retain the existing metadata-only unanchored submission remedy through `canMutateProgram` with the actual current organization role; direct sequence/source reads remain held. Public, owner and explicit-member positives remain reachable. Fresh role demotion, actor disable, foreign/deleted parents and selected programme conflicts refuse reads.

Before returning coverage, the reader rechecks the exact retained leaf set and pointers/pins/lifecycle, current parent/access, canonical programme/application aliases, actual programme type and relevant recorded product/device flags, programme labels and live region/pathway facts. Real SQL changes deferred until after a read result prove that permission withdrawal and changed type, flags, framework or leaf pin are refused rather than published as current. These are READ COMMITTED late checks, not an atomic revocation reservation or transaction snapshot guarantee.

Available framework metadata comes from the actual filing registry and current live region records. No arbitrary first-choice default is used: only a positively recorded compatible framework defaults; an explicit compatible selection remains labeled explicit. Conflicting region/framework facts refuse evaluation. IND/NDA/BLA rows stay visible with an honest unavailable coverage notice; this increment does not implement their complete deliverables engines. CTIS input uses the shared canonical ISO state codes, preserves `GR`, and does not infer member states.

Typed source references preserve exact retained identities. Their programme/project identifies the admitted placement container; source origin is separately admitted or held as `SOURCE_PARENT_UNVERIFIED`. Labels never replace identity, source proof or an editor target. Missing, not applicable, undetermined content, changed/unpinned evidence and finalization remain separate axes. The existing governed dispatch assessment remains an independent canonical gate.

## Separate evidence and limits

The source implementation owner separately records 38 final focused source/mapper cases and 203 canonical/default regression cases in `source-verification.md`; those runs overlap and must not be added together. The UI owner separately records 251 client cases. Those results are not native database proof and are not part of this 25-case route count.

The independently assigned native owner verifies real JWT, request-owned Lazy clients, deployed PostgreSQL and restricted `app_service`/forced-RLS behavior using retained isolated synthetic rows. Its results are not claimed here. Binary bytes/hash presence does not establish substantive scientific content; unbound stores, unknown source bodies or missing proof remain undetermined. Existing background service callers keep their ABI. Adjacent anchor/mutation/assembly/export/sign/dispatch routes are outside these seven adopted reads; this evidence does not claim their complete current-parent privacy or regulatory readiness.

Heavy runner slot #1 was explicitly released after route GREEN and scoped lint. All further source changes require coordination and affected verification; publication belongs to the control tower.
