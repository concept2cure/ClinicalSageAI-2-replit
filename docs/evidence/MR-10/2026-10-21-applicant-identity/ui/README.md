# Existing forms and dispatch UI completion

Status: local implementation and focused verification complete. Root owns browser,
build, full compiler, integrated review and direct canonical publication.

## What already exists

- `IndFormsPanel.tsx` already loads the forms engine, displays recorded program
  facts, builds/downloads forms and files completed signed forms. It now reaches
  the deployed IND sponsor CRUD and explicitly records the selected sponsor and
  agency application number through the existing program-facts route. Existing
  `ind_sponsors.signatory_name`/`signatory_title` already feed authorized
  representative form fields; the compact editor now reaches these facts too.
- `IndApplicantIdentity.tsx` extracts the reached registry/fact subsection;
  `indFormsPanelRecords.ts` extracts the existing listing, form receipt, upload
  body and PDF-header handling. No second console, writer, validator or store.
- `submissionScopedRead.ts`, `shellProject.ts` and `authService` already own
  session and project-visit identity. The whole existing forms panel now uses
  these guards. Existing `mutateVerbatim` now admits PATCH in its type union.
- `SubmissionSeqWorkspaces.tsx` already runs the server's dispatch gate and
  invokes the governed signing chain. Its existing action now also reaches an
  explicitly eligible unsent FDA release renewal. Eligibility and release
  verdicts remain server-owned; absent authorization offers no renewal.
- `SubmissionCenter.tsx` already refreshes a confirmed dispatched-to-dispatched
  act through its existing sequence reload and workspace remount. A suspected
  extra readiness-refresh requirement was refuted by executing the actual
  parent chain with the proposed extra line removed. No production change to
  this file remains; its final contents equal pretask `b9a48ce71`.

## Verified behavior

- Registry creation/update and program binding are separate explicit writes,
  each requiring the person's reason and exact opaque revision. A new sponsor
  remains unbound. Shared record edits state their effect on every bound program.
  Authorized representative name/title use the existing nullable registry
  fields; recording them does not sign a form. Drafts can leave them blank,
  existing values are editable/clearable, and receipts must match both facts.
- Exact returned facts, binding/name and advancing revisions are checked before
  reporting a save. Missing, malformed, mismatched, 204 or lost acknowledgements
  hold further writes until explicit read/reconciliation. A confirmed registry
  mutation with an unconfirmed/nonretrievable audit entry remains visibly so.
- Session retirement, program changes including A→B→A, late reads and late
  receipts cannot repopulate another visit. StrictMode effect replay remains
  usable. Multiword addresses retain spaces while typing.
- Form checks and other form responses belong to a synchronous input generation.
  Recorded program reads/receipts, sponsor revisions and per-form edits retire
  old checks. A late check cannot repaint a previous clean verdict after an
  identity save. Malformed/empty build results do not become clean checks; every
  FDA 1572 investigator result is verified and missing fields are reported.
- Existing PDF, dossier, filing target, completed-form attestation, freeze and
  dispatch behavior passes its focused cohort. Renewal enters the existing
  precheck → real sign modal → dispatch chain, and its parent reads the updated
  verdict after confirmation. An unknown act remains unresolved.

## Verification records

- `red.txt`: initial reachability/receipt checks, **8 failed / 8** before integration.
- `red-stale-check.txt`: all **3** input ownership defects fail before repair.
- `red-malformed-receipts.txt`: **6 failed / 7**, exposing malformed build and
  unchanged registry-revision receipts. The final empty-array case was corrected
  to use object-wrapped Vitest table rows, so it executes an actual array payload.
- `red-reauthorization.txt`: **2 failed / 7** before reaching the existing action.
- `refresh-mutation-refuted.txt`: corrected actual-parent continuation passes
  with the proposed extra refresh line absent. This is a refutation, not red
  product evidence. `preflight-reauthorization-refresh.txt` retains the earlier
  harness failure; the helper had marked HTTP 503 as `ok:true`, and the first
  count assertion included the initial Validation read. Both were corrected.
- `red-authorized-representative.txt`: all **6** reached-editor/receipt cases
  fail before exposing the existing fields. `green-authorized-representative.txt`
  records **35/35** focused passes, including unchanged-revision and malformed
  receipt holds; `lint-authorized-representative.txt` has zero errors/warnings.
- `green.txt`: **132 passed / 12 files**, Node 22, targeted Vitest cohort.
  `green-before-authorized-representative.txt` retains the prior 128-case run.
- `lint-final.txt`: exit 0, zero errors. New subsection/helper/test files have
  zero warnings; pre-existing large-file warnings remain. `lint-baseline.json`
  records the same existing-file warning population from pretask source.
- `inputs.sha256`: ten owned or directly relevant production/test file pins,
  verified against the working tree after the final run. Root owns publication
  ancestry and complete build/execution input manifests.

The intermediate `green-*`, compatibility and lint files retain diagnostic runs,
including unsuccessful preflights; `green.txt` is the final cohort. No worker
commit, push, dependency or baseline change was made. Human witnessing, actual
agency assets/conformance and customer applicant facts are not claimed here.
