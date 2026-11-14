# An IND catalogue document opens with the parts its record already has (F1, sweep item 15, 2026-11-14)

## The defects

New document → Start from → IND:

1. **The Pre-IND briefing document opened as one empty section** titled with its own name. Its pyramid task
   ("Prepare briefing package") binds no CTD section, so the catalogue had nothing to give it.
2. **A CMC or nonclinical subtask was judged on every section of its parent task.** For example, "Manufacture"
   (3.2.S.2) was a preparation worksheet AnA would not draft, because the drug substance task also holds the
   3.2.S.4.4 batch analyses, a data table. The 3.2.S.2 section row, with the same seven parts, was draftable. Two rows
   both read "Manufacture — preparation worksheet", because ICH titles 3.2.S.2 and 3.2.P.3 alike.

## What already exists (RULE 3)

- **The Pre-IND briefing document's parts:** `us_lifecycle_pre_ind_meeting` in
  `server/services/market-specs/document-template-library.ts`, "Pre-IND Meeting Briefing Document (Type B)". Its
  eight parts run from the meeting request letter to the numbered questions for FDA with the sponsor's positions. The
  attendee list is manual (RULE 2).
- **The pattern:** the SAP row in `server/services/authoring/ind-authoring-templates.ts` already opened with a
  recorded document's parts (`work:sap:*` codes, "no CTD placement is established"). It is now one table,
  `RECORDED_DOCUMENTS`, with the SAP and the Pre-IND briefing document. The SAP row is byte-identical, as the snapshot
  delta shows.
- **The section rows** (`section:m3.2.S.2` and the rest) are the reference each subtask now matches.
- **The draftability rule:** `narrativeDraftable` in `server/services/authoring/ind-document-catalog-source.ts`, unchanged.
  A subtask bound to a code now passes only that code and its own artifact types.

Nothing new: no screen, route, table or tool.

## The change

- **Pre-IND briefing document:** 1 empty section → the record's 8 parts, each keeping the record's drafting mode.
- **18 subtasks:** each is judged on its own CTD section and named with its code ("3.2.S.2 · Manufacture"). All 18
  now equal their section row in parts, drafting modes, draftability and name. One name differs: "Characterisation"
  against the section's spelling. See `subtask-vs-section.txt`.
- **Built-in templates:** 449 before and after; 19 changed, none added or removed (`builtin-snapshot-delta.txt`). The
  cross-sector digest is re-recorded with a dated note.

## Proof

- **Red:** `red.txt`. On trunk `462855c80`, 4 of 6 fail on assertions, and both controls pass.
- **Green:** 6 of 6. Neighbourhood: `green.txt`.
- **In the running app:** `app-walk.txt`. Through the API New document calls, the template list shows each row's new
  name and draftability, and the Pre-IND briefing document reports `sectionCount: 8`. A document created from it in
  the demo IND project holds the eight parts, read back from `GET /api/authoring/docs/:id/sections`. The picker
  screen itself was not clicked.

## Left open, said

Each of the 18 subtask rows is now the same document as its section row, so the list shows "3.2.S.2 · Manufacture"
twice. Listing one row per document is the CSR lane's `getListedBuiltinAuthoringTemplates`. They were told, with
this file.
