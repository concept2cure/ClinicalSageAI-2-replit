# Stage 6 — Workspace Smoke Pack (Governed Lifecycle)

Stage: Stage 6 — Governed Workspace and Document Lifecycle Hardening  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `40004a38` (`40004a38`) as Stage 6 baseline

## Smoke intent

Provide deterministic tripwire checks for beta-critical governed workspace flows without rewriting orchestration.

These checks validate **contract presence and wiring** for:

1. create document
2. open artifact
3. active context updates
4. placement / relocation
5. editor handoff
6. review / provenance / audit surface entry
7. return-state continuity

## Test file added

- `tests/stage6-governed-workspace-verifier.test.ts`

## Assertions covered

| Critical flow | Assertion evidence |
|---|---|
| Create new document | `handleCreateNew` and `handleCreateFromTemplate` still call canonical artifacts endpoint path |
| Open existing artifact | `openArtifactId` + `tryOpenForEdit` + `setMode('edit')` wiring remains intact |
| Active context update | `onActiveDocumentChange` callback effect + `onContentChange={handleDocContentChange}` preserved |
| Place / relocate artifact | `handlePlacementConfirm` and `<PlacementDialog ... onConfirm={handlePlacementConfirmWithCleanup} />` present |
| Editor handoff | `initialContent`, `onInitialContentConsumed`, `openArtifactId`, `onOpenArtifactConsumed` passed to `EditorPanel` |
| Review/provenance/audit entry | `switch (documentTab)` keeps inspector mapping (`provenance` / `compare` / `audit`) and `GovernedDocumentPanel` mount |
| Return-state continuity | `localStorage` save/restore for `c2c_last_artifact_${projectId}` remains in shell |
| Parent shell integration | `ZenApp` still clears pending handoff state and receives active document context |
| Backend route support | `server/routes/concept2cure.ts` still exposes artifact list/create, placement, provenance, versions, and export endpoints |
| Safe extraction proof | `SectionRequirementsPanel` imported from standalone child file and still mounted by shell |

## Validation commands

- `npx vitest run --config vitest.config.ts tests/stage6-governed-workspace-verifier.test.ts`
- `npx vitest run --config vitest.config.ts tests/phase2-hardening.test.ts tests/phase8-governed-operations.test.ts tests/phase9-persistence-permissions.test.ts`

## Scope clarification (reality check)

Stage 6 smoke pack is primarily **source-shape contract verification** for governed workspace lifecycle wiring.  
It is not a full authenticated browser E2E proof.

This is intentional for Stage 6 because the mission is hardening core orchestration safety while avoiding deep rewrites.

