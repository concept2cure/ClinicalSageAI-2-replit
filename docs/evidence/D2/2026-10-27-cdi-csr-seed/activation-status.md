# CSR reference collection: publication and activation status

Observed 2026-10-27. This receipt supersedes the publication-pending wording in
the earlier `verification.md`; its compiler and runtime limitations still apply.

## What already exists

- The reference originals and catalog were published on `concept2cure-v2` in
  `5a2f07b39ce310c2f620414223fec361efb5f7ed`.
- The AnA/CRE integration and agency discovery repairs were published in
  `0a07f49d7cf0b3dc179d4dca87b9bf5c767bc56d`, following the repository owner's
  recorded decision to publish despite the incomplete local whole-program
  compiler result. That decision did not establish a compiler pass or permit a
  deployment without the existing release gates.
- `cre_evidence_sources` remains the canonical store. The existing AnA tool
  `search_clinical_regulatory_evidence` exposes the bounded, provenance-bearing
  reference reader after the registered migration is applied in a released app.
- `.github/workflows/deploy-aws.yml` already provides gated staging and production
  deployment. This work adds no alternate release or ingestion path.
- `docs/security/WO-07-dependency-risk-decision.md` and its ledger already govern
  exact-lock dependency reviews. No new exception or approval mechanism was added.

## Evidence available now

| Measure | Verified result |
| --- | ---: |
| Newly downloaded original PDFs | 34 |
| Pages in those new originals | 28,248 |
| Bytes in those new originals | 935,730,927 |
| New CDI-focused originals | 19 |
| Newly downloaded full CDI CSRs | 0 |
| Substantial main redacted CSR originals delivered individually | 4 |
| Permitted originals in the application repository | 22 |
| Pages extracted from those permitted originals | 718 |
| Source records in the application seed | 78 |
| Catalog-only records in that seed | 56 |

The 19 CDI-focused originals comprise seven CSR synopsis packages, six protocols,
five SAPs and one scientific results summary. The four main redacted CSR originals
are GSK110390/ZOSTER-006, GSK114312, GSK100388 Phase A and GSK104106 final Year 10.
The latter two belong to the same longitudinal study family. Public redacted
disclosure does not establish that all submission appendices or patient listings
are included.

The 22 permitted repository originals are 21 FDA review documents and one CC BY
publication. They are not 22 full sponsor CSRs. Sponsor originals remain retained
outside the public repository pending the applicable commercial-use,
redistribution and training review. Catalog records retain their identity,
checksums, links and related-document groups without admitting their report text.

See `../2026-10-27-cdi-csr-reference-package/source-directory.md`,
`verification.md`, and `ana-csr-reference-learning.md` for document identities,
qualification criteria and the 97 focused tests already completed.

## Live activation has not been demonstrated

No production migration, deployment, embedding job or model training was executed
by this work. Publishing originals and retrieval code does not change a model's
weights or prove that the running AnA service can retrieve the new references.

At **2026-10-27 22:26:16–22:26:17 UTC**, the canonical branch still pointed to
`0a07f49d7cf0b3dc179d4dca87b9bf5c767bc56d`. Its required workflows were queued:

| Workflow | GitHub Actions run | Status |
| --- | --- | --- |
| CI | [40589879552](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/40589879552) | Queued; no verdict |
| Semgrep | [40589879639](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/40589879639) | Queued; no verdict |
| CodeQL | [40589879718](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/40589879718) | Queued; no verdict |
| Tier 5 Browser Smoke | [40589879589](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/40589879589) | Queued; no verdict |

Five older CI runs (40365597666, 40361596101, 40358905688, 40358197877 and
40357865688) still had 15 assigned test runners. Their earlier validation failures
were inspected; they are not current-commit CI verdicts. The oldest previously
inspected run, 40353950157, completed with failure at 22:20:32 UTC.

The older staging run
[40421512113](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/40421512113)
still held the staging deployment concurrency group with its pre-deploy test job.
Its CI and Security gates had failed. No build, migration or rollout job appeared
in the captured job list. The workflow's explicit instruction is never to cancel
a deployment; this run is separate from any proposed superseded-CI cleanup.

The available GitHub connector supports repository publication and workflow
inspection, but exposes neither cancellation nor deployment dispatch in this
session. The separate browser authentication request was declined and was not
retried. No workflow was cancelled or dispatched.

## Repairs and publication boundary

`ci-reference-fixes.md` records the reproduced obsolete Semgrep exemption and two
ordinary prose strings misread by the SQL reference heuristic. Removing the
obsolete exemption reduces the exemption set and passed all 14 existing evidence
self-tests. No scanner or security baseline was weakened.

Compatible dependency updates and the two prose repairs are retained in
[`activation-repairs.patch`](activation-repairs.patch), with focused verification
in [`dependency-remediation.md`](dependency-remediation.md) and
[`ci-reference-fixes.md`](ci-reference-fixes.md). They do not constitute an
approved dependency ledger, a whole-program compiler pass, or a deployment.
The WO-07 contract requires human review of an uncovered advisory before resealing
the changed lockfile. In particular, the uncovered Zod finding has not received a
new disposition. The existing time-limited image-size reachability decisions are
distinct and must be judged from their existing runtime proofs.

The patch is 10,905 bytes, SHA-256
`ad9d8c40f83e68fd06d220a210187f7c3b3a23c4aa2a5777b3e5e756e1cfe1c9`.
It contains only the two package manifests and the two prose source files.
Reverse-application was checked against the tested candidate; after restoring
those four source files to the published base, `git apply --check` passed and
the original lock again matched its existing ledger seal. The 108 distinct
dependency compatibility tests describe the candidate patch, not a deployed
dependency update. The Semgrep evidence self-tests were rerun on the actual
publication candidate: 14 passed, and all 24 remaining fingerprints validated.

## Remaining acceptance steps

1. Resolve the uncovered dependency finding under the existing human-review
   policy, then apply and verify the compatible dependency patch and reseal the
   lock through the existing helper. Do not hand-edit the ledger hash.
2. Obtain successful required checks for the exact canonical commit selected for
   release, including a complete compiler verdict. A queued check is not a pass.
3. Resolve the older staging run through the established release ownership
   process, then use the existing gated staging workflow.
4. Verify all 78 seed records, the 22 admitted originals and their hashes,
   bounded page retrieval, tenant isolation, rights withdrawal and refusals for
   catalog-only content in the deployed environment.
5. Qualify CSR assistance on held-out study families before claiming expertise:
   verify source/page citations, planned-versus-reported analyses, denominators,
   adverse-event terminology, missing data, and separation of external examples
   from the client's actual study evidence. The supplied capability guide defines
   this evaluation; ingestion alone does not satisfy it.
