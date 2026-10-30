# D2 — project initiation reaches study and protocol design

## What already exists

| Existing owner | What it does / current limit |
| --- | --- |
| `shared/regulatory/app-registry.ts`, `workspace-derivation.ts` | Existing `study_protocol_design` identity maps to `protocol-dev`; configuration is not permission. |
| `client/src/concept2cure/v2/surfaces/ProjectPlan.tsx`, `ProjectHome.tsx` | Existing verified project context, filing Plan and Author protocol door; the Plan entry was missing. |
| `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx`, `ProtocolDevSelection.tsx`, `ProtocolDevWorkspace.tsx`, `ProtocolDevDesign.tsx` | Existing project-scoped protocol start, study design/binding, statistics, assessments, deterministic checks and review; not separate apps. |
| `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx`, `editor/RichSectionEditor.tsx` | Existing protocol adapter uses the shared editor; protocol and authoring stores are not live-synchronized. |
| `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`, `SourceImportDialog.tsx`, `editorTarget.ts` | Existing canvas/editor and governed saved-working-copy handoff; no extra canvas or editor. |
| `server/services/authoring/authoring-draft-tool.ts`, `authoring-from-draft.ts` | Existing AnA saved-document generation for the canonical canvas; no new generator. |
| `shared/constants/launch-scope.ts`, `server/services/cmc/composition-scope.ts` | Existing admission, access and CMC composition restrictions remain unchanged. |

The detailed survey and bounded deleted-history search are in
`docs/design/STUDY_PROTOCOL_PROJECT_INITIATION.md`. No owner is rebuilt or removed.

## Delivered change

Plan's selector reaches the existing services only after the matching project
record is read. One combined Study & Protocol Design choice opens `protocol-dev`;
other choices follow current availability, including CMC's small-molecule US IND
boundary. Changing the project requires selecting work again. Selecting work
creates no record, and cannot revive an unavailable selection.

The existing protocol selection bar explains the study/protocol sequence and
shared canvas/editor. No surface, rail item, backend, store, generator, canvas,
editor, commercial grant or launch admission was added.

## Verification

- `red.log.gz`: before implementation, Plan's missing entry fails; the new component
  import fails. Twenty existing/guard Plan tests pass.
- `green.log.gz`: six suites, 67 tests pass: core selection, Plan integration,
  protocol study design, project launch scope, shared protocol editor, CRF handoff.
- `copy-styles.log.gz`: three suites, 40 tests pass (includes 10 core-selection
  tests already counted above), covering established copy and stylesheet ownership.
- `build.log.gz`: production Vite and server builds pass; existing chunk-size warning.
- Canvas-path gate and self-test pass, including deliberate broken-link failures.
- `desktop.png`, `mobile.png`: Chromium renders of the real component's server
  markup with production styles, at 1100px and 390px. Both have zero horizontal
  overflow. This is isolated layout verification, not an authenticated live app walk.
- `typecheck.log.gz`: whole-repository canonical typecheck passes with zero errors.
- Focused ESLint on all six changed TypeScript files passes with no findings.
- Required pre-push checks run before source publication.

Used Node 22.23.4 to match the repository's Node 22 requirement. This is engineering
evidence only; it does not assert live provider qualification or formal OQ.

## Guided-workspace enhancement

### What already exists

`ProtocolDevWorkspace.tsx` owns `TABS`, the single active tab, the section outline,
AnA section action and `sourcePending` from `ProtocolDevSection.tsx`.
`navParams.ts` owns the shared leave-guard registry. `ProtocolDevSelection.tsx`
and `ProtocolDev.tsx` own protocol/scope selection and incoming protocol handoffs.
The previous tab/outline paths could unmount pending edits. The enhancement
extends these owners; it adds no editor, generator, canvas, API or store.
`ProtocolWorkNavigation.ts` holds that same tab/section state and shared guard;
it keeps the workspace within the repository's function-size limit.

`ProtocolWorkflowGuide.tsx` reaches the five existing tabs in suggested order.
Its current marker is location only, and its advice distinguishes an absent,
unreadable or approval-blocking study design. It invents no completion or approval.
Shared pending-work checks preserve the editor across guide/tab/outline/AnA
actions, protocol/scope changes and incoming protocol handoffs. Blocked handoffs
are consumed without a hidden delayed replay. Saving clears pending state only
through the existing editor and current-record reread, not from a success message.

- `red-guide.log.gz`: guide absent and six existing navigation-loss cases fail
  before implementation.
- `green-guide.log.gz`: guided order, pending-edit protection, save success/failure,
  scope/picker/handoff guards and existing protocol tests pass: seven suites,
  92 tests on the final factored navigation owner.
- `navigation-state.log.gz`: protocol picker, tab refresh and section-current
  behavior pass separately: two suites, seven tests (99 final focused tests total).
- `red-dialog-guard.log.gz`: reproduces the two additional nested-dialog/filing
  bypasses before correction; final green includes their regression checks.
- The real editor-content test holds navigation during an unresolved PATCH and
  after a 409 refusal; a failed reread retains the guard until current data arrives.
- Focused ESLint over all eight changed/new TypeScript files passes with no warnings.
- `enhanced-regression.log.gz`: five related regression suites, 80 tests pass.
- `enhanced-build.log.gz`: production client/server build passes.
- `guide-desktop.png`, `guide-mobile.png`: isolated real selector and guide markup
  with built production styles, pictured together for layout QA (not a claim they
  occupy one live screen). No horizontal overflow at 1100px or 390px.
- `initiation-push.log.gz`: first slice published to `concept2cure-v2` with every
  pre-push gate, including zero-error typecheck, passing.
