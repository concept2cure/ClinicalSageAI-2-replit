# Existing editor assembly completion — W1 / D2

| Scope | Owner | Status |
| --- | --- | --- |
| Existing queue/state | Root | Completed; final qualified hashes recorded |
| Focused queue regressions | ana_drafting_usecase | 16/16 passed; frozen |
| Actual Workbench integration | next_authoring_usecase | 31/31 passed; frozen |
| Git, global checks and human handoff | Root | Claimed |

Contract: `docs/design/ASSEMBLY_QUEUE_COMPLETION_2026-10-26.md`.

## What already exists

- `client/src/concept2cure/v2/editor/assemblyDraftQueue.ts` is the sole sequential candidate queue. It verifies the exact saved section before each draft, retains completed candidates and stops on refusal. It currently combines a confirmed populated row with an unconfirmed row as failed/stop, causing repeated retry starvation.
- `editor/assemblyBuildState.ts` defines the existing slot lifecycle. `editor/useAuthoringAssemblyBuild.ts` owns build/retry/stop, source-selection identity and retained individual review sessions; only failed/not-started slots are retried. No new queue/controller is needed.
- `editor/AuthoringAssemblyBuild.tsx` already displays each slot status/message and existing review/retry controls using the established disclosure, form and notice patterns. It renders statuses generically; no UI/CSS change is required.
- `editor/assemblyBuildTransport.ts` verifies scoped inventory/detail/sections and exact saved identities; failed/partial/foreign reads are unconfirmed, never empty. `editor/authoringDraftTransport.ts` owns generation and explicit reviewed acceptance. Keep both unchanged.
- `server/routes/authoring-assembly.ts`, `server/services/authoring/authoring-assembly.ts` and `authoring.router.ts` already own preview/commit and the section AI draft/accept endpoints. Existing source manifests and server acceptance base checks remain authoritative. No server/provider/store/schema change is needed.
- `editor/__tests__/authoringAssemblyBuild.test.tsx`, `workbenchAssemblyBuild.test.tsx` and `v2/__tests__/authoringDraftTermination.test.tsx` cover provider refusals, stop/currentness and retained candidate review. They omit a confirmed populated pending row followed by an eligible empty row.
- Existing automated browser hosts under D2-EDITOR-INTEGRATION and D2-EDITOR-LOCAL-JOURNEYS mount the real Workbench with synthetic HTTP. Reuse if useful; no replacement editor or product surface.

Root and two read-only audits searched queue/slot/assembly/retry/preserve names, client consumers, routes, services, shared contracts, AnA paths and migration locations. `git log --all --diff-filter=D -- '**/*assemblyDraft*' '**/*authoring-assembly*' '**/*AssemblyBuild*'` returned no deleted alternative. This completes existing assembly, not a new capability.

## Verification contract

A freshly verified exact saved row with non-whitespace content becomes terminal `preserved`, with the existing factual preservation message. Do not request a draft, alter text, create a candidate or imply acceptance for that row. Continue sequentially to later eligible empty rows. A preserved slot is excluded from ordinary retry; existing completed/accepted candidates and source-selection attribution stay intact. A deliberate later build is still available through existing controls.

Absent/unconfirmed/malformed/inaccessible saved rows remain failed and stop. Provider refusal, explicit Stop and context loss retain existing stop semantics. Check currentness and Stop after the read and before any continuation. Preserve the 20-section limit, region admission, exact single-section target and source-selection scoping. No automatic acceptance, writes, resubmission or provider credentials.

Root owns only assemblyDraftQueue.ts and assemblyBuildState.ts production edits, design/evidence/human checklist, integration/gates and normal direct Git. ana_drafting_usecase owns focused tests in a new assemblyDraftQueueCompletion.test.tsx and packet tests/. next_authoring_usecase owns additions to existing workbenchAssemblyBuild.test.tsx and packet workbench/; optional bounded browser evidence only after agreeing a reused host. Neither worker edits production or Git. No compiler beside tests/build/lint/global gates.

Retain meaningful behavioral RED through existing exports before production edits. Qualify focused and existing integration suites, strict lint with zero warnings, production build, seven existing editor/UI/size gates and normal pre-push full TypeScript gate. Never raise a baseline or refresh dependencies. All work lands directly on concept2cure-v2. Local/Codespaces only; automated synthetic HTTP cannot qualify a human session, live provider or regulatory submission.

## Qualified local increment

The existing queue now marks freshly confirmed nonempty pending sections **preserved** and continues to later eligible empty sections. Preserved rows are terminal for this retained queue and receive no generated candidate or acceptance. Individual review, existing candidate edits, source attribution and read/refusal/Stop/context boundaries remain in place. All-filled summaries state that no candidate awaits review. There are no product markup, CSS, route, schema, dependency or provider changes.

- Focused actual-hook regression suite: **16 passed** (tests/), after five meaningful pre-fix failures and 11 passing controls.
- Actual Workbench/controller/candidate-review integration: **31 passed** (workbench/final-green.json), after two meaningful UI failures. Both full runs retain existing act diagnostics from the direct project-switch case; the added cases introduce none.
- Root integration: **82 passed / five different suites** (integration-qualified.json), covering assembly, provider-truncation handling and current/saved source/document-start flows. These are **129 distinct tests in seven suites**, not historical rerun totals.
- Strict production/fixture/test lint: zero errors/warnings. The production build and all seven declared editor/UI/size gates pass. Normal pre-push TypeScript qualification and canonical publication are recorded separately after completion.
- final-qualified-inputs.json is the union of the declared final source/config/test inputs. Before/after hashes are stable in final receipts; this is bounded qualification, not an exhaustive dependency graph.

Automated HTTP fixtures do not qualify real human sessions, model science, source extraction or agency delivery. No new browser run is claimed: this increment has no markup/style change and uses the actual Workbench component suite. Human worksheet cases 107–110 were added as **Not run**; all 110 cases remain unexecuted human observations.

## Approved bounded scope supplements and historical checks

The initial approved contract remains frozen by the worker evidence. Strict lint exposed the existing Workbench test file/callback limits after adding two cases. Root approved extraction of its existing fixture data, plan and UI helpers into `editor/__tests__/workbenchAssemblyBuild.testSupport.ts` and a separate describe block; there is still one real editor host. No assertions were removed, and the final 31-case suite plus both fixture files pass strict lint. The first passing pre-extraction suite and size-lint failure remain historical.

Root also approved alignment of `v2/__tests__/authoringDraftTermination.test.tsx` after the initial integration run found a stale unscoped URL fixture (81 passed / one failed). `integration-fixture-classification.md` and the original compressed test retain that failure. URL.pathname matching and explicit document readScope now reflect existing scoped reads; every GET asserts programId. Original truncation, candidate retention, no-third-generation and no-acceptance assertions are unchanged. The production read policy was not changed. That first run is a fixture failure, not the queue defect RED.

The focused suite retains its first 6-failure epoch and final 5-failure RED separately. Only an overbroad source-change phase expectation was corrected: changing source selection leaves old pending slots isolated and makes the current selected set empty. Slot/source/no-generation boundary assertions remain intact; no product phase behavior was changed.

Independent final read-only review found no blocking issue in the two production files or the fixture correction. The existing target-blind summary/remaining predicate is unchanged; exact-target iteration never broadens to another target. Preserved is an observation of saved text, not approval, acceptance or current regulatory completeness. A later manual section draft remains available through the existing editor controls.
