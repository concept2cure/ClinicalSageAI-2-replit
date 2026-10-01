# The AnA document canvas → editor, as a build-with-AnA experience

**Row:** D2 (launch catalog: Authoring). Founder-directed, 2026-10-01: simple,
focused enhancements to the canvas that converts into the editor, so that AnA
builds the document and works inside it while she keeps talking with the
client, as one builds with Claude. The work stays within
`docs/design/ANA_DOCUMENT_CANVAS.md`: one canvas, one editor, the authoring
store.

## 1. The editor opens beside the conversation

**Before.** "Open full editor" expanded the canvas in place, at the thread's
full width and the viewport's height. AnA's answers scrolled away above it,
and the person edited with the conversation out of sight.

**Now.**
- The thread keeps a pane after its conversation column (`.ct-canvas-pane`),
  and an expanded canvas portals the one editor into it.
- The conversation keeps a reading column (34%, 340–520px) with its answers,
  the card that opened the editor (marked, its button now "Close the editor")
  and the composer.
- The document takes the rest.
- Below 1100px there is no room for two columns, so the document takes the
  screen, "Back to conversation" returns, and an ask from inside the editor
  closes it so the prefilled message is on screen.
- The workbench stays mounted in the pane while hidden, so its state survives
  closing and reopening.
- Without a pane (the Authoring surface, the card alone) the canvas expands in
  place as before.

**Failing first.**
- `1-beside-red.txt`: the new case in `conversationThreadCanvas.test.tsx`
  failed against the unchanged code, because no pane held the editor.
- `1-beside-green.txt`: 85/85 across both canvas suites, every
  conversation-thread suite, and the in-canvas citation and caption suites.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`: wired (thread → canvas → workbench).
- `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- ESLint ratchet: unchanged.

## 2. The card says what the document is and how far along, and keeps up with AnA

**Before.**
- The card named the CTD module and status, rendered the first section, and
  offered "Show all".
- It read the store once, when it mounted. It did not say what kind of
  document it was or which sections were still empty.
- It did not reflect anything AnA changed in a later turn. Reopening the
  thread was the only way to see a revision.

**Now.**
- **Type line:** names the document type, from the stored product code in
  words: `clinical_overview` → "Clinical overview".
- **Outline:** lists every section with drafted / not drafted, and the meta
  line says "2 of 3 sections drafted". Choosing a section shows it in the card.
- **Refresh:** the thread counts AnA turns as they settle and passes the count
  as `refreshKey`, and each canvas re-reads its record quietly on a new value.
  - Sections whose stored text changed are marked "Updated" in the outline, and
    the card says "Updated after AnA's last turn: 2.5.3".
  - A refresh that fails keeps the record already read on screen and says so,
    with a retry. It never shows an empty document.

**Failing first.**
- `2-live-red.txt`: all five cases of the new `documentCanvasLive.test.tsx`
  failed against the unchanged canvas.
- With the thread change removed, the thread case read the document once and
  never again.
- Three assertions in `documentCanvas.test.tsx` were updated for the richer
  card, each keeping what it checked: only the first section's body shows
  until asked (now scoped to the section's article, since the outline names
  every section), the drafted count, and the type line.

**Green:** `2-live-green.txt`, 91/91.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- The new pre-push warnings gate first refused two complexity warnings this
  change had added. The fetch-and-parse moved into one `readDocumentRecord`,
  and two `??` defaults went, because `DocumentCanvas` already defaults both
  props. The ESLint ratchet is unchanged.

## 3. AnA's answers go into the open document

**Before.**
- The editor's "Insert into <section> as tracked suggestion" existed only in
  the editor's own AnA rail, and the rail is hidden when the editor is
  embedded in the conversation canvas.
- So while a document was open beside the conversation, nothing AnA answered
  in the conversation could reach it except by copy and paste, unattributed.

**Now.**
- When the editor is embedded, `DocumentWorkbench` reports its open section
  and an `insert` bound to its editor (`EditorBridge`). It reports nothing
  while the document is sealed or no section is open.
- `DocumentCanvas` passes that on only while it is expanded. After it closes,
  the workbench stays mounted but hidden, and a hidden editor is not offered
  as a target.
- Each settled AnA answer in the thread offers "Insert into 2.5.1 as tracked
  suggestion". The turn that drafted the open document does not, because its
  answer describes a draft that is already there.
- The insert goes through the editor's one suggestion door,
  `RichSectionEditorHandle.insertSuggestion`. That is the same path as the
  rail.
  - The text lands as `<ins>` marks attributed to AnA, with
    `data-source-record` naming the turn record that wrote it.
  - Nothing is saved until the person reviews each edit and saves.
  - In source mode, or when the editor refuses, the toast says so instead of
    claiming success.
- No server write and no new route. The section PATCH has no optimistic
  concurrency, so a server-side write while the editor is open could be
  overwritten by the editor's next save. The editor's own door avoids that.

**Failing first.**
- `3-insert-red.txt`: the insert case failed against the unchanged thread
  ("Unable to find role=button … Insert into 2.5.1 as tracked suggestion").
- `3-withdraw-red.txt`: with the canvas's `expanded` gate removed, the offer
  stayed after the editor closed. The case fails without the gate.

**Green:** `3-insert-green.txt`, 12/12 in the thread suite. The 35 suites
that mount the thread, the canvas or the workbench, plus the editor's own
suites, pass 321/321.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- `check-eslint-warning-ratchet --since HEAD --gate`: no file changed its
  warning count.
- The offer reuses the thread's existing `.ct-ref` chip, so there is no new CSS.

## 4. Every AnA draft opens as a document

**Before.**
- Only `draft_authoring_document` wrote the editor's store. Every other tool
  that drafts a document produced a markdown draft: the briefing book, the
  plans, the statistical documents, and the rest of the
  `status: 'generated'` family in `AnaToolExecutor`.
- That draft was a side-panel card. The card's Edit went to the authoring
  workspace with no document. `docs/design/ANA_DOCUMENT_CANVAS.md` names this
  as the defect: "The thread's Edit button navigates to `document-authoring`
  with **no document identity**."
- So most document types AnA drafts could not reach the canvas or the editor.

**Now.**
- The card's control is "Open as document" (`ArtifactCard` in
  `surfaces/ConversationThread.tsx`). It opens the draft as an authoring
  document in the open project through the one door that does that,
  `POST /api/authoring/docs/from-draft`
  (`editor/draftToDocument.ts`).
  - The server sanitizes every section on the way in, as it does for the tool.
  - There is no second store and no server change.
- The draft is split at its top heading level.
  - A heading's own number ("2.5.1 …") becomes the section code when every
    heading has a distinct one. Otherwise sections are numbered in order.
  - A leading title heading is dropped, because it is the document's title.
  - Text before the first heading is a section under the document's title.
  - A draft with no headings is one section. HTML drafts split the same way.
- **Provenance:** source `ana`, the conversation, and the turn record that
  drafted it. The canvas then reads "Drafted by AnA in this conversation".
- **Once per turn.** The project's documents with the same title are read
  first. One whose provenance names the same conversation and turn is opened,
  and nothing is created.
  - If that check cannot run, nothing is created and the toast says so,
    because a duplicate in a controlled store is worse than asking again.
  - Without an open project the control is disabled with its reason.
- On success, the card leaves the side panel. The document becomes the canvas
  under the turn that drafted it and opens in the editor beside the
  conversation (steps 1–3 then apply: outline, refresh, AnA's answers into it).

**Not changed.**
- A thread reloaded later does not bring the card back. The panel has never
  rehydrated drafts (its own comment says so), so the canvas for a draft
  opened this way is also this session's.
- The document itself is in the project and in Authoring, where the next
  session finds it.

**Failing first.**
- `4-open-red.txt`: all three new thread cases failed against the unchanged
  thread, which had no control that opens the draft as a document.
- Each rule was then broken on purpose and the tests caught it:
  - `4-mutation-fail-open-red.txt`: a failed earlier-copy check treated as
    "none found" creates a document. One unit case and one thread case fail.
  - `4-mutation-no-reuse-red.txt`: a matching document never reused creates
    a second copy. One unit case and one thread case fail.

**Green:** `4-open-green.txt`. The 36 suites that mount the thread, the
canvas, the workbench or the card list, plus the editor's own suites, pass
335/335.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- The ESLint ratchet `--since HEAD --gate`: unchanged. ESLint on the two new
  files: clean.

**Replaced, not deleted.**
- The card's Edit navigation is replaced in place by "Open as document". The
  same button now carries the document, as the design doc requires.
- Reachability is proven by "every AnA draft opens as a document" in
  `conversationThreadCanvas.test.tsx`.
- No file was deleted.

## 5. AnA knows the document open beside the conversation

**Before.**
- The thread runs on the shell's chat, which is created with no authoring
  context, because the shell does not know a document is open beside the
  conversation.
- So every turn sent while the person built a document reached AnA naming
  no document, no section and no module. "Draft this section" named nothing
  she could resolve.
- The section-specific ICH M4 guidance that the stream route adds for an
  open section (`buildSectionSpecificPrompt`) never applied.

**Now.**
- The embedded workbench's bridge (step 3) carries the workbench's own
  `authoringContext`: the same object its own chat sends, built once, not
  rebuilt by the thread.
- `useAnaChat`'s `send(text, files, { authoringContext })` puts it on that one
  turn. A turn without it sends the host's own context, never an earlier
  turn's, and the turn's context wins over the host's.
- While the editor is open, every turn from the thread carries it: the
  composer, Refine and Continue. With nothing open, a turn is sent exactly as
  before.
- It travels through `authoring_context`, which the stream route already
  renders as "Current Authoring Context", inside the fence labelled
  untrusted. It also reaches `document_context` and the route block's
  section code.
- A sealed (frozen or approved) document is still open, so it is still named
  to AnA, but it is reported `editable: false` and no insert is offered into
  it. In step 3 the bridge reported nothing for a sealed document; that is
  corrected here.

**Failing first.**
- `5-hook-red.txt`: with `useAnaChat.ts` stashed, the per-turn context was not
  sent. Two of three cases fail. The third is a guard that the context does
  not stick to later turns, and it passes either way.
- `5-thread-red.txt`: with the thread stashed, the turn carried no context.
- `5-mutation-sealed-red.txt`: an insert offer that ignores `editable` puts
  the frozen document up as a target, and the sealed case fails.
- One existing suite, `anaContinueHosts`, failed on the first green attempt.
  It asserts that Continue is sent with exactly one argument. Now nothing
  extra is passed when no document is open.

**Green:** `5-context-green.txt`. Every suite that mounts the thread, the
canvas or the workbench, plus the editor's suites and every `useAnaChat`
suite: 56 files, 554/554.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- The ESLint ratchet `--since HEAD --gate`: unchanged.

**Not done here, and why.** AnA now knows which section is open but cannot
read what it says. Both ways to give her the text are in files that sessions
holding claimed rows changed in the last 24 hours, so they are written up,
not edited:
- **Board hand-off item 14, still open at this commit.**
  - `server/routes/ana-ri/stream.ts` reads no `module_context`, so the fenced
    "OBSERVED SCREEN STATE" block, which could carry a section excerpt as
    data, reaches no model.
  - `stream.ts` was changed today by `…01KnUGoX` (`720965433f`) and by
    `…01T2wooC` (`c7691741a3`).
- **No AnA tool reads an authoring document.**
  - `draft_authoring_document` writes one. `read_governed_document` reads a
    different store (`doc_…` ids).
  - A read-only `read_authoring_document` (outline, then a section's
    content, tenant-scoped) beside the draft tool would let AnA revise the
    document she built.
  - `AnaToolExecutor.ts` and the tool definitions were changed today by
    several claimed lanes (`…01SuVLo2`, `…01GCu8tc`, `…0194UQPx`,
    `…01KnUGoX`).
  - This is proposed for whichever lane next holds those files.
