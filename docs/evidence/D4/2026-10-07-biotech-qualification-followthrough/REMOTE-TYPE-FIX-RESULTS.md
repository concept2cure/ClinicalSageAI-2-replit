# Test-fixture identity annotations — remote gate follow-through

Only repository `concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`.
Baseline `bd886f5d3a766ba35179f98ecb053f61420f69f6` is the health-report-only
child of publication `d46df5e1c406b0e8347385bcc0963dc02fd3e513`. Both owned
source blobs are identical between those commits; the erasure receipt verifies
that identity before comparing the edited source.

## Actual remote RED and precise fixture change

`REMOTE-TYPECHECK-RED.txt` records GitHub job `112920552724` in run
`37658757090`: the full compiler measured three `TS2322` errors, exit 2,
zero-error baseline. That is actual semantic RED on the published source.
No local full TypeScript run or inferred GREEN replaces it.

| Owned test file | Annotation repair |
|---|---|
| `server/services/ana/__tests__/derived-spreadsheet-sql.test.ts` | `params()` uses the existing `DerivedUploadParams` contract and requires its fixture's `derivation`. The two intentionally blank values are `projectRef = ''`; that string domain was previously inferred as the fixture programme's `randomUUID()` template. Required derivation keeps test accesses precise while using the canonical project/upload string domains. |
| `server/services/document-data-disposition/__tests__/recorded-lineage.pglite.integration.test.ts` | The depth-loop `parent` is explicitly `{ fileId: string; hash: string }`. The original UUID upload and later `file_audit_lineage_…` string identities remain the same values. The loop still creates all 65 hops and requires depth refusal. |

Only these annotations and a type-only import change. There is no value,
assertion, production type/guard, `any` cast, suppression or baseline change.
The original blank project inputs and all original controls are preserved.

## Emission and execution receipts

`REMOTE-TYPE-FIX-ERASURE.json` records SHA-256 hashes for baseline and edited
source, and baseline and edited emitted JavaScript, for each owned file.
Source hashes differ; emitted code is byte-identical for both files. The
comparison uses Node `v24.19.0`, esbuild `0.28.1`, TypeScript loader, ESM output,
ES2022 target, no source map, no minification and `legalComments: none`, with
the same source filename/options on each side. It also verifies the baseline
source equals the corresponding published source. The receipt supplies the
exact options and per-file hashes needed to repeat that comparison.

`REMOTE-TYPE-FIX-TESTS.txt` records both existing SQL suites after annotations:
**35/35 cases passed, two physical files, zero failed/pending/skipped/todo,
exit 0, 10.38 seconds**. `REMOTE-TYPE-FIX-MANIFEST.json` verifies their exact
requested/actual files, actual assertion statuses and edited source blobs.
`REMOTE-TYPE-FIX-LINT.txt` records scoped ESLint exit 0 with no diagnostics.
Local runtime execution and
esbuild type erasure do not establish semantic compiler success. The control
tower must obtain the exact final 24-GiB GitHub compiler verdict.

The unchanged controls include derived-save audit/capture rollback,
conversation-only blank-project saving, terminal ancestor refusal, retained-data
admission, tenant/path binding, legacy/cross-project descendants, independent
manual records, malformed/cyclic ancestry, the complete 65-hop depth input and
actual SQL alias controls. The fixtures' original filesystem/provider/audit
seams and PGlite limitations remain as stated in their existing receipts.

No commit, push, branch, worktree or full local TypeScript was made by this
worker. The control tower owns the SQL-inventory parser, integrated gates and
publication. D4 and D1–D10 remain open; this annotation repair supplies no new
scientific, deployment or live-connection qualification.
