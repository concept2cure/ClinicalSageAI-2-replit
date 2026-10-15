# P0-12 residual (DP-08, DP-09): model output on any chat path proposes writes and never makes them; AnA's erasure fails honestly

Rows **D5/D6**. Plan item P0-12 (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`), findings DP-08 and DP-09. Date 2026-10-01, base `66e82a6d`.

The plan row still read *"Open: DP-09, prompts on the non-SSE chat paths … the every-write tier … waits on hot files"*. Since then, P0-12 part 2 (`94036a27`) and P1-34 (`aa4d5552`, the tool register) landed. This folder establishes what holds at HEAD, door by door, and closes what did not.

## Question 1: can model output on any chat path change state without a person's confirmation?

**At HEAD, yes, through one door: the ` ```ana-action ` block.** Every other door held. The table is the full survey (read at HEAD, then pinned by a test).

| Door | Where | At HEAD `66e82a6d` | Now | Test |
|---|---|---|---|---|
| ` ```ana-action ` block, live stream | `routes/ana-ri/post-processing.ts` → `processResponseActions` (`services/ana-guidance-executor.ts`) | **OPEN.** A `strong`/`moderate` block created a governed artifact (`executeGovernedAnaOperation`). A `review_thread` block also opened a review thread with a comment **in the person's name**. Nobody was asked, and neither the command partition nor the tool register saw it. | The block becomes the canonical `create_artifact` command, put through `executeCommands` with no confirmation, so it returns the confirm-tier `HUMAN_CONFIRMATION_REQUIRED` proposal on `post_done.executedCommands`. Nothing is written. | `routes/ana-ri/__tests__/post-processing-action-block-proposal.test.ts`, `services/ana-ri/__tests__/ana-action-block-proposal.test.ts` |
| ` ```ana-action ` block, `POST /api/chat` | `routes/chat/send-message.ts` STEP 6b | **OPEN**, the same writes | The same proposal, in the response's `executedCommands` | `ana-action-block-proposal.test.ts` ("both chat paths …") |
| ` ```command ` block in the reply | post-processing → `processCommandsInResponse` → `executeCommands` | Held since `94036a27`: every `effect: 'write'` is propose-only, and `humanConfirmed` is written only in `routes/ana-ri/utility.ts` | Unchanged | `services/ana-ri/__tests__/chat-doors-propose-only.test.ts` (with a control), `propose-only-partition.test.ts`, `confirm-tier.test.ts` |
| `execute_platform_command` in the agentic loop (`/api/chat`, the `/ana` socket, `/api/claude/agent`, deep investigation) | `services/ana/AnaToolExecutor.ts` bridge → `executeCommands`, with no `humanConfirmed` on the command context | Held. **But on `/api/chat` the proposal reached only the model**: the response carried no `executedCommands`, so nothing could prompt the person. | Held. `/api/chat` lifts each proposal into `executedCommands` (`pendingSignoffFromToolResult`), so a client renders the sign-off prompt. A confirmation on the *tool* context is not passed to the command. | `chat-doors-propose-only.test.ts`, `chat-turn-proposals.test.ts` |
| Any other tool, on every path | the `registerToolHandler` wrapper (`preHandlerRefusal` rule 3, register `confirm`) | Held since `aa4d5552`. `toolHandlers` is written only by `registerToolHandler`. `/api/claude/agent` passes no tool context at all, so it fails closed. | Unchanged | `services/ana/__tests__/tool-authorization-enforcement.test.ts`, `direct-mutator-confirm-gate.test.ts` |
| Live stream tool calls | `routes/ana-ri/stream.ts` `settleApprovals` → `classifyToolCall` | Held. A governed call holds the turn, and the action runs only inside `POST /governed-action`. | Unchanged | `governed-tool-gate.test.ts`, `confirm-tier.test.ts` ("the stream holds a tool …") |
| Utility routes | `utility.ts` `POST /governed-action` (the sole `humanConfirmed` writer, which needs a person's confirm, reason or e-signature); `generate-execute.ts` `POST /execute` (no `humanConfirmed`, so writes are proposed); `/seal-verified-version` (a person's re-verified act) | Held | Unchanged | `propose-only-partition.test.ts` ("single writer") |
| MCP connector | `server/mcp/tools/runtime.ts` `callAnaHandler` → the wrapped handlers. All seven it calls are register `read`. | Held for AnA's tools. The connector's own write is the residual below. | Unchanged | `server/mcp/__tests__/mcp-governed-role-gate.test.ts` |

### Two further defects found on the same paths, and fixed

- **`POST /api/chat` could not put a proposal to the person.** The plan row's "prompts on the non-SSE chat paths". This is fixed for the action blocks and for platform commands, as in the table.
- **"Action executed successfully." was stored for a turn where nothing ran.** When a reply was nothing but blocks, both paths stored that sentence whenever any result existed. That included a proposal nobody had confirmed, and a refusal (`RBAC_DENIED`, `GOVERNANCE_UNAVAILABLE`). `blocksOnlyAnswer` now says which: *"AnA proposed an action. Nothing has changed yet …"*, or *"Nothing was changed. <the refusal>"*. Only a turn where everything ran keeps the old sentence. Separately, `send-message.ts` now replaces the text only when blocks were actually removed. Before, an empty reply with no blocks would have been stored as that sentence too.

## Question 2: does AnA erasure still run from chat, and is DP-09 gone?

- **From chat it is only ever proposed, at the e-signature tier.** `erase_personal_data` in a model reply comes back as `HUMAN_CONFIRMATION_REQUIRED`, tier `esignature`, with nothing written. That has held since `8ebe3040` (P0-12 part 1). It runs only through `POST /api/ana-ri/governed-action` after a reason for change and server-side re-authentication. `chat-doors-propose-only.test.ts` pins it on a reply, and `propose-only-partition.test.ts` pins it on the partition.
- **DP-09 was fixed by `dc48d926` (2026-09-28)** in `server/services/ana-ri/command-executor.ts`:
  - The swallowing `.catch(() => ({ rows: [] }))` inside `BEGIN … COMMIT` is gone. `runIfTablePresent` puts each statement under a `SAVEPOINT`, and only a missing table (`42P01`) is reported as "not applicable". Any other error rolls the whole erasure back.
  - The `gdpr_data_subject_requests` record is required.
  - The signature is written first, under the signer's own name.
  - Regulated artifacts are kept, not overwritten (GDPR Art. 17(3)(b)).
- **One erasure.** `80cbd718` retired the duplicate HTTP erasure path, which now answers 410 and names the signed path.
- **Proof.** Put the pre-`dc48d926` swallow back into a copy of the current handler (`red/dp09_mutant.py`), and three of the erasure suite's cases go red. At HEAD all seven pass.

## Deleted behaviour and its replacement (working agreement)

AnA no longer creates an artifact or a review thread on her own word. The replacements, by path:

- **The artifact.** The `create_artifact` proposal, rendered by `extractPendingSignoffs` (`client/src/concept2cure/components/ana/useGovernedAction.ts`, reached from `useAnaChat.ts` `post_done`). Confirming it posts to `POST /api/ana-ri/governed-action` (`server/routes/ana-ri/utility.ts`), which runs `createArtifact` (`server/services/ana-ri/command-executor.ts`). That is the same quality gate and governed persistence the old executor used. `ana-action-block-proposal.test.ts` proves the confirmed proposal writes the content.
- **The review thread and its comment.** The `create_review_thread` and `add_review_comment` commands, proposed through the same partition, once the backing memo exists.

## Red / green

| | File | Result |
|---|---|---|
| red | `red/ana-action-door-before-fix.txt` | HEAD sources. **9 of 10 fail.** The live stream created the memo artifact on the model's word (`[AnA Executor] Created memo: id=501`), and the action-block module carried its own writes. |
| red | `red/non-sse-prompts-before-fix.txt` | Tree after the action-block fix, before the prompt and answer fixes. **9 of 11 fail.** No `pendingSignoffFromToolResult`; `send-message` does not lift loop proposals; `blocksOnlyAnswer` says "executed successfully" over an `RBAC_DENIED`. |
| red | `red/dp09-swallowed-error-mutant.txt` | The DP-09 swallow reinstated in a copy of the current handler (`red/dp09_mutant.py`). **3 of 7 erasure cases fail**: a failed redaction reports success, an absent table reports 0, and a missing request table reports success. |
| green | `green/doors-after-fix.txt` | **46 / 46** across the five door suites, including the two controls that show a confirmed context reaches the handler. |
| green | `green/dp09-erasure-at-head.txt` | **7 / 7** erasure cases at HEAD. `command-executor.ts` is unchanged by this item. |
| green | `green/neighbour-suites.txt` | **1,165 / 1,167** across 92 files: every `ana-ri` route and service suite, the gate and wrapper suites, and the chat route suites. The 2 are 10 s PGlite-creation timeouts under the parallel run, in `artifact-approval-follows-status.pglite.test.ts`, which imports none of the changed files. Alone it passes 12 / 12, and that run is in the same file. |
| green | `green/gates.txt` | `check:security-patterns`, `ci:server-error-leaks` and `ci:discarded-audit-write` pass. `ci:duplicate-exported-types` fails on three names (`CtqCategory`, `DocumentProvenance`, `EligibilityAssessment`), each declared twice in committed files at HEAD that this change does not touch. This change adds no colliding name and removes one (`AnaActionResult`). |
| green | `green/eslint.txt` | 0 errors. No file's warning count rose: `ana-guidance-executor.ts` 9 → 3, `post-processing.ts` 5 → 4, `send-message.ts` 22 → 22. The new tests are clean. |

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/services/ana-ri/__tests__/ana-action-block-proposal.test.ts \
  server/routes/ana-ri/__tests__/post-processing-action-block-proposal.test.ts \
  server/services/ana-ri/__tests__/chat-turn-proposals.test.ts \
  server/services/ana-ri/__tests__/chat-doors-propose-only.test.ts \
  server/services/__tests__/ana-guidance-executor.test.ts
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/services/ana-ri/__tests__/ana-governed-command-signature.pglite.integration.test.ts -t erase_personal_data
# DP-09 mutant: python3 docs/evidence/D6/2026-10-01-tranche-4/P0-12-residual/red/dp09_mutant.py, run
# server/services/ana-ri/__tests__/dp09-mutant.pglite.integration.test.ts -t erase_personal_data, then delete both generated files.
```

## Residuals (not changed here)

1. ~~**The prompts still tell AnA that an `ana-action` block "auto-saves".**~~ Fixed in the fix round below, except one line in a file outside this item: the `execute_platform_command` tool definition (`server/services/ana/bla-biologics-tool-defs.ts` L781, L786) still says *"re-issue with params.confirm = true"*. The exact replacement is in the fix round's residuals.
2. **Tool proposals on the non-SSE paths are not confirmable.** A tool that writes on its own handler is confirmable only from a held run (`TOOL_NEEDS_HELD_RUN`), which `/api/chat`, `/api/claude/agent` and deep investigation do not have. Its proposal reaches the model, which relays it, and nothing runs. Making these confirmable means giving those paths a run row, or a confirmation route that records the tool context server-side.
3. **`/api/claude/agent` returns no `executedCommands`** (`server/routes/ana-intelligence.ts`, outside this item). Its proposals reach only the model. The same lift as `send-message.ts` (`pendingSignoffFromToolResult` in `onToolExecution`) applies.
4. **The MCP connector's one write**, `c2c_file_draft_for_review` (`server/mcp/tools/governed.ts`), runs on the external client's call with no per-call confirmation from the platform. It is authorised by:
   - the `c2c:file` scope the person granted at OAuth consent;
   - an editor role, read live (GS-S-1);
   - an audit row.

   It creates only a draft leaf in an unlocked sequence, and freezing, signing and transmitting stay in the app. Per-call approval belongs to the MCP host by protocol. Whether a connector write also needs a confirmation in the platform is a product decision.
5. **Draft version history.** A tool draft (`status: 'generated'`) on the live stream is filed by `persistCollectedDrafts` (`post-processing.ts`) into `concept2cure_artifacts`, status `draft`, source `ana_document_studio`. This happens without a prompt. It is the pinned AnA-draft → canvas path (`docs/design/ANA_DOCUMENT_CANVAS.md`), and the register classes the generating tool as AnA's own working state (`generate_document` → `self`). It is not changed here; it is flagged so the classification is a decision, not an accident.
6. `scripts/ci/duplicate-exported-types-baseline.json` can drop `AnaActionResult` at the next regeneration (not done here).

## Fix round (2026-10-01, after the adversarial verifier)

Base `0e58e794` plus the earlier round's working-tree change. The verifier found two must-fix defects. Both are fixed here, red first.

### 1. A false success was still stored

**What was wrong.** `blocksOnlyAnswer([])` returned *"Action executed successfully."*. An empty list has neither a proposal nor a refusal, so it fell through to that sentence. Three turns reached it:

- `POST /api/chat`, a reply of nothing but a **provisional or uncertain** block.
- `POST /api/chat`, a **strong** block in a conversation scoped to a **program UUID**. `processResponseActions` proposes nothing without an integer project.
- The live stream, an empty reply that offered only a **navigation chip** (`executedActions` non-empty, `executedCommands` empty).

Nothing ran and nothing was proposed. Yet the stored message, which the next turn reads as history, said it had. That is the false record 21 CFR 11.10(e) forbids. The draft AnA wrote was also dropped: it existed only inside the block.

**What is true now.**

- `blocksOnlyAnswer([])` answers *"Nothing was changed."* It claims a run only when every result reports one.
- Every `ana-action` block now leaves a line in the answer saying what became of it, taken from the partition's answer:
  - *"Proposed for saving as a project artifact. Nothing is saved until you confirm it."*
  - *"Not saved. AnA marked it provisional, so it was not proposed for saving."*
  - *"Not saved. This conversation is not scoped to a project, so it could not be proposed for saving."*
  - *"Not saved. <the refusal>"*, for example the RBAC message.
- When the reply was nothing but blocks, the draft is kept above that line. It exists nowhere else, and the sign-off card (`GovernedActionSignoff.tsx` `summariseParams`) shows only 77 characters of each parameter, so a person would otherwise be asked to confirm a memo they cannot read. When the reply has prose of its own, only the line is added, so the draft is not repeated.
- **One answer for both chat paths.** `settleActionBlocks` (`server/services/ana-guidance-executor.ts`) is the only place either route turns blocks into the answer. `send-message.ts` stores what it returns. `post-processing.ts` hands its answer to the command-block step. Neither route calls `processResponseActions` or decides the wording itself, and `ana-action-block-proposal.test.ts` pins that.

### 2. The prompts made AnA claim a save that is only a proposal

**What was wrong.** The prompts told AnA she saves things herself:

- `persona.ts`: *"Auto-save as a governed artifact"*, *"auto-saved as artifact"*, *"Save as a new artifact version"*, *"Every document you produce is a governed artifact"*, *"so the system can auto-save it"*, and *"The system will auto-create a project artifact"*.
- `lumen-context/base-system-prompt.ts`: *"so the platform can execute it automatically … real governed artifacts"* and *"The action block will be automatically processed … The artifact will be created"*.
- `document-routing.ts`: *"include an `` ```ana-action `` block to auto-save as a governed artifact"*.

The platform-command bridge (`ana/AnaToolExecutor.ts`) told the model to *"re-issue with params.confirm=true and params.reason"*. The gate never reads that: `executeCommands` reads only `ctx.humanConfirmed`, which only `POST /api/ana-ri/governed-action` stamps.

**What is true now.**

- Each of those passages says the platform puts the block to the person as a proposal, that nothing is saved until they confirm it, and that AnA does not say it was saved or created.
- The bridge now says three things:
  - pass the parameters each command lists;
  - a write never runs on the model's call;
  - on `HUMAN_CONFIRMATION_REQUIRED` or `PART11_SIGNATURE_REQUIRED` nothing ran: tell the person it has not been done, and do not re-issue it.
- Handler-level parameters such as `revert_to_version`'s `confirmed` or the MDX handlers' `confirm`/`reason` are still passed, as the command lists them. They are read only after a person's yes.
- `action-prompts-propose-only.test.ts` pins this on the assembled prompts, not on source text:
  - `getCorePrompt()`;
  - the live stream's `orchestrate(...).systemPrompt`;
  - `BASE_SYSTEM_PROMPT`;
  - `buildDocumentGenerationContext` for a detected request;
  - the two bridge handlers' returned instructions.

### Red / green (fix round)

| | File | Result |
|---|---|---|
| red | `red/fixround-before-fix.txt` | **23 of 42 fail.** The tree here was the earlier round's change, plus one behaviour-preserving step: send-message's answer decision moved into `settleActionBlocks` so a test can drive it. Prompts and `post-processing.ts` were as before. Results: `blocksOnlyAnswer([])` gave `'Action executed successfully.'`. The provisional-only and program-UUID replies on `POST /api/chat` gave `'Action executed successfully.'`, and so did all three stream cases on `post_done.cleanedResponse`. No block's fate was stated. The persona prompt still said *"Auto-save"*, the base prompt *"execute it automatically"*, and document routing *"auto-save"*. Both bridge instructions still said *"re-issue … confirm=true"*. |
| green | `green/fixround-after-fix.txt` | **42 / 42.** |
| green | `green/fixround-neighbour-suites.txt` | **1,597 / 1,597** across 105 files. That is the earlier neighbour set (every `ana-ri` route and service suite, the gate and wrapper suites, the chat route suites), plus every suite that imports the persona, the base prompt, document routing or the bridge. |
| green | `green/fixround-eslint.txt` | 0 errors. No file's warning count rose against `0e58e794`: `ana-guidance-executor.ts` 9 → 3, `post-processing.ts` 5 → 4, and the rest unchanged. The new test is clean. |
| green | `green/fixround-gates.txt` | `check:security-patterns`, `ci:server-error-leaks` and `ci:discarded-audit-write` pass. |

### Commands (fix round)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/services/ana-ri/__tests__/chat-turn-proposals.test.ts \
  server/services/ana-ri/__tests__/ana-action-block-proposal.test.ts \
  server/routes/ana-ri/__tests__/post-processing-action-block-proposal.test.ts \
  server/services/ana-ri/__tests__/action-prompts-propose-only.test.ts
```

### Residuals (fix round)

1. **The `execute_platform_command` tool definition**, `server/services/ana/bla-biologics-tool-defs.ts`, is outside this item, so it is not edited here. It still tells the model to *"re-issue with params.confirm = true and params.reason set"*. The tool result now says the opposite, and the gate ignores the flag either way. Proposed replacement:
   - L781: *"Execute any governed platform command — ANA's full operational control beyond the typed tools (see list_platform_commands for the catalog). Pass `command` (a command name) and `params` (the parameters the command lists). Runs through the platform's governed command executor: reads run; a write never runs on this call — it comes back as a proposal (HUMAN_CONFIRMATION_REQUIRED or PART11_SIGNATURE_REQUIRED) that only the person's confirmation in the platform runs, and it is written to the audit trail when it does. The organization, user, and active project are taken from the session context, never from params, and per-tenant tool policy is enforced. When a result is a proposal, nothing ran: tell the person what you proposed and that it has not been done, and do not re-issue it. Report the result message verbatim."*
   - L786: *"Command parameters, as list_platform_commands lists them. A confirm flag here runs nothing: only the person's confirmation does."*

   `scripts/generate-ana-capability-manifest.ts` L76 still classifies the tool as governed after this change, because the description keeps "governed". Once it lands, add the definition to `action-prompts-propose-only.test.ts`.
2. **The live stream's command-block context guesses a project from a program UUID.** In `post-processing.ts`, `cmdCtx.activeProjectId` is `Number.parseInt(streamProjectId, 10)`, which is 7 for `'7abb1c22-…'` (ADR-0011). Writes there are proposals, so nothing is written to the wrong project, but a read or a proposal can be scoped to it. The fix is `parseIntegerProjectId(streamProjectId) ?? undefined` with a test. It was found in this round and not changed: it is a separate defect from the two the verifier raised.
3. A reply whose draft content itself contains a `` ```command `` fence now passes through the stream's command step, because the draft is kept in the answer. Its writes are proposed like any other block's. This is noted, not changed.

### Lane disclosure (fix round)

These files were edited this round although another lane touched them in the last 24 hours:

- `server/routes/ana-ri/post-processing.ts`: 10-01 03:29, `session_01KnUGoX3g4R4FWKWGc2sTbN` (PF-08 review, `382e25c6`).
- `server/services/ana/AnaToolExecutor.ts`: 10-01 03:21, `session_01GCu8tcx7BxXG5B6SysALUV` (RBQM, `72177e78`).
- `server/services/lumen-context/base-system-prompt.ts`: 10-01 01:49, `session_01SuVLo2QXnofZDpPjYtAWM8` (D4 reference audit, `4b101f04`).

The other files this round edited were last touched more than 24 hours ago:

- `persona.ts`: 09-25.
- `document-routing.ts`, `ana-guidance-executor.ts`: 09-06.
- `send-message.ts`: 09-28.

## Control tower, before commit (2026-10-01)

The re-verification left one must-fix of the same class: the model-facing definition of
`execute_platform_command` (`server/services/ana/bla-biologics-tool-defs.ts`, registered in
`AnaToolDefinitions.ts`) still told AnA that governed mutations need `params.confirm = true` and to
re-issue with it, contradicting the bridge's new instruction. Rewritten to say a write comes back as a
proposal that only the person's confirmation runs, and not to re-issue it; the `params` description
says a confirm flag does nothing. Pinned by a new case in `action-prompts-propose-only.test.ts`:
red against the old text (`control-tower/tool-def-red.txt`), green after (`control-tower/tool-def-green.txt`,
11/11). The eight P0-12 suites pass together, 139/139.
