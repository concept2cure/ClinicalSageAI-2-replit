# Finish Codespaces port selection and CSR polling

Plan: F1. Workstream W1, rowD2. Source baseline: `f6127e72231bd9e9f302f596a672f58b1b40db15`. Stay in the existing startup and one-editor workflow; no new product surface, service, route, table, dependency or provider policy. Root owns all jobs and Git.

## What already exists

- `scripts/startup.sh` owns `is_port_in_use`, `select_app_port`, and the existing Codespaces doctor-before-start flow. It scans up to 20 ports on every conflict, including Codespaces.
- `.devcontainer/post-start.sh` polls its requested `C2C_PORT`, while `devcontainer.json` forwards 5000. Silent fallback can start the backend on 5001 while the user still opens 5000. Those setup files remain with their owner; complete the existing unheld port selector by refusing busy requested ports in Codespaces only. Preserve local fallback and the real preflight.
- `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` already polls the narrative run every 2 seconds inside the existing CSR editor controls. Its `useNarrativeRun` accepts every completed response. An older running response can replace a newer completed outcome and restart polling.
- `csrNarrativeBuild.test.tsx` already covers running/completed/stalled/refused narrative states and QC. Extend that real component test with deferred out-of-order status replies, then retire superseded reads in the existing hook. No layout change.
- `StudyDataBuild.tsx` and `CsrRunBuilds.tsx` already remount project/document/run scopes; they are not duplicated or edited here.

Searches: current files/callers/routes, current coordination, full-history deleted-file searches for port and CSR progress tests. No deleted alternate implementation was found. The active CSR-draft route/accept/UI holds and the founder's D4-3 demo hold remain intact.

## Verification

First observe RED using actual sourced Bash against real TCP listeners and deferred real-component status replies. Keep free-port/local fallback controls, current narrative outcomes and refusals. Run focused tests and actual local application/browser checks appropriate to these existing paths, then normal direct hooked publication. No live model or agency request. Provider availability in the founder Codespace remains unverified.

## Results and limits

- Real TCP-listener port cases: initial RED **2 failures / 3 controls**, then **5 passing**. Both existing Codespaces markers refuse an occupied requested port without changing `PORT`; ordinary local fallback and free-port behavior remain covered.
- Narrative response ordering: initial RED **3 failures / 7 controls**. Independent review found a latency starvation defect in the first repair. A further frozen control reproduced it (**1 failure / 10 passing**); the final hook tracks the newest **applied** response, so pending later requests do not prevent progress. Older success cannot erase a newer error or completion; effect cleanup retires responses after job change/unmount.
- Final adjacent CSR component checks: **53 passing across 7 files**. Current startup/doctor/policy/qualification checks plus the port cases: **57 passing**. These counts are separate from live runtime checks.
- Actual `npm run dev` starts the existing local native fixture with Codespaces flags, the `app_service` role and RLS on. Database/schema/storage are ready. `/readyz` honestly reports `anaState: no_provider` and HTTP 503. No provider credential, signing or agency submission is exercised here.
- The existing APIs queued one source-bound parent job requesting only §1, then completed the existing **fact-only** patient safety narrative engine and returned a nonempty QC list. The parent reported complete for that selected-section request. This is not a full CSR, successful model generation, scientific validation, or filing readiness. Public CDISC files, clinical rows, narrative text and credentials remain outside Git.
- `native-narrative-prepare.json` is the wrapper receipt; `native-narrative-fixture.json` is the native operation result recovered from the retained unchanged raw output after detecting an output-name collision. No operation was replayed or result fabricated.

## Setup-owner handoff

The founder's actual Codespace and its secrets remain inaccessible from this session. The separate Codespaces setup owner retains `.devcontainer/**`, `scripts/ops/codespaces-*` and the human-testing manual. Read-only followthrough found that post-start's sample-data shortcut checks `adsl.xpt` alone while the fetcher writes files incrementally: interruption after ADSL can leave a partial bundle skipped at restart. That owner should finish whole-bundle detection/retry. This repair does not change held setup files, provider policy or clinical classification to work around it.

Source receipts pin selected code, static local imports, direct SQL and named configs; they do not claim a complete dynamic dependency graph. Each check retains its real exit, raw compressed output, hashes and before/after drift check. Browser fault injection and native outputs are recorded separately.

## Running-editor verification

`browser-order-attempt2` passed **three real Chromium cases** in 53.634 seconds: actual native completion inside the existing project→Author→CSR editor, deliberately reordered native completion versus stale running, and a newer injected read failure versus stale success followed by native completion. The fault cases explicitly change only browser response order/status; they do not claim backend response races. Completion refreshes headings and can remount the panel, so the component RED/GREEN tests remain the causal hook proof. The error case also checks the mounted panel before the next poll. No document/build/model/agency write was attempted in this browser walk; only the editor's existing room presence operations were allowed.

Attempt1's baseline passed but its fault harness timed out: React StrictMode retired the first priming effect, and normal presence requests had been overblocked. Its real failed receipt and result remain. Attempt2 fulfills all initial priming reads until the live panel displays progress, then delays an interval reply; it allows only the current document's room presence paths. This was a test-harness correction, with no production adjustment after the final component checks.

The actual rehearsal ran on an isolated local native database, not the founder's GitHub Codespace. The temporary app process group was stopped after the browser checks; port 5100 was verified closed. The source repair is `b180c0518c66d6876482e02a5d028e7f42b80950`; normal hooked publication and the accepted reference are recorded in the delivery receipt. The production build passed with no selected-source drift. No UI layout, extra editor, product navigation, provider policy or clinical source approval was changed.

For exact historical replay, `initial-csr-tests-from-final.patch` removes only the later latency control from the final tests and reproduces `csr-red-inputs.json`'s test hash. `latest-issued-hook-from-final.patch` reproduces the intermediate hook hash used by `csr-latency-red`. Their reconstructed bytes were checked against those retained hashes without modifying the working source. These are evidence patches, not changes to install.

## Canonical publication and merged checks

The first source push completed every gate, including full CLI TypeScript exit 0 with zero errors, but Git rejected its ref update because another session had advanced the canonical branch. `source-push-attempt1` preserves that real exit 1. A normal fetch and conflict-free merge retained 13 incoming commits, including the founder's P-104 plan updates, private-account scope, governed writes and peer review. The four owned code/test files were unchanged by that merge.

The retry `source-push` exited0 and directly advanced `origin/concept2cure-v2` from `ea3b158e6` to **`2216b9decb0dada59f967d116c72984f4ca6d7d7`**. All normal hooks passed, with zero TypeScript errors/CLI exit 0 and no lint-warning growth. There was no force push, PR, changed gate/baseline, deployment or provider-policy workaround.

On that accepted merged source, `csr-merged` repeats **53 passing tests across 7 files**, and `build-merged` passes. Original premerge runtime/readiness/browser result records were copied to `*-premerge.json` before the merged rehearsal. The merged native receipts identify the updated backend input set independently. The original 57 startup/qualification cases remain tied to their unchanged selected startup inputs; repeated CSR/browser cases are not added to an inflated cumulative total.

The accepted merged app also passed the three native/browser response-order cases in 62.036 seconds. Final evidence lint found one complexity warning in the browser test route handler. Its exact tested bytes are retained as `browser-narrative-order-tested.txt`; identical presence/write predicates were extracted into helpers. Both active browser scripts then passed lint with zero warnings, and the same three cases passed again in 63.611 seconds (`browser-delivery`). No production source changed during that test-helper cleanup.

Because the merged account scope also governs writes, the existing manual-editor rehearsal was copied into this packet and repeated on the accepted source: **save with deliberate change reason (HTTP200), reopen the saved text in a fresh browser context, and open the existing inline AnA controls** all passed in 24.418 seconds. Generation was not requested. The screenshot masks editable text and tables and was visually inspected. The final runtime stopped successfully and port5100 was verified closed.

`manifest.json` and `verify.py` require all25 named receipts, their actual expected exits (including preserved failures), raw hashes, unchanged frozen inputs, exact GREEN-to-accepted-code links, accepted Git blobs and tracked owned artifacts. The live helper versions are linked to their final browser receipts; the historical tested helper is linked to its snapshot. Run `python3 docs/evidence/F1/2026-11-06-codespaces-port-and-csr-polling/verify.py` from the repository after checkout.
