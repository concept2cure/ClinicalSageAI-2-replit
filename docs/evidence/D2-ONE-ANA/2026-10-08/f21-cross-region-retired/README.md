# F21 (part): the Cross-region model verdict is retired

Launch row **D2**. This is the part of FILING_SPINE.md slice F21 that both decision documents call for:
- `docs/design/FILING_SPINE.md` F21 (break 23), CPO-decided;
- `docs/design/WORKFLOW_DECISION_2026-10-08.md` (proposed), under "What we stop": "The Cross-region model verdict (F21). A model producing a verdict breaks Rule 2."

The other part of F21, the Planner comparing regions over the deterministic engine, is **not done here**. The proposed workflow decision defers F21–F23 until after D10 (one partner filing), so it waits for the founder.

The slice was claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`. A research subagent mapped every reference first, read-only.

## What was wrong

- **A model list rendered as a verdict.** The Submission Center's Cross-region workspace asked a model which Module 1 deltas another region needed: `POST /api/submissions/:id/cross-region`, then `computeCrossRegionGap`, then the prompt `cross-region-gap`. It rendered the model's list as a verdict. When the list was empty, the screen read "No Module 1 deltas reported".
- **Fixed targets.** The targets were hard-coded to fda, eu and jp.
- **The same through AnA.** AnA could ask the same question through the tool `cross_region_gap_analysis`.
- **Rule 2.** A model producing a regulatory verdict breaks CLAUDE.md Rule 2.

## Deletion (CLAUDE.md working agreement)

- **History search:**
  - `git log --all --diff-filter=D -- 'client/**/*CrossRegion*'` returns nothing.
  - The workspace was never deleted and rebuilt before.
- **Replacements, by path:**
  - **What the platform can carry for another market, deterministically:** `server/services/regulatory/market-support.ts` (F19), through `GET /api/submissions/market-support`. It is shown on every region option of `surfaces/NewSubmissionForm.tsx` (F20) and on each submission row of ProjectHome's Submit tab. It is held by `server/services/regulatory/__tests__/market-support.test.ts` and `client/…/__tests__/{marketSupportLine,submissionCenterNewFromProject}.test.tsx`.
  - **Another region's Module 1 requirements:** the Planner's region profile (`GET /api/region-profiles/:region`, `SubmissionCenter.tsx`), held by `submissionCenterHonesty.test.tsx`.
  - **For AnA:** `resolve_submission_plan` (`submission-resolver.ts`), which reads the same market-support judgement.

## What changed

- **Client:**
  - `CrossRegionWorkspace` is removed from `SubmissionSeqWorkspaces.tsx`, and its now-orphaned `regL` and `SC_REGIONS` import with it.
  - In `SubmissionCenter.tsx`: its render, its `PER_SEQ_WS` entry and every copy naming it are removed, and "eight workspaces" becomes "seven".
  - The unused `ScCrossRegion` fixture type is removed.
- **Shared:**
  - The `cross-region` workspace is removed from `shared/types/submission-ui.ts`. It drives the tab bar and `set-workspace` validation.
  - It is removed from the `submissions.set-workspace` enum in `shared/navigation/surface-actions.ts`, so AnA can no longer ask for it.
  - `CrossRegionRequest` and `CrossRegionResponse` are removed from `shared/types/submission-api.ts`, along with the capability flag.
- **Server:**
  - `POST /:id/cross-region` and its capability flag are removed from `server/routes/submissions.ts`.
  - `computeCrossRegionGap` is removed from `submission-ai-service.ts`. Its header records the retirement.
  - The prompt directory `server/services/ai-gateway/prompts/cross-region-gap/` is deleted.
- **AnA:**
  - The tool definition, its two `AnaToolDefinitions.ts` entries, its handler, its authorization-register entry and its launch-inventory entry are removed.
  - Its line in `submission-center-tools.test.ts` and `sub-agent-toolset.test.ts` is removed, along with its input-guard test.
  - `docs/ana-capability-manifest.json` is regenerated (`npm run manifest:ana`). The regeneration also picked up earlier drift from other lanes' tool changes, which had not been regenerated.
- **API docs:**
  - `submission-center.openapi.json`: the path is removed (69 lines, nothing else touched).
  - `SUBMISSION_CENTER_API.md`: §6 now records the retirement and names the replacement.
  - `SUBMISSION_CENTER.http` and `SUBMISSION_CENTER.md` are updated.
  - Two living inventories are updated: `docs/design/FEATURE_AND_SERVICE_INVENTORY.md` and `docs/RECONCILE_intelligence_stack.md` (WO-7 is marked retired).
  - Dated audit snapshots are left as the record of their date.
- **`server/services/ana/__tests__/cross-region-retired.test.ts` (new).** It holds the retirement. It is modelled on `ind-tools-retired.test.ts` and checks:
  - AnA has no handler, offer, register entry or inventory entry for the tool;
  - there is no workspace, and AnA cannot open one;
  - there is no route, no `computeCrossRegionGap` and no prompt;
  - no client source renders "No Module 1 deltas reported" or posts to the route.

## Runs

| File | Result |
|---|---|
| `red/vitest.txt` | The retirement test at `97ab887d`, before the change: **4 failed**. |
| `green/vitest.txt` | **4 passed**. |

- Server: `server/services/{ana,submission-ai,reasoning-engine}`, `server/routes/__tests__`, `tests/ci` and `tests/services/regulatory`: **9747 passed, 8 skipped, 0 failed** (806 files).
- Client: `client/src/concept2cure/v2`, `tests/ui` and `shared`: **5630 passed** (527 files).
- `tsc --noEmit -p tsconfig.json`: **0 errors**.
- Lint: every changed file is at or below its HEAD count. `SubmissionSeqWorkspaces.tsx` went 9 → 8 and `AnaToolExecutor.ts` 100 → 99.
- Gates green: `ci:action-overclaim`, `ci:internals-in-copy`, `ci:launch-scope`, `ci:launch-scope-api` and `ci:surface-discoverability`.
- `ci:step-presentation`: red on trunk; see below.

### Found red on trunk, not this change's

`ci:step-presentation` fails with: "MISSING review_sop_requirements: no `present` block".
- It fails identically with this change stashed.
- The cause is a tool added by the SOP-expertise lane (`8b866b24`).
- The fix belongs to that lane: a `present` block for that tool in `tool-authorization.register.json`.
