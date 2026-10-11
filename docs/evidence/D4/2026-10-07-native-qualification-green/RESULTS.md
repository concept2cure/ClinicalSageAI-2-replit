# W3 / D4 — completed native qualification

The native PostgreSQL lane passed all **1,582 cases across 150 physical files**,
with zero failures, pending cases or todo cases, on exact source
`6a54db14cc6a41727c5f46103afbab2ac9609047`. All 38 failures from the original
`4d1252f` native artifact now pass under the same case names. No file or case was
removed: the original and completed populations have the same 150 paths and
1,582 case identities. Vitest reports 594 suites because that count includes
describe groups; it is not the physical file count.

`NATIVE-VITEST.json` is the byte-preserved `vitest.json` member of GitHub artifact
11516976694. The downloaded ZIP SHA-256 matches GitHub's artifact digest.
`REMOTE-RECEIPT.json` records the exact run/attempt/source, completed provisioning,
unmocked `pg` / `RLS_ENFORCE=on` test step and successful artifact upload.
The four unchanged export inventory guards all pass on the fully migrated
database: more than 1,000 real columns, complete secret-shaped decisions, no
stale listed columns and no column on both lists. This is the complete native
proof that the earlier isolated four-table reproducer explicitly deferred.

Both remote compiler steps passed on that exact source: the unchanged full
TypeScript regression-baseline gate and the beta-slice check. This does not
claim a zero-diagnostic full compiler; the baseline gate is preserved. The
production boot smoke and built-image sign-in (including second factor) jobs
also completed successfully.

`SCOPE.json` pins all non-documentation top-level trees/blobs separately from
their paths. They match the qualified source and publication base `f5a24e7`.
The only intervening changes are the ten recorded secret-scan evidence and
disposition files. This delivery adds only this evidence directory. The exact
source-transfer check covers production, tests, migrations, runner settings,
lockfile and guards; no runtime assertion was weakened for this green report.

Run `python VERIFY.py.txt --selftest` from this directory in the checkout.
The verifier accepts the archived native report and rejects controlled missing
files, missing cases, failing/pending cases, forged counters, wrong CI source,
failed compiler steps and changed source pins. These controls validate evidence
handling; they do not replace the actual remote database execution.

The broad integration and coverage jobs were still running when the receipt
was fetched. This is **native qualification evidence**, not a claim that the
whole CI workflow, D4 row, regulated product or commercial launch is green.
The existing full-history credential dispositions and revocation status are
unchanged. No full local compiler runs on the 8-GiB host. Metadata-only normal
commit and full pre-push checks use their unchanged relevance rules.

Remote run: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37697288645
Native job: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37697288645/job/113056059016
Compiler job: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37697288645/job/113052021942
