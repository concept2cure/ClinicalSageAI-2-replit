# CSR editor context and action admission — 2026-11-03

Target: `concept2cure/ClinicalSageAI-2-replit`, canonical branch `concept2cure-v2`.
Scope: the EXISTING Project → clinical study report → study data → CSR build/review/import/assembly flow. No new editor, data store, model, gateway, or UI navigation world.

## Trace reviewed in source

1. `client/src/concept2cure/v2/editor/StudyDataBuild.tsx` displays a CSR document's frozen clinical source and earlier saved-run choices.
2. `StudyDataSource.tsx` reads the project Vault's eligible sources and the currently frozen, approved study-data receipts through the existing `/api/submission-orchestrator/csr/*` routes.
3. `CsrBuildDraftControl` queues the CSR build through `/api/csr/jobs`.
4. `CsrRunBuilds.tsx` reads `GET /api/csr/jobs?programId&runId`, then `GET /api/csr/jobs/:jobId/headings`; it mounts the existing section review, AnA narratives, assembly and Authoring source intake.
5. The server owns project/actor permission, source approval, review and assembly admission. This patch does not bypass or replace those gates.

## Confirmed defects repaired

**Previous project/build remained visible on a scope change.** `useRunBuilds` retained `current.builds` when the `programId` or `runId` prop changed. React renders before effects reset, so the old build's progress and associated review, narrative and assembly controls could appear within the new project's editor. The state now carries the exact project/run key, displays no old rows on the first render, and discards obsolete asynchronous responses.

**Saved headings could be overwritten by an obsolete read.** `useBuildHeadings` launched a new read when `updatedAt` changed but a slower previous read could commit afterward. That could restore an older, potentially approved-looking heading in the review UI. Heading state now keys on job, saved revision and retry epoch; superseded requests lose ownership and their results are ignored.

**Malformed build data could appear actionable.** The build decoder previously verified only numeric job ID and a string status. It now checks the complete database-backed status enum, study identifier, 0–100 integer progress and parseable update time before rendering any build controls. A malformed response is an error, not a fabricated progress display.

**Document/project switching retained old clinical-source choices until effects ran.** `StudyDataBuild` reset local state only in effects. Its entire study-data session now remounts synchronously under the project and document key, including Vault source picker, selected frozen data, queued build focus and saved-run views. Late replies from the retired session cannot repopulate the new session.

**Failed headings read had no direct recovery.** A failed `GET /headings` displayed an alert but did not let the person retry that read, while narrative and assembly actions were still displayed. The card now provides **Retry reading sections** and offers review, narrative and assembly actions only after the current headings have been successfully read. The server-side authorization and assembly gates are unchanged.

## Regression cases added

- `client/src/concept2cure/v2/__tests__/csrRunBuildsScope.test.tsx` — old project/run controls disappear immediately; late old project reply is ignored; older heading read cannot overwrite current review; malformed records fail closed; failed headings block actions until explicit retry succeeds.
- `client/src/concept2cure/v2/__tests__/studyDataBuildScope.test.tsx` — project changes clear existing study data and build controls; late document replies do not repopulate a different project; switching documents remounts the source picker.
- Existing `csrCardReach.test.tsx`, `studyDataSource.test.tsx`, CSR jobs/review/assembly tests remain in place. No fixtures were installed as production data.

Suggested verification in a checked-out Node 22 workspace:

```bash
npx vitest run client/src/concept2cure/v2/__tests__/csrRunBuildsScope.test.tsx client/src/concept2cure/v2/__tests__/studyDataBuildScope.test.tsx client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
```

**Verification honesty:** Static source-contract inspection completed, 12/12 intended guard patterns present at the inspected branch. Native React/Vitest, full TypeScript, real database, provider, browser, and clinical/scientific acceptance have **not** been run in this connector-only session. GitHub Actions on the pushed commit remains the next actual test verdict; do not mark the slice fully qualified without those results.

## Next core convergence targets (not claimed delivered here)

1. Verify the existing Project Data Room → Vault source approval → clinical table / ADaM or other biostatistics source eligibility → CSR evidence digest path on a real, authorized synthetic test project. No guessed efficacy or safety results.
2. Verify AnA's governed model selection, source-receipt inclusion and long-form medical-writing output with an actually qualified provider; an API key check alone is insufficient.
3. Verify independently reviewed CSR sections can be saved/reopened in the one Editor and exported without missing sections, lost edits, unsupported numeric claims or stale signatures.
4. Retain the established read/edit/signer, audit, tenant and 21 CFR Part 11 controls. Do not silently switch to mock data or create a second CSR workspace.

Source design reference: `docs/design/CSR_END_TO_END_2026-10-29.md` describes the earlier 2026-10-29 baseline. Its gap inventory is not a current test verdict: several October 30–November 2 slices superseded it.
