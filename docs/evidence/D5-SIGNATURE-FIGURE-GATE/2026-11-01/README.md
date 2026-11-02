# D5: an unverified figure is not sealed unnoticed (P-89), 2026-11-01

**Row:** D5, Part 11 evidence. **Package:** L1. **Decision:** P-89 (`docs/LAUNCH_DEFINITION_OF_DONE.md`).

The founder answered "Yes" to: *should an unchecked figure block a signature unless the signer acknowledges it?*
An approval or a seal of an Authoring document is now refused while the text being signed states a figure that its
section's cited sources do not hold. It goes ahead only when the signer acknowledges each such figure, and the record
keeps each one.

## What already exists

The work found by search:

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/authoring/draft-figure-check.ts` `checkSectionFigures` | At save, looks for each figure of a source-citing section in the cited excerpts. Each is `found` or `unverified`. | It runs once, at save. Nothing re-ran it after an edit, and its result has no content hash. |
| `server/services/authoring/authoring-from-draft.ts` `verifySourcesInsideSave` | Writes that result into `authoring_documents.provenance.projectSourceReferences[].figures`. | — |
| `server/services/authoring/draft-source-references.ts` | Verifies saved source references (`verifyReferenceSnapshots`) and reserves the source stores (`reserveDraftSourceStores`). Used by save and export. | Signing never used it. `savedSourceSelection` dropped each group's `sectionCode`. |
| `server/routes/authoring.router.ts` `/docs/:docId/e-sign`, `/sign`, `/freeze` | The three signing acts. `approvalRefused` asks the "not settled" question before the credential (`acknowledgeUnresolved`). | No act looked at figures. |
| `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx` | The signing dialog. On a 409 `DOCUMENT_NOT_SETTLED` it asks in a `C2CForm`, then reopens `EsignModal`. | Had no figure question. |
| `DocumentWorkbench.tsx` `DraftFigureLine` | Shows the save's figure check, "when the draft was saved". | Advisory only. Unchanged. |

**Searches run:**
- "unverified", "figure", "acknowledg", "FIGURES_", "figuresAcknowledged" across `server/` and `client/`;
- `git log --all --diff-filter=D` on `*figure*` and `*acknowledg*`.

Nothing that gates a signature on figures existed or was deleted.

**What did exist and stays as it is:**
- `ind-lifecycle/filing.routes.ts` `acknowledgedGaps`: a per-item acknowledgement for filing gaps. Its shape is reused
  here.
- `dispatch-gate.ts` P-22: a hard block, which offers no acknowledgement.
- `shadow-finding-disposition.ts` P-35: one signature per finding, which is too heavy for this.

## The defect

1. An AnA draft states "progression-free survival HR 0.71".
2. The cited CSR states no such hazard ratio.
3. On save the figure is marked `unverified`, and the editor shows that.
4. The approver signs: approved, frozen, filed. Nothing asked, and nothing records that the approver saw it.

It was worse after an edit:
- A figure the author corrected still read unverified.
- A number typed in after the save had never been checked at all.

## The change

1. **The check runs again at signing, on the text being signed** (`savedSourceExcerptsForSigning`,
   `unverifiedFiguresAtSigning`). It runs inside the signing transaction, after the document row is locked, with the
   source stores reserved as a save reserves them.
   - **An unverifiable source.** A cited source that no longer verifies (withdrawn, superseded, changed text) lists
     every figure of its section as `source_unavailable`. The check does not pass by default.
   - **An undecodable record.** A saved record that cannot be decoded refuses the act with
     `SOURCE_REFERENCES_UNAVAILABLE`.
2. **The gate** (`figuresRefused`) is called from three places:
   - `approvalRefused` (`/e-sign` APPROVER);
   - `/sign` APPROVER;
   - `/freeze`.

   In each it runs before `reverifyAuthoringSigner`, so a refusal spends no second factor. It answers 409
   `FIGURES_UNVERIFIED` with `unverifiedFigures: { digest, items: [{ key, sectionId, sectionCode, sectionTitle, text,
   kind, reason }] }`.
3. **The acknowledgement is each key, sent back** (`acknowledgedFigures`).
   - Anything else is refused again: a missing key, an extra key, a duplicate, or a list from an earlier text.
   - Once accepted, `UNVERIFIED_FIGURES_ACKNOWLEDGED` is written on the act's transaction. Its metadata (`act`,
     `digest`, `documentHash`, each item) is hashed into the chained row (`authoring.section.*`, `metadataSha256`).
   - The act's own chained row (`authoring.document.e-sign` / `.sign` / `.freeze`) carries
     `figuresAcknowledged: { digest, count }` beside its `signatureId`.
4. **The dialog** asks about each figure: one choice per figure, starting at "Go back and correct it".
   - The signature reopens only when every figure is kept. It then says "You kept N figures not found in their cited
     sources. Your signature records each one."
   - Keeping one figure and correcting another goes back, and sends nothing.

**Scope, as P-89 records it:**
- Review and authorship signatures are not approvals and are not asked.
- A figure in a section that cites no sources is never compared with anything, so it is outside the check.

**What is not in the signature digest.** The acknowledgement is bound to the act through its chained row, as
`acknowledgeUnresolved` is. It is not inside `authoring-sig-v1`. Putting it there needs a v2 digest, a column, and
the reader at `workflow-import-governance.ts:242`.

## Proof

All red runs are from the same tests, against the code before this change.

- **Unit** (`server/services/authoring/__tests__/draft-figure-check.test.ts`, 9 new tests):
  - the list is taken from the current text;
  - a corrected figure is not listed;
  - an unverifiable source is listed as `source_unavailable`;
  - a section citing nothing is outside the check;
  - the verdict demands exactly the listed keys;
  - the digest is independent of the order of the list.
- **Real re-read on embedded PostgreSQL**
  (`server/services/authoring/__tests__/saved-source-excerpts-for-signing.pglite.integration.test.ts`, 5 tests):
  - the document is created by the real `POST /docs/from-draft`, whose own check records HR 0.71 as unverified;
  - the signing re-read takes the reservation lock before the Vault read;
  - it names HR 0.71;
  - it ignores the save's stale record after a correction;
  - it catches a number typed in later;
  - it reports a changed CSR as `source_unavailable`;
  - it takes no lock for a document that cites nothing.
- **The three routes** (`server/routes/__tests__/authoring-signature-figure-gate.test.ts`, 11 tests). This is the
  real router and signing ceremony; the saved-source re-read is the only seam.
  - **Red** (`red/route-gate-without-p89.txt`): 9 of the 11 fail. `/e-sign` APPROVER, `/freeze` and `/sign`
    APPROVER all answered 200 over HR 0.71, and wrote a signature and a seal. The 2 controls passed: a clean
    document, and a review signature.
- **The dialog** (`client/src/concept2cure/v2/__tests__/authoringFilingBarFigures.test.tsx`, 4 tests; the real
  `EsignModal`).
  - **Red** (`red/filing-bar-without-p89.txt`): 4 of 4 fail. The old bar never asked.
- **Green** (`green-summary.txt`): 68 of 68 across these five files, including the existing
  `authoringFilingBar.test.tsx`.
- **Regression:** the 34 existing suites that exercise `/e-sign`, `/freeze`, `/sign` or the source-reference module
  pass, 472 tests in all.
- **Lint:** no new warnings on any changed file. The filing bar's component was split (`FreezeDialogs`,
  `useFigureQuestion`) to keep it under the limits.

## In the running app (`live/`), 2026-11-02

RULE 4: a screen is not done until it was opened in the running app and used.

**The install.** A local install was provisioned from empty: PostgreSQL 16 with pgvector,
`scripts/db/provision-test-db.sh` (`install-fresh` then `deploy-migrate`), 1,281 tables, and the `app_service` role
checked. The server ran in development on `:5000`.
- **Accounts.** `scripts/seed-admin.mjs` created two accounts in the same organisation: JM Smith, who authors, and Ava
  Approver, who signs.
- **Setup.** It went through the real routes with real sessions. The author created an IND project, filed a CSR excerpt
  into its Vault (`POST /api/vault/ingest`, extracted inline), and saved a drafted Clinical Overview section citing it
  (`POST /api/authoring/docs/from-draft`). The section states 212 patients and 47%, which the excerpt holds, and
  HR 0.71, which it does not.
- **The browser.** Playwright, as Ava Approver, used the real sign-in page, the project, the document's **Open**, and
  **E-sign → Approval**. No model was called.

**What happened** (`browser-run-1-before-fix.json`, `shots/before-fix-*`):
1. The first approval answered **409 `FIGURES_UNVERIFIED`**, naming one figure: `HR 0.71`, section 2.5.4 Overview of
   efficacy, `not_in_cited_source`. 212 patients and 47% were found in the source, so neither was listed.
2. The bar asked: "A figure is not in its cited source", then "HR 0.71 · 2.5.4 Overview of efficacy — Not found in the
   excerpts this section cites", with **Go back and correct it** selected (`before-fix-12-figure-question.png`).
3. Ava set it to **Keep it as written** and continued. The signature dialog reopened, saying "You kept 1 figure not
   found in its cited sources. Your signature records each one."
4. The second approval carried `acknowledgedFigures: ["<section>#1:HR 0.71"]` and answered **200**. The document is
   APPROVED and frozen, and the toast read "Document signed (approver) — approved and frozen".
5. **The record** (`db-rows.txt`):
   - `authoring_signatures` has Ava's APPROVER signature, re-verified by password.
   - `authoring_audit_trail` has `UNVERIFIED_FIGURES_ACKNOWLEDGED`, naming HR 0.71, with the document hash the
     signature binds.
   - The chained `audit_logs` carries the acknowledgement at seq 18 and the approval at seq 19, with
     `figuresAcknowledged: { digest: ff48e02c…, count: 1 }` beside its `signatureId`.
   - No HMAC seal was written: this local install has no seal key, which is D5's owed KMS item.

**A defect only the running app showed, and its fix.** After the approval succeeded, the dialog went back to a blank
Review form instead of showing "Signature applied" (`before-fix-15-approved.png`).
- **The cause.** `doSign` cleared the question state on success. That turned `EsignModal`'s `defaultMeaning` from
  approval back to review, and the dialog's reset effect is keyed on it.
- **Not new.** The older "not settled" approval (2026-10-30, `setUnresolved(null)`) had the same flaw.
- **The fix.** The question state is now cleared when the dialog closes (`closeAll`, which **Done** calls), not on
  success.
- **The tests.** Two tests now hold it, one for each path, and both failed first (`red-confirmation-reset.txt`; the
  "not settled" case was red the same way before the fix).
- **The rerun.** On a second draft, after the fix (`browser-run-2-after-fix.json`, `after-fix-15-approved.png`):
  "Signature applied", with Ava Approver, Approval, the reason, the time and the chain hash, still on screen 5
  seconds later. The ledger again holds the acknowledgement and the approval, at seq 23 and 24.

## Owed

- **A deployed run.** The live run below is a local install. A run on staging is D1's, with the rest of the product.
- **Unchecked sections.** Sections that cite no sources are outside the check. Covering them is a founder decision.
- **A refreshed display.** The editor's `DraftFigureLine` still shows the save's check, labelled "when the draft was
  saved". Showing the current check in the editor before signing is a reach for D4's editor lane, not this one.
