# Vault passage freshness correction — D2 / W2

## What already exists

The canonical AdvancedRAGPipeline, Vault row mapper, candidate revalidation fences, actor/source guards, exact context verifier and Data Room/AnA consumers already exist. This increment extends their freshness checks for same-original-file re-extraction and same-ID chunk replacement. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) defines the proposed behavior and its limits.

## Evidence status

Discovery and proposed contract are recorded before new tests or production changes. Independent review, fail-first tests, qualification and direct canonical publication are pending. No implementation, test pass, deployment or agency acceptance is claimed by this initial record.

## Fail-first freeze

Four independently authored test files execute **55 cases: 41 semantic failures and 14 passing controls**, zero skips, on unchanged production. There are no import, fixture or runtime failures. `root/red*` retains exact commands, hashes, raw output, JSON results and exit status; `frozen-tests.json` pins all four files. All 29 selected baseline inputs remain byte-identical after the normal incoming merge. All new tests have zero lint errors/warnings. Worker scope files identify synthetic SQL/provider seams and the separate real SQL/PGlite suite; no live-provider or native-RLS claim is made.

## Qualified correction

Only `server/services/advancedRAGPipeline.ts` changes production. Initial dense/lexical rows pin extraction SHA-256 and nullable coordinates in the statement selecting the hit. Existing candidate fences verify current own text, literal membership, pinned extraction/coordinates and available-context fingerprint. Changed candidates are dropped; generation retains the existing whole-answer refusal. Dense hashing occurs after a materialized ranking limit, avoiding full-tenant repeated extraction hashing. No schema, dependency, provider, cache engine or tool is added.

The final exact-source run passes **269 tests in 27 files**, including all 55 frozen tests, zero failures/skips. `root/verified*` retains commands, hashes, raw results and exit status; `qualification-source-manifest-current.json` pins 65 selected inputs and one-hop imports, not a complete dependency closure. All frozen tests remain unchanged. Four existing suites receive truthful fixture metadata/source consistency without changed assertions. All eight changed test files have zero lint warnings/errors. Production has zero lint errors and the same nine pre-existing warnings, no growth.

The initial passing run is retained in `root/final*`. Lint then identified one new method-length warning; the identical dense SQL template was extracted into a private function in the same canonical service. No rule or baseline changed. The initial source is archived in `root/first-qualified-source.ts.txt` with its exact original command hash; current tests were rerun after extraction. Two independent implementation reviews and a final SQL-helper review are CLEAR (`root/implementation-reviews.json`).

## Limits

Literal membership cannot identify an exact span or distinguish repeated identical text. Exact-span references still require the existing verifier. NULL-extraction sources retain explicit legacy hit-only behavior; historical misaligned coordinates are not remapped or repaired. Tests use owner-mode PGlite for actual lexical/revalidation/context SQL and scripted provider seams for asynchronous boundaries. Dense mapping/SQL shape is tested with controlled rows, without a native pgvector planner or live-provider claim. Hashing adds bounded-candidate whole-extraction computation; no production latency benchmark or launch-readiness claim is made. Point-in-time fences cannot recall content already sent to a provider. Existing citation persistence can leave historical rows if a source changes during its await, even though final answer return is refused; that writer behavior is separate. Trimmed-backfill repair and the already-filed checksum cache race remain separate needs.

## Publication status

Contract head f50ed6d10 and incoming canonical history were preserved by normal merge 526e86cba and pushed directly with normal hooks. The 29 selected baseline inputs were unchanged by that merge. Fail-first freeze is dd4ae4dea. Current code and evidence are qualified locally; normal code-push TypeScript and remote publication proof are pending.
