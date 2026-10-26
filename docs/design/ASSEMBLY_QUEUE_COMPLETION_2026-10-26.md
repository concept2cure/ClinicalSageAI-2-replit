# Complete assembly preparation after saved text appears

W1 / D2; concept2cure-v2 only, local/Codespaces.

## What already exists

- `client/src/concept2cure/v2/editor/assemblyDraftQueue.ts` is the sole sequential candidate queue. It verifies the exact saved section before each draft, retains completed candidates and stops on refusal. It currently combines a confirmed populated row with an unconfirmed row as failed/stop, causing repeated retry starvation.
- `editor/assemblyBuildState.ts` defines the existing slot lifecycle. `editor/useAuthoringAssemblyBuild.ts` owns build/retry/stop, source-selection identity and retained individual review sessions; only failed/not-started slots are retried. No new queue/controller is needed.
- `editor/AuthoringAssemblyBuild.tsx` already displays each slot status/message and existing review/retry controls using the established disclosure, form and notice patterns. It renders statuses generically; no UI/CSS change is required.
- `editor/assemblyBuildTransport.ts` verifies scoped inventory/detail/sections and exact saved identities; failed/partial/foreign reads are unconfirmed, never empty. `editor/authoringDraftTransport.ts` owns generation and explicit reviewed acceptance. Keep both unchanged.
- `server/routes/authoring-assembly.ts`, `server/services/authoring/authoring-assembly.ts` and `authoring.router.ts` already own preview/commit and the section AI draft/accept endpoints. Existing source manifests and server acceptance base checks remain authoritative. No server/provider/store/schema change is needed.
- `editor/__tests__/authoringAssemblyBuild.test.tsx`, `workbenchAssemblyBuild.test.tsx` and `v2/__tests__/authoringDraftTermination.test.tsx` cover provider refusals, stop/currentness and retained candidate review. They omit a confirmed populated pending row followed by an eligible empty row.
- Existing automated browser hosts under D2-EDITOR-INTEGRATION and D2-EDITOR-LOCAL-JOURNEYS mount the real Workbench with synthetic HTTP. Reuse if useful; no replacement editor or product surface.

Root and two read-only audits searched queue/slot/assembly/retry/preserve names, client consumers, routes, services, shared contracts, AnA paths and migration locations. `git log --all --diff-filter=D -- '**/*assemblyDraft*' '**/*authoring-assembly*' '**/*AssemblyBuild*'` returned no deleted alternative. This completes existing assembly, not a new capability.

## Approved completion contract

A freshly verified exact saved row with non-whitespace content becomes terminal `preserved`, with the existing factual preservation message. Do not request a draft, alter text, create a candidate or imply acceptance for that row. Continue sequentially to later eligible empty rows. A preserved slot is excluded from ordinary retry; existing completed/accepted candidates and source-selection attribution stay intact. A deliberate later build is still available through existing controls.

Absent/unconfirmed/malformed/inaccessible saved rows remain failed and stop. Provider refusal, explicit Stop and context loss retain existing stop semantics. Check currentness and Stop after the read and before any continuation. Preserve the 20-section limit, region admission, exact single-section target and source-selection scoping. No automatic acceptance, writes, resubmission or provider credentials.

Root owns only assemblyDraftQueue.ts and assemblyBuildState.ts production edits, design/evidence/human checklist, integration/gates and normal direct Git. ana_drafting_usecase owns focused tests in a new assemblyDraftQueueCompletion.test.tsx and packet tests/. next_authoring_usecase owns additions to existing workbenchAssemblyBuild.test.tsx and packet workbench/; optional bounded browser evidence only after agreeing a reused host. Neither worker edits production or Git. No compiler beside tests/build/lint/global gates.

Retain meaningful behavioral RED through existing exports before production edits. Qualify focused and existing integration suites, strict lint with zero warnings, production build, seven existing editor/UI/size gates and normal pre-push full TypeScript gate. Never raise a baseline or refresh dependencies. All work lands directly on concept2cure-v2. Local/Codespaces only; automated synthetic HTTP cannot qualify a human session, live provider or regulatory submission.
