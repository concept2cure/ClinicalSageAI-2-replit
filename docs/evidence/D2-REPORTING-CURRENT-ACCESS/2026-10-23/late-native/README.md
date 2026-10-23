# Preserve concurrent native model provenance

## What already exists

The existing `ana/AnaToolExecutor.ts` reports each returned gateway call through `onModelResponse`. `ana/turn-record.ts` retains per-call metadata through `TurnRecorder.addServed`; `turn-record-models.ts` determines actual returned authors, and `ai-governance/approved-models.ts` qualifies their pinned identities. `turn-record-loop.ts` already collects raw tool calls and writes native-host turn records. Classic JSON chat retains its current read-only and project-source safeguards.

## Canonical reconciliation

After the reporting completion commit, canonical advanced from `dd749f3e5` through `2148660b9`. Normal merge `484ed08fc` preserves the reporting work and the incoming documentation and native-host provenance completion. The bounded source delta contains four runtime files and three model-call/host test files, with no reporting application source overlap. No additional application edits were made during this reconciliation.

The native hosts now pass the existing model-response observer and its collected returned calls into the existing recorder. The collector detaches primitive provider/model/request-ID metadata immediately, retaining callback order and unknown metadata. The canonical author qualifier therefore sees earlier unqualified or unknown returned authors, including before a later failure, instead of relying only on the final answer's model. A failed dispatch is not invented as a served call. The remaining absent later-input and tool-round facts are stated as limits. The model approval registry and read-only/project-source behavior are unchanged.

## Verification

All **50 tests in four suites pass**, with no failures, pending cases or TODOs, in **36.51 seconds**. The run covers all three incoming native model-call/host suites and the existing classic JSON read-only suite. Provider/executor seams are synthetic; no actual gateway, provider, deployed identity or agency is exercised. The native recorder tests use their existing SQL-backed writer/reader checks.

`checks.json` records the exact command and 12 source/test/helper hashes before and after execution, with no drift. Every previously qualified reporting client and backend target hash also remains unchanged after the merge; their separate results are not added to this run or relabeled as rerun. `tests.txt.gz` and `tests.json.gz` retain lossless output, pinned by `archives.json`.

Root owns the refreshed production build, full compiler, normal push gates and canonical publication. Live regulated/model acceptance remains separate.
