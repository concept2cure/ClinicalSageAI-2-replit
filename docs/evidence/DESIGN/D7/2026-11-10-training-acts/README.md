# A training drawer holds while its act saves, and focus goes where the person is (D7, 2026-11-10)

Package **D7**, Quality on the work-area pattern. This repairs four findings of the Quality review of 2026-11-10:

1. **A drawer could be dismissed while its act was saving.**
   - Job roles and "Who must train" hold an act (Rename, Add a person, Remove, Withdraw, Assign) inside the drawer.
   - While the act's write was in flight, Close, Escape and the scrim still closed the drawer. A refusal then had
     nowhere to show.
   - The change log's drawers had the same gap: Cancel or Escape closed a drawer whose write was in flight.
2. **Focus was lost.**
   - Opening an act left focus on the button that opened it, and that button was then unmounted.
   - Closing the act left focus nowhere.
3. **A disabled Delete said why only in a hover title.** Touch and keyboard users could not read it.
4. **Touch targets.** On a phone, the small buttons inside a drawer were shorter than 44px.

## What already exists

- **The drawer**: `DialogPanel` (`client/src/concept2cure/quality/ControlledDocumentDialogs.tsx`, C15).
  - It already takes `busy`: while true, Close is disabled and Escape and the scrim do nothing.
  - The training drawers passed `busy={false}`.
- **The acts**: `ReasonAct`, `JobRolesPanel`, `TrainingAssignmentsPanel` (`quality/TrainingCoverage.tsx`, C15).
  - Each act already kept its own `busy` and its refusal.
  - The drawer was never told about the act's `busy`.
- **The change log's write guard**: `writing` (`quality/ChangeControl.tsx`, C8). It already stops a second write,
  but a drawer's `onCancel` closed the drawer regardless.
- **The 44px phone rule for drawer actions**: `quality/app.css`, `.qms-train-act .de-btn` (C15).
- **The shared drawer button styles**: `client/src/concept2cure/v2/styles/journey-v2.css`. They dim a disabled
  *primary* button only.

Nothing new: no screen, route, table or component.

## What changed

| | Before | After |
|---|---|---|
| An act saving | the drawer's `busy` was `false` | the act reports its `busy` to its drawer (`ActBusy`, a context inside `TrainingCoverage.tsx`), so Close is disabled and Escape and the scrim do nothing until the write answers |
| The change log | `onCancel={() => setDrawer(null)}` on five drawers | `closeDrawer`, which does nothing while `writing` is set |
| Focus | left on an unmounted button | the act's heading takes focus when the act opens. When it closes, focus returns to the button that opened it, or to the drawer if that button is gone. The footer buttons stay mounted, disabled while an act is open, so focus has somewhere to return |
| Delete, when a role is assigned to a document | disabled, with a `title` | disabled, with "Delete is unavailable while it is assigned to a document: withdraw those assignments first." beside it, named by `aria-describedby` |
| Phone | small drawer buttons under 44px | `.qms-shell :is(.de-body .btn.small, .vr-member .btn.small, .de-seg-opt)` are 44px at ≤640px |

## Found by walking it

These were found in the running app and repaired in this change:

- **StrictMode lost the opener.** The first walk returned focus to the drawer, not to "New job role".
  - The app runs under React StrictMode in development, which mounts each effect twice. On its second mount the act's
    effect took its own heading for the opener.
  - The opener is now read once, at the act's first render. A test renders the panel under `React.StrictMode` and
    failed the same way first (`red.txt`, last case).
- **A disabled ghost button looked live.** "New job role" (while an act is open) and Cancel (while a write saves)
  were disabled but looked live, because the shared rule dimmed only a primary button.
  - Repaired in the shared rule, `journey-v2.css`: every disabled `.de-btn` is at half opacity. This is a separate
    commit under F1, since the file is the product's, not Quality's.

## Tests

- `quality/__tests__/TrainingAssignments.test.tsx`:
  - the drawer cannot be dismissed while its act is saving;
  - focus moves into an act and back to its opener;
  - the same under StrictMode, from the footer button;
  - a disabled Delete says why beside it.
  - The older Job roles case now reads the note, not the title.
- `quality/__tests__/qmsGovernedActions.test.tsx`: a change drawer stays open while its write is in flight, through
  Escape and Cancel.

`red.txt`: the five cases fail before the change. `green.txt`: Quality's 28 suites and the dialog focus-trap suite,
29 files and 375 tests. The CSS gates and the generated ramp check pass.

## Walked in the running app

`w28-training-acts.cjs` (`shots/w28-training-acts.log.json`) ran as the approver, with no page errors. Its one API
error is the 503 the walk itself returns for a held write.

1. **Setup.** The organization had no job roles, so the walk made one through the real routes, each write with its
   reason: "QA reviewer (walk)", held by Theo Trainee and assigned to QS-SOP-001.
2. **Delete** (`shots/w28-delete-note-1440.png`). Disabled, with no title. The note beside it reads as above, and is
   the button's `aria-describedby`.
3. **New job role** (`shots/w28-act-open-1440.png`).
   - Focus moved to the act's heading.
   - The footer button stayed, disabled, at opacity 0.5.
   - Cancel returned focus to it.
4. **Remove a holder, held.** The walk held the DELETE for two seconds, then refused it with a 503, so nothing was
   removed (`shots/w28-act-saving-1440.png`).
   - While it saved, Close was disabled, Escape left the drawer open, and Cancel was dimmed.
   - Then the refusal showed in the act, and Close was enabled again.
5. **Phone, 390** (`shots/w28-job-roles-390.png`). Add a person, Rename, Delete and Remove are 44px high.

Run it from this folder with `NODE_PATH=$(npm root -g) node w28-training-acts.cjs`. It needs `WALK_PASSWORD` and a
running server.
