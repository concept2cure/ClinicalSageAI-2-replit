# L4 Submission gates say what is true (2026-11-10)

Plan package F1. Items: GA-D7-11 (server half only; stays open), GA-D7-10 (the labelling half), GA-D7-12 (closed), GA-D7-13 (placed status and a truthful card label; denominators stay open).

Status by the ledger's closesWhen:
- GA-D7-12: closed.
- GA-D7-10: Compile now names its rule set and says the other exists. One count (GA-D7-10B) stays with RIM.
- GA-D7-11: NOT closed. The gate carries the note; the screen still prints "Satisfied." until RIM's file and DispatchReadiness.tsx pass it on. The lead should not mark it closed.
- GA-D7-13: half closed. Placed reads placed. The cards still count the outline (18/29/17/20/12) against a headline of 48 required: "denominators agree" is not met. The lead should not mark it closed.

## What already exists

- `server/services/ectd/dispatch-gate.ts`: `evaluateReleaseSignatureGate` judges the release signature. When a type needs no signature, it returned `{ cleared: true, blockers: [] }`, with nothing to say that it did not apply.
- `server/services/ectd/assess-dispatch-readiness.ts` (held by RIM): `dispatchGateViews` turns each gate into a view, with a `notAssessed` note. `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx` `GateOutcome` prints "Satisfied." for any cleared gate that has no `notAssessed` note.
- `server/routes/ectd-compile.ts` `POST /:projectIdent/validate`: Compile's placement and package-identity checks. Submission readiness runs a separate rule set (`assess-dispatch-readiness.ts`).
- `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`: renders every finding from Validate, information last.
- `templates/forms/acroforms/FDA_{1572,3454,356H}.pdf.manifest.json`: `reviewedBy` is part of the asset-trust gate (`ind-form-fill-service.ts`, `registryCoverage.ts`), so it must stay a non-empty string.
- `client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx`: printed "Asset reviewed by <reviewedBy>."
- `server/services/ind-lifecycle/ind-checklist-view-assembler.ts`: `placedDocuments` read only leaves from `coauthor_documents`. `server/services/ectd/leaf-source-resolver.ts` already scopes a Vault leaf through the programme. That is the scope reused here.
- `client/src/concept2cure/v2/surfaces/IndLifecycle.tsx`: labels statuses from `INDL_STATUS_LABEL`. The module cards come from `getModuleProgress`, which counts every section of the outline, not the required set.

## What was wrong

- GA-D7-11: on a 510(k) sequence that was not signed and not frozen, the release-signature gate read "Satisfied" with a check. The gate did not apply, so nothing was satisfied.
- GA-D7-10: Compile's Validate showed 37 errors and Submission readiness showed 8. Neither said which rule set it ran, or that the other one exists.
- GA-D7-12: the 1572, 3454 and 356h manifests named a personal e-mail address as reviewer, and the forms panel showed it.
- GA-D7-13: a section placed from the Vault (the Investigator's Brochure, the QOS, the Tox summary) read "Not started". The module cards said "required sections approved" over 96 sections, while the headline said 48 required.

## What changed

- `dispatch-gate.ts`: a cleared gate that does not apply now carries `notRequired`: "Not required for this submission type. …". A gate that is required never carries it, and neither does an invalid signature.
- `ectd-compile.ts`: Validate returns `ruleSet` and ends with an information finding. The finding names Compile's placement and package checks. It also says Submission readiness, in Submit, runs a separate rule set, that its error count can differ, and that its verdict decides dispatch. The note is not counted in the summary.
- The three manifests: `reviewedBy` is now "the product owner (regulatory forms review)". This is a role, not an address. The field stays non-empty, so each asset stays trusted.
- `IndFormsPanel.tsx`: `reviewerLine` never shows an address. An address reads "Asset reviewed by a named reviewer on record." A role reads as that role.
- `ind-checklist-view-assembler.ts`: a Vault leaf whose document belongs to this organisation (scoped through `regulatory_programs`, not deleted) now reads `placed`. It never reads as approved, and readiness is unchanged. These leaves place nothing: one at a form code or at the forms heading, one naming another organisation's document, a missing document, or a deleted one.
- `IndLifecycle.tsx`: `placed` reads "Placed, not yet approved". The module card now reads "sections approved".

## Proof

- Red first, then green: `logs/d7-11-*`, `d7-10-*`, `d7-12-*` (the red log is redacted), `d7-13-*`, `d7-13-client-*`.
- New tests:
  - `server/routes/__tests__/ectd-compile-validate-rule-set.test.ts`
  - `server/services/ind-lifecycle/__tests__/ind-checklist-vault-placed.pglite.integration.test.ts`
  - `client/src/concept2cure/v2/__tests__/indFormsTemplateReviewer.test.ts`
  - `client/src/concept2cure/v2/__tests__/indChecklistVaultPlaced.test.tsx`
- Extended tests: `release-signature-gate.test.ts` and `indFormsPanel.test.tsx`.
- Mutations: 13 of 13 killed, and each file's sha256 was restored (`logs/mutations.txt`; the driver is in `logs/mutate.py.txt`).
- Repair (after the verifier, 2026-11-12):
  - V-L4-01: the Vault branch of `placedDocuments` moved into a named helper, `placeVaultLeaf`, in the same file. The ratchet (`check-pushed-lint-warnings.mjs --base HEAD`) lists none of this lane's files. No lane file gained an ESLint warning.
  - V-L4-02: tests added. The Validate test pins the note outside the counts (`summary.pass` equals the info rows other than the note) and exactly one note row. The PGlite test adds: a document in a deleted programme places nothing; a Vault leaf at a form code or the forms heading places nothing; with the programme store absent (42P01) the checklist still assembles and reads not started.
  - Repair mutations (`logs/mutations-repair.txt`, driver `logs/mutate-repair.py.txt`): 7 of 8 killed. R5 (the forms-heading guard in `placeVaultLeaf` dropped) survives because it is equivalent: `m1.1` is removed from the section list (the filter in `assembleOrgIndChecklists`) and from readiness (`readinessSectionStatus` deletes and recomputes it), so no output can change. The guard stays as a statement of intent.
  - V-L4-05: the role case moved to `indFormsTemplateReviewer.test.ts`. `indFormsPanel.test.tsx` is back to its one HEAD warning.
  - V-L4-06: the JSDoc on the rule-set finding was cut to one line. `ectd-compile.ts` is 102,592 bytes; it was 101,678 at HEAD, already over 100,000 before this lane. A split needs a new file under `server/routes`, which is a lead decision (the one-design gate may read it as a route file).
  - All lane tests on the tree as it is now: 7 files, 107 of 107 (`logs/repair-lane-tests.txt`).
- Every test that imports a changed module was run: 21 files with 387 tests, 15 files with 313, 22 files with 437, and 20 client files with 177. Two client tests timed out under a load average of 17. They pass when run with a longer timeout (`logs/related-client-rerun2.txt`), and neither of them reads the changed text.
- Typecheck with a scoped config: no errors in the changed files except `ectd-compile.ts`. That route's import graph runs out of memory at 4096 MB, so it was not typechecked.
- Repair typecheck (2026-11-12): the server set (dispatch-gate, the assembler, both their tests) has 0 errors in lane files. The client set was killed for memory on the shared machine; the repair changed only the client test files (one case moved), which vitest transforms and runs (107 of 107).
- Running app (`gademo`, 5240, signed in as ana), at 1440 and 390 px, no horizontal overflow, no HTTP or console error (`logs/walk-running-app.txt`):
  - The forms panel reads "Asset reviewed by the product owner (regulatory forms review)." No address appears on the page (`shots/L4-forms-reviewer-*.png`).
  - The module cards read "0/18 sections approved" (`shots/L4-ind-checklist-module-cards-*.png`).
  - In C2C-101's IND forms, m1.14.4.1 Investigator's Brochure, m2.3 Quality Overall Summary and m2.6.6 Toxicology Written Summary read "Placed, not yet approved" (`shots/L4-ind-checklist-ib-placed-*.png`). The server half is live on 5240.
  - Compile & export for C2C-101, Validate: the last row reads "These findings come from Compile's placement and package checks …" and names Submission readiness (`shots/L4-validate-rule-set-*.png`). At 390 px the findings table clips its fix column; that table is EctdCompile.tsx, not this lane.
- To re-walk: only the release-signature card in NeuroPanel-Dx 510(k) Submission readiness, after RIM's change. Until then it reads "Satisfied." as before.

## Not fixed here

- GA-D7-11, screen half: needs `assess-dispatch-readiness.ts` (RIM) to pass `notRequired` through `dispatchGateViews` as its own view field, not through the `notAssessed` note (that would print "Not assessed. Not required …"). `DispatchReadiness.tsx` `GateOutcome` then needs its own branch that prints the note alone instead of "Satisfied.". Neither file is in this lane.
- GA-D7-10, screen header: `EctdCompile.tsx` could show `ruleSet` in the findings header and in the toast, leave the `VALIDATION_RULE_SET` row out of the count and the empty-state test, so a clean pass still reads "No findings". That file is not in this lane. The finding already reaches the screen.
- GA-D7-10B: one count for one sequence. This stays with RIM.
- GA-D7-13, the rest:
  - Counting an approved Vault version as approved.
  - Computing the module cards over the required set (`ind-readiness-service.ts`).
  - Rolling child sections up to required headings.
  - Converging 36 (rule pack) and 48 (outline) required sections into one set.
  These need other files, and the last is a product decision.

## Risks

- 'placed' is outside the `SectionStatus` union (`server/services/regulatory/ind-ectd-sections.ts`) and passes through an existing cast in `readinessSectionStatus`. The owner of that file could add it to the union.
- The rule-set row is one info row counted in the screen's finding count (42 for C2C-101), and a clean pass can no longer show "No findings". The fix belongs to `EctdCompile.tsx` (see Not fixed here).
- The checklist issues one extra query (vault.documents with regulatory_programs). It fails closed to none on 42P01 / 42703.

## Questions for the founder

- Should the template reviewer be a named reviewer record (a person in the product) rather than a role?
- Which required set is the one for an IND: the rule pack's 36 or the outline's 48?

## Logs not kept

Two logs of whole neighbouring test runs are over 100 kB each and are not kept in the repository: `related-gate-2.txt` `related-gate.txt`. Their pass counts are quoted in "Proof" above; the runs can be repeated with the commands given there.
