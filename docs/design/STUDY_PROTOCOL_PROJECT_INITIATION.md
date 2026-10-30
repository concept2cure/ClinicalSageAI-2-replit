# Reach study and protocol design from project initiation

2026-10-30. Launch row D2, project journey. User direction: one Study & Protocol
Design selection inside the project alongside CMC, RBM and Biostatistics; all
use cases share one canvas, one document generator and one editor.

## What already exists

- `shared/regulatory/app-registry.ts`: `study_protocol_design` already names the
  combined capability and maps it to `protocol-dev`. No second identity is needed.
- `shared/regulatory/workspace-derivation.ts`: selects that capability for
  clinical work; this configuration projection is not an authorization grant.
- `client/src/concept2cure/v2/surfaces/ProjectPlan.tsx`: the project initiation
  step, filing deliverables and CMC phase doors. No core-work selector yet.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: verified project context,
  availability checks and an Author-only protocol door. Preserve that door.
- `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx`, `ProtocolDevSelection.tsx`,
  `ProtocolDevWorkspace.tsx`, `ProtocolDevDesign.tsx`: project-scoped protocol
  selection/start, study creation/binding, design checks, statistics, assessments,
  registers and review already share one workspace. Entry does not explain this.
- `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx`: already mounts
  `editor/RichSectionEditor.tsx`; no protocol-specific editor is needed.
- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`,
  `SourceImportDialog.tsx`, `editorTarget.ts`: the existing canvas, shared editor
  and provenance-preserving saved-working-copy handoff. Protocol imports are
  explicit working copies, not a claim of live synchronization between stores.
- `server/services/authoring/authoring-draft-tool.ts`, `authoring-from-draft.ts`:
  existing AnA generation saves the authoring document used by the canvas/editor.
- `shared/constants/launch-scope.ts`: protocol-dev is an Authoring child; RBM
  and Biostatistics are not currently launch-admitted. No admission changes here.
- `server/services/cmc/composition-scope.ts`: CMC composition remains restricted
  to recorded small-molecule US INDs.

Searches covered study/protocol design, project initiation, routes, services,
schemas, AnA generation and canvas/editor owners. Deleted-path search:
`git log --all --diff-filter=D -- 'client/**/*Protocol*' 'client/**/*Study*'
'client/**/*Canvas*' 'client/**/*Editor*'`. The checkout has bounded history;
an empty search is not evidence that an earlier owner never existed. No owner
is replaced or removed.

## Implementation boundary

Extend Plan with a core-work selector, reusing the combined registry identity.
Selecting a choice opens its existing project-context destination. Offer only
available destinations, preserve the CMC composition boundary, and offer nothing
until the project read is verified. Selection itself creates no record.

Explain the existing combined study/protocol sequence at its current entry:
start/select protocol, define/bind study design, write/check, review. All actions
continue to use existing controls, governed APIs and shared generation/editor
contracts. Do not add a surface, rail entry, store, generator, canvas or editor.

Evidence: `docs/evidence/D2-STUDY-PROTOCOL-INITIATION/2026-10-30/README.md`.

## Enhancement — guided order inside the existing workspace

User requested continuation and enhancement after the initiation change.

### What already exists

`ProtocolDevWorkspace.tsx` owns all sixteen `TABS`, one `tab` state, the section
outline and `protocol-dev.open-section`. `ProtocolDevSection.tsx` reports dirty
section/status changes and in-flight saves through `onPendingChange`; the workspace
already uses that `sourcePending` state to protect its saved-copy editor handoff.
The tab strip and outline do not yet consult it, so changing tabs can unmount a
pending section. All work remains in the existing editor and governed stores.

Extend that owner with a suggested five-step order: study design, statistics,
protocol, checks, review. Each control selects its existing tab; all original tabs
and sections remain reachable. Read bound-design presence, resolution and recorded
blocking findings for a plain-language suggestion; do not invent completion,
qualification or progress figures. One shared tab-change handler protects the
guide, tab strip, outline and AnA section action from discarding pending work.
Keyboard focus moves only after a tab change is accepted. A suggestion never
generates content, advances approval or writes a record.

The existing `navParams.ts` leave-guard registry is also used by TaskTray and
notifications. Register the workspace's current refusal there (without recursive
calls), and consult it before protocol/scope selection and incoming protocol
handoffs. Preserve dirty state until the canonical editor and confirmed record
reread clear it; never clear it merely because a PATCH succeeded. This does not
claim a redesign of every shell navigation path.

Nested study-design/statistics drawers already use `C2CForm`; the shared
`surfaceLeaveRefusal()` checks those dialogs too. Consult that canonical check
from tab/outline/action navigation, while the registered callback returns only
local state (no recursion). `File protocol in open project` uses the same guarded
selection path as starting/selecting a protocol, since filing can change scope.
The existing tab/section state is factored into `ProtocolWorkNavigation.ts` so
the workspace remains within the repository's function-size limit. It composes
the same leave-guard registry, with no second navigation state or service.

## Continuation — AnA navigation respects the same pending-work guard

Launch row D2; the user requested continued improvement after publication.

### What already exists

- `client/src/concept2cure/v2/V2App.tsx`: one serial Live Drive queue checks
  governed ceremonies and dispatches `beforeunload` before navigation. It does
  not yet consult the shared surface-leave registry, so protocol status-only
  changes can be lost when AnA changes the surface, project or remounts it.
- `client/src/concept2cure/v2/driveQueue.ts`: refuses a move before calling its
  navigation callback; failed moves report their actual reason to the driving
  run instead of being counted as applied. Keep this owner and contract.
- `client/src/concept2cure/v2/navParams.ts`: the existing shared leave registry
  and native-dialog refusal. No new guard registry or router is needed.
- `client/src/concept2cure/v2/surfaces/ProtocolWorkNavigation.ts`: registers
  pending text/status/save state and local dialogs; nested dialogs are found
  by the shared check. It does not itself own shell navigation.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`: registers the
  canonical editor's current dirty/busy state. Its explicit user save/leave
  handoffs stay with the existing editor.

Consult the shared refusal from the existing Live Drive queue before any
navigation can publish another project, stash parameters or remount a screen.
Keep the existing ceremony and `beforeunload` checks, entitlement checks,
same-run failure reporting and explicit user handoffs. A refused move must not
replay after saving; a fresh request may proceed once the guard clears.
Manual shell/browser-history navigation is a separate boundary, not claimed by
this slice. No new editor, canvas, generator, store, surface or API.

The existing `surfaceActions.ts` bus also navigates when an action's resolved
owner is not mounted. Compare against its existing `registeredSurfaceId()`
before performing such a cross-owner action; same-owner actions retain their own
existing handlers and safeguards. Checking only explicit navigate moves would
leave this path open.
Use the actual mounted owner, not the current route: the shared editor may
legitimately register inside a different host route. Resolve aliases through
the existing `resolveSurfaceIdForTarget()` before comparing.

`V2App.tsx` also owns `followWork`, the artifact-saved callback that focuses a
saved Vault artifact. This currently bypasses the serial queue and can navigate
away from pending work. Check the same shared refusal before stashing/focusing
an artifact. A skipped focus is not a failed save and must not replay later as
a delayed surprise. Keep saved-artifact identity/deduplication behavior explicit.
Mark the artifact focus handled before refusing it, so a repeated event for the
same saved artifact cannot jump the screen once the pending guard clears.
