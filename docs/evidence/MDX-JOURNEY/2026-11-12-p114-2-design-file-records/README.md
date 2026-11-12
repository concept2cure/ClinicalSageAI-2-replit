# P-114 item 2 (MDX M16): a filing's paperwork is not tagged as a design record

Plan: F1, a repair of shipped behaviour: no screen, mount or table. Decision: P-114 item 2
(`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-11-09, decided under the founder's delegation). Study: M16 in
`.design/client-journey/MDX_JOURNEY_2026-11-01.md`.

## The defect

Engineering's design history is the project's own document sections (P-60). Found walking the device journey in the
running app (slice 5):
- "What's blocking your documents" tagged every eSTAR node "DHF", the cover letter, the FDA forms and the truthful
  and accurate statement included;
- the "Open risks" figure was red always, at zero with no risk file recorded too.

Under the QMSR (21 CFR 820, in force 2026-02-02, incorporating ISO 13485:2016 §7.3.10), the design and development
file holds design inputs and outputs, verification, validation, reviews, transfer, changes and risk records. A cover
letter is written for the filing. It is not a design record.

## What already exists (RULE 3)

- **The governed outlines name their own Administrative group.** Every FDA device outline version in
  `c2c_rule_packs` (k510, denovo, pma; ten versions) has a top-level group A labelled "Administrative" (the PMA's:
  "A · Administrative information (21 CFR 814.20(b)(1)–(2))"). The indications for use statement, Form FDA 3881, is
  filed in group B by the 510(k) eSTAR outlines and in group A by De Novo's. No list of administrative sections
  existed in code; the eSTAR mapper groups its administrative slots by a comment only
  (`pathway-engines/estar/estar-mapper.ts`).
- **`shared/regulatory/design-controls-trace.ts`**, the one definition of design-controls semantics that the route
  and the screens share. The classifier is added there.
- **The route** `GET /api/mdx/engineering/:programId` (`server/routes/mdx-engineering.ts`), whose `dhf` panel reads
  `c2c_document_sections` under the project's documents.
- **The screen**: `mdx/surfaces/EngineeringSurface.tsx` (the blocker feed and the figures) and
  `EngineeringDesignHistory.tsx` (the section list and its note).

## The change

- `designFileStanding({ docType, label, groupLabel })` returns `filing-content` or `design-file`. It reads the
  outline, not a list kept in code:
  - a section in an FDA device filing's Administrative group is filing content;
  - so is the indications for use statement, wherever the outline files it;
  - everything else keeps the standing it had.

  A document of another class is not decided. The EU outlines' conformity group (the Annex IV declaration, the
  Notified Body certificate) was not part of P-114.
- The route reads each section's document class and its group's label, and sends `record` on every row.
- The screen:
  - A filing-content row in the blocker feed is tagged "filing", not "dhf". It is still listed, because a mandatory
    cover letter with nothing written still blocks its document.
  - In the section list its cell reads "filing content", and the panel's note says "A filing's cover letter, forms
    and certifications are marked as filing content, not design records."
  - "Open risks" is red only when a risk is open.
- Nothing is removed from the screen (P-122). "Mandatory sections approved" still counts every mandatory section.

## Verified

| Check | Before | After |
|---|---|---|
| `shared/regulatory/__tests__/design-file-standing.test.ts` (6 cases: the Administrative group in the 510(k), De Novo and PMA outlines; Form 3881; design and performance sections; other document classes; a word inside a label) | failed, "designFileStanding is not a function" (`red/classifier-before.txt`) | 6 passed |
| `server/routes/__tests__/mdx-engineering-per-product.test.ts`, new block (3 cases) | 3 failed (`red/route-before.txt`) | passed, with the six other engineering route suites: 7 files, 102 tests (`green/server-after.txt`) |
| `mdx/surfaces/__tests__/EngineeringSurface.designHistory.test.tsx`, two new blocks (5 cases) | 3 failed (`red/screen-before.txt`) | 10 of 10 in the file. Every `mdx/surfaces` and `mdx/__tests__` suite: 65 files, 591 tests (`green/screen-after.txt`) |
| The running app, rebuilt from an empty database: a new 510(k) project's Engineering screen | every row "DHF"; the risk figure red | A1, A2, A5, A6, A9 and B2 tagged "filing"; B1 and B3 "dhf"; ten cells "filing content" and 21 design-file; "Open risks 0 · No risks recorded yet" with no tone; no failed request (`runs/engineering-live.json`, `shots/`) |

## Not decided here

The EU technical documentation's conformity group, and whether the substantial-equivalence discussion or the
bibliography are design records. P-114 named the paperwork above, and the rest keeps its standing.
