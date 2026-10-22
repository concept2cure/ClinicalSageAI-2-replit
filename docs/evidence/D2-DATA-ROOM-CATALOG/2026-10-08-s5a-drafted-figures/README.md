# D2 — each figure in an AnA draft is checked against the sources it cites (Data Room catalog S5a)

Date: 2026-10-08. Launch row: **D2**.
Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`, slice S5.
This is the first half of S5. The other half, engine-run (`computed`) lineage, is not
in this slice; see "Not in this slice" below.

## The defect

A draft saved with source references (`draft_authoring_document` →
`createDocumentFromDraft`) recorded which documents and excerpts it cited, and nothing
about what the text said of them. The record itself said so: "not claim-level support".
A response rate, a sample size or a hazard ratio the model wrote was stored and shown
exactly like one the cited CSR states. ICH E3's rule that every number agrees with its
table had no counterpart for a drafted section.

## The change

- **`server/services/authoring/draft-figure-check.ts`, `checkSectionFigures` (pure).**
  - It finds every figure in the stored section's readable text (`sectionReadableText`)
    with the clinical-figure reader AnA's answer check already uses (`figuresIn`):
    percentages, p-values, HR/OR/RR, CIs, n, counts, doses and durations.
  - Each figure is looked for in the cited excerpts, standing with its own measure, so
    "31 sites" is not 31% and a date is not a count.
  - A figure that is there is `found`, with the document, its content hash and the
    offset. The offset is recorded only where the original text holds that number;
    otherwise the document is named with no offset.
  - A figure that is not there is `unverified`. The check never changes the text and
    never supplies a number (Rule 2).
- **`answer-check-figures.ts` `figureFoundAt`.** This is the locator. `figureHeld` now
  reads its verdict from it, so the verdict and the locator follow one rule. The answer
  checker's 107 existing tests pass unchanged.
- **The save.** `verifySourcesInsideSave` runs the check inside the save's transaction,
  against the excerpts it has just verified. It records each section's result as
  `projectSourceReferences[].figures` (counts, findings with unverified ones first, and
  `truncated`) on the document and on every CREATE audit row. Section content is
  sanitized once and the same text is stored and checked.
- **AnA's result.** It names each unverified figure with its section, and tells AnA not
  to present it as the source's (`unverifiedFigureNote`).
- **The editor.** A line under the provenance line (`DraftFigureLine`) says either
  "N of M figure(s) are not stated in the cited sources; verify or remove them: 55%
  (2.5.4)…" or that all were found. With no recorded check it says nothing, never "all
  found".

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new tests against trunk's code. A saved draft carries no figure check (`expected undefined to match object { checked: 2, found: 1, unverified: 1 }`), and the check module does not exist. |
| `02-green.txt` | 43 files, 694 tests. They cover the PGlite save suite (a draft citing "12 of 30 subjects" saves "30 subjects" as found at its offset and "55%" as unverified, in the document, its audit row and AnA's message), the module's unit tests, the editor line, the answer checker and memory fact-check suites, and the authoring and editor suites. |

Also run:

- `tsc --noEmit`: 0 errors.
- The ESLint ratchet `--since origin/concept2cure-v2`, with the new files included: no
  change.
- `ci:sql-interpolation` and `ci:undefined-css-classes`: OK.

## Not in this slice (S5b)

- **Engine-run records and `computed` lineage.** This needs `stats_computation_runs`, and
  a figure inserted from the statistics engine would cite its run.
- **`derived` span lineage for found figures.** `document_span_lineage` can cite only a
  `cre_evidence_sources` row today, so a Vault document needs a new provenance kind,
  amended in place under Rule 1.
- **Passage-based grounding** in `draft-project-sources.ts`, in place of the first 12,000
  characters. The saved reference format requires `span.start = 0`, so this changes the
  receipt shape.
