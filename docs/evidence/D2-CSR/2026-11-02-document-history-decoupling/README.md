# CSR editor and reviewer evidence — package history must not gate the document

Date: 2026-11-02. Branch: `concept2cure-v2`. Plan: **F1** (repair existing functionality). This closes a **code disconnect**, not the founder's hosted demo acceptance.

## Existing system and defect

Concept2Cure has one Project Management project, one Data Room, one Canvas/Editor and one AnA. A CSR is a selected document type, not a separate product. The existing `StudyDataBuild.tsx` runs in `DocumentWorkbench.tsx` when the saved template entry is `component:clinical_study_report`. Its project's sources are previewed/frozen via `StudyDataSource.tsx` into `csr_study_data` under the saved document, without any Submission Center package run. `readSavedClinicalTables` verifies that sealed source when the editor builds a draft or a reviewer maps claims.

**Defect A — editor:** `useStudyDataChoices` used `Promise.all([readDocumentStudyData(...), GET /api/submission-orchestrator/runs])`. If the **optional** historical package-runs read failed, its combined catch set `studyData:null` and hid **the document's source selector and frozen tables**. This could strand a valid CSR document project even when its own data was available.

**Defect B — reviewer:** `useSavedRuns` in `CsrEvidenceReview.tsx` used the same combined read. A history failure prevented the scientific reviewer from choosing an otherwise valid `csr_study_data` receipt. Before the repair, an omitted/malformed `runs` array was treated as a successful empty history. When the history query failed with no document data, the review panel also incorrectly said no retained clinical tables existed, confusing "unavailable" with "empty".

## What was changed, without another module or workflow

- **`client/src/concept2cure/v2/editor/StudyDataBuild.tsx`**: `Promise.allSettled` distinguishes the **required** document study-data read from **optional** package-run history. A document-data failure still blocks the source workflow. A history-only failure yields a visible alert, but current document sources and frozen builds remain available. An invalid history list is also reported as incomplete, never silently treated as zero history.
- **`client/src/concept2cure/v2/surfaces/CsrEvidenceReview.tsx`**: The reviewer's own frozen study data is authoritative and required. Older package runs remain optional; history failures or malformed lists are displayed as errors but do not hide verified `studyDataId` options for the same document. Missing/invalid document data fails closed. Run options reset on program/document changes, and an unavailable history never triggers the "no retained tables exist" message.
- **Existing Vitest suites extended**, not new architecture: `client/src/concept2cure/v2/__tests__/csrBuildProgress.test.tsx` and `client/src/concept2cure/v2/__tests__/reviewDecisionCsrEvidence.test.tsx`. The former's old draft-status assertion was also aligned to the previously implemented placeholder-honesty text.

No server-side approval requirements, clinical-source hashes, actor permissions, electronic signatures, workflows, UI navigation layout, AI providers or data stores were changed. This repair does not bypass the real requirement that the **source version be approved** before freezing into a document.

## Exactly what was executed

In this ChatGPT turn, both patched hook bodies were fetched from the exact GitHub branch blob and their TypeScript-only syntax erased before executing the **actual JavaScript hook logic** with controlled state/effect/network doubles:

| Source hook | Cases | Result |
|---|---:|---|
| `useStudyDataChoices` from `StudyDataBuild.tsx` | 5 | **5 passed**, zero failed |
| `useSavedRuns` from `CsrEvidenceReview.tsx` | 6 | **6 passed**, zero failed |

Editor cases: both reads succeed, history fails, history response malformed, current document source fails, valid document data survives history failure. Reviewer cases: both reads succeed, history fails with valid document data, malformed history, required document read fails, malformed document record, absent program scope.

These are **isolated hook-function executions** against explicit doubles, NOT the native React/JSDOM Vitest runner, NOT a native TypeScript typecheck, NOT a database integration test, NOT the deployed browser and NOT a scientifically qualified result. The expanded React suites are committed for full execution elsewhere. No fake test verdict is asserted for those suites.

The GitHub Actions check runs observed against the latest working commits were **queued**; no complete CI qualification or hosted browser receipt was available.

## What still blocks the founder's demonstration

1. Authorized Faux Biotech organization/user and FBT-201 project must exist in the deployed environment; the code/data pack alone does not create a hosted record.
2. Source files must be imported into the existing project Data Room and verified by their real Vault IDs, hashes, versions and approval state.
3. A real authorized reviewer must complete the appropriate source review/approval before `POST /api/submission-orchestrator/csr/study-data` can freeze the data.
4. In the one editor, open the canonical ICH E3 CSR working document, preview/freeze data, run actual AnA drafting with configured provider permissions, reconcile all quantitative claims and save/reopen the report.
5. Exercise the real Tasking → exact document, Communication, independent scientific review and applicable approved export. Do not imply an e-signature or regulatory filing occurred when it did not.

**Release/hosted-demo qualification: OPEN.** This patch makes the existing one-flow architecture resilient to an *optional* history read, but it cannot prove any app-side data ingestion or model result without executing the hosted journey.
