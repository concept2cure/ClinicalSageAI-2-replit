# Current backend integration, 23 October 2026

W1 / D2 reconciliation of retained local checkpoint `b513b53e4` with canonical `55f75b72f`. The one backend merge conflict was the leaf-evidence test's type import. Its fixture now derives the leaf type from the existing subject's parameters, as canonical does, instead of retaining a duplicate imported alias. No assertion or production authority was changed by that resolution.

## What already exists

- `server/routes/authoring.router.ts` uses the request-owned current-read compositor in `services/authoring/authoring-document-read.ts`; selected-project identity, full/partial read projection and the `client_program_id` response remain intact.
- The router's existing review workflow is the canonical review record. Incoming retirement of the duplicate artifact projection and the filing-lock check are retained, together with its actual service lineage fixture and recorded applicant.
- `server/routes/chat/send-message.ts` and `server/services/ana/AnaToolExecutor.ts` retain current-turn read-only controls, execution refusal and the canonical tool-result handoff limits.
- `server/services/ana-wisdom-engine.ts`, the existing memory services and their selected-project readers retain project-only recall. Incoming honesty changes preserve unmeasured values as unknown and classify unrated platform patterns without manufacturing severity or confidence.
- The current reporting implementation and its recent changes are assessed in `../reporting-current-state/README.md`. No reporting surface or engine was added by this integration.

## Verification

One bounded invocation passes **362 tests in 23 suites**, with zero failures or skips, in **146.63 seconds**. It includes the current-read/access/source-history and snapshot regressions, JSON read-only execution, the service lineage, selected-project memory, report-state isolation, actual review workflow, leaf evidence, unmeasured wisdom and focused reporting refusal/signature/deadline checks.

`command.json` records the exact suite list and configuration. `target-pins.json` pins 40 target source/test inputs, all verified unchanged after the run. `tests-green.txt.gz` preserves the exact raw output, including fixture warnings; `result.json` records deterministic archive and decoded hashes. Earlier October 17–21 counts are not added to this run or relabeled as current results.

These are PGlite and explicit-seam results. The provider and agency boundaries remain mocked where the fixtures state; they do not establish native RLS, live approved-model generation, Codespace acceptance, real transmission or commercial compliance. Final client/build/compiler gates and publication are root-owned and recorded separately. Nothing was staged, committed or pushed by this backend reviewer.
