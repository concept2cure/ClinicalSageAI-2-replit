# Independent scope review: same-mounted project and session isolation

Reviewer: `action_order_contract`. Date: 2026-10-30. Source-only review; no runners, compiler, browser or Git commands/mutations. Only this review document was written.

## What already exists

- `ProjectHome.tsx` uses the canonical shell-project channel, actual actor and existing `useAuthoringReadSession` for its owned program read. Its unsent composer, conversation pages, dossier, activity and other parent/child state live in the same mounted surface. Its stage state already follows project identity and remembers the chosen step through `shellProject.ts`.
- `authoringCurrentRead.ts` supplies the authoritative existing session owner. It keeps the same object/key across ordinary bearer refresh, replaces it for actor/account/revision boundaries, holds one stable fenced key during a pending adoption, and mints one owner after that adoption settles. `authoringReadSessionAdoption.test.tsx` directly covers refresh, same-account restart and pending/refused adoption stability.
- `TaskBoard.tsx` already uses an outer ownership boundary and a keyed inner canonical implementation. Reuse that structure; this does not authorize another workspace or state store.
- `useLiveData` has optional owner support, but activity/dossier/conversations are not all opted into it. A key only on the aside would not retire retained parent data. Keying the existing whole workspace retires component-local state and its reads together.
- `projectThreads.ts` owns first-page/older-page reads and pagination. Existing effects retire some state after project changes, but a same-mounted first render can still show retained content. An owner-keyed workspace creates fresh hooks without another thread reader.
- `pinProgram` in current ProjectHome clears shared `window.C2C_SOURCE_PINS` only when a mounted instance observes a project change. A newly keyed child would initialize that ref to the new project and skip the reset; the stable outer boundary must retain this existing responsibility.
- `useSurfaceActionHandlers`, readiness notification, `consumeNavParams`, `chooseStage`, and the channel's remembered step implement explicit handoff > pending stage action > remembered step > empty-project default. Existing `projectHomeStepReturn.test.tsx` covers this precedence.

## Decision

**APPROVED** for red-first component tests and the following bounded implementation. No further product decision is needed for this correction.

1. Keep public `ProjectHome` as the stable ownership wrapper. Capture `useShellProject`, `useAuthUser` and `useAuthoringReadSession` there once, and pass those values into the single existing workspace implementation. Do not duplicate direct session hooks/program reads in both layers; child components retain their existing legitimate independent readers.
2. Key that inner workspace by the existing selected-project identity, actor and existing session key. Exclude step, title, other display metadata, bearer token text and callback identity. Keep the existing numeric/transient-id refusal rather than coercing an unrelated id space into the program UUID.
3. A committed project/actor/session ownership change unmounts the previous workspace and mounts fresh parent/child hook state before the new owner is rendered. A→B→A creates a fresh second A instance; a late response for the first A must not resurrect its draft, roster, activity, dossier, documents or conversations. Same project UUID under a different actor/session also starts fresh.
4. Preserve the existing program `DataReadOwner`/session-current guard, team verification, document/source shape/admission guards and server scope. This wrapper does not create permission or declare a pending adoption current. Do not rewrite every hook or introduce another read/session engine.
5. Keep the source-pin retirement ref/effect in the **stable outer wrapper**, now comparing the project/actor/session owner. Initialize it to the first owner so an intended first-mount source handoff is preserved. Clear existing global pins on subsequent owner changes; preserve them on ordinary refresh and step/title changes. The existing behavior is passive-effect retirement: this review does not require a new pre-effect global-clear policy without an identified consumer/trigger. Tests may require before-effect DOM isolation, while pin-reset assertions should respect that existing effect boundary.
6. Keep the lifecycle selection and all stage/action registration work in the inner canonical workspace. Retain registration/ready/hand-off effect ordering: pending actions register first, then an explicit `consumeNavParams('project-home')` handoff wins. Keep `workId`→Review fallback and the current remembered-step/default behavior. A same-owner `chooseStage` publishes a step update and must **not** remount the workspace or clear a draft. Do not move action registration to the stable wrapper with stale inner closures.
7. The wrapper uses the existing authoring-session identity, not raw bearer identity. An ordinary token refresh preserves the exact textarea DOM/value, history/pagination and normal read count. Pending adoption rerenders retain the one existing fenced key rather than resetting the session counter in a newly keyed hook and creating a render/read loop. Same-account sign-out/sign-in is a new session even when actor text is unchanged.
8. Existing persisted records are not erased. Only component-local unsent/pagination/read state is retired across ownership. Keep the accepted six-step layout, canonical editor, MDX/market handoffs, commercial/access/signature/export safeguards and explicit failure states.

## Required proof before implementation/publication claims

- With unchanged production, reproduce same-mounted project-switch draft/thread/parent-data carry-over using the real ProjectHome and real shell-project channel; capture a layout-effect DOM snapshot before passive read resets.
- Deferred A→B and A→B→A: no previous owner data in any new-owner committed snapshot; late first-A and B replies cannot repopulate the current owner.
- Same UUID actor/account/organization and session-restart changes: a fresh composer plus fresh read state; ordinary bearer refresh preserves the exact existing DOM/draft/history and does not add reads.
- Same-owner stage, title and ordinary project metadata updates preserve draft/history; source pins preserve their first-mount handoff and ordinary-refresh behavior but retire after actual project/actor/session boundary effects.
- Pending adoption repeated renders remain bounded, with no maximum-depth/read loop; preserve the existing authoring session-adoption tests.
- Run the current step-return precedence suite: explicit Tasks/navigation handoff wins pending action and remembered/default state; pending action wins remembered/default; bare workId/invalid stage falls back to Review.
- Preserve real team/source/document scope tests, actual MDX/project handoff tests and existing stage persistence checks. No always-true owner mocks or guard bypass.

This is approval of the contract, not execution or publication. Root owns the red/green runs, implementation review, combined regression/native/browser checks, lint/build/TypeScript, normal direct push and remote acceptance proof.

## Reviewed source pins

```json
{
  "client/src/concept2cure/v2/surfaces/ProjectHome.tsx": "c4e05775fb27ffcc014a705910286c12129bd79db9a0c63adc2933a264e5987c",
  "client/src/concept2cure/v2/surfaces/TaskBoard.tsx": "a6e013f38467747c313d4095ad31d25bc8f31dbeecaf58153d4c2fc37f0398ac",
  "client/src/concept2cure/v2/editor/authoringCurrentRead.ts": "eeb1c7f6670a9372216bbb844bc11f52632e74e127260a3e9a29d50586a657d7",
  "client/src/concept2cure/v2/editor/CanvasDocumentList.tsx": "830a2e90e35e387e08d260e35a4d6ed3cf615db524822358b303a79e0c476fed",
  "client/src/concept2cure/v2/surfaces/projectThreads.ts": "a5bf04435d712281605b1f6b119759332d5b13bf58df30150a412417c17f4ea4",
  "client/src/concept2cure/v2/surfaces/ProjectDossier.tsx": "ed20cd2989f0b397947adb5cf87e6cb894af639db26052a1cb9add9ee6308cd3",
  "client/src/concept2cure/v2/shellProject.ts": "b64eca13dbcf858eec808251e9d391e9cbbac43f6d4e1491cbd21e60d07497b7",
  "client/src/concept2cure/v2/navParams.ts": "1f65cb37fab1713c3de8782d351411fd4df7566edc45ea58b047a87aedd4aa9c",
  "client/src/concept2cure/v2/dataConnect.tsx": "51b03e8cf336df448663742c5b31bb4dc9c93f6879b437cc490420fcc6809815",
  "client/src/concept2cure/v2/__tests__/projectHomeStepReturn.test.tsx": "16cdad6bd49b92970bfaa900f79fa2bfb448caf3d1670e9aeea5cb42722f9251",
  "client/src/concept2cure/v2/editor/__tests__/authoringReadSessionAdoption.test.tsx": "e89ea92d4943d2801db0abd914fe77354111ab7664eb06b8dba5bfd03692825e"
}
```
