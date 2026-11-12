# The section Check stops giving CTD advice on an informed-consent form

Package **F1**. Filed 2026-11-12. Found walking P-102 slice 1 (`../2026-11-12-consent-check-in-editor/`, "Found and not
changed").

## What already exists (RULE 3)

| Piece | Path | State before |
|---|---|---|
| The section Check | `POST /api/authoring/sections/:id/ai/deficiency-scan` in `server/routes/authoring.router.ts` | Six heuristics written for CTD sections, run on every document. `checks_skipped` was already in the response. |
| The Check panel | `editor/DocumentWorkbench.tsx` | Said "No flags. The section passed all N mechanical checks (length, module keywords, CTD elements where defined, tables, placeholders, structure)" whatever ran. Never showed `checks_skipped`. |
| The consent check | `consent_elements` and `editor/ConsentElementsCheck.tsx` (P-102) | What a consent form is actually held to. |

## The defect

On a one-sentence confidentiality section of a consent form, the Check said three things a consent author should not act
on:
- "Section content appears insufficient. Regulatory sections typically require detailed information." A consent form
  is meant to be short plain language.
- "No data tables or figures detected."
- "Content lacks proper structure."

On a consent document filed under module M5, it also asked for "efficacy", "endpoint" and "statistical". Its required
content read "not indexed … no entry for "6"", as if nothing were required. With no module, it said `module ""`.

## What changed

- **Server.** On an informed-consent document, `content_length`, `module_keywords`, `data_presence` and `structure`
  are not run. Each is recorded in `checks_skipped` with the reason. The placeholder check still runs.
- **The required-content line** points at the 21 CFR 50.25 elements.
- **A document with no module** is said to have none.
- **The panel's no-flags sentence** names checks only when all of them ran, and a new line says what did not run and
  why, in the server's words. The sentences live in `editor/sectionCheckSentences.ts`, split out of the workbench in
  its folder.

The decisions sit in helpers outside the handler, which keeps it within the complexity limit.

## Red, then green

- `authoringDeficiencyScanConsent.test.ts`, with the router change absent:
  - the heuristics case failed (content_length and missing_data present);
  - the requirements case failed (no `checks_skipped` entry, CTD wording).
- `sectionCheckSentences.test.ts` is new: the helpers did not exist, and its source pin rejects the old sentence.
- After the change: the scan suites 29 of 29.
- The editor folder and the section-check tests: 101 files and 1,465 tests, with one failure,
  `workbenchRemedies.test.tsx` "applies 'insert-empty' …":
  - It passes 15 of 15 alone with this change.
  - Run with `DocumentWorkbench.tsx` at HEAD, without this change, it failed 1 of 15.
  - So it is timing-sensitive under load, and not caused here. Noted for the editor's lane; not changed.
- Typecheck: 0 errors.
- ESLint warning ratchet: no file changed its count.

## Opened in the running app and used

A new draft consent document in C2C-101, created and drafted through the product API (9 of 11 elements). The Check was
pressed on section 6 in the browser. `heuristics-1440.png`, `heuristics-390.png`. The panel reads:

> No flags from the 1 mechanical check that ran — this is not a review. Required content — not indexed. This is an
> informed consent form. What it must contain is the 21 CFR 50.25 elements of informed consent, checked below. Not run:
> length, module keywords, tables, structure. Not run on an informed consent form, which is short plain language with no
> tables. It is checked against the 21 CFR 50.25 elements instead. This document has no CTD module, so no keyword
> profile applies. 9 of 11 required elements of informed consent are complete in this document. …

The label "Required content — not indexed" is the panel's existing heading for any section the CTD guidance does not
index. It stays as it is.
