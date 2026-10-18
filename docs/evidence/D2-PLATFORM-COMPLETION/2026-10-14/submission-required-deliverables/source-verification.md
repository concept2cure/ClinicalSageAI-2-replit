# Source-aware Required deliverables verification

Observed on `concept2cure-v2`, 2026-10-14 UTC. Source implementation frozen after the final focused replay at 20:39:22. No commit, push, schema change, rendering, staging, writer invocation, AI call, or native SQL run was performed by this source implementation owner.

## Results

- `source-mapper-unit.txt`: 203/203 tests in 12 files passed, including canonical dispatcher/manifest/technical-file and all six existing mapper suites plus the then-current new source fixtures. Start 20:25:32; duration 22.60 seconds. This is a default-behavior regression replay, not a reconstruction of an untouched historical RED run.
- `source-unit-final.txt`: final 38/38 tests in two files passed (17 request-q source cases, 21 source-aware manifest cases). Start 20:39:22; duration 8.56 seconds. This replay covers the subsequent private source helper decomposition, independent duplicate pins/provider cache, exact current editor section identity, and truthful non-substantive Builder flag. The two runs overlap and must not be added together.
- `source-eslint.txt`: combined scoped source/mapper/parent route/DTO lint completed with zero errors and 14 warnings. One new source control-character regex warning was subsequently removed without changing the accepted character set.
- `source-eslint-final.txt`: final new source helper and its test completed with zero errors and zero warnings. Remaining combined warning locations belong to existing materializer/dispatch/mapper sites or the parent-owned route/DTO/test scope; no threshold or suppression was changed.
- `git diff --check` passed after the final source edits.

Commands used Node 22 with a 4096 MB heap and one Vitest worker. No broad build, compiler, native runner, or provider-network verification is represented by these files. Exact frozen source/test byte hashes are recorded separately in `source-sha256.txt`.

## What the fixtures establish

The source tests use actual supplied PGlite SQL and canonical current programme/authoring access readers. They exercise programme parent admission before body reads; same-organization sibling refusal; private actor refusal; draft, placeholder, missing pin and changed pin qualification; exact retained historical coauthor seal version; duplicate pointers with independent pins and one provider read per recorded version; body/provider change and permission revocation; provider parent move refusal before a second provider fetch; unbound stores; typed read outage; and executor-bound late admission. Global application SQL is poisoned. Only unrelated import-time audit initialization and synthetic storage byte delivery are mocked.

The mapper tests use the existing matchers and slot registries for all ten canonical server pathways. They preserve actual matched source objects/indices, known not-applicable facts, manual applicability checks and contradictions. An unverified matched optional/conditional source remains undetermined; required unknown content blocks readiness. The actual legacy default ABI on the same fixtures supplies the negative control. These focused policy comparisons do not claim a separate untouched historical full-repository RED execution.

## Limits and intentional uncertainty

PGlite tests are not native PostgreSQL forced-RLS, JWT, deployed schema, or external storage integration proof. The separately assigned native request-context proof must establish those claims. Synthetic provider bytes verify the content/pin algorithm and late-read ordering, not a live provider account.

`c2c_document_sections` requires its actual programme-bound source parent. Coauthor copies require a positively verified authoring alias, current full document rights, exact retained seal version/hash and canonical assembled retained content. Current mutable draft prose does not substitute for the sealed historical version. Vault reads require the recorded provider/version and verified retained hash; binary PDF proof does not assert substantive scientific content. Programme-bound onboarding bytes likewise remain scientifically undetermined. Unified/rendered stores with no verified normalized source parent remain undetermined without source-body/provider reads or guessed programme metadata.

Source references retain the placement container's actual programme/project/sequence/submission/leaf identity and the admitted typed source key; these fields do not claim a reconstructed source parent. Labels come only from admitted stored title/file-name fields. Editor links require the actual authoring alias and current rights, with an actual current section identity where available. Filing codes and titles never reconstruct editor targets.

Late checks re-read current parent/object rights and exact recorded source/body/hash/lifecycle identities before repeated bytes, then re-read identities and rights after bytes. They refuse changed evidence with a safe typed error under READ COMMITTED. This is a late-read defense, not an atomic revocation or lock/snapshot guarantee. Parent request readers independently bind and recheck retained placement pins/lifecycle and programme/pathway evaluation facts before returning combined JSON.
