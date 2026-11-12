# P-130, slice A: the consent document is the record the Check, the approval and the protocol read

Packages **R1** and **F1**. Filed 2026-11-12. This is slice A of founder decision P-130
(`docs/LAUNCH_DEFINITION_OF_DONE.md`, decided under the founder's delegation, "You decide as an sme would"). Slice B
retires the structured store's routes and AnA's writers into it.

## What already exists (RULE 3)

| Piece | Path | State before |
|---|---|---|
| The gate over a consent document's text | `consentDocumentGate`, `consentApprovalVerdict` in `server/services/protocol-consent/protocol-consent-logic.ts` (P-102 slices 1 and 2) | Ran only when a document carried a built-in consent template. |
| AnA's drafted documents | `draft_authoring_document` → `server/services/authoring/authoring-from-draft.ts` | Records the type as `product_code` and no template. So a consent form AnA drafted got no 50.25 Check and no approval gate. |
| The protocol's Consent tab | `surfaces/ProtocolDevReviews.tsx` `ConsentTab`, fed by `pdev-view-assembler.ts` | Read the structured store (`consent_forms`, `consent_form_elements`), which the editor cannot open or approve. |
| How a surface opens a document of another project | `openReviewDocument` in `surfaces/Review.tsx` (`publishShellProject`, then `setEditorTarget`) | Followed here. |

No screen, route, mount, table, AnA tool or service folder is added. `pdev-view-consent.ts` is split out of the
assembler, in its folder, because the assembler is over the file-size limit.

## What changed

- **`isConsentDocument`.** A document is an informed-consent document by its built-in template, or by its recorded
  type, `product_code` `informed_consent` (or the catalog alias `ich_icf`). The editor's Check, its skipped
  heuristics, its required-content line and the approval gate all use it.
- **The assembler** reads the protocol's project's consent documents, newest first, tenant-scoped, through
  `pdev-view-consent.ts`. It returns the newest one's elements, with the section each is drafted in, the editor's gate
  on its text, and the document (id, project, title, status, how many the project has).
- **The Consent tab:**
  - shows that verdict, with "approved in the editor" for an approved document;
  - says plainly when the project has no consent document, or the protocol has no project, and prints no figure;
  - has "Open in the editor" as the pane's action.
- **Opening a document of another project.** The action opens the document in its own project. Found in the running
  app: with another project open in the shell, the editor refused it ("it belongs to a different project").

## Red, then green

`red.txt` is the new tests run against the five source files as they stood: 16 failed. The other assembler cases in
that run also fail, because the old code queries the consent-form tables the test no longer creates.

After the change:
- the protocol, consent, signing and section-check suites: 56 files, 686 tests, all pass;
- the tab test with the project switch: 6 of 6;
- typecheck: 0 errors;
- ESLint warning ratchet: no file changed its count.

## Opened in the running app and used

The demo protocol C2C-101-201 belongs to the project C2C-101, which holds two consent documents from the P-102 walks.
The approved one is older. The newer draft has 9 of 11 elements.

1. The protocol workspace was opened, then its Consent tab. It read "9 of 11 required elements complete", from the
   newer draft, and named both reasons: the confidentiality wording and the ClinicalTrials.gov statement. It noted
   "2 consent documents in this project, the most recently updated is shown" (`consent-tab-1440.png`,
   `consent-tab-390.png`).
2. The shell had C2C-201 open. "Open in the editor" opened C2C-101 and the document "Informed consent form - LUM-201 v2"
   (`consent-opened-in-editor-1440.png`).
