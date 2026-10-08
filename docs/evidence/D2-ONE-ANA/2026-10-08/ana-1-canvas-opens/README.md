# Slice 1 — the document opens on the right while AnA builds it

Launch row **D2**, 2026-10-08. Slice 1 of `docs/design/ONE_ANA_ONE_CANVAS.md`.

The founder, 2026-10-07: *"when I want to use AnA, just like I use Claude, I want to have a canvas on the right-hand side, and I want to see the documents being built."*

## What was wrong

A document AnA drafted appeared as a card in the middle of the thread (`0-screens/06-conversation-document-card.marked.png`). The editor opened on the right only after the person clicked "Open full editor" (`07-conversation-editor-beside.marked.png`).

## What changed

`ConversationThread.tsx`: when a turn being streamed on this screen names an authoring document (`artifact_draft` carries `authoringDocId`), the editor opens beside the conversation in the existing pane. Nothing waits for a click.

Five rules govern this:

- **History opens nothing.** Only a turn streamed while the screen is open triggers it. A conversation reopened from history opens nothing by itself.
- **Each document opens by itself once.** Once the person closes it, it stays closed.
- **It never takes the pane from the person.** If they have another document open beside the conversation, the new one is offered instead: "AnA built <title> · Open".
- **Narrow screens get the offer, not the editor.** At 1100px or narrower the editor would hide the conversation, so it is offered there too.
- **The offer never takes focus.** It is announced (`role="status"`, `aria-live="polite"`) and never moves focus, because the person may be typing.

Every document action stays where it was: edit, insert AnA's answer as a tracked suggestion, file to the Vault, assign review, place into a filing.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `canvasAutoOpen.test.tsx` (new) | 4 failed, 1 passed | 5 passed |
| `conversationThreadCanvas.test.tsx` | — | 21 passed |
| Conversation, canvas and AnA suites, plus `tests/ui/one-shell.test.ts` | — | 482 tests in 46 files; one failed, and was corrected as below |
| `ci:canvas-path` | — | wired |

The "before" case that passes is the history rule (nothing opens by itself on a reopened conversation). It is the guard, and it held both before and after.

`conversationThreadCanvas.test.tsx` › "re-reads the document when AnA's turn ends" counted section reads exactly: 1 before the turn settled, 2 after. With the document now open beside the conversation, its editor reads the sections too. The test now counts from just before the turn settles.

It was shown still to guard the re-read: with the settle re-read removed from `ConversationThread.tsx`, the test fails (mutation applied, run, restored).

## Not done in this slice

- **The navigation collapse** below 1600px while a document is open is not part of this commit. It belongs to slice 9, where the shell grid changes.
- **Live text.** The document appears when the tool has saved it. Watching the text arrive section by section is slice 26.

## In a real browser (`screens/`)

Captured against the real server, client and database at `d390f9646`, with a stand-in model labelled "STAND-IN" on screen. The draft tool, its approval card and the stored documents were real. "Open full editor" was never clicked.

| Width | Result |
|---|---|
| 1440 | **Pass.** The editor opened on the right 219 ms after "Confirm and run", while AnA was still working (`1440-b-document-appears.png`). It stayed open after the turn ended. |
| 1280 | **Pass.** It opened on the right after 234 ms. |
| 1024 | **Pass.** It was offered, not opened: "AnA built <title>", with Open. The notice did not take focus. Open put the editor across the screen, as designed at 1100px and narrower. |
| Reopened from history | **Pass, but it showed a real defect.** The reopened conversation held no document at all, so nothing could open. The saved step summary had cut the document's id off. Fixed in `../ana-1b-reopened-keeps-document/`. |

Other findings in `screens/README.md`, each assigned to a later slice:

- **Blank pane before the editor loads.** The right side is open but blank for about 0.4 s before the editor appears.
- **The "AnA is driving" strip overlaps the editor** at 1440 and 1280. Slice 4 removes its typing box.
- **1280 is cramped.** The navigation collapse is slice 9.
- **Project home disagrees with the drafted document.** Its "Recent drafts" and "Module completion" read the governed dossier sections, not the authoring document AnA drafted, so they say "no sections". That belongs to the project-page slices (23, 24).
- **Three typing boxes during a run.** Visible in `1440-b-document-appears.png`: "Steer this run", "Reply to AnA" and "Ask or steer AnA". Slice 4 makes that one.
