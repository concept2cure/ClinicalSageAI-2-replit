# Biostatistics calculation basis in the existing editor

Plan **F1**, launch workstream **W1**, row **D2**. This repair completes the
existing Biostatistics → Document authoring handoff. It adds no route,
production file, table, model, parallel artifact store or editor.

## What already exists

| Existing path | Existing capability | Gap relevant to this repair |
| --- | --- | --- |
| `client/src/concept2cure/v2/surfaces/Biostatistics.tsx` | Loads a persisted study through the bridge, computes the edited form through `/api/ana-biostats/compute`, previews generated Markdown and sends a working document to the shared editor. Worked examples are already labelled in the UI. | The document request has no study/run basis. The response retains full computation provenance, but the screen keeps only `engineVersion`. The two-stage authoring call sends only title/module/code/HTML. |
| `client/src/concept2cure/v2/authoringHandoff.ts`, `authoringHandoffRecovery.ts` | Canonical specialist handoff, project/account guards, one active attempt, explicit unknown-outcome recovery, exact-document reads and guarded navigation. | The generic writer creates the document and its text separately, with no statistical origin. Its section-only recovery is appropriate for that existing path, not for a new atomic statistical save. |
| `server/routes/ana-biostats.ts` (`POST /document`) | Existing authenticated document endpoint invokes the document generator. | Caller-supplied computed results are accepted without server recomputation. The response's engine version therefore cannot by itself prove where those results came from. |
| `server/services/ana-biostats/orchestrator.ts` (`quickCompute`) | Existing normalizer and enhanced deterministic engine, judgment, domain adaptation and regulatory customization. | The document endpoint does not use this path. Reuse it rather than a new engine. |
| `server/services/ana-biostats/document-generator.ts`, `types.ts` | Deterministic statistical prose and full input/result/judgment/domain/regulatory provenance. | Generated document provenance lacks the admitted project, stored design snapshot and stored-run relationship. |
| `server/services/biostatistics-bridge/bridge-service.ts`, `design-adapter.ts` | Maps the design's string `studyId`, numeric project ID, program UUID, actual adapted inputs and input hash; exposes the latest saved sizing run separately. | A current workbench calculation may use edited inputs and must not silently inherit the design's saved sizing run. |
| `server/services/study-design/study-design-repository.ts` | Reconstructs the canonical design from `cdisc_prm_studies.metadata`; persists it with its numeric study row. | String design identity and numeric FK must remain distinct. A save must read the actual stored row under the admitted tenant and program. |
| `server/services/stats/computation-runs.ts`, `computation-provenance.ts` | Existing immutable saved inputs/outputs, input/output hashes, purpose, method, engine/version and numeric study FK. | A named run must be scoped and checked, not accepted from a browser label. No new run is implied by simply generating a document. |
| `server/services/ana-biostats/workflow-integrator.ts` | Existing statistical persistence/integration module; artifacts, versions, provenance events and editor handoff. | Its artifact creation writes three records separately and retains only partial statistical metadata. Creating an artifact merely to reach the editor would add an unnecessary intermediate write. |
| `server/services/authoring/authoring-from-draft.ts`, `authoring-documents.ts` | One transaction creates document, sections, genesis revisions, audits and lineage; handles uncertain commit acknowledgement. Server-only source options are distinct from parsed public provenance. | The statistical handoff does not yet reach this canonical atomic writer. Arbitrary public provenance must remain untrusted. |
| `server/services/authoring/authoring-program-access.ts` | Fresh membership and organization status, unique integer project anchor and private-project write policy. | These checks must govern the statistical save and its source reads in the create transaction. |
| `server/services/authoring/artifact-workflow-source.ts`, `workflow-source-import.ts` | Existing exact-version artifact import retains metadata/citations/provenance and uses the canonical authoring writer. | Appropriate for an already persisted artifact, not proof that an unsaved workbench response is one. |

### Searches and scope

Read root instructions and current coordination; no active hold names the
approved handoff, Biostatistics or from-draft service paths. The authoring
router and CSR saved-evidence exports remain outside this repair. Searched
actual `/api/ana-biostats/document` callers, generator users, shared authoring
writers/recovery, bridge designs, computation-run readers and their tests.
The bounded full-history deletion search found retired browser engines,
legacy surfaces and unreachable statistical services, not an alternate
canonical statistical-to-authoring writer. Existing code is reused.

## Repair contract

1. The existing document endpoint recomputes from actual submitted inputs;
   supplied results, engine labels and model claims are not computation proof.
2. An explicit save action uses the canonical authoring transaction. It saves
   the exact server-generated content with full statistical provenance and
   records its deterministic origin instead of attributing it to the person.
3. Actual current project/write admission, stored study snapshot and any
   named saved run are verified inside that transaction. Cross-tenant,
   cross-project, stale statistical inputs and corrupt/misbound run claims
   refuse the save.
4. Edited workbench inputs are retained separately from adapted design inputs
   and any saved sizing run. An absent run is recorded as absent, not invented.
5. Worked examples remain explicitly labelled examples with no study/run
   claim. All outputs remain working drafts requiring review, not approval,
   human authorship or filing readiness.
6. Existing project/account/current-attempt recovery governs the atomic save.
   No automatic retry or section-only continuation can lose its provenance.

## Verification

The “What already exists” inventory and repair contract were recorded before
implementation. Four regressions failed on the actual baseline: two server
cases in `01-red-document-computation.log` and two client cases in
`02-red-atomic-handoff.log`. One server regression demonstrated that a caller
could change the sample size to 99,999 and receive it back under the engine's
provenance label. The repaired endpoint recomputes the original inputs.

| Final test group | Result | Evidence |
| --- | --- | --- |
| Document endpoint and shared atomic handoff | 24 passed in 2 files | `03-document-and-atomic-handoff.log` |
| Existing rendered Biostatistics, shared specialist callers and context guards | 123 passed in 8 files | `08-ui-contract-final.log` |
| Canonical from-draft provenance and explicit recovery | 60 passed in 4 files, including 2 new statistical recovery cases | `09-canonical-recovery-and-provenance.log` |
| Statistical origin with actual PGlite authoring SQL | 12 passed in 1 file on the final typed fixture | `10-final-basis-sql.log` |
| Actual restricted PostgreSQL runtime and retained authoring evidence | 5 passed in 1 native file | `11-native-basis-verified.log` |

These runs cover **201 distinct tests**. The 23 existing
`specialistRecoveryInteraction` cases run in both UI groups are counted once.
Log 04 is an earlier passing version of the same 12 PGlite cases and is not
counted again. The first adjacent UI run (log 05) found 17 expectations/mocks
for the retired two-request statistical handoff; they were updated to the
actual atomic request/receipt while preserving the other specialists' existing
behavior. Those are contract updates, separate from the four actual baseline
regressions above.

Native verification was lead-owned and serialized through the isolated
PostgreSQL wrapper. The fixture verified the real `app_service` role with
TLS, forced tenant RLS and no bypass. The first native attempt (log 06) stopped
before assertions because its program fixture omitted required `product_name`;
all five cases were skipped. The second attempt (log 07) passed four cases,
then the first case's audit assertion used the wrong `details` column. The
production writer had succeeded. That test now reads the canonical writer's
actual `new_values` field, requires the CREATE chain hash and HMAC seal, and
checks full statistical provenance in the authoritative audit-trail metadata.
The final five-case run passed against the exact final typed fixture. Neither
immutability nor audit triggers were disabled for cleanup.

All focused runs used the installed Node 22 runtime and
`vitest run --config vitest.config.ts <listed test files>` with
`--no-file-parallelism --maxWorkers=1 --reporter=verbose`. Native execution used
the existing native-test configuration through the lead's database wrapper.

## Retained record and behavior

The explicit `save_to_authoring` action on the existing document endpoint
reaches `createDocumentFromDraft`. The canonical writer owns one serializable
transaction for the document, section, immutable genesis revision, audit and
clause lineage. Inside that transaction it rechecks current organization and
private-project write authority, recomputes the calculation again, locks and
reads the actual study row, and checks any named sizing run's exact tenant,
program, numeric study, purpose and stored input/output hashes.

The server-only `statisticalSource` provenance records:

- The admitted organization, program UUID and unique integer project anchor.
- The document type and explicit worked-example or study-design basis.
- Full normalized computation inputs, actual outputs, judgment, domain and
  regulatory context, generation time and engine version; SHA-256 values
  describe the retained JSON inputs and outputs.
- The string design `studyId`, distinct numeric `studyRef`, stored design
  snapshot and its hash, update timestamp, adapted design inputs, the existing
  bridge input hash, and a separate hash of the stored adapted-input JSON.
- Whether normalized current inputs match the stored design or were modified.
- The exact saved sizing run, if one exists: its ID, recorded time, method,
  purpose, engine/version, original inputs/outputs and hashes. Exact input and
  output equality with the current calculation are separate facts. A matching
  filename, selected study or planned N never substitutes for those checks.
- The SHA-256 of the exact sanitized section bytes. The canonical writer
  checks this hash against the bytes it is about to store.

The generator's clock appears only in provenance, so a stable preview's
Markdown can be compared exactly before saving. The stored design snapshot
is the record read at save; the freshness receipt supplied by the bridge
covers its statistical inputs. The repair does not pretend the bridge exposed
a full design-revision token.

Worked examples carry an explicit content notice and title suffix, plus null
design and `not_applicable` sizing-run context. Study drafts with no saved run
record `none` as observed during that save. The server does not create a sizing
run as a side effect. Public `/docs/from-draft` provenance continues to drop
`statisticalSource`; it cannot manufacture verified calculation or source
claims.

The client retains the full preview provenance, sends the actual calculation
input snapshot, and accepts success only for an exact program/document/section
receipt with the requested statistical basis. Project/account changes and
unknown commit outcomes use the existing recovery lane. Recovery cannot
append a naked section after an atomic statistical save. Reuse reads both the
retained origin and section; failure to verify an existing copy stops the
action instead of silently creating another one.

## Changed-path manifest

Production changes are limited to these seven existing files:

- `client/src/concept2cure/v2/authoringHandoff.ts`
- `client/src/concept2cure/v2/authoringHandoffRecovery.ts`
- `client/src/concept2cure/v2/surfaces/Biostatistics.tsx`
- `server/routes/ana-biostats.ts`
- `server/services/ana-biostats/types.ts`
- `server/services/ana-biostats/workflow-integrator.ts`
- `server/services/authoring/authoring-from-draft.ts`

Changed or added tests/fixtures:

- `client/src/concept2cure/v2/__tests__/authoringHandoff.test.ts`
- `client/src/concept2cure/v2/__tests__/biostatAttachHonesty.test.tsx`
- `client/src/concept2cure/v2/__tests__/biostatBridge.test.tsx`
- `client/src/concept2cure/v2/__tests__/biostatServerEngine.test.tsx`
- `client/src/concept2cure/v2/__tests__/openInEditorHandoff.test.tsx`
- `client/src/concept2cure/v2/__tests__/specialistHandoffInteraction.test.tsx`
- `client/src/concept2cure/v2/__tests__/specialistRecoveryInteraction.test.tsx`
- `client/src/concept2cure/v2/__tests__/_statistical-handoff-fixture.ts`
- `server/routes/__tests__/ana-biostats-refusal-is-422.test.ts`
- `server/services/ana-biostats/__tests__/authoring-basis.pglite.integration.test.ts`
- `tests/db/biostat-authoring-basis.dbtest.ts`

## Qualification and remaining gates

The document remains a working draft, with deterministic compositor lineage
and `governedWrite: unverified`; requesting it is not human authorship, an
approved model receipt or scientific approval. This repair changes no engine
formula, scientific validation, filing-placement rule, approval workflow or
release gate. It does not retrofit the separate full-workflow artifact writer
or assert that a worked example is clinical project evidence.

No running-app, deployment or live clinical-result qualification is claimed.
Production/test files are frozen for the lead's full compiler, build, required
`scripts/ai/verify-tests.sh` and publication gates. Their final result belongs
to the lead's integration record.


## Follow-up: SQL and lint gate repair

The integrated pre-push check identified the optional sizing-run SQL fragment
and new validation complexity/size warnings. The run lookup now uses a fixed
statement with an optional bound `bigint` run ID, matching the deployed run ID
type. A named run still must belong to the exact organization, program, study
and purpose; omitting the ID still reads that study's latest recorded run.

Private helpers in the existing statistical writer now separately validate the
requested basis, recompute the calculation, verify the stored study snapshot
and verify the sizing run. All database reads still occur through the supplied
canonical authoring transaction. Existing handoff and surface files separate
calculation-receipt, study-receipt and saved-document checks without changing
their fail-closed or uncertainty behavior. The route's canonical save branch
and the writer's provenance annotation were extracted into same-file helpers.
Test cases were grouped by their actual behavior, and mock dispatch now handles
non-POST requests before selecting a POST endpoint. No new production file,
endpoint, model, table, lint suppression, gate or baseline was introduced by
this follow-up.

Fresh post-cleanup validation:

- `../2026-11-08-study-source-lineage/08-gate-repair-server-regressions.log`:
  **77 passed in 8 files**, including the 12 statistical basis cases and 10
  document/refusal route cases, with the adjacent source suites.
- `12-gate-repair-ui-canonical.log`: **174 passed in 12 files**, exit 0,
  exercising rendered Biostatistics, exact handoff receipts, shared callers,
  project/account changes, recovery, and canonical from-draft provenance.
- `../2026-11-08-cross-module-data-flow/native-source-biostat-after-sql.log`:
  **15 passed in 3 files**, exit 0, including the 5 Biostatistics basis cases.
  The lead ran this after the SQL/lint repair against actual native PostgreSQL.
- `../2026-11-08-study-source-lineage/09-gate-repair-lint.log`: no new warnings
  in the 13 scoped files. The existing warning counts remain 1 in the shared
  handoff, 4 in the Biostatistics surface and 5 in the evidence service.
- `../2026-11-08-study-source-lineage/10-gate-repair-sql.log`: the SQL scanner
  passes; the statistical writer has zero counted SQL interpolations.

The two focused runs plus the native rerun contain **266 passing cases across
23 files**, without counting an earlier run again. This is the post-cleanup
verification set, not a claim that the full repository/compiler/build gates
have passed. Production files and tests are frozen for the lead's integration.

### Fixture type qualification follow-up

The lead's full-context TypeScript diagnostic found five unknown-result errors in the PGlite basis fixture. Its setup/assertion reads now use the existing generic PGlite query API with explicit result shapes, retaining nullable provenance, metadata and machine-author fields. Service execution, SQL, transaction traces and assertions remain unchanged. All **12 basis cases pass again**, alongside 10 CSR-import cases, in `../2026-11-08-cross-module-data-flow/typed-fixture-regressions.log`; scoped lint is clean. This fixture repair does not change production statistical behavior or substitute for the complete repository compiler gate.
