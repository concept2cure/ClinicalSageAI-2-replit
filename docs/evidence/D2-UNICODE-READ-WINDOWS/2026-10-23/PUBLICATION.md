# AnA Unicode read windows — D2 / W2 publication

The correction is pushed directly to `concept2cure-v2` at accepted code head `43cde0d111d1c9fdd8f6454435b15ccf3f7541b1`. No PR, alternate branch, force push, rule/baseline change or hook bypass was used. Incoming work was merged normally without conflicts; all 92 current selected qualification inputs match the accepted Git tree.

## What already exists

The correction extends `read_project_document` in `server/services/ana/document-catalog-tools.ts` and its existing tool guidance. It keeps the generic fitter, actor/source/version checks, host budgeting, private snapshots, guarded receipt writer and flags in place. [INVENTORY.md](INVENTORY.md) records existing pieces/searches; [CONTRACT.md](CONTRACT.md) records accepted behavior.

A split requested start moves back one UTF-16 unit. A split candidate end moves inward unless that would empty a one-unit window, when one complete two-unit character is returned. Every rendered source slice and prospective coverage uses that actual span. Both receipt spans are recomputed from the selected fitted size, rather than the last candidate rendered. Guidance discloses actual UTF-16 bounds and the minimum whole-character exception.

## Qualification and history

- Baseline: `26d85015640a87dc06fda9209f4eef678970c279`.
- Contract/clarification: `aa3e35951`, `332bbbbce`; normal documentation push succeeded.
- Original fail-first freeze: `e3fb63771c79f7feb5891369637316f7ebe8ad44`.
- Initial implementation: `fc1899262afaa4f02cbcbd2c559e587e2cdbe0a6`; initial merge `c116cae130761b1b423fbe51deb9d77264428597`.
- Test-only typing correction: `aeac06998681673176bb63ce42f0d35da40b82bc`.
- Accepted merge/code head: `43cde0d111d1c9fdd8f6454435b15ccf3f7541b1`.
- Four new files: **45 cases**, with **25 semantic failures / 20 passing controls** on unchanged baseline, zero skips or fixture errors. All pass after correction.
- Current exact-source run: **517 tests / 26 files passed**, zero failures/skips. The public-API property test fully checks **180 source windows**. See `root/verified*`.
- All six changed TypeScript files: **zero lint errors/warnings**, no warning growth. See `root/lint-verified*`.
- Actual normal retry push: **all mandatory gates passed**, including whole-project TypeScript **zero errors / compiler exit 0**. See `root/retry-push*`.

The first code push was rejected by one TypeScript error in a test wrapper's optional admitted-service property. The original complete push output is retained under `root/implementation-push*`. Exactly one erased non-null assertion corrects its type. Original source, diff, cause and independent review remain under `root/test-typing*`; identical TypeScript 5.6.3 ES2022/ESNext transpilation emits byte-identical JavaScript with SHA256 `db801cd38bc450a26dd74b0e03617b6ba8317825b122371f331612c7a1379dd3`. No fixture, assertion, callback or production behavior changed. The full current tests/lint were rerun afterwards; no baseline was raised.

The original `frozen-tests.json`, `qualification-source-manifest.json`, `root/final*` and `root/qualification.json` remain historical at e3fb/c116. Current `frozen-tests-current.json`, `qualification-source-manifest-current.json`, `root/verified*` and `root/current-qualification.json` record the single test-source hash change and current acceptance. A short tool-access interruption is documented in `root/runtime-continuity.json`; the original first push survived without a duplicate process.

## Remote verification and final evidence

`root/code-verification.json` records fresh local = remote `43cde0d111d1c9fdd8f6454435b15ccf3f7541b1`, clean tracked files and no unmerged entries. It verifies remote Git bytes for all **92 current selected inputs, 26 current test files, four current frozen tests, two production files and 63 evidence files tracked at that code head**. It also verifies the original 92-input manifest at c116 and original four frozen tests at e3fb. All **91 recorded retained ancestors** remain reachable. Pending evidence files are explicitly listed.

This final evidence-only publication adds the actual retry receipt, verification and final documentation. `publication-manifest.json` pins every evidence file in this directory except itself. Final read-only fresh-fetch checks verify that manifest, every pinned file, current source inputs and retained history against the published branch, with the last check reported in tool output to avoid recursive proof commits. Source manifests cover selected inputs and one-hop relative imports; they are not exhaustive dependency graphs. Worker handoff files preserve authorship status; the current execution verdict is `root/current-qualification.json`.

## Limits

The fix preserves valid surrogate pairs and exact UTF-16 spans, not full grapheme clusters. It adds no malformed-original repair/refusal and rewrites no historical receipts. Legacy coverage remains legacy byte-bound history, not actor/extraction/provider-served proof. Whole-or-nothing host protection is qualified for current receipt-eligible reads; historical/no-host/ineligible reads retain existing ordinary host truncation under squeezed budgets. Existing minimum metadata fallback and late possible-commit cancellation semantics remain unchanged.

Executor/stream source and receipt-store seams are synthetic; scripted gateway captures prove host dispatch parameters only. Guarded-writer tests additionally execute actual legacy receipt SQL and transactions in owner-mode PGlite with explicit synthetic source/actor admission, without qualifying native RLS, concurrent locks, V2 durable receipts or a live provider. This is not deployment, full launch qualification or agency acceptance. Stale retrieval after re-extraction, trimmed backfill source basis and the already-filed capture cache race remain separate needs.
