# Wave 2B — the canvas lists what AnA built, a draft can be pulled down, a conversation stays in its project

Launch row **D2**, 2026-10-08. Three client halves of `docs/design/ONE_ANA_ONE_CANVAS.md`:
slice 12 with the client half of slice 11 (§4.3, the Documents list), the client half of
slice 7 (§4.5, Download), and the client half of slice 5 (a conversation that belongs to
another project). The server halves landed first: `../ana-11-documents-built/`,
`../ana-7-working-copy/`, `../ana-5-own-project/`.

A review pass found three defects that tests in jsdom could not see, and a few smaller
ones. They are fixed here; see "Review fixes" below. The Download menu was then checked in
a real browser (`browser/`).

## Part 1 — the Documents list in the canvas

### What was wrong

The right-hand column beside a conversation showed a document only while it was open. A
conversation reopened from history found its documents by parsing a capped copy of a tool
result in the step trace, and that copy had cut the id off (`../ana-1b-reopened-keeps-document/`).
So a reopened conversation showed no document at all, and there was no list of what the
conversation, or the project, had built.

### What changed

- `client/src/concept2cure/v2/editor/CanvasDocumentList.tsx` (new). One list, two scopes:
  "This conversation" reads `GET /api/authoring/docs?conversationId=<thread>`, "This project"
  reads `?programId=<uuid>&source=ana` (`documentListUrl`, :50; `readDocumentList`, :81;
  `useDocumentList`, :113). Each row: title, status in words (`StatusPill`, :175: Draft,
  In review, Approved, Frozen), module, sections, updated time, Open, and "Download working
  copy" (part 2). Honest states (`ListBody`, :296): reading; a failed read is an error with
  Try again, never an empty list; a refresh that fails keeps the earlier list and says so;
  empty says "No documents built in this conversation yet."
- `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`. The list is portalled into
  the same pane the editor uses (`.ct-canvas-pane`, :1873), so the column holds one thing at
  a time: closed, the list, or one open document (`data-state`). With nothing open it shows
  by itself when the conversation has built a document and it hides nothing (:1174, see
  review fix 4), except at 1100px and narrower, where the pane takes the screen and the list
  shows only when asked for. The header gains "Documents (n)" (:1589), a disclosure button
  with `aria-expanded` and `aria-controls`. The list is re-read when an AnA turn ends.
- Open reuses the existing `expandedDocId` → `DocumentCanvas` → `DocumentWorkbench` path
  (`openFromList`, :1184). A document whose card is in the transcript opens through that
  card. A document with no card (another conversation's, or one whose trace lost its id)
  mounts the same `DocumentCanvas` with `cardless` (:1904): no card, only the editor beside
  the conversation. No second editor.
- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`. The editor's bar gains
  "← Documents (n)" (:639), which closes the document and shows the list in its place with
  focus on the list's heading, and the document's status in words (:646). Beside the
  conversation, closing a document the list opened hands focus back to its row's Open. A
  cardless document whose record does not read says so in the region, with a retry (:671),
  never an empty editor.

## Part 2 — Download: two acts that cannot be mistaken

### What was wrong

`AuthoringCreateExport` had three buttons, Word, PDF and XML, all disabled for a draft,
because the controlled export is refused (409) unless the document is FROZEN or APPROVED.
A document AnA had just built could not be pulled down at all.

### What changed

- `client/src/concept2cure/v2/editor/DownloadMenu.tsx` (new). One Download menu button.
  "Working copy (Word)" and "Working copy (PDF)" are offered at any status, each described
  "Marked DRAFT — uncontrolled copy". Choosing one POSTs
  `/api/authoring/docs/:id/working-copy {format}` and hands the bytes to the existing
  `downloadBlob` (`downloadWorkingCopy`, :99). A refusal is said in the server's words and
  names the document, beside the control and in a toast; a file that did not arrive or a
  blocked download says so. Success says "requested in your browser" (:123), as the
  controlled export does: the browser may still ask where to save it.
  "Controlled export (Word / PDF / XML)" is the host's existing governed export, enabled only
  when FROZEN or APPROVED (`isSealedStatus`, :59); otherwise it is shown disabled with
  "Freeze or approve to export a controlled copy" visible and read with each item
  (`ControlledGroup`, :279).
- Keyboard and screen reader (`useMenu`, :194): `aria-haspopup="menu"`, `aria-expanded`,
  `aria-controls`; ArrowDown opens it on the first item; the arrows, Home and End move;
  Escape closes it and returns focus to the button; choosing an item does the same.
- `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx`. The three buttons are
  replaced by the menu (:238). The controlled export's blocked reason is a sentence
  (:356), not a bare `disabled`. A document of unknown status is no longer offered the
  controlled export (:74): the server would refuse it, and the working copy fits it.
- The Documents list rows reuse the same menu with working copies only.

## Part 3 — a conversation that belongs to another project

### What was wrong

The server refuses a turn with `THREAD_PROJECT_MISMATCH` when the conversation is bound to
another project than the one the turn names. The client showed its generic "AnA couldn't
complete this request" and offered no way out.

### What changed

- `client/src/concept2cure/components/ana/useAnaChat.ts:442`. The refusal reads: "This
  conversation belongs to another project. Start a new conversation in the project you have
  open. Your request was not sent to the AI provider." The failed assistant message records
  the server's code as `refusalCode` (:1896; the field is in `useAnaChat.types.ts:363`).
- `ConversationThread.tsx:434`. Under a turn refused with that code, one button:
  "Ask again in a new conversation in <open project>" (:454). It starts a new conversation
  through the existing `startNewConversation` path and asks the person's own question again
  in it, with its attachments (`restartInOpenProject`, :1531). Its name says the question is
  sent, because the refusal just above it says it was not. It is disabled while AnA is
  answering. Any other refusal offers nothing of the kind.

## Review fixes

### What was wrong

1. **The Download menu was cut off in a browser.** It was `position:absolute` inside
   `.ed-doc-actions`, which is `overflow-x:auto` (`authoring-v2.css:263-271`). That makes
   the 32px toolbar a scroll box on both axes, and it clipped the menu. Opening the menu
   also scrolled the toolbar up to reach the focused item. In Chromium, 1 of 5 items could
   be hit at 1440px wide and 2 of 5 at 390px; the controlled export items could not be
   reached at all (`red/download-menu-browser.txt`, `browser/reviewed-authoring-1440.png`).
   This is where the editor's toolbar renders, on the Authoring surface and in the canvas.
2. **At 1100px and narrower, "Back to conversation" showed the list, not the conversation.**
   A document opened from the list left the list open behind it. Closing the document by
   Back, by Escape, or by an ask from the editor brought the list back, and the list hides
   the conversation at that width. An ask from the editor was typed behind the list.
3. **A refusal stayed beside the wrong document.** The Download menu kept one document's
   refusal, and its "Preparing…" state, after the Authoring surface handed it another
   document.
4. **The list hid the side column's drafts.** Shown by itself, the list replaced the side
   column. That column holds the drafts that are not authoring documents (type B, with
   "Open as document"), which the list does not include, and AnA's progress during a run.
5. Smaller: "← Documents (n)" counted this conversation's documents even when the list
   would open on "This project"; a document opened from the list showed its status nowhere;
   the way-out button sent the question without saying so; the success toast said
   "Downloaded" when the browser had only been handed the file.

### What changed

1. `DownloadMenu.tsx`. The menu opens in the browser's top layer as a manual popover
   (`showInTopLayer`, :161), out of every scroll box, and is placed in fixed coordinates
   from its button by the one placement helper the other clipped menus already use,
   `fixedMenuPlacement` (`menuPlacement.ts`; `placeMenu`, :179). It follows the button when
   any box scrolls, and focus on open does not scroll the toolbar. The `popover` attribute is
   set only where the browser can open one. `authoring-v2.css:1859` makes `.dlm-menu` fixed
   and undoes the browser's own popover box.
2. `ConversationThread.tsx`. `closeDocument` (:1217) closes a document toward the
   conversation. At 1100px and narrower it closes the list too, and puts focus on the
   header's "Documents" (or on the composer after an ask, `canvasAsk`, :1250). Beside the
   conversation nothing changes: the list comes back with focus on the row. "← Documents"
   stays the way to the list.
3. `DownloadMenu.tsx`. `useWorkingCopy` (:309) keeps each request and refusal with the
   document it was for. A refusal shows only beside its own document; an answer that comes
   after the person moved on is still told in a toast that names the document, and does not
   hold the other document's control.
4. `ConversationThread.tsx:1174`. The list shows by itself only when it hides nothing: not
   while the side column is open and holds a type-B draft or a running turn. The header's
   "Documents" still opens it, and with the side column closed it shows as before.
5. The count is of the list it opens (`listCount`, :1167). The open document's bar shows its
   status (`DocumentCanvas.tsx:646`). The button reads "Ask again in a new conversation in
   <project>". The toast says "requested in your browser".

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `canvasDocumentsList.test.tsx` (new) | at `HEAD`: 13 of 13 failed (`canvasDocumentsList.test.txt`); as reviewed: 7 of 22 failed (`review-canvasDocumentsList.test.txt`) | 22 passed |
| `downloadWorkingCopy.test.tsx` (new) | at `HEAD`: 11 of 11 failed (`downloadWorkingCopy.test.txt`); as reviewed: 8 of 17 failed (`review-downloadWorkingCopy.test.txt`) | 17 passed |
| `conversationProjectMismatch.test.tsx` (new) | at `HEAD`: 3 failed, 2 passed (`conversationProjectMismatch.test.txt`); as reviewed: 3 failed, 2 passed (`review-conversationProjectMismatch.test.txt`) | 5 passed |
| `useAnaChat-project-mismatch.test.ts` (new) | at `HEAD`: 2 failed, 1 passed (the "no code" case) | 3 passed |
| Mutation: the cardless region never shows a failed read (`red/opened-document-read-fails.mutation.txt`) | 1 failed | (the same test, green above) |
| Real browser, Download menu in the editor toolbar (Authoring and canvas) and a list row, 1440px and 390px (`browser/`) | as reviewed: toolbar items hit-testable 1 of 5 (1440px) and 2 of 5 (390px); toolbar scrolled 41-77px on open (`download-menu-browser.txt`) | every item hit-testable in all six cases, top layer, toolbar not scrolled, the PDF working copy downloaded by mouse, the menu follows its button when the list scrolls (`download-menu-browser.txt`) |
| `authoringCreateExport.test.tsx`, `workbenchExportRecovery.test.tsx`, `authoringAnaPane.test.tsx` (adapted to the menu) | — | 31 passed (`green/adapted-export-tests.txt`) |

The `HEAD` red runs were taken with only this slice's source files set back to `HEAD` and
its two new components removed. The "as reviewed" red runs were taken with this pass's four
source files (`ConversationThread.tsx`, `DocumentCanvas.tsx`, `CanvasDocumentList.tsx`,
`DownloadMenu.tsx`) set back to the reviewed copies. Each time the files were restored and
checked byte for byte with `cmp`.

The tests that pass in both "as reviewed" runs are the earlier tests, plus two guards: closing
a list-opened document beside the conversation still focuses its row, and with the side
column closed the list still shows by itself.

The browser check builds the real `AuthoringCreateExport`, `CanvasDocumentList` and
`DownloadMenu` with esbuild (`browser/build.mjs`), loads the real stylesheets
(`design-system/colors_and_type.css`, `app-v2.css`, `authoring-v2.css`) in Chromium
headless_shell 1194, and asks `elementFromPoint` what is at the centre of every menu item
(`browser/check.mjs`). It is a harness with the DOM chain the editor renders, not the running
app.

Also run: every test file that imports or mocks a changed file, 157 files, 2,152 of 2,164
tests passing (`green/related-suites.txt`). None of the 12 failures is in this slice's tests:
`appMentions.test.tsx` reads `Shell.tsx`, which wave 2A rewrote; `conversationRailTwins.test.tsx`
(wave 2A, new) asks the conversation for the pre-mortem panel and the accepted steers, which
2A lists as not built; `sendForReview.test.tsx` and `workbenchAssignReview.test.tsx` (wave 2C)
pass when run alone. ESLint: no changed file has more warnings than at `HEAD` (`ConversationThread.tsx`
6 and 6; `DocumentCanvas.tsx` 2 and 2; `AuthoringCreateExport.tsx` 2 and 2; the adapted
tests 1 and 1; new files 0, the `browser/` scripts included). `ci:undefined-css-classes`,
`ci:surface-text-ramp` (after regenerating), `ci:canvas-path` and `check:microcopy` pass.

## Not done

- The running app was not opened in a browser. The browser check above uses the real
  components and stylesheets in a harness. Slice 7 asks for both formats downloaded and
  opened; the server half's evidence holds those files (`../ana-7-working-copy/`).
- Type-B drafts are not rows in the list (§4.3 asks for them with "Open as document"). Until
  they are, the list does not show by itself while the side column holds one.
- Slice 12's other parts: Progress has not moved into the Step chip's popover, so the list
  and the progress column still take turns; the conversation width and the Comments
  container query are unchanged; the transcript card keeps its action row.
- A row shows the number of sections, not "4 of 4 drafted": the list route returns
  `section_count` only.
- Project home's "Recent drafts" is not yet replaced by this list (`ProjectHome.tsx` is
  not this slice's file).
- The mismatch offer lives in the session only: the server refuses before it saves the
  question, so a reload shows no refused turn to offer it under.
- `fixedMenuPlacement` opens a menu above its button when it fits there. In a list row lower
  on the screen the Download menu therefore opens upward, over the rows above it.
