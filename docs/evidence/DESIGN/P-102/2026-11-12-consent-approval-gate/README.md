# P-102, slice 2: an informed-consent form is approved only over its 21 CFR 50.25 elements

Packages **R1** and **F1**. Filed 2026-11-12. Founder decision P-102 (2026-11-05): "Yes, one record". The
`informed_consent` document type carries the 50.25 checklist as the editor's checks, and its approval runs through the
editor's one signing. Slice 1 (`../2026-11-12-consent-check-in-editor/`) put the checklist in the editor's Check. This
slice makes the approval read it.

## What already exists (RULE 3)

| Piece | Path | State before |
|---|---|---|
| The gate over the document's sections | `consentDocumentGate` in `server/services/protocol-consent/protocol-consent-logic.ts` (slice 1) | Shown in the Check; nothing read it at signing. |
| The editor's approval doors | `approvalRefused` (E-sign) and the `/sign` APPROVER branch in `server/routes/authoring.router.ts` | Independence (P-18, P-95, P-116, P-117), settle, then figures (P-89). Nothing keyed on the document's type. |
| The pattern followed | P-89 `figuresRefused`: 409 before the credential, a question the signer answers, the answer recorded on the signing transaction and named on the act's chained row | Reused, not copied: the consent refusal is a sibling called from the same two places. |
| The filing bar's questions | `surfaces/AuthoringFilingBar.tsx`, `surfaces/authoringApprovalQuestions.ts` | Asked for not settled, figures, and not reviewed. |
| Where a study's applicable-clinical-trial status is stored | Searched: `applicable_clinical_trial`, `applicableClinicalTrial`, `isApplicableClinicalTrial` | Stored only on the old structured consent form (`protocol_consent_forms`, no caller). `server/routes/study-design.ts` takes it from the caller per request and stores nothing. So no record holds it for a document. |

No screen, route, mount, table, service or AnA tool is added.

## The decision taken here

Applicable-clinical-trial status has no stored home for a document, and adding one is a schema change. So the approver
is asked at the moment it matters, and the answer is recorded with the approval. This follows P-89's shape, and the
founder's standing delegation ("you decide based on what's best for our clients") covers the choice. If the founder
later records a study-level status, the verdict reads it instead of asking (`consentApprovalVerdict` takes the answer
as one argument).

## What changed

- **`consentApprovalVerdict(gate, statedNotApplicable)`** (pure):
  - **Clear** when every required element is complete.
  - **409 `CONSENT_INCOMPLETE`** when any 50.25(a) element is not met. It names each one by title. **Nothing lifts it.**
  - **409 `CONSENT_TRIAL_STATUS_REQUIRED`** when only the ClinicalTrials.gov statement (50.25(c)) is missing.
  - **Stated not applicable**: the approval proceeds.
- **`consentRefused`** in the router. It runs on an APPROVER signature of an informed-consent document, through E-sign
  and `/sign`, before the password. When the approver states the study is not an applicable clinical trial:
  - the transaction writes the trail row `CONSENT_NOT_APPLICABLE_CLINICAL_TRIAL_STATED`, with the document hash;
  - the signature's own chained row carries `consentTrialStatus`.

  A freeze is not asked: P-102 names the approval.
- **The filing bar** asks "Is this study an applicable clinical trial?", starting at "It is one: go back and add the
  statement". "It is not an applicable clinical trial" reopens the signature, and its line says the statement is
  recorded. `CONSENT_INCOMPLETE` is not a question: the server's sentence is shown and nothing offers a way past it.
- **Housekeeping:**
  - `postAuthoringSignature`'s fifth parameter became one acknowledgements object, which keeps it inside the
    parameter limit.
  - The question's hook sits beside its form in `authoringApprovalQuestions.ts`, which keeps the bar under the
    file-size limit.

## Red, then green

`red.txt` holds the output of each red run:

- `authoring-signature-consent-gate.test.ts`: 6 of 8 failed with the router at HEAD. The 2 that passed are the
  controls (a complete form; another type).
- `authoringFilingBarConsent.test.tsx`: 3 of 4 failed with the bar at HEAD. The fourth, the incomplete form showing the
  server's sentence, passes on both.
- `consent-document-gate.test.ts`: the six verdict cases failed with "not a function" before the verdict existed.

After the change:
- The 20 signing, approval, filing bar, deficiency-scan and consent files: 176 tests, all pass.
- Typecheck: 0 errors.
- ESLint warning ratchet: no file changed its count.

## Opened in the running app and used

The local app on port 5270, with the consent document from slice 1 in the demo project C2C-101. `running-app-walk.txt`
holds the transcript.

1. Two members were added through the product, using `POST /api/tenant-users` and the activation link, as the demo
   seed adds its reviewer: `consent-reviewer-b@example.test` and `consent-approver-b@example.test`. Both are
   synthetic, at a reserved domain. The approver was given an APPROVER grant on the document through
   `POST /api/authoring/docs/:id/permissions`.
2. Round 1:
   - Section 6 lacked the FDA statement and section 11 was empty.
   - The author sent the document for review, and the reviewer signed the review.
   - The approver's approval answered **409 `CONSENT_INCOMPLETE`**, naming the confidentiality element and noting the
     missing ClinicalTrials.gov statement.
3. Round 2:
   - The author added the FDA statement, which changes the text, so the review was requested and signed again.
   - The approval answered **409 `CONSENT_TRIAL_STATUS_REQUIRED`**.
4. In the browser, as the approver:
   - E-sign, Approval, a reason and the password. The question appeared (`approve-1-trial-question-1440.png`).
   - "It is not an applicable clinical trial" reopened the signature, with the recorded line
     (`approve-2-resign-with-statement-1440.png`).
   - Signed: "Signature applied", Approval (`approve-3-signed-1440.png`).
5. In the database:
   - the trail row `CONSENT_NOT_APPLICABLE_CLINICAL_TRIAL_STATED` reads "consent-approver-b@example.test stated that the
     study is not an applicable clinical trial";
   - the document is `APPROVED`.

Steps 1 to 3 were done through the product API. Step 4 was done in the browser. The walk was at 1440 px only.

## Left of P-102

- **The structured record behind `/api/protocol-consent` is not converged.** Its seven routes have no caller. Under
  "one record", it should be retired or reached, and that is a founder decision (P-122 asks one for any removal).
- **The Check still lists the ClinicalTrials.gov statement as not complete** on a form approved as not an applicable
  clinical trial. The approval records the statement; the Check does not read the trail.
- **The when-appropriate elements (50.25(b)) are not checked one by one.**
