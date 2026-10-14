# Guarded views and exact remedy sections

W1 / D2 continuation from `87b27c89` on `concept2cure-v2`. This enhances
DocumentCanvas → DocumentWorkbench → RichSectionEditor and the existing
conversation remedy cards. It adds no editor, conversation, provider, route,
dependency or UI pattern.

## Reproduced failures

Six actual-canvas tests failed before production changes in
`editor/__tests__/editorOversightNavigation.test.tsx`, recorded in
`/workspace/scratch/editor-oversight-navigation-before.log`:

- A document-level remedy's Open section action selected the right section,
  but left it in assembled Document view, so the proposed fix stayed disabled.
- A fix for the currently selected section offered no way to open that section
  editor while Document view was active.
- Switching to Document view unmounted the dirty RichSectionEditor before
  asking for its unsaved-work decision. Cancel, Save and leave-without-save
  dispositions were therefore absent; later Save and continue had no editor
  handle to save.
- The empty-section drafting request copied stored section/document titles
  into the person's message even though those names already accompanied the
  exact saved identity in structured context.

## Existing navigation and proposal doors

The existing leave target now carries a view transition, or Section view with
an exact section target. The same unsaved-work guard holds that transition;
`applyNav` changes the view only after the person deliberately saves or leaves
the edits on the device. Cancel and a refused save retain the same mounted
dirty editor, section and prior view. The Section/Document controls and the
full document's Edit action use that same door.

The existing bridge reports its actual `viewMode`. A remedy's Open section
button can therefore open the already-selected section behind Document view,
as well as another section, through the guarded Section-view transition.
Frozen sections remain readable and their application refusal stays visible.
The model, saved-version, exact-quote and tracked-change gates are unchanged;
opening a section neither applies nor saves a proposal.

DocumentCanvas now uses fixed drafting prose while retaining the exact
document/project/section IDs and the stored titles in its saved origin. The
existing conversation test still proves prefill without automatic submission,
explicit Enter and the requested section's context.

The applied remedy note now describes the application event: adding the
suggestion did not itself save or approve the document. It no longer asserts
that the suggestion is currently unsaved after a later deliberate save.

## Validation and limits

The new suite has eight cases covering another-section and same-section
remedies, actual attributed tracked replacement, frozen read-only behavior,
Cancel, Save, explicit leave, refused Save and stored-title isolation. The
scoped run also includes existing canvas, remedies, disclosure, saved-context
and conversation-handoff suites: **53 tests in six files passed**, recorded in
`/workspace/scratch/editor-oversight-navigation-final.log` (30.85 seconds).
Changed remedy UI and tests pass strict zero-warning ESLint. Workbench and
DocumentCanvas retain their thirteen and two existing warnings respectively;
no warning was added. `git diff --check` is clean.

No live model/provider request was made; scripted responses and immutable-turn
fixtures exercise the existing proposal door. Browser, whole-tree typecheck,
build and repository gates are recorded by the control tower.

One observed follow-through remains unresolved: a remedy card remembers that
it was applied, without querying the current suggestion's state. Rejecting or
discarding that local change can leave the card's Apply control disabled.
This pass does not infer that state, enable reapplication from memory or add
another suggestion store. A future change needs the actual tracked suggestion
identity and state from the existing editor.
