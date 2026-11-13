# D4: a save says which revision it recorded, and the Versions rail shows words and reasons (2026-11-12)

**From** S12's biotech sweep of 2026-11-09 (`../../SPINE/S12/2026-11-09-biotech-sweep/`), findings 24, 26, 14 and the
editor's part of 11:
- the Versions rail printed each revision's stored HTML as text, tags and comment-anchor attributes included;
- every card read "edited" with no reason for the change;
- the count beside a section, and the version chip, stayed at their old value after a save until a reload, and the
  confirmation fell back to "open History to confirm the revision";
- the confirmation named the section by its stored key: "Section saved (qms-purpose)", "(1.20:work:1)".

## What already exists (RULE 3)

- **`server/routes/authoring.router.ts`.**
  - `PATCH /sections/:sectionId` saves the text, writes the revision (`createRevision`, `doc_revisions`) and the
    Part 11 audit row (`authoring_audit_trail`, with `change_reason` and `content_hash_after`) in one transaction,
    and answered the section row alone.
  - `GET /sections/:sectionId/history` lists the section's revisions with the author's name. `doc_revisions` does
    not store a reason.
- **`client/src/concept2cure/v2/editor/textDiff.ts` `visibleText`.** The words of a stored section, already used by
  the word-level redline; not exported.
- **`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`.** The Versions rail's cards, the version chip
  (`.ed-ver`), and the save confirmation, which already says "revision N recorded" when the reply carries
  `revision_count`.
- **`shared/regulatory/section-code.ts` `sectionNumberLabel`.** The number a reader is shown for a section; nothing
  for a name code, and the node for a working heading (rB-F13, 2026-11-12).

Nothing new is added: no route, table or screen. Two small pure helpers sit beside the code they serve.

## The change

| Part | Now |
|---|---|
| The save's reply | `section.revision_count`, counted in the save's own transaction, so it includes the revision just written. |
| The history read | Each revision carries `reason`: the audit trail's `change_reason` for the change that left that text (`content_hash_after` = the revision's `content_sha256`), the audit row nearest in time when a section returned to an earlier text. A revision that predates the ledger has none. |
| A Versions card | `revisionPreviewText`: the words a reader sees, at most 400 characters. Below it, "Reason: …" when one was recorded. A comment's anchor is saved under its own reason, so its revision reads as what it is. |
| The save confirmation | `savedSectionName`: the section's number and title, never a stored key. |

## Red, then green

- **Red at HEAD.**
  - `revisionCardText.test.ts`: 4 of 4 failing (the two helpers did not exist).
  - `authoring-save-governed-write.pglite.test.ts` › "the reply carries the count, and each revision carries the
    reason given for it", on PGlite with the real migrations, without the server change (`red-server.txt`):
    "expected undefined to be 1".
- **Green.**
  - The PGlite suite: 22 of 22. Its harness now loads `migrations/20260929_actor_names.sql`, which the history read
    needs; no case had read history there before.
  - Every client suite that renders the workbench or uses the diff helper: 51 files, 674 of 674.
  - The server suites for the authoring router: 91 files, 1,242 of 1,242.

## In the running app

`t94.cjs`, 1440 px, on LMN-201's "1.20 · Introductory Statement…", section "1.20:work:2": two saves, each with a
reason, then the Versions rail (`t94-after.json`, `after-saved.png`, `after-versions.png`).

| | Seen |
|---|---|
| The first save | "Section saved — revision 2 recorded (1.20 Dosage form, formulation, and route of administration)." The version chip reads v2 at once. |
| The second save | "… revision 3 recorded …", and v3 at once. |
| The Versions rail | Three cards. "The dosage form is an oral capsule. Each capsule holds one dose." with "Reason: Walk 94: the unit dose added"; "The dosage form is an oral capsule." with "Reason: Walk 94: the dosage form stated"; the first, empty revision with no reason. No markup in any card. |

Before, on trunk the same day (`../2026-11-12-controlled-document-save/t87-before.json`): "Section saved
(qms-purpose) — open History to confirm the revision."

**Seen, not changed here:**
- **An unbound template copy's save still ends "The text is saved in the editor but not in the filing: This document
  is not bound to a filing".** The page already says the copy is unbound; saying it as a half-failure on every save is
  the CSR lane's finding ED-04, taken next.
- **Adding a comment still writes a content revision** (the anchor lives in the section's HTML). It now reads
  "Reason: Comment anchor applied", so it is no longer an unexplained edit; whether an anchor should be a revision at
  all is a design question, not changed.
