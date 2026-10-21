# Finish study metadata on the existing placement path

Starting source: `4282257ac`. W5/D7, MR-10 Stage 1 / CAT2-04 input portion.
The published Builder metadata editor remains the way to correct placed leaves.
This slice reaches the existing metadata writer during placement. DTD validity,
agency acceptance and the rest of MR-10 remain open.

## What already exists

- `shared/schema/submissions.ts`, the existing study-tagging migration and
  `shared/types/database.d.ts`: nullable study fields already exist.
- `server/routes/submissions.ts` and
  `server/services/submission-service/submission-service.ts`: existing governed
  PUT persists both fields; locks, tenant/author/reason controls, source pins,
  duplicate placement and validation invalidation already work. No writer change.
- `server/services/ectd/{core-to-packager,stf-generator,ectd4-validator}.ts`:
  existing projection, STF filename/rendering and coverage rules. The pure
  filename pattern currently lives in `ectd-regional-rules.ts`. Their server
  modules import crypto/regulatory services, so browser code cannot import them.
- `server/services/ana/{AnaToolDefinitions,AnaToolExecutor}.ts`: existing direct
  package tool accepts tags, but does not persist the human placement path.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`: existing
  Builder editor already displays and saves tags; its AddLeafForm omits them.
  Reuse its two controlled inputs rather than adding a second field design.
- `VaultPlaceIntoSubmission.tsx` and `AuthoringPlaceIntoFiling.tsx` already own
  placement, source/copy identity, reason, status and uncertain outcomes. Neither
  has study fields. The authoring copy must not be created before required inputs
  are valid. Existing document/project wrappers and canonical session guards are
  reused; review found the dialog wrappers did not yet include actor revisions.
- `filingTarget.tsx`: existing target picker, field style kit, reason and exact
  pointer receipt guard; extend that receipt guard with optional expected tags.
- `EctdCompile.tsx`, `RecordHistory.tsx`, and `submissionScopedRead.ts`: existing
  viewer/history/session infrastructure; no viewer, ledger or scope system added.

Searched current routes/services, schema/migrations, shared regulatory rules,
surfaces and AnA tools for study identifier/id, STF/file-tag/1789, placement,
receipt and filename validation. Deleted-history search on `*Study*Tag*`, `*stf*`,
`*STF*`, `*Place*Filing*`, `*Placement*Field*` found only an unrelated gstack test
deletion (`7df89f4f7`), not a prior placement implementation to restore.

## Contract and ownership

1. Lift existing `FILENAME_PATTERN`, `stfFileName`, `STF_NOT_REQUIRED_SECTIONS`
   and `requiresStfReference` into browser-safe
   `shared/regulatory/ectd-leaf-rules.ts`, preserving exact behavior, messages,
   sources and server exports. Server modules import/re-export the same functions.
   No copied regex or second coverage policy. Shared tests pin exemptions and
   filename boundaries; existing server STF tests continue to run unchanged.
2. Extract the existing Builder pair of inputs into
   `StudyTaggingInputFields.tsx`, using existing field kit styles and controlled
   values `{studyId:string, stfFileTag:string}`. Reuse it in Builder editor and
   all three placement forms. No state store or form engine.
3. Shared client helper `studyTaggingPlacement(section, operation, region, values)`
   returns `{show, required, valid, problem, payload}`. Show fields for existing
   STF sections except delete operations. Require both for FDA/unknown region,
   matching existing coverage severity; keep other regions' advisory behavior.
   Validate supplied study ID with the SAME `stfFileName` before any copy/write.
   Tag is exact human text, max128; document recall tags remain unverified and
   are not an enum. Empty optional pair and hidden fields produce no payload;
   otherwise send both trimmed values (empty means null). No inference/prefill.
4. Clear entered study values explicitly when source, target or canonical section
   changes, including the existing target hook's singleton auto-selection.
   Extend the existing dialog wrapper keys/current predicates with the canonical
   session guard so actor changes cannot continue a saved-read/copy/PUT chain.
   Existing document/project wrappers still reset owned state. Fields
   and selectors are disabled while writing, after placement or while uncertain.
   Metadata validity gates Authoring BEFORE taking a copy and gates both other
   PUTs. Preserve existing reason, lifecycle and source behavior.
5. Extend `FilingLeafReceipt` / `matchingLeafReceipt` with optional study fields:
   when expected metadata was sent, confirm exact ID/tag as well as existing
   sequence/section/lifecycle/pointer. Missing/mismatched metadata is unknown.
   Use existing mutation uncertainty rule for bodyless2xx, OUTCOME_UNKNOWN,
   network errors and malformed success; preserve DELETE204 semantics. No blind
   retry. Reuse existing dialog holds and Builder reread/refresh infrastructure.
   No-op is distinct from a new placement. Surface leaf and returned sequence
   transition audit uncertainty through the existing receipt warning helper.
6. Foundation worker owns shared rules, the three server extraction modules,
   shared input component, filingTarget helpers/types and their focused tests.
   Dialog worker owns Vault/Authoring placement files, the existing copy helper's
   leaf/snapshot failure classification, and their tests. Foundation additionally
   signals singleton auto-selection through the existing target-change callback.
   Root owns
   Builder integration/editor reuse, uncertainty export, docs and publication.
   Workers do not commit/push or edit another scope; root publishes directly.

## Evidence

Failing-first regressions: required study metadata stops every placement before
copy/PUT; exact payload and receipt, omitted/mismatched/bodyless receipts,
exemptions/delete/other regions, reset on context changes and no-op/audit outcomes.
Run relevant existing placement, Builder, STF writer/projection/packager tests.
Fresh Chromium exercises actual components against synthetic intercepted API;
production build and normal compiler/lint/push gates remain required. Human
witnessing is recorded as unexecuted. No live AI, agency or regulated record writes.
