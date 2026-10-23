# Vault passage freshness correction — D2 / W2

## What already exists

The canonical AdvancedRAGPipeline, Vault row mapper, candidate revalidation fences, actor/source guards, exact context verifier and Data Room/AnA consumers already exist. This increment extends their freshness checks for same-original-file re-extraction and same-ID chunk replacement. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) defines the proposed behavior and its limits.

## Initial evidence status (historical)

Discovery and proposed contract are recorded before new tests or production changes. Independent review, fail-first tests, qualification and direct canonical publication are pending. No implementation, test pass, deployment or agency acceptance is claimed by this initial record.

## Fail-first freeze

Four independently authored test files execute **55 cases: 41 semantic failures and 14 passing controls**, zero skips, on unchanged production. There are no import, fixture or runtime failures. `root/red*` retains exact commands, hashes, raw output, JSON results and exit status; `frozen-tests.json` pins all four files. All 29 selected baseline inputs remain byte-identical after the normal incoming merge. All new tests have zero lint errors/warnings. Worker scope files identify synthetic SQL/provider seams and the separate real SQL/PGlite suite; no live-provider or native-RLS claim is made.

## Qualified correction

Only `server/services/advancedRAGPipeline.ts` changes production. Initial dense/lexical rows pin extraction SHA-256 and nullable coordinates in the statement selecting the hit. Existing candidate fences verify current own text, literal membership, pinned extraction/coordinates and available-context fingerprint. Changed candidates are dropped; generation retains the existing whole-answer refusal. Dense hashing occurs after a materialized ranking limit, avoiding full-tenant repeated extraction hashing. No schema, dependency, provider, cache engine or tool is added.

The preceding exact-source run passes **269 tests in 27 files**, including all 55 frozen tests, zero failures/skips. `root/verified*` retains commands, hashes, raw results and exit status; `qualification-source-manifest-current.json` pins 65 selected inputs and one-hop imports, not a complete dependency closure. All frozen tests remain unchanged. Four existing suites receive truthful fixture metadata/source consistency without changed assertions. All eight changed test files have zero lint warnings/errors. Production has zero lint errors and the same nine pre-existing warnings, no growth.

The initial passing run is retained in `root/final*`. Lint then identified one new method-length warning; the identical dense SQL template was extracted into a private function in the same canonical service. No rule or baseline changed. The initial source is archived in `root/first-qualified-source.ts.txt` with its exact original command hash; current tests were rerun after extraction. Two independent implementation reviews and a final SQL-helper review are CLEAR (`root/implementation-reviews.json`).

## Limits

Literal membership cannot identify an exact span or distinguish repeated identical text. Exact-span references still require the existing verifier. NULL-extraction sources retain explicit legacy hit-only behavior; historical misaligned coordinates are not remapped or repaired. Tests use owner-mode PGlite for actual lexical/revalidation/context SQL and scripted provider seams for asynchronous boundaries. Dense mapping/SQL shape is tested with controlled rows, without a native pgvector planner or live-provider claim. Hashing adds bounded-candidate whole-extraction computation; no production latency benchmark or launch-readiness claim is made. Point-in-time fences cannot recall content already sent to a provider. Existing citation persistence can leave historical rows if a source changes during its await, even though final answer return is refused; that writer behavior is separate. Trimmed-backfill repair and the already-filed checksum cache race remain separate needs.

## Publication status

Contract head f50ed6d10 and incoming canonical history were preserved by normal merge 526e86cba and pushed directly with normal hooks. The 29 selected baseline inputs were unchanged by that merge. Fail-first freeze is dd4ae4dea. Current code and evidence are qualified locally; normal code-push TypeScript and remote publication proof are pending.

## SQL inspection rejection and retry qualification

The first normal code push at 557c4a31d was refused by the SQL inspection gate before TypeScript: extracting the SQL string outside `.query` reduced the scanner's visible count from 44 to 39. This was a visibility change, not an actual removal of interpolation. The failed push remains in `root/implementation-push*`; no baseline was lowered or relaxed.

The private helper now directly executes `client.query` with the same literal SQL and arguments. All five interpolations are visible to the unchanged scanner, which passes with the original 44 allowance. A further independent review is CLEAR (`root/query-helper-review.json`). The current exact-source run (`root/retry*`) again passes **269 tests in 27 files**, all four frozen files unchanged. `root/lint-retry.json` has zero errors, nine existing production warnings, no growth and zero test warnings. `qualification-source-manifest-retry.json` and `root/retry-qualification.json` are the current qualification; earlier manifests remain historical. Normal retry push and TypeScript are pending.

## Historical archive size correction

The normal e300ea177 push passed SQL inspection, then the repository size gate refused one additional production file above 100,000 bytes before TypeScript. The initial investigation split the historical source archive; the subsequent size report identified advancedRAGPipeline.ts at 100,382 bytes as the counted production file. The full rejection is retained in `root/retry-push*`. The archive is now split into two plain-text parts under the unchanged ceiling. `root/first-qualified-source.parts.json` pins their hashes/order and the original reconstructed hash; concatenation is byte-identical to the source used by `root/final.command.json`. No source/test behavior, qualification input hash, warning allowance or gate/baseline changed. Earlier references to the unsplit archive describe its historical copy at 557c4a31d. Current qualification remains 269 tests / 27 files; final normal push is pending.

The production size correction consolidates the repeated tenant-refusal history into three comments retaining the owner/RLS caveat and the original in-repository proof path. Executable statements remain unchanged; the service is below the existing ceiling. `root/size-correction.json` records exact sizes and hashes. The split historical .txt archive was not in the production scanner count; its earlier suspected role was corrected after inspecting the actual report. The current exact-source qualification will be recorded as `root/release*`; TypeScript remains pending the normal push.

## Current release qualification

`root/release*` passes **269 tests in 27 files**, including all 55 unchanged frozen tests, zero failures/skips. `qualification-source-manifest-release.json` pins the current 65 inputs; `root/release-qualification.json` is the current verdict. `root/lint-release.json` retains zero errors, nine pre-existing production warnings, zero test warnings and no growth. The size gate passes at its unchanged 56-file byte / 114-file line ceilings (`root/health-release.txt`). Source and frozen hashes remained unchanged during the run. Normal final push and whole-project TypeScript are pending; the earlier pending/misdiagnosed archive status is superseded by this record and `root/size-correction.json`.

## Test typing correction and current qualification

The normal release push at merge c0f535753 passed every preceding gate, then whole-project TypeScript refused two TS18048 errors: optional mock-call params in the mapping test. Complete output remains in `root/release-push*`. The correction adds exactly two erased non-null assertions to those already-selected calls. No fixture, assertion, value or production code changed. The original frozen source is retained in `root/test-typing-original.ts.txt`; its exact diff, TypeScript 5.6.3 ES2022/ESNext transpilation proof and independent CLEAR review are beside it. Emitted JavaScript is byte-identical (SHA-256 803412963a4cd732e120e52983727eeac287ddd3f633dd9c6b8ec56035303878).

The original freeze and manifests remain historical. `frozen-tests-typed.json` and `qualification-source-manifest-typed.json` explicitly record the one corrected test-source hash; runtime fail-first meaning remains unchanged, without rerunning baseline against changed production. Current `root/typed*` again passes **269 tests in 27 files**, all 55 new cases, zero failures/skips. `root/lint-typed.json` has zero errors, nine existing production warnings and zero test warnings. `root/typed-qualification.json` is current. No gate or baseline was changed. The incoming 22 canonical commits were preserved by normal merge c0f535753; all 65 selected inputs stayed qualified and there were no conflicts. Final normal TypeScript retry/publication is pending.
