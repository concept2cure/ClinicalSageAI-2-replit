# AnA Unicode read-window correction — D2 / W2

## What already exists

The registered read_project_document handler in `server/services/ana/document-catalog-tools.ts`, its shared fitter/settlement in `read-receipts.ts`, host whole-or-nothing budgets and guarded receipt writer already exist. This increment corrects their existing window/receipt alignment for complete surrogate pairs; it adds no reader, tool or store. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) records the accepted behavior.

## Chronological evidence record

Inventory, contract and selected baseline hashes were recorded before tests/production edits. New tests and publication proof will be added only as executed. No qualification, push or deployment result is claimed by this initial record.

## Fail-first freeze

Four independently authored new test files execute **45 cases: 25 semantic failures and 20 passing controls**, zero skips, on unchanged production. Failures are 11 handler, six executor, five stream and three actual guarded-writer cases. Every failure is an assertion about behavior, with no fixture/import/runtime failure. `root/red*` retains exact commands, hashes, raw output and JSON results; [frozen-tests.json](frozen-tests.json) records the freeze. All 17 selected baseline inputs and 22 existing regression files stayed unchanged. The 180-window corpus stops on its first baseline violation; full traversal is claimed only on a passing run.

The four frozen new test files have zero lint errors/warnings. An initial authoring-only max-params warning was corrected before the baseline run, without relaxing any rule. Original preparatory lint remains under `root/lint-authoring*`. Source/access and host receipt-store seams are synthetic where the worker scope files say so; the guarded-writer suite additionally executes actual legacy receipt INSERT/transaction SQL in owner-mode PGlite, without native RLS or live-provider claims.

## Initial qualified correction (historical at c116cae)

Only the existing `document-catalog-tools.ts` handler and `document-catalog-tool-defs.ts` guidance change production. A split requested start moves back one UTF-16 unit. Each fitted candidate ends before a split pair, or takes one whole pair when a one-unit request would otherwise be empty. The selected actual span is recomputed from final fit.size and used for both receipt spans; source slices and prospective coverage use the same bounds. Generic fitting, actor/version revalidation, receipt writing, host guards and flags remain unchanged.

The final exact-source run passes **517 tests in 26 files**, zero failures/skips, including all 45 new tests and the full 180-window public-API corpus. `root/final*` retains exact commands, hashes, raw output, JSON results and exit status. All six changed TypeScript files have **zero lint errors and warnings**, no growth. All four frozen files and 22existing regression files remain byte-identical. `qualification-source-manifest.json` pins 92 selected inputs and one-hop relative imports, not an exhaustive dependency graph.

`root/implementation-reviews.json` records two independent CLEAR reviews of bounds, whole-pair progress, selected-fit recomputation, exact snapshots, unchanged gates and accurate tool guidance. Worker scope files preserve authorship/handoff status; the initial execution verdict is `root/qualification.json`; the typing-correction section below identifies the current verdict.

## Limits and remaining needs

The correction preserves valid surrogate pairs, not full grapheme clusters, and adds no malformed-original repair/refusal. It does not change legacy coverage into actor/extraction/provider-served proof or automatically repair prior receipt history. Whole-or-nothing host guarantees apply to current receipt-eligible reads. Historical/no-host/ineligible windows preserve existing handler/no-newreceipt behavior and existing ordinary host truncation under squeezed budgets. Minimal metadata-heavy results retain the existing fitter fallback and still face actual host ceilings. Late possible-commit cancellation remains unconfirmed rather than a claimed rollback.

Source admission and executor/stream receipt storage in the relevant fixtures are synthetic. The writer suite additionally reaches actual guarded legacy receipt SQL and PGlite transactions; it does not qualify native RLS, concurrent locks, V2 durable admission or a live provider. This is not deployment, full launch qualification or agency acceptance. Stale retrieval after re-extraction, trimmed backfill source basis and the already-filed capture cache race remain separate needs.

## Initial publication attempt

Contract commits aa3e35951 and 332bbbbce were pushed directly with normal hooks. The implementation is qualified locally; whole-project TypeScript and code publication await the normal implementation push.

## Test-wrapper typing correction and current qualification

The first normal code push at `c116cae130761b1b423fbe51deb9d77264428597` was refused by whole-project TypeScript: one TS2345 because the test-only admitted service wrapper retained an optional property type. The complete failed push and compiler output remain in `root/implementation-push*`. No baseline was raised or hook bypassed.

The correction adds exactly one erased non-null assertion to that wrapper. The original frozen source is archived in `root/test-typing-original.ts.txt`; its exact diff, cause, hashes and independent CLEAR review are beside it. TypeScript 5.6.3 transpilation with identical ES2022/ESNext options produces byte-identical JavaScript before and after. No fixture value, test assertion, callback or production file changed.

Original `frozen-tests.json`, `qualification-source-manifest.json`, `root/final*` and `root/qualification.json` remain historical at the first code head. Current `frozen-tests-current.json` and `qualification-source-manifest-current.json` transparently record the single test-source hash change. The full current rerun (`root/verified*`) again passes **517 tests in 26 files**, including all 180 corpus windows; `root/lint-verified*` has zero errors and warnings. `root/current-qualification.json` is the current verdict. The original fail-first result is unchanged in meaning, with runtime-equivalence proof rather than rewritten history.

The documentation-only incoming commit `56a076306` was preserved by normal merge `43cde0d111`, without conflicts or changes to the 92 selected inputs. The normal retry push succeeded at `43cde0d111`: every mandatory gate passed and whole-project TypeScript returned zero errors / exit 0. Fresh remote checks matched all current selected inputs, test/freeze/production files, historical manifests and retained ancestors. See [PUBLICATION.md](PUBLICATION.md) and `root/code-verification.json`.
