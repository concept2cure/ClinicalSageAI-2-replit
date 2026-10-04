# PF-10 S5 / LX-06, stream half (D5): an AnA draft names the conversation, the turn and the model that wrote it

Plan: the PF-10 scout of 2026-10-01 (`wf_92bf7e8a-b5e`), slice S5. This is the stream half of LX-06 in `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`, whose first two tests it turns green. The rest of LX-06 is not in this slice (see "Not in this slice").

## The defect

`draft_authoring_document` records `provenance.conversationId`, `turnId` and `model` from its context (`authoring-draft-tool.ts`, which reads `ctx.threadId`, `ctx.turnId` and `ctx.model`). Nothing set them.

A tool runs in a turn in one of three ways. Each built its own context, and none passed the three fields:
1. **Dispatched** in the loop: `stream.ts`, the handler call.
2. **Held** for the person's yes: `stream.ts` `heldToolContext`, recorded on the run row.
3. **Confirmed**: `routes/ana-ri/utility.ts` `runConfirmedTool`.

`draft_authoring_document` is confirm-class, so in production it runs only through paths 2 and 3. Every AnA draft therefore recorded no conversation, no turn and no model.

The founder-path walk baselined both checks, `model-recorded` and `turn-recorded`. The walk itself called the handler with its own copy of path 1's context, so a fix to the stream alone would never have shown in it.

## The change

**New module, `server/services/ana/turn-tool-context.ts`.** One builder for each path:
- `turnToolContext` for path 1;
- `heldToolContext`, moved out of `stream.ts`, for path 2;
- `confirmedToolContext` for path 3.

Each sets:
- `threadId` (the resolved thread);
- `turnId` (the run id, which `ana_turn_records.run_id` joins on);
- `model` (the served model id).

A value that is not known is null. A run held before this change confirms with none.

**Callers and types:**
- `stream.ts` dispatches with `...turnToolContext(…)`, and holds with `heldToolContext(…)`.
- `utility.ts` runs a confirmed tool with `confirmedToolContext(held.toolContext, …)`.
- `run-control.ts`'s held-context type gains `threadId` and `turnId`.
- The `AnaToolExecutor.ts` doc that said "the stream's dispatch does not pass them yet" is corrected.

**The lineage walk** (`tests/lineage/founder-path-lineage.hops-authoring.ts`) now runs the draft the way production does: held, stored as the run row stores it, then confirmed. It uses the same builders, so the walk and production cannot drift. Both baseline entries are deleted, and the baseline only shrinks.

**`governed-write-gate.test.ts`** pins the dispatch's use of the builder in place of the old inline `servingModel` line.

## Evidence

| File | Shows |
|---|---|
| `01-red-routes.txt` | Against HEAD's `stream.ts` and `utility.ts`: a dispatched tool gets no `threadId`, `turnId` or `model` (`stream-run-hold.test.ts`), and neither does a confirmed one (`governedActionConfirmTier.test.ts`). |
| `02-red-walk.txt` | With both baseline entries removed and HEAD's hop, the walk fails: `ana-draft/model-recorded` and `ana-draft/turn-recorded` fail and are not baselined. |
| `03-green.txt` | 25 files, 345 tests, all passing: every AnA route suite, the suites that touch the run row, the confirmed tool or the draft tool, the new `turn-tool-context.test.ts`, and the walk with both checks green. `tsc` passes, and the lint ratchet is unchanged. |

## Not in this slice

The rest of LX-06:
- the tool schema taking `sources[]`;
- a `cre_evidence_source` span for a verified quote (which needs LX-04 and LX-05);
- refusing a caller-supplied `provenance` on `POST /api/authoring/docs/from-draft`;
- the workbench's AnA-pane contributor.

Its baseline entries (`tool-accepts-sources`, `source-span`, `source-span-survives`) stay red and baselined.

## Review

The review was `wf_505025ef-41f`, with two lenses and two skeptics per finding. It raised four findings, all upheld 2/2; three are distinct. Each was fixed in the follow-up commit.

1. **`humanConfirmed` gained a second writer.**
   - `confirmedToolContext` stamped `humanConfirmed: true`, so `server/services/ana-ri/__tests__/propose-only-partition.test.ts` ("exactly one writer") failed. The first green run was a subset that left it out.
   - The builder now returns the project and identity fields only. `utility.ts` `runConfirmedTool`, the one writer, adds `humanConfirmed: true`.
   - A builder test pins that it never stamps it. Evidence: `07-partition-single-writer.txt`, failing at `720965433` and passing after.
2. **Nothing tested the stream's hold-site arguments.** That is the only production path for a confirm-class draft.
   - `stream-run-hold.test.ts` now captures what `requestApproval` is asked to hold, driving the real confirm-class `draft_authoring_document`.
   - It asserts `toolContext` names the resolved thread, the run and the served model.
   - When the thread could not be persisted, it asserts `threadId` is null, never the client's `thread_id`.
   - Reds: `04-red-hold-site-thread-null.txt` and `05-red-hold-site-client-thread.txt`. Both mutations type-check and keep every other suite and the walk green.
   - The walk's comment now says what it covers: the builders. The stream test covers the wiring.
3. **The baseline ceiling stayed at 17 with 15 entries.**
   - It is now 15.
   - `06-red-baseline-over-ceiling.txt`: one added entry fails the walk, and `ci:canvas-path` refuses it ("16 entries over its ceiling of 15").

`08-green-after-review.txt` is the whole AnA, authoring and lineage tree, all passing.
