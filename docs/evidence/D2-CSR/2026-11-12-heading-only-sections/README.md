# D2: a CSR heading that holds only its subsections needs no text of its own (2026-11-12)

Launch row D2, ledger package L1. Founder decision **P-126** (`docs/LAUNCH_DEFINITION_OF_DONE.md`), decided under the
founder's delegation of 2026-11-10. It reads P-115 item 5, "Every heading holds text".

## What a person met

An ICH E3 report has headings that only organise the ones beneath them: "5 Ethics" over 5.1 to 5.3,
"9 Investigational Plan", "12 Safety Evaluation", "16 Appendices". The CSR scientific review refused any section
whose saved content was empty, so the reviewer's screen listed each of them as "No saved text. A CSR is approved
only when every section is written", and the report could be reviewed only after someone typed filler under each.

The same check read "empty" as the empty string. A section holding only markup ("<p></p>", what the editor saves
when a person clears a section) passed as written.

## What already exists (RULE 3)

Nothing new was built. One rule was written once, in the module the screen and the server already share.

| Path | What it does today | What it did not |
|---|---|---|
| `shared/authoring/csr-scientific-review.ts` | The review's shared contract: the format, the table keys, the number rule, the placeholder rule | Said nothing about what "holds text" means |
| `server/services/authoring/csr-scientific-review-core.ts` | Verifies a reviewer's map against the saved snapshot and the retained tables; gates approval, signature, freeze and export of a CSR | Refused every blank section, and passed a section of empty markup |
| `client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts` | Builds the reviewer's map and lists what still stops it | Kept its own copy of the blank check (`!content.trim()`) |
| `client/src/concept2cure/v2/surfaces/CsrEvidenceReview.tsx` | The scientific-review step inside the review decision | A third copy of the blank check |
| `server/services/csr-builder.ts` `isDraftableE3Heading` | The build already knows a "bare parent" heading and drafts it through its children | Was not what the review read |
| `client/src/concept2cure/v2/surfaces/CsrNotApplicable.tsx` | Names the headings that hold only subsections and offers them no "not applicable" act | |

Searches run: `content.trim()`, `blank`, `has no saved text`, `holds only`, `bare parent`, `e3Children`,
`SECTION_EMPTY`, `CSR_EVIDENCE_SECTION_CHANGED` across `shared/authoring`, `server/services/authoring`,
`server/services/csr`, `server/routes` and `client/src/concept2cure`.

## What changed

- `shared/authoring/csr-scientific-review.ts`: `csrSectionHoldsText` (text a reader sees; markup, entities and white
  space are not text; a figure is content), `csrHeadingOnlySectionIds` (a blank section whose number is the parent
  of another section's number in the same document; "5" of "5.1", never of "50.1"), and the statement a review
  records for such a heading.
- The server verifier accepts a heading-only section with no text, bound to its exact saved content, carrying no
  mapped result. It refuses every other section that holds no text a reader sees.
- The reviewer's map asks nothing for a heading-only section and records it as one. The screen says
  "Heading only. Its subsections hold the text, and each is listed here."
- A blank heading with no subsections now also says how to fix it: write it in the document, or state it not
  applicable there with a reason (`../2026-11-12-heading-not-applicable/`).

The review's format identifier is unchanged. Nothing about who reviews or signs changed.

## Tests: red first, then green

`client/src/concept2cure/v2/surfaces/__tests__/csrHeadingOnly.test.ts`, 13 cases, against the screen's map and the
server's verifier together.

- **Red, with only the shared rule added:** 5 failed. The screen listed "Section 5 Ethics has no saved text" and
  refused to build a map; the server refused a blank heading over its subsections ("A saved section is missing,
  blank or no longer matches its reviewed content"); and the server **accepted** a section of empty markup.
- **Green:** 13 of 13. The review's other suites: 12 files, 268 tests; the three database-backed suites, 48 tests.
- **The pins, made to fail:** without the dot boundary ("5" a parent of "50.1"), 1 fails; with a mapped claim
  allowed on a blank heading, 1 fails; with markup counted as text, 5 fail. Each was restored.

No file gained a lint warning (`csr-scientific-review-core.ts` had 3 complexity warnings and has 3). A targeted
`tsc` over the changed files reports nothing.

## Opened in the running app

The stack as a Codespace builds it, in the Lumen account, on "LMN-201 RePreve Part B Clinical Study Report —
SYNTHETIC". `heading-only.cjs` is the walk: the Lumen lead sends the report for review to the Lumen approver; the
approver opens the review board, records a decision, chooses Approve, selects the retained study data and reads the
tables.

| | Before (`review-before.json`, `before-ethics.jpg`) | After (`review-after.json`, `after-ethics.jpg`) |
|---|---|---|
| Sections listed | 119 | 119 |
| "No saved text" | 113 | 91 |
| Shown as heading only | 0 | 22 |
| "5 · Ethics" | "No saved text. A CSR is approved only when every section is written." | "Heading only. Its subsections hold the text, and each is listed here." |
| Failed requests, console errors | none | none |

22, not the 19 the build leaves undrafted: this document holds text under only 6 headings, so three parents the
build did draft text for are blank here too. Which three was not worked out.

## Limits, stated

- **The approval was not recorded in this walk.** The report still has 91 headings with no text, so "Record
  approval" is disabled, as it should be. The server's acceptance of a heading-only section is shown by the tests
  against the real verifier, not by a signed approval in the app.
- **A parent heading for which the build drafted text of its own is accepted blank** if a person does not import
  that text. P-126 item 1 decides that: a heading with subsections needs no text of its own.
- **A receipt issued before this change** over a document holding a section of empty markup no longer verifies.
  No database was examined for one.
- **No real model drafted the report's text.** The build in this account was the stand-in's.
