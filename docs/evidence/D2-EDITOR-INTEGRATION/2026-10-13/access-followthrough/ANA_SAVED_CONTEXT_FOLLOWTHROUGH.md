# AnA saved context follow-through

Workstream W1, launch row D2. This continues the existing editor integration
on `concept2cure-v2` after `1c7d319a`. It changes the canonical conversation's
saved-context selection and scope guards, without adding a surface, editor,
provider or conversation.

## Reproduced defects

Three regression cases failed before production changes in
`editor/__tests__/authoringConversationScope.test.tsx`:

- An authoring handoff carried saved version T1. The canvas had already read
  T2, but the first explicit Enter still sent T1 because the arrival snapshot
  overrode the current bridge.
- The current canvas showed section B, but the first explicit Enter sent the
  earlier attached section A.
- A document opened from a normal transcript remained mounted after the shell
  changed projects. The next message sent its earlier project's authoring
  context; the project-change cleanup only covered an editor-origin attachment.

The failing run is `/workspace/scratch/ana-scope-before.log` (three failures).
A real TipTap case also reproduced the version problem after Save followed by
Back to conversation: the hidden canvas retained T2, while the pending source
still sent T1. Its failing run is
`/workspace/scratch/ana-scope-hidden-before.log`.

## Context and application contract

`editor/authoringConversationOrigin.ts` now checks a bridge's saved project,
document and section identity before it supplies AnA context or receives an
insert or remedy. The current project must be a regulatory program UUID and
match the bridge's saved project; its document and section must match the
saved authoring context. A failure uses the existing disabled-control reason
presentation and never invokes the bridge mutation.

At explicit submission, a visible canvas with verified current-project saved
identity supplies the current saved section and version instead of an earlier
authoring handoff snapshot. A hidden canvas may refresh that snapshot only
when it names the exact same document and section. A different hidden section
does not silently retarget the question. A verified saved snapshot remains the
fallback when there is no matching bridge. Unsaved editor text is never sent.

Removing the source attachment still omits its open bridge from that question.
Inventory verification, retry, late-result cancellation and the existing
immutable-turn/model/version/quote proposal gates remain in place. Frozen and
assembled Document views retain their existing refusal wording.

`surfaces/ConversationThread.tsx` collapses a canvas when the shell project
changes, but retains its mounted registry entry and local buffer. It does not
save, discard or unmount that work. Reopening an earlier project's canvas
cannot enable its AnA insert or remedy controls. Returning to that project's
verified saved document reveals the same editor buffer and reason for change.
This follows the existing conversation, source chip, disclosure and disabled
control patterns; there are no CSS or UI-kit changes.

## Validation

The new scope suite covers saved-version selection, current-section selection,
cross-project context omission, hidden-section identity, malformed bridge
identity, intentional source removal, and disabled insertion/remedy after an
explicit cross-project reopen. The live suite mounts the actual
ConversationThread → DocumentCanvas → DocumentWorkbench → RichSectionEditor
path and proves that the same dirty TipTap node and reason survive a project
switch and return, without a PATCH or unsaved-text disclosure. It also checks
confirmed saved versions before Enter with both visible and hidden canvases.

The existing origin suite now asserts that a scope change closes the retained
canvas rather than deleting it, while still refusing the unverified source.
The final focused run passed **20 tests in three files**: scope eight, live
TipTap three, and existing origin nine. The log is
`/workspace/scratch/ana-scope-final.log`. New helpers and all changed scoped
tests pass ESLint with zero warnings; the canonical conversation retains its
five existing warnings. `git diff --check` is clean.

The legacy `conversationThreadInsertRefusals.test.tsx` shared fixture now names
its actual project and a UUID section, carries that project in the generated
draft, and restores the previous shell project after each case. Its model,
unfinished-answer and individually associated refusal assertions are unchanged.
That entire eight-case suite plus the scoped twenty cases pass **28 tests in
four files**, logged in `/workspace/scratch/ana-scope-refusal-fixture-final.log`;
all four files pass strict zero-warning lint.

No existing save, export, freeze, approval or model gate was weakened. No live
model or provider request was made. The control tower records the combined
regression run, fresh typecheck and repository gates.
