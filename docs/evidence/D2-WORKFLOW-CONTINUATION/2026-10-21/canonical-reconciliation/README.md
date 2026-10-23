# Canonical workflow reconciliation, 21 October 2026

W1 / D2 continuation of work order C2C-2026-10-16. The interrupted local delivery is `70a3db998`, including eight unpublished commits after common ancestor `3cae08d23`. On resumption, canonical `30afd3bd1` contained 449 subsequent commits. This normal merge preserves both histories on `concept2cure-v2`; it does not introduce another development branch or rewrite published history.

## What already exists

- `server/routes/authoring.router.ts` already mounts document reads, editing, generation, review and filing. `server/services/authoring/authoring-document-read.ts` supplies the current-authority header, exact-section and list projections. The merge retains that compositor and carries the canonical `client_program_id` header into it so updated filing recovery can verify the same project.
- `server/services/authoring/authoring-read-scope.ts` already reuses current project/object authority and rechecks it after a read. Partial readers receive admitted sections without whole-document source facts. Saved-source history uses that same authority.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, `DocumentCanvas.tsx`, `FileToVaultDialog.tsx`, and the existing filing surfaces already deliver the editing and Vault handoffs. Canonical recovery, filing identity and uncertain outcomes are composed with current session/project reads, partial-read refusals, unsaved-work decisions and source-history withdrawal.
- `client/src/concept2cure/v2/editor/documentRecordRead.ts` is the existing canonical document-record read. The client reconciliation converges read validation onto that implementation while retaining current-access projection and selected-project requests.
- `server/routes/chat/send-message.ts` already enforces the current turn's read-only intent. Canonical strict tool-result handoff errors remain alongside those controls. The execution-level refusal in `server/services/ana/AnaToolExecutor.ts` remains authoritative.
- `server/services/client-intelligence-memory.ts`, `working-memory.ts`, and `memory-consolidation-job.ts` already provide memory. The merge keeps selected-project isolation and canonical exclusion of internal ReportOS manifests from raw memory recall.
- `tests/lineage/founder-path-lineage.pglite.test.ts` already walks the service chain. Its newer canonical MIME/MDN fixture supersedes the earlier local classification stub; the duplicate CMS mock is removed. External storage/rendering/provider/agency primitives remain explicit test seams.

## Verification boundary

The final merged server run passes **181 tests in eight suites**, with no skips or failures, in 69.28 seconds. It covers current document reads/access, saved-source history, snapshot authority, JSON read-only enforcement and the actual service lineage fixture. This is PGlite/mock-provider evidence, not a live approved-model or agency acceptance run.

Selected-project memory passes **119 tests in nine suites**, without skips or failures, in 37.96 seconds. Its raw output retains the fixture warnings. `results.json`, `backend-memory-pins.json` and `archives.json` record exact results, targeted inputs and lossless log archives. Client conflict regressions, production build and the final normal pre-push gates are recorded once complete. Earlier proof packets retain their original source pins and results; their counts are not added together or relabeled as fresh merged-tree verification. Exact publication SHA and hosted CI state are reported after the push.

## Remaining acceptance

The specified Codespace is not listed by this session's GitHub access, and its forwarded app returned HTTP 404 on 21 October. The managed environment reports no configured provider credentials. No prepared demo database was changed. WO-01 and WO-04 remain open until authorized QA completes the approved-model, evidence-grounded IND edit/save/reopen/review and restart workflow in that runtime. Provider approval flags, qualification, signatures and audit history were not fabricated to obtain a demo response.

Canonical now covers the existing Vault placement UI in `authoringVaultPlacementFlow.test.tsx`; the earlier second TODO is therefore not repeated as an open gap. The remaining `supersedes_id` TODO in `server/services/ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts` is still open. Commercial compliance and complete platform signoff are not claimed.
