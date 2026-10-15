# D2 — a drafted section is grounded in the stretch of each source it needs (Data Room catalog S5d)

Date: 2026-10-15. Launch row: **D2**.
Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`, slice S5 ("grounding").
Founder, 2026-10-15: "Do it all."

## The defect

`batch_draft_sections` gives the drafting engine at most 12,000 characters of each
cited document, and 48,000 across them. Those characters were always the first 12,000:
a CSR's title page, synopsis and table of contents. A section on the primary efficacy
result, or on the adverse-event summary, was drafted from front matter. The figures it
needed stood far beyond character 12,000, were never read, and the S5a check then
flagged them as unverified. Every layer assumed the excerpt starts at character 0:

- the reference parser (`span.start !== 0` was refused);
- the save's verification (`slice(0, end)`);
- the budget (counted by `end`);
- the figure check's offsets;
- the claims check's offsets ("it starts at character 0").

## The change

- **`server/services/ana/draft-source-window.ts` `chooseSourceWindow` (pure).** The
  window is the contiguous stretch that holds the most distinct section terms (the
  section type and instructions, without boilerplate), then the most occurrences.
  - It starts at the nearest paragraph or sentence boundary before its first hit, and
    backs up only as far as keeps its last hit inside the window.
  - It is deterministic and keyless, like the passage search (S1).
  - With no term, or none in the document, the window is the opening, and its `basis`
    says so. A document that fits whole is served whole.
- **`draft-project-sources.ts`** serves that window, with `span.start`, `span.end` and
  `basis`. `completeText` is true only for the whole document. The prompt says text
  outside the window was not read.
- **`batch_draft_sections`** passes each section's type and instructions as its query.
- **`draft-source-references.ts`.**
  - An excerpt may start anywhere. It is at most 12,000 characters long, and a receipt
    saved before S5d (no start) reads as the opening.
  - The budget counts lengths.
  - The save verifies and serves `slice(start, end)`.
  - The parser is split (`parseSpan`) to stay under the complexity limit.
- **Offsets are the document's.** The figure check (`draft-figure-check.ts`) and the
  claims check (`section-claims-check.ts`) add the excerpt's start, so a figure's
  `offset`, a claim's source `start`/`end` and the S5c lineage locator all name the
  document's own characters.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new tests against trunk's code. The window module does not exist. A reference starting inside the document is refused at save. A source offset is the excerpt's, not the document's. |
| `02-green.txt` | The same suites green. |

The suites:

- `draft-source-window.test.ts`, 7 tests. Efficacy and safety sections are grounded in
  their results; with no term the opening is kept and labelled; a whole document is
  served whole; the window never runs past the end; the choice is deterministic.
- `draft-project-sources.test.ts`. A section's terms choose a window deep in a
  document, and the span names exactly the characters served.
- `draft-source-references.test.ts`. The contract change: a start inside the document
  is kept, a legacy receipt reads as the opening, the budget counts lengths, and a
  window longer than 12,000 characters is refused wherever it starts.
- `section-claims-check.test.ts`. A source side's offsets move with the excerpt's
  start, and the section's offsets do not.
- The PGlite draft suite. A windowed reference saves, its found figure's offset is the
  document's, and an oversized window saves nothing.
