# One known-tag rule for every reader of section content

Periodic review 2026-09-28, editor family, the batch-draft accept, round 3
(2026-10-04). A prerequisite of that fix, filed on its own.

## What changed

Whether a section's stored content is HTML or plain text decides what a
reader is shown: the section editor and the authoring export read it as HTML
only when it holds a known tag, and as plain text, every character shown,
otherwise. The rule had two copies, one in the editor
(`client/src/concept2cure/v2/editor/roundTrip.ts`, `looksLikeHtml`) and one in
the export (`server/export/authoring-section-content.ts`,
`contentLooksLikeHtml`). They were held equal only by a test that compared
their source. They had drifted before: `dl`, `dt`, `dd` and `caption` were in
neither, and a glossary section was escaped into the record.

The batch-draft accept's lineage needs the same rule: in content read as plain
text, a tag-shaped token is shown, so it cannot be compared as hidden. That
would have been a third copy. The rule now lives once, in
`shared/authoring/plain-text-html.ts` (`looksLikeHtml`), with the editor's
account of why the allowlist is what it is. The editor imports and re-exports
it. The export keeps the name `contentLooksLikeHtml` for its importers, bound
to the shared function. The allowlist is byte-identical to the one the editor
had.

## Proof

- `roundTripFidelity.test.ts`, "one allowlist": the shared module holds the
  list, and neither the editor nor the export keeps one or reads anything but
  the shared rule. Green: `green.txt` (12/12).
- Shown failing on each old copy: the editor's file at HEAD
  (`red-editor-keeps-its-copy.txt`) and the export's file at HEAD
  (`red-export-keeps-its-copy.txt`), each restored after.
- The suites that read the rule: `related.txt` (editor, export, section
  generation, authoring read; 34 files, 510 tests).
- `tsc` over the four files and their importers: no errors. ESLint: no new
  warnings in any of the four (0, 3, 5 and 0 at HEAD and after).

Self-reviewed in this lane. The independent refute-review of the batch-draft
round covers this change with it.
