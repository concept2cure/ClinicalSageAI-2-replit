# F1 / D4: saving a Quality controlled document says nothing about a filing (2026-11-12)

**Found by** the Quality lane's walk 41 on 2026-11-12
(`../../DESIGN/D7/2026-11-12-training-lists-re-read/shots/w41-editor-1440.png`) and handed to the editor's holder in
`.design/claude-convergence/COORDINATION.md`. After saving a section of a new SOP the editor said: "The text is
saved in the editor but not in the filing: This document is not bound to a filing, so there is no governed section
to update." A controlled document is never bound to a filing.

## What already exists (RULE 3)

- **`server/services/c2c/commit-section-to-filing.ts` `commitSectionToFiling`.** Every section save calls it in the
  save's own transaction. It writes the text through to the filing the document is bound to
  (`authoring_documents.c2c_document_id`). For a document bound to none it answers `committed: false` with the
  sentence above, for every kind of document.
- **`server/services/c2c/filing-section-target.ts` `filingResponse`.** The shape the save route returns as `filing`.
- **`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` `filingCommitNote`.** Appends that reason to
  "Section saved".
- **`public.qms_documents.authoring_document_id`** (`db/migrations/20261014_qms_controlled_authoring_content.sql`).
  The Quality register's binding to its authored document, one register entry per document.
  `server/services/qms/controlled-document-content.ts` reads it for the Quality signing and write refusals.

Nothing new is added: no route, table or screen. One private helper, `isControlledDocument`, sits in the commit
service.

## The change

| Part | Now |
|---|---|
| The commit service | For a document bound to no filing, it asks whether a Quality register entry names the document. If one does, the answer is `committed: false`, `outsideFiling: 'controlled-document'`, "This is a controlled document in the Quality register. It is approved and released there, and is not part of a filing." Any other unbound document keeps the old sentence. |
| A missing Quality store | The helper first probes for the column with a statement that cannot fail, as the service already does for the filing store. A statement against a missing table would abort the save's transaction. |
| `filingResponse` | Passes `outsideFiling` through. |
| The editor | `filingCommitNote` says nothing about a filing when the server marks the document as a controlled document. Every other case is unchanged. |

## Red, then green

- **Red at HEAD** (`red-at-head.txt`), 2 failing:
  - `commitSectionControlledDocument` › "says the document is controlled in Quality, not that it is missing a
    filing";
  - `filingCommitNote` › "says nothing about a filing for a Quality controlled document".
- **Green.** Both new suites pass, 6 of 6. Every suite that exercises the commit path passes, the PGlite ones
  included: 19 files, 262 of 262.
- **Lint.** ESLint warnings per file equal trunk's (`DocumentWorkbench.tsx` 12 and 12; the others 0).

## In the running app

`t87.cjs` on trunk `a9b5af1873`, 1440 px: Quality on LMN-201 → **New controlled document** → the one editor →
type a sentence, give a reason, **Save**.

| | The save says | The save's `filing` |
|---|---|---|
| Before (`t87-before.json`, `before-save.png`) | "Section saved (qms-purpose) — open History to confirm the revision. The text is saved in the editor but not in the filing: This document is not bound to a filing, so there is no governed section to update." | `committed: false`, the unbound sentence |
| After (`t87-after.json`, `after-save.png`) | "Section saved (qms-purpose) — open History to confirm the revision." | `committed: false`, `outsideFiling: 'controlled-document'`, the Quality sentence |

The "after" run reads the real `qms_documents` row in Postgres, so the helper's two statements are proven there
and not only against the unit test's scripted client.

**Seen, not changed here:**
- **The toast names the section by its code, "qms-purpose".** That is an internal code. It is one of the editor's
  section-code leaks, taken separately.
- **The "before" run's project sources read answered 409 once**, while the new document's first save landed. That is
  the source read's access recheck (`COORDINATION.md`, "on a Quality-heavy project the read is still 6.6 to 7 s"),
  taken separately.
