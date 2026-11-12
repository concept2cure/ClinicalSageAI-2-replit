# P-102, slice 1: the 21 CFR 50.25 checklist is the one editor's check for an informed-consent document

Package **R1** (reach). Filed 2026-11-12. Founder decision P-102 (2026-11-05): "Yes, one record."
`docs/LAUNCH_DEFINITION_OF_DONE.md` says the `informed_consent` document type carries the 50.25 required-element
checklist and its completeness as the editor's checks for that type.

## What already exists (RULE 3)

| Piece | Path | State before this change |
|---|---|---|
| The one record of consent elements | `shared/regulatory/informed-consent-elements.ts` | Read by the gate, the consent outline's guidance and AnA's consent review. |
| The approval gate | `server/services/protocol-consent/protocol-consent-logic.ts` (`evaluateConsentCompleteness`, `consentGateView`) | Ran only over the structured form behind `/api/protocol-consent`. No screen can write that form. |
| The consent document type | `shared/regulatory/project-bootstrap.ts` (`ICF_SECTIONS`, 12 sections); built-in templates `component:informed_consent` and `registry:ICH_ICF` | A person can draft a consent document in the one editor. It was checked against nothing: no file in the editor or `server/services/authoring` mentioned 50.25. |
| The editor's Check | `POST /api/authoring/sections/:id/ai/deficiency-scan` in `server/routes/authoring.router.ts`; the panel in `editor/DocumentWorkbench.tsx` | Heuristics by section, plus two whole-document fields that are not counted in its score (`record_requirements`, `document_figure_consistency`). Nothing keyed on the document's type. |
| The type-in-the-editor pattern | `editor/StudyDataBuild.tsx`, shown for a CSR by `isCsrTemplateId` | A type's function appears inside the one editor for that type (RULE 4). |
| A text matcher by cue | `server/services/ana/gcp-consent.ts` (`reviewInformedConsent`) | AnA's review tool. Not used here: the editor's check is the gate itself, so the two cannot disagree. |
| The protocol's read-only Consent tab | `surfaces/ProtocolDevReviews.tsx` | Stays read-only, as P-102 says. |

Searches run: `50\.25`, `informed_consent`, `consent` across `client/src/concept2cure/v2/editor`, `server/services/authoring`,
`server/routes/authoring.router.ts`; `git log --all --diff-filter=D` on `*Consent*` found no deleted editor check.

## What changed

- **`consentDocumentGate(sections)`** in `protocol-consent-logic.ts`. It is the same gate, read over the document's
  sections. Each required element is drafted in one section of the consent outline (the research statement and the
  purpose share section 1). An element is complete when the gate accepts that section's text, including the wording
  50.25(a)(5) and 50.25(c) prescribe.
- **`isConsentTemplateId`** recognises the two built-in consent templates. A document's type is its stored template
  id; `authoring_documents` has no type column. The ids are pinned against `builtinAuthoringTemplateId` by test.
- **The Check's response** carries `consent_elements` for a consent document only. It is absent for any other type,
  and absent when the sections could not be read. It is not counted in the heuristic score.
- **`editor/ConsentElementsCheck.tsx`** draws it inside the Check panel: the gate's count, why each incomplete
  element is incomplete (by title, with its citation), all eleven elements under one disclosure with the section
  each is drafted in, and the note on the ClinicalTrials.gov statement. It never says the form is compliant.

No screen, route, mount, table, service or AnA tool is added.

## Red, then green

- Before the change: 8 of 9 new server cases failed (`consentDocumentGate is not a function`; no `consent_elements`
  in the response). The ninth, "absent on a document of another type", passed before and after, as it should.
- After: `consent-document-gate.test.ts` 6 of 6, `authoringDeficiencyScanConsent.test.ts` 3 of 3,
  `consentElementsCheck.test.tsx` 3 of 3.
- With the existing section-check and consent suites: 11 files, 70 tests, all pass.
- Typecheck 0 errors. ESLint warning ratchet: no file gained a warning.

## Opened in the running app and used

Local instance (`npm run up`, port 5270, organisation 2, the seeded administrator).

1. An informed-consent document was created in the demo project "C2C-101" from the built-in consent template,
   through `POST /api/authoring/docs`. It seeded 12 sections.
2. The Check on the empty document reported **0 of 11**, each element "not yet included".
3. Sections 1 to 9 were drafted through the section save (with its reason for change). Section 6 does not say that
   FDA may inspect the records. Section 11 was left empty.
4. The document was opened in the editor in a browser, at section 6, and **Check** was pressed. The panel reads
   "9 of 11 required elements of informed consent are complete in this document", then the two reasons.
5. Screenshots at 1440×900 and 390×844: `consent-check-*.png` and `consent-check-all-elements-*.png`. No sideways
   page scroll at either width.

The document was created and drafted through the product API, not by typing in the browser. The Check itself was
pressed in the browser.

## Not done here: what is left of P-102

- **Approval is not yet refused on an incomplete consent document.** The editor's signing does not read this gate.
  The plug point is a sibling of `figuresRefused` in `approvalRefused` and `/sign`
  (`server/routes/authoring.router.ts`), with its question in `surfaces/authoringApprovalQuestions.ts`.
- **Applicable-clinical-trial status has no place on the document.** The check counts the ClinicalTrials.gov
  statement until the study is recorded as not being an applicable clinical trial, and says so. Refusing approval on
  it needs that record first, or a non-ACT study could never be approved. Where the status lives (the project's
  study, or the document) is a decision for the editor's holder.
- **The structured record behind `/api/protocol-consent` is not yet converged** into the document. Its seven routes
  still have no caller.
- **The when-appropriate elements (50.25(b))** share section 12 and are not checked individually.

## Found and not changed

- The generic section heuristics run on a consent section too. On a one-sentence confidentiality section they say
  "No data tables or figures detected" and "Section content appears insufficient". Those are the existing checks
  (`content_length`, `data_presence`), written for CTD sections. They are noise on a consent form.
- The section check's "Required content — not indexed" line appears for consent section codes, since the CTD
  guidance record has no entry for "6". True, but the consent block now below it is what the author needs.
