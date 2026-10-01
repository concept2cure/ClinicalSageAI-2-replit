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

## 6. A section not yet drafted is one ask away

**Before.** The outline (step 2) said "Not drafted" and stopped there. To get
AnA to draft one section, the person had to:
- type the request,
- open the editor,
- find the section,
- and hope the turn and the insert agreed on which section was meant.

**Now.**
- A section with no text shows "Ask AnA to draft 2.5.2" beside "Not drafted
  yet". It works the same in the card and once chosen from the outline.
- The ask opens the editor beside the conversation at that section. The
  canvas passes `embedded.focusSection` (one request per nonce). The
  workbench applies it once, through its own `requestLeave`, so unsaved text
  in the open section is held for the author to decide, never saved or
  dropped for them.
- The ask lands in the composer for the person to send: "Draft the text for
  section 2.5.2 … of "<document>" here in the conversation, so I can insert
  it into the document." It asks for the text in the conversation because
  the document already exists, and a second draft of it would be a
  duplicate.
- With the editor open at 2.5.2, that turn carries 2.5.2 (step 5), and AnA's
  answer offers "Insert into 2.5.2 as tracked suggestion" (step 3).
- When the window is too narrow for two columns, the existing `canvasAsk`
  rule closes the editor so that the prefilled ask is on screen.

**Failing first.**
- `6-ask-red.txt`: the new thread case failed against the unchanged canvas,
  which had no ask.
- `6-mutation-no-focus-red.txt`: with the canvas not passing `focusSection`,
  the editor opens at its first section, and the case fails on "Insert into
  2.5.2".

**Green:** `6-ask-green.txt`. The thread suite (18/18) and both canvas
suites. The 56 files that mount the thread, the canvas or the workbench, plus
the editor's and `useAnaChat`'s suites, pass 555/555.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`,
  `ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions`: OK.
- The ESLint ratchet `--since HEAD --gate`: unchanged.
- One rule was added in `authoring-v2.css`
  (`.dcv-sec-empty .nda-open`), using existing tokens only.

**A process note.**
- Step 5's first push ran its hook while step 6 was still uncommitted in the
  working tree. The hook's typecheck reads the working tree, so it refused
  step 5 for step 6's unfinished line (`doc` possibly null). That was
  correct, and nothing was pushed.
- Interrupting that loop left the ESLint ratchet's temporary
  `__eslint_ratchet_prev__.*` copies behind. They were removed.
- Steps 5 and 6 are pushed together from a clean tree.

## 7. Seen in a browser: the card collapses while its document is open beside it

**How these screens were made.** Steps 1–6 were proven in jsdom, which lays
nothing out. These screens are real layout:
- The thread's markup is captured with the same API fixtures as the tests (a
  four-section Module 2.5, two sections drafted).
- It is wrapped in the design tokens (`design-system/colors_and_type.css`)
  and every `client/src/concept2cure/v2/styles/*.css`.
- It is rendered by the pre-installed headless Chromium at 1440×900.

Two things in them are artifacts of this method, not the product:
- Fonts fall back to system fonts.
- The editor's "Attribution could not be read … Failed to parse URL" banner
  comes from a relative-URL fetch in jsdom.

The capture spec was a temporary file and is not committed.

**Seen.**
- `screens/2-card.png`: the card from step 2 (type line, project and
  progress, provenance, outline with drafted state) reads as intended. 2.5.3
  is chosen in the outline, with step 6's "Ask AnA to draft 2.5.3" beside
  its empty state.
- `screens/7-beside-before.png`: with the editor open beside the
  conversation, the card in the conversation column still repeated the
  outline and the section, the same content as the editor next to it. That
  pushed AnA's next answer out of view.
- The same screen also shows step 6 as built: "Not drafted yet. Ask AnA to
  draft 2.5.3".

**Changed.**
- While its document is open beside the conversation, the card collapses to
  its head (type, title, progress, provenance, "Updated after AnA's last
  turn" when it applies) and its actions. The outline and the section are in
  the editor next to it.
- The editor's own "Draft with AnA" takes the ask there. It routes to the
  conversation's composer, through the canvas's `onAsk`.
- Closing the editor restores the whole card.
- `screens/7-beside-after.png` shows the result: the follow-up question and
  AnA's answer are in view beside the editor.
- The CSS gains `.dcv-body[hidden] { display: none }`, because `.dcv-body`
  is `display: grid`, which beats the user agent's `[hidden]` rule.

**Failing first.**
- `7-collapse-red.txt`: the step-1 beside case, extended to assert the
  collapse and the restore, fails on the unchanged canvas.

**Green:** `7-collapse-green.txt`. The thread suite and the three canvas
suites, 48/48.

**Also run.**
- `tsc`: clean.
- The ESLint ratchet: unchanged.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`,
  `ci:check-css-selector-shadowing`: OK.

**Seen, not changed: the editor family's files.**
- In a ~940px pane the editor's header actions scroll sideways. That is the
  editor's documented choice: wrapping was measured and rejected.
- The outline column opens with a long notice: "This project has no
  governed filing document …". It is true, and about the filing outline,
  not this document. It takes the top of a narrow pane. It is a candidate for
  the editor family's next pass.

## 8. An assumed module is said to be assumed

**Before.**
- A document created without a module is stored as M2, and the server
  records `moduleDefaulted: true` on its provenance (`authoring-from-draft.ts`,
  2026-09-22 review #13: "a filing must not treat the assumption as a
  decision").
- This happens when `draft_authoring_document` is called without a module,
  and for every draft opened as a document in step 4.
- No client read the flag, so the card's type line said "M2" as though it
  had been chosen. A statistical analysis plan read as "Statistical analysis
  plan · M2". Step 4 made this case common.

**Now.**
- `provenance.ts` gains `moduleWasAssumed(raw)`, kept in the one module that
  reads the record.
- The type line says "M2 (assumed)". The hover text says no module was
  chosen when the document was created, so M2 was assumed, and to check it
  before filing.
- A module that was chosen reads as before.

**Failing first.** `8-module-red.txt`: the new case failed against the
unchanged canvas.

**Green:** `8-module-green.txt`. The 51 suites that mount the thread, the
canvas, the workbench or read provenance pass 656/656.

**Also run.**
- `tsc`: clean.
- The ESLint ratchet: unchanged.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.

## 9. AnA's answer reaches the document at any width

**Before.**
- Step 3 withdrew "Insert into 2.5.1 as tracked suggestion" when the editor
  closed, because a hidden editor is not somewhere the person can see a
  suggestion land.
- Below 1100px the conversation is hidden while the editor is open
  (`screens/9-editor-at-1024.png`, from the same browser harness as
  section 7). AnA's answers are on screen only while the editor is closed.
- So below 1100px the offer and its target were never on screen together,
  and the loop could not be used. That covers a 1024px laptop or a tablet in
  landscape.

**Now.**
- While the editor is closed but still mounted, each settled answer offers
  "Open 2.5.1 and insert as tracked suggestion". The click reopens the
  editor and inserts, so the suggestion still lands where the person sees it.
  Step 3's principle holds; only its means changed.
- While the editor is open, the offer reads as in step 3.
- The canvas reports its editor with an `open` flag instead of reporting
  nothing when closed.
- Turns still name the document only while the editor is on screen (step 5),
  because the person is not looking at a closed one.
- A document whose editor was never opened is offered nothing, as before.

**Amended test.** Step 3's case "withdraws the offer when the editor closes"
is replaced in place by "when the editor closes, the offer reopens it". The
reason is in its comment. Its first half still asserts that the plain
"Insert into" offer goes when the editor closes.

**Failing first.** `9-reopen-red.txt`: the amended case failed against the
unchanged thread and canvas.

**Green:** `9-reopen-green.txt`, 18/18 in the thread suite. The 56 files
that mount the thread, the canvas or the workbench, plus the editor's and
`useAnaChat`'s suites, pass 556/556.

**Also run.**
- `tsc`: clean. It caught `AnaTurn`'s prop type still on the two-argument
  callback; fixed.
- The ESLint ratchet: unchanged.
- `ci:canvas-path`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
