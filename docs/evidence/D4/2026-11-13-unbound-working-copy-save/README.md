# D4: saving a working copy that is in no filing no longer reads as a half-failure (2026-11-13)

**Found by** the CSR lane (`017CFk…`), ranked first in its editor list as ED-04. Every save of a document made from
a template ended "The text is saved in the editor but not in the filing: This document is not bound to a filing,
so there is no governed section to update." The save had worked. Every template copy starts bound to no filing, so
the sentence appeared on every save of every new document until it was placed.

## What already exists (RULE 3)

- **`server/services/c2c/commit-section-to-filing.ts` `commitSectionToFiling`.** The one statement that writes an
  authored section's text into its filing, inside the save's transaction. For a document with no
  `c2c_document_id` it returns `{ committed: false, reason }`. Since `adf161686a` (2026-11-12) it names one such
  state, `outsideFiling: 'controlled-document'`, for a Quality controlled document.
- **`server/services/c2c/filing-section-target.ts` `filingResponse`.** Passes `outsideFiling` to the client with the
  save's reply.
- **`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` `filingCommitNote`.** Turns that reply into the second
  sentence of the save confirmation. It is silent for a controlled document and prints "saved in the editor but not
  in the filing: …" for every other `committed: false`.
- **The editor's own statement of the state.** The outline reads "Saved draft sections · unbound", and the note
  under it reads "Unbound working copy. These sections belong to the saved draft. Review and place the document
  into a filing before treating them as filing sections." Both are on the page before and after a save.
- **Place into filing** (`surfaces/AuthoringPlaceIntoFiling.tsx`) is the act that puts the copy into a filing.

Nothing new is added: no route, table, screen or tool. One value joins an existing field.

## The change

| Part | Now |
|---|---|
| `commit-section-to-filing.ts` | The unbound branch returns `outsideFiling: 'unbound-working-copy'` with the same reason. A bound document whose text did not reach its filing still carries neither mark. |
| `DocumentWorkbench.tsx` `filingCommitNote` | Silent for either mark. The confirmation is the save and its revision. |

**What is not removed (P-122).** The page's statement that the copy is unbound, and what to do about it, is
unchanged and stays in view. The sentence dropped from the confirmation said a filing write had failed when no
filing existed to write to. A bound document whose commit is refused still gets the full sentence
(`filingCommitNote.test.ts`, "still says when a filing document was saved but did not reach its filing, with the
reason").

## Red, then green

- **Red at HEAD** (`red-at-head.txt`), 3 cases:
  - `filingCommitNote` › "says nothing about a filing for a working copy that is in none" ("expected ' The text is
    saved in the editor but …' to be ''");
  - `commitSectionControlledDocument` › "names a working copy that is in no filing, for a document no Quality
    record names", and › "never reads a Quality store that is not there".
- **Green.** Every suite that reads the commit result, in batches:
  - 12 server and contract files, 203 of 203;
  - five PGlite suites, one at a time: `authoring-draft-accept-record` 9, `filing-lock-write-through` 7,
    `node-status-follows-work` 18, `qms-approval-checks-the-filing` 8, `authoring-save-governed-write` 22;
  - eight client files, 116 of 116, and the re-file act's suite (`authoringRefileSavedText`), 26 of 26.
- **Lint.** ESLint warnings per file equal trunk's (`DocumentWorkbench.tsx` 12 and 12; the other three 0 and 0).

## In the running app

`ed04.cjs`, trunk `cd5f9c95a7` plus this tree, 1440 px, signed in as the organisation's administrator. The document
is LMN-201's "1.2 · Cover Letter", made from an IND template and bound to no filing. One sentence is typed into its
first section, a reason is given, and **Save** is pressed. "Before" ran the same server with trunk's
`DocumentWorkbench.tsx`.

| | Before (`ed04-before.json`, `before-save.png`) | After (`ed04-after.json`, `after-save.png`) |
|---|---|---|
| The save's reply | 200, `filing: { committed: false, outsideFiling: "unbound-working-copy", reason: … }` | The same |
| The confirmation | "Section saved — revision 2 recorded (1.2 Cover Letter). The text is saved in the editor but not in the filing: This document is not bound to a filing, so there is no governed section to update." | "Section saved — revision 3 recorded (1.2 Cover Letter)." |
| The page, before and after the save | "Saved draft sections · unbound" and "Unbound working copy. These sections belong to the saved draft. Review and place the document into a filing before treating them as filing sections." | The same |

No API response at or above 400 in either run.

**Seen, not changed here:**
- **The server's reason still says "not bound to a filing".** The same result is returned by the save, the revert
  and the AI-draft accept (`authoring.router.ts`) and by the re-file act, and is written to the audit metadata, so
  the sentence stays in the reply. The editor's save confirmation is its only printer, and no longer prints it for
  this state.
- **The note on the page says "place the document into a filing" but is not itself the door.** The act is
  **Place into filing** in the editor's bar. Whether the note should carry the act is a P-122 question for the
  editor's holder and is not decided in this change.
