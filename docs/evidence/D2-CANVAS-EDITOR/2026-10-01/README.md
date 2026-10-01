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
