# Verification receipt — CDI reference seed and agency discovery

> Archived implementation-review evidence for [commit e6efa61109ed](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/e6efa61109eddbe0d9e508642a28e710a48f3b1f). This document describes the separately prepared application implementation, which has an incomplete whole-repository TypeScript verdict. Its application paths refer to that review commit, not to deployed functionality or this documentary publication. This package does not deploy or import the implementation.

Date: 2026-10-27. Implementation revision before this receipt:
`648e9252adbb366c895745bd5318a712d5491ee7`.

## Verified acquisition and admission counts

| Measure | Result |
| --- | ---: |
| New original PDFs acquired in this work | 34 |
| PDF pages in those new originals | 28,248 |
| New original bytes | 935,730,927 |
| New CDI-focused original PDFs | 19 |
| CSR synopsis packages among the CDI-focused PDFs | 7 |
| Protocol/SAP companions among the CDI-focused PDFs | 11 |
| Scientific results summaries among the CDI-focused PDFs | 1 |
| Newly acquired full CDI CSRs | 0 |
| Substantial main redacted CSR originals delivered individually | 4 |
| Application source records in the generated seed | 78 |
| Permitted originals retained in the application assets | 22 |
| Extracted pages for those application originals | 718 |
| Catalog-only application records | 56 |

The 22 application originals are the previously retained 21 FDA review documents
and one CC BY trial publication, not 22 sponsor CSRs. The four individually
delivered sponsor reports are GSK110390/ZOSTER-006, GSK114312, GSK100388 Phase A,
and GSK104106 final Year 10. The last two belong to the same longitudinal family.
They are public redacted disclosure files, with no certification that all original
submission appendices or patient listings are present.

Sponsor originals remain privately retained and review-required for commercial
retrieval, redistribution and training. Their public catalog records preserve
identity, original checksums, exact links, versions and package relationships;
they contain no admitted report text or application original path.

The generated migration SHA-256 is
`0142bb4d52dac85601e4d2ca59131bc802d9ea2c1e8fd2b1909878548a1aad70`.

## Completed checks

| Check | Result |
| --- | --- |
| Seed compiler `--check` against the actual originals and derivatives | Passed; 78 sources, 22 retained originals, 718 pages |
| Seed/migration PGlite tests | 5 passed, including replay, tenant preservation, rights withdrawal and altered-content refusal |
| Public reader and registered AnA tool tests | 31 passed, including actual original-byte checks, private-source exclusion, restricted rights, SQL-shaped inputs and page bounds |
| FDA/EMA connector and integration tests | 61 passed across six files; real-source response subsets are retained as fixtures |
| Total focused software tests | 97 passed across nine files |
| Negative control for the reader rights check | Removing the check caused the relevant tests to fail; the check was restored |
| Targeted agency-client TypeScript compilation | Passed |
| Initial production frontend/server build | Passed |
| Production server build after the agency repairs | Passed, including the audit-chain verifier bundle |
| ESLint errors and warning-growth checks | Passed; no new warning allowance or baseline increase |
| SQL interpolation guard | Passed after replacing query interpolation with literal SQL and fixed bind parameters |
| All pre-push checks preceding the whole-repository compiler | Passed, including migration order/replay/deployment path, tenancy, tracked imports and size ceilings |

## Whole-repository compiler: incomplete, not a pass

This execution environment has an 8 GiB memory limit. The ordinary full-program
compiler reached that limit and was stopped without a completed verdict.
The repository's existing memory-bounded checker was then run with
`TYPECHECK_FILES_PER_PROCESS=1000` and `TYPECHECK_HEAP_MB=6144`. It established a
14,580-file program and completed 1,000 diagnostic targets, but its second
worker aborted with JavaScript heap exhaustion. That run did not establish a
complete compiler verdict and the pre-push gate correctly failed.

A separate diagnostic-free full-program listing also exhausted a 4096 MiB heap
before returning file order. It produced no semantic diagnostics and is not a
validation substitute. Smaller target batches may reduce semantic memory, but
this session has not established that they complete under the runtime limit.

No typecheck baseline, compiler scope, hook or release gate was weakened. Further
publication of the application code is pending a complete compiler result or an
explicit, recorded decision by the repository owner about that publication gate.
The focused tests and successful build must not be substituted for a full
typecheck or described as medical-writing qualification.

## Runtime status

No production database migration, deployment, embedding job, scientific
qualification or model training has been executed by this work. A repository
publication alone does not establish that live AnA can retrieve these records.
The existing Deploy to AWS workflow separately gates staging and production
release and applies the registered migration set.

The intended post-release checks are: 78 source records from this seed; 22
permitted originals with the expected hashes; bounded page reads through AnA;
refusal of catalog-only/restricted content and private sources; and no external
report treated as client study evidence. See the accompanying
[CSR capability guide](ana-csr-reference-learning.md) for the additional clinical
and statistical evaluation still required.
