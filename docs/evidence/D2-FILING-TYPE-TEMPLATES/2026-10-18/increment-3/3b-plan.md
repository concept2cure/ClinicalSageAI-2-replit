I re-derived the plan's claims from the code at HEAD `0c69304aa`. The plan needs material corrections before it can be executed: one P-14 gap makes its new class sentence false, one slice duplicates a cleanup slice, two slices land in an order that breaks Rule 2, and one proposed test cannot fail. Nothing was edited, staged or run; only grep/sed/git and file reads were used.

# Adversarial review of the 3b plan, with the corrected plan

## 0. What moved since the planner's HEAD `a9593ef98`

- **`dfd5b408e`** changed two test fixtures only.
- **`0c69304aa`** is cleanup S01, plus `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/cleanup/inventory-plan.md` (840 lines).
- **No cited code file changed.** The inventory plan overlaps 3b in four places:
  - **S44** (L571-579) is 3b's Slice 5.
  - **S48** (L599-607) rewrites the Module 2 blueprints that Slice 7's red case depends on.
  - **FD-11** (L809) is 3b's founder question F-A.
  - **H11** (L747) is 3b's "picker duplicates" item.

## 1. Findings: evidence, then correction

### Rule 3: built beside something that exists

**R3-1. Slice 5 duplicates cleanup S44, and S44's loader is wrong.**
- **Evidence:**
  - S44 (`inventory-plan.md` L575) changes the same two handlers (`AnaToolExecutor.ts` L5567, L5770). It loads `loadNonclinicalStudiesForProject(ctx project)`.
  - That loader takes a `ctd_programs.id`, not a project, and returns the builder shape `NonclinicalStudy[]` (`load-nonclinical-studies-for-project.ts` L40-58).
  - The composers take `NonclinicalStudyInput[]` (`nonclinical-m24-adapter.ts` L89; `m26-nonclinical-summaries.ts` L35). `loadNonclinicalProgram(...).studies` is that shape (`nonclinical-program-loader.ts`).
- **Correction:** do it once, as 3b Slice 2, with `loadNonclinicalProgram`. Amend S44 to point at that commit and drop its loader bullet.

**R3-2. `ctdComponent?` copies a fact the registry already holds.**
- **Evidence:**
  - The registry holds `ctdModule` '2.4' / '2.5' / '2.6' / '2.7' (`global-document-registry.ts` L471-474).
  - `global-document-registry.ts` imports only `./document-taxonomy` (L12-22), and `document-taxonomy.ts` imports nothing. So `filing-document-classes.ts` can read the registry with no cycle.
- **Correction:** derive the code with `ctdComponentOf(c)` (shown in Slice 5) and pin it. Add no field.

**R3-3. `refuseFilingDocumentClassEctd` would sit beside `refuseRegionalDeviceEctd` (`ectd-compile.ts` L332-339).**
- **Correction:** extend the one function and keep its four call sites (L671, L1395, L1533, L1567).

**R3-4. Slice 3 rebuilds scope resolution and loses legacy projects.**
- **Evidence:**
  - Slice 3 chains `resolveOpenProgram` → `readProgramAnchorRow`. `resolveCsrScope` already does programId → unique anchor → project-in-org → actor access (`csr/project-scope.ts` L61-79, L85-101).
  - `resolveOpenProgram` returns null for a legacy numeric project that has no `regulatory_program_id` (`program-access.ts` L241-249). Such a project can still own `csr_build_jobs`.
- **Correction:** call `resolveCsrScope` with `{ programId: projectRef }` or `{ projectId }`.

**R3-5. "ICH as a market" would be split across two functions.**
- **Evidence:**
  - The plan edits `unmappedSupport` (L417-447) and `describeUnmappedClass` (`document-class.ts` L183-196).
  - The one place for ICH as a market is `harmonisedSupport` (docstring L527-541, `return null` at L550).
  - `describeUnmappedClass` is also called by `scaffold-project-documents.ts:101`, `governed-document-binding.ts:101` and `add-project-market.ts:139`.
  - The proposed sentence would say "no NDA is filed with it" for a QOS or a Comparability Protocol. `nda` is only the wizard's routing default (`Projects.tsx` L180).
- **Correction:** state the not-offered verdict inside `harmonisedSupport`. Leave `describeUnmappedClass` and `unmappedSupport` untouched.

**R3-6. F-A and FD-11 are one decision.**
- **Correction:** record one ID, FD-11.

### Rule 1

**R1-1. The proposed "governing_rule after full replay" test cannot fail.**
- **Evidence:** the new file runs after `20260810c` (`migration-set.mjs` L991 vs after L3186) and re-sets provenance. The contract already checks the end state (contract L145).
- **Correction:**
  - After a full boot, re-run `20260810c_rule_pack_provenance.sql` alone and assert no class-pack row changed.
  - Add a static pin that no spec version outside csr/ib/protocol matches `/^ich-m4-/`.
  - Show it red by renaming one version to `ich-m4-x`.

**R1-2. Changeable facts would be frozen into immutable pack text.**
- **Evidence:**
  - The basisNotes carry "AnA composes Module 2.7 only from this project's own completed CSR builds" and "An application's Module 2.x is written in the application's own project".
  - The 2.6 label carries "· preparation worksheet" while FD-11 is still open.
  - `basisNote` becomes `uncertainties` (`filing-class-packs.ts` L192-197). The contract pins it (L146), and the emitter never rewrites a file (`emit-filing-class-packs.ts` L297-306). So any later change to either fact forces a new pack version.
- **Correction:** keep basisNotes to provenance and outline guidance only. Drop "preparation worksheet" from the 2.6 label until FD-11 is decided. The P-14 placement sentence lives once, in `classNotSequencedReason`.

**R1-3. The 2.6 version names a revision its basis does not.**
- **Evidence:** the version is `ich-m4s-r2-v1.0`, but the basis ref is "ICH M4S / FDA M4S" (`nonclinicalSummaryBlueprint.ts` L15).
- **Correction:** version `ich-m4s-v1.0`, label "× ICH M4S".

**R1-4. Red evidence for the header gate must not use a branch or worktree (Rule 0).**
- **Correction:** commit locally on `concept2cure-v2`, run the gate (red), then delete the never-pushed file, re-emit, amend the commit, and never push the red commit.

**R1-5. The replay case needs one more change.**
- **Evidence:** the plan moves `newestOnly` but not the `count` query (`check-constraint-replay.pglite.test.ts` L148-151).
- **Correction:** change `count` with it. The fixture also needs `agency TEXT`; the planner's correction #3 is confirmed (`20261020` L114-128).

**R1-6. The packs couple the contract to the record.**
- **Evidence:** any title, condition or flag change under 2.4/2.5/2.7, or in the 2.6 blueprint, turns the contract red (L141-142) until a new version is minted.
- **Correction:** every cleanup slice and task 17 that touches those rows lists `c2c-filing-class-packs.contract.test.ts` as a pin.

**Confirmed correct, no change needed:**
- `widenCheck` is conditional on `pg_get_constraintdef` (L77-92). The value count goes 46 → 48 → 49 → 50 as strict supersets, so the guards in `20260806b`, `20260810b`, `20261018`, `20261018c` and `20261020` hold on replay.
- ON CONFLICT DO NOTHING, and the exact-tree / node-count / one-live RAISE (L239-265).
- No table is created, so the tail stays last (`UUID_TENANT_ISOLATION_NONPUBLIC` L3520, `CHILD_TABLE_PARENT_SCOPE` L3537, `TENANT_ISOLATION_SWEEP` L3548).
- `LIKE 'ich-m4-%'` (`20260810c` L96-101) matches neither `ich-m4e-…` nor `ich-m4s-…`.

### Offers the platform cannot finish, P-14 and P-28

**P-1. A class project can still become an application, so "sends nothing for this one on its own" is false today for all 21 classes and would be for the four new ones.**
- **Evidence:**
  - `POST /api/submissions` checks only the market verdict (`server/routes/submissions.ts` L318-341).
  - `createSubmission` checks only the organization (`submission-service.ts` L315-320, `refuseForeignProgram` L283-292).
  - `insertSubmissionRow` refuses only regional device types (L254-257).
  - A `clin_overview` submission at `fda` is "offered" (author-only, ich fallback), and `isSameSubmissionType('clin_overview', 'clin_overview')` passes every read (`submission-request-read.ts` L79, L265).
  - New submission lets a person pick any application type for the open project (`NewSubmissionForm.tsx` L48-51, L132-138).
  - Assemble, freeze, dispatch and transmit sit on `submissions.ts` L1901, L2054, L2070, L2098, outside `ectd-compile.ts`.
  - The type-match rule exists only at anchoring (`assertMayAnchorTo`, L511-531).
- **Correction:** refuse at creation (Slice 3).

**P-2. Slice 7.1 on its own puts a false sentence on screen.**
- **Evidence:** `EctdCompile.tsx` L1002-1005 discards a 422 body and sets 'error'. `EctdModuleReadiness.tsx` L126-131 then says "Compilation readiness could not be read … Sign in to your tenant and retry". Regional device projects already show this today.
- **Correction:** add a not-applicable state that shows the server's reason (Slice 3).

**P-3. The slices land in an order that breaks Rule 2.**
- **Evidence:**
  - 2.4 class projects ship (Slice 1) before the 2.4 composer stops composing model-written studies (Slice 5). Reader F2 said not to point 2.4 users at that tool until it is fixed.
  - 2.5 ships before Slice 3. In an open 2.5 project, AnA would answer "Open the program, or name it" (`module2-csr-inputs.ts` L39-47).
- **Correction:** fixes first, then classes (new order below).

**P-4. `ctdProgramId` is chosen by the model, and no record links it to a project.**
- **Evidence:** `ctd_programs` has only organization and workspace keys (`shared/schema/csr-knowledge-db.ts` L717-745).
- **Correction:** the result names the CTD program it read and states that no link is recorded. File the missing link; do not claim P-14 holds for this path.

**P-5. Slice 5 leaves the tool definitions requiring model-written studies.**
- **Evidence:** `bla-biologics-tool-defs.ts` L419-450 (`studies` items; "when target-organ findings are supplied") and L615-650. The `load_nonclinical_program` description (L664) says "pass the returned arrays into the relevant tool".
- **Correction:** change the schemas and descriptions in Slice 2.

**P-6. F3 cannot stay optional.**
- **Evidence:** caller prose sets the 2.5.1 completeness flag (`m2-summary-builders.ts` L748). It is fed by AnA input (`AnaToolExecutor.ts` L15830) and a request body (`submission-orchestrator.ts` L979). That is a figure moved by the model (Rule 2).
- **Correction:** make it mandatory in Slice 1.

**P-7. Slice 7.2 reaches nothing.**
- **Evidence:** once compile, status, validate and filed-state refuse classes, the class branch in `required-sections.ts` (L207-218) has no route caller left:
  - compile and validate call it directly (`ectd-compile.ts` L675, L1579);
  - status reaches it through `measureStatus` (L1415);
  - `compile-placement` is called only from `ectd-compile.ts`;
  - `vault-coverage` answers classes first (L107-113).
- **Correction:** drop it; the CSR pin at `required-sections.test.ts` L131-137 stays.

**P-28:** no slice widens the boundary. The QOS/DS/DP strings state it as `composition-scope.ts` L5-8 does.

### Pins and gates the plan forgot

- **`tests/regulatory/submissionTypeBridge.test.ts`:** the aliases.
- **`server/services/ana/__tests__/nonclinical-clinpharm-tools.test.ts`:**
  - L118-135, L199-215 and L418-420 compose from supplied studies; they move in Slice 2.
  - L17 mocks the loader, and L345-390 use `ctx {organizationId:3, projectId:9}` with no `userId`; they move in Slice 1.
- **`server/services/__tests__/m2-summary-builders.test.ts` L195-245** and **`m2-summary-conclusions-from-recorded-fields.test.ts` L131** (F3).
- **`tool-selection.test.ts`, `tool-selection-tokenize.test.ts`, `tool-selection-carry-over.test.ts`** (2.4/2.6 tool definitions).
- **`tests/routes/ectd-compile-ident.test.ts`:** the regional regex `/device.*not.*eCTD/i` must still hold.
- **`client/src/concept2cure/v2/__tests__/ectdModuleReadiness.test.tsx`.**
- **`server/services/submission-service/__tests__/submission-program-anchor.pglite.test.ts`.**
- **`registryPickerOffers.test.tsx`:** a component chosen-offer case.
- **Gates:**
  - `ci:canvas-path` for AnA tool slices (inventory-plan rule, L30-31);
  - `ci:journey-migration-reachability` when the `createJourneyDb` list in `add-project-market.pglite.test.ts` changes;
  - `ci:migration-guard-order:selftest` and `ci:migration-deploy-path:selftest` (both run in pre-push);
  - the no-argument emitter run **before** emitting, not only after.

### False user-visible strings

- **"Not supported: the platform has no filing outline or channel for ICH / Global"** stays on 18 not-offered rows (plan: "not done"). Fix it in `harmonisedSupport` (Slice 4).
- **"places no document into another project's sequence"** is broader than what the code enforces. The server's own wording is "A filing can hold only its own project's documents" (`submission-service.ts` L3716). Use that.
- **"this platform sends nothing for this one on its own"** is false until P-1 is fixed.
- **The EctdModuleReadiness error text** (P-2).
- **"Show N more":** the picker actually reads "More filing types" / "Show {n} more filing types" (`AnaVerbs.tsx` L340, L348).

### Other session's files

- No owned file is edited.
- `AnaVerbs.tsx` (`d97388005`) and `Projects.tsx` (`daeb5cab9`, `d97388005`) are being edited by `session_01JbQUvBxcGHdBgkgAydQKpx`. The inventory plan treats files that session edits as theirs (L36-37). Send the message before the AnaVerbs commit and rebase onto their latest.
- `EctdCompile.tsx`, `EctdModuleReadiness.tsx` and `NewSubmissionForm.tsx` got decision-12 wording only. They are not owned, but name them in the message.

---

## 2. Corrected plan

# 3b: let biotech clients organize, build, customize and complete the CTD component filings (D2 / W1)

**Basics:**
- **Basis:** read at HEAD `0c69304aa`.
- **Evidence:** `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-3/`, README sections g–n.
- **Rule 0:** commit and push to `concept2cure-v2` only.
- **Order:**
  - Slices 1–4 have no migration and are independent of one another.
  - Slice 5 needs 1, 2 and 3.
  - Slice 6 needs 5.
  - Slice 7 needs 5, plus FD-11 for any "worksheet" wording.
  - Slice 8 is optional.
- **Unchanged:** the class rollout keeps the decided order (2.5/2.4, then 2.7, then 2.6). The ICH M2–M5 record and every Start-from template stay unchanged (`cross-sector-builtin-authoring-templates.test.ts` stays green).

## What already exists (Rule 3)

**Searches run:**
- the readers' lists;
- `templateWorkingBinding`, `resolveOpenProgram`, `resolveCsrScope`, `ECTD_NOT_APPLICABLE`, `readinessNotComputed`;
- the curated bridge aliases, `LEGACY_FILING_ID_ALIASES`, `isSameSubmissionType`, `APPLICATION_TYPE_MISMATCH`;
- `createSubmission`, `insertSubmissionRow`;
- `/sequences/:seqId/(assemble|freeze|dispatch|transmit)`;
- `EctdModuleReadiness`, `NewSubmissionForm`;
- `loadNonclinicalProgram`, `loadNonclinicalStudiesForProject`, `ctd_programs`;
- the 2.4/2.6 tool definitions;
- the eCTD header marker on every 2026-10 migration;
- `git log` on AnaVerbs, Projects and EctdCompile;
- `inventory-plan.md`.

| ID | Path : line | What it does today | What it does not do |
|---|---|---|---|
| E1 | `shared/regulatory/filing-document-classes.ts` L40-57, L59-97 (ICH block L88-94), L137-145 | 21 classes. One ICH sentence: "placed into an application's sequence". | No component class. |
| E2 | `server/services/c2c/filing-class-packs.ts` L89-120 (csr L104, dsur L109), L129-198 | Mints each pack from `getRegistryDocumentTemplate`. Nests by prefix (L159-164). `basisNote` becomes uncertainties (L192-197). | — |
| E3 | `scripts/db/emit-filing-class-packs.ts` L42, L55-92, L105-269, L271-310 | Emits unseeded versions; conditional strict-superset CHECK; RAISE assertions; never rewrites a file. | Writes no `eCTD REGULATORY AUDIT CONTEXT` marker. The four emitted files lack it; the gate is `require-migration-headers.sh` L69-76 / L114, run at `ci.yml` L76, base `HEAD~1` on a push. |
| E4 | `migrations/20261018_*`, `20261018c_*`, `20261019b_*`, `20261020_*` (doc_type 46 values; agency widened L114-128) | The precedent pack files. | — |
| E5 | `scripts/db/migration-set.mjs` L991, L3142-3186, L3520 / L3537 / L3548 | Applier order; one transaction per file. | — |
| E6 | `migrations/20260810c_rule_pack_provenance.sql` L96-101 | Re-attests `ich-m4-%` versions on every deploy. | — |
| E7 | `migrations/20260528_phase9_document_schema.sql` L73-118, L212-218 | Packs table, the CHECKs, counted readiness (empty headings not counted). | — |
| E8 | `server/services/c2c/document-class.ts` L47-67, L77-85, L143-149, L183-196 | Class map and agency map. | — |
| E9 | `server/routes/c2c/project-intake.ts` L33-57, L69-78, L238-269 | Accepts classes; a class gets no spine; the product class is required. | — |
| E10 | `server/routes/c2c/projects.ts` L100-112, L685, L722-729, L795, L942-953 | 422 before SQL; scaffold against `documentAgencyFor`. | No per-filing reason. |
| E11 | `server/services/regulatory/market-support.ts` L135-153, L165, L208-244, L417-447, L527-569, L587-650, L657 | One verdict per (type, market). `harmonisedSupport` returns null for a non-ICH-class type (L550). | No per-filing reason. |
| E12 | `server/routes/submissions.ts` L318-341, L418-447; sequence routes L1901 / L2054 / L2070 / L2098 | Create checks the market verdict only; sequence assemble / freeze / dispatch / transmit. | Does not refuse a class project or class type. |
| E13 | `client/src/concept2cure/v2/surfaces/Projects.tsx` L121-181 (class L130-131), L186-189, L692, L880 | Class checked first; "covers drugs and biologics; the project records which"; Review shows "<Class> — <submissionFormat>". | No edit needed. |
| E14 | `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` L23-27, L52-87, L113-141 (refusal L133), L340-366 | Not-offered rows show `row.offer.reason`. | No per-filing reason. |
| E15 | `shared/regulatory/filing-catalog.ts` L123, L163-230 (L196-197) | `clin_overview` and siblings are legacy catalog aliases. | — |
| E16 | `shared/regulatory/global-document-registry.ts` L310-312, L471-475; imports only `document-taxonomy` (L12-22) | The seven rows with `ctdModule`. | — |
| E17 | `server/services/market-specs/document-template-library.ts` L115-116, L146-180, L213-214, L255-266, L464-480, L497-516 | QOS / 2.4 / 2.5 / 2.7 / DS / DP are record projections; 2.6 is the dedicated blueprint. | — |
| E18 | `server/services/market-specs/ctd-component-outlines.ts` L49-60, L129-150, L171-203 | Subtree, nesting, `requiredOf`; basis label is `ref`-only (`regulatory-basis.ts` L132-140). | — |
| E19 | `server/services/regulatory/registry/blueprints/nonclinicalSummaryBlueprint.ts` L14-24, L41-57 | 2.6 from both halves; all rows required; ref "ICH M4S / FDA M4S". | — |
| E20 | `server/services/authoring/builtin-authoring-templates.ts` L86-124, L169-172; `templateCatalog.ts` L41-49 | Start-from names, e.g. "GLOBAL · Quality Overall Summary (QOS)" and "GLOBAL · Module 3.2.S — Drug Substance — preparation worksheet". | No test pins the names. |
| E21 | `server/services/authoring/authoring-template-sections.ts` L143-146 | A Start-from copy is unbound. | — |
| E22 | Live application packs: nda:fda and bla:fda `ich-m4-v2.2` (`20261005` L119-124), maa:ema `ich-m4-v2.1` (`20260804` L89-90), ind:fda `ich-m4-v2.2` (`20260902` L68-69) | Each holds 2.3, 2.4, 2.5, 2.6, 2.7, 3.2.S and 3.2.P (verified by grep). | — |
| E23 | `docs/design/FILING_SPINE.md` L251-256; P-14; `submission-service.ts` L3697-3730 | Modules 2–5 are written in the application project. "A filing can hold only its own project's documents". | — |
| E24 | `migrations/_generated/phase9_rule_packs.json` | `mod3:ich` has four flat rows (via dmf); `mod2:ich` is reached by nothing. | — |
| E25 | `routing-after.txt` | us_dmf / eu_asmf → dmf → mod3:ich, author-only; eu_maa author-only. | Predates the regional classes. |
| E26 | `server/services/cmc/composition-scope.ts` L5-8, L224-226; `cmc-quality-summary-tool.ts` L1-40, L61 (`MODEL_SUPPLIED_CMC_REFUSAL`) | P-28; QOS composed from CMC records; supplied data refused. | — |
| E27 | `module2-csr-inputs.ts` L31-62; `csr/load-csr-inputs-for-project.ts` L122-141; `csr/project-scope.ts` L24-30, L61-79, L85-101; `program-access.ts` L232-252; `AnaToolExecutor.ts` L5917-5948, L15785-15870 | The 2.5 / 2.7 composers. | Pass no actor (403); never read `projectRef`; 2.5 reads artifacts by the model's `project_id` (L15809, L15852). |
| E28 | `AnaToolExecutor.ts` L5567-5605, L5659-5697, L5770-5795; `bla-biologics-tool-defs.ts` L419-450, L615-650, L660-670; `nonclinical-program-loader.ts` (`CtdProgramNotFoundError`); `load-nonclinical-studies-for-project.ts` L40-58 | The 2.4 / 2.6 composers and the loader tool. | Compose model-written studies; `ctd_programs` has no project link. |
| E29 | `server/services/m2-summary-builders.ts` L407 / L758 / L928 (`sectionKey`), L671, L748 | Root-keyed output; caller prose counts toward 2.5.1 completeness. | — |
| E30 | `shared/regulatory/filing-section-key.ts` L20-28 | Writes into a node or its undivided ancestor. | — |
| E31 | `required-sections.ts` L197-218; `vault-coverage.ts` L103-114; `add-project-market.ts` L113-129; `ProjectMarkets.tsx` L359-365; `DispatchReadiness.tsx` L314-317; `product-types.ts` L295-334 | Generic class readers. | — |
| E32 | `server/routes/ectd-compile.ts` L332-339, L671 / L1395 / L1533 / L1567; `EctdCompile.tsx` L998-1006; `EctdModuleReadiness.tsx` L124-131 | Refuses regional device projects. | The client shows a refusal as "could not be read". |
| E33 | `server/services/report-os/orchestrator.ts` L122-126, L148-168; `project-bootstrap.ts` L953-956; `program-registry-context.ts` L66-90 | Evaluates the registry blueprint against the legacy `sections` table. | — |
| E34 | `shared/regulatory/submission-type-bridge.ts` L81-131 (`'DSUR'` L126), L146-150, L186 | Alias map; `isSameSubmissionType`. | `'clin_overview'` resolves nothing. |
| E35 | `server/routes/c2c/documents.ts` L408-604, L739, L839-900 | Customize, lock, and submit by external attestation. | — |
| E36 | The precedent tests (the plan's list) plus `submissionTypeBridge.test.ts`, `submission-program-anchor.pglite.test.ts`, `ectdModuleReadiness.test.tsx`, `nonclinical-clinpharm-tools.test.ts` | The suites each slice extends. | — |
| E37 | Deleted: `client/src/concept2cure/authoring/` (`2895218b8`), `Module2SummaryPage.jsx` and siblings (`83fa7f6cf`), `CTDProjectWizard.tsx` (`8ba28dc0d`) | None is rebuilt here. | — |
| N1 | `submission-service.ts` L119-136 / L156-180 (error codes), L249-272 (`insertSubmissionRow`, `DEVICE_PREPARATION_ONLY` L254), L283-292, L315-370, L511-531 (`assertMayAnchorTo`) | Creation and anchoring. | Creation does not refuse a class project or class type. |
| N2 | `client/src/concept2cure/v2/surfaces/NewSubmissionForm.tsx` L48-51, L132-138 | A person picks the application type for the shell project. | — |
| N3 | `cleanup/inventory-plan.md` S44 (L571-579), S48 (L599-607), H11 (L747), FD-11 (L809) | The overlapping cleanup slices. | — |
| N4 | `server/services/ind/ctd/section-brief.ts` L153-160; `authoring-guidance.ts` (2.6.3 / 2.6.5 / 2.6.7 `generationPrompt`: "do not fabricate data") | The drafting brief carries guidance, content and pitfalls. | Does not carry `generationPrompt`. |

## Decided at session level

- **docType names:** `clin_overview`, `nonclin_overview`, `clin_summary`, `nonclin_summary`. Each is the catalog's legacy alias (E15), as `csr` and `sap` are.
- **Labels:** lowercase and singular: "clinical overview", "nonclinical overview", "clinical summary", "nonclinical summary".
- **Versions:**
  - `ich-m4e-r2-v1.0` for 2.5 and 2.7;
  - `ich-m4s-r2-v1.0` for 2.4 (its template names M4S(R2));
  - `ich-m4s-v1.0` for 2.6 (its basis names M4S only).
  - None matches `ich-m4-%`.
- **Provenance:** `harmonised_standard`, confidence `medium`.
- **2.6 flags:** the served outline's, 34 of 34 required.
- **Component identity:** derived from the registry's `ctdModule`. No new field.
- **Per-filing reason:** `FilingOffer.reasonByFiling`, set only in `harmonisedSupport`.
- **Model-supplied figures:** 2.4 and 2.6 refuse them (the `MODEL_SUPPLIED_CMC_REFUSAL` and S44 precedent). 2.5 and 2.7 keep ignore-and-report (the `module2-csr-inputs` precedent).
- **basisNotes:** provenance and outline guidance only.

## Gates for every slice

1. `npm run ci:typecheck:no-regression -- --incremental` (0 errors, baseline 0).
2. `npm run ci:eslint-ratchet:since -- origin/concept2cure-v2`.
3. The named suites, plus every test file `git grep -l` finds for the touched symbols.
4. `npm run ci:unreferenced-modules`.
5. A slice that touches an AnA tool or drafting: `npm run ci:canvas-path`.
6. A slice with a migration:
   - `ci:migration-drop-safety` and `:selftest`;
   - `ci:migration-set-order`;
   - `ci:migration-guard-order` and `:selftest`;
   - `ci:migration-deploy-path` and `:selftest`;
   - `ci:migration-prefix-collisions`;
   - `ci:check-rule-pack-provenance`;
   - `./scripts/ci/require-migration-headers.sh`;
   - `ci:journey-migration-reachability`;
   - `npx tsx scripts/db/emit-filing-class-packs.ts` with no argument, before emitting (only the new specs UNSEEDED) and after (exit 0);
   - `npm run test:schema-contract`.
7. `cross-sector-builtin-authoring-templates.test.ts` stays unchanged and green.
8. Rule 0.

---

## Slice 1: Fix where the 2.5 and 2.7 composers read their CSRs (complete `module2-csr-inputs.ts`)

**Relies on:** E27, E29, E23.

### Changes

1. **`server/services/ana/module2-csr-inputs.ts`:**
   - `Module2Context` gains `userId` and `projectRef` (ToolContext L307, L330).
   - Scope input:
     - `projectRef` matching `looksLikeProgramUuid` → `{ programId: projectRef }`;
     - otherwise `ctx.projectId` → `{ projectId }`;
     - no open project but `input.project_id` → `{ projectId: input.project_id }` (the `catalogDocumentBoundary` precedent, `ana/catalog-scope.ts` L88-95);
     - none of these → `needs_project`.
   - Call `resolveCsrScope(db, org, scopeInput, { forWrite: false, actorUserId: ctx.userId })` (`csr/project-scope.ts` L85).
   - If a project is open and `input.project_id` differs from the resolved `projectId` → `{ ok:false, status:'cross_project', code:'CROSS_PROJECT' }`.
   - Catch `CsrScopeError` → `{ ok:false, status: err.status === 403 ? 'access_denied' : 'needs_project', code: err.code, message }`.
   - Then call `loadCsrInputsForProject(org, scope.projectId, { actorUserId: ctx.userId })`.
   - Every arm carries the resolved `projectId` when one exists.
   - Messages say "project" (decision 12), e.g. "This project has no completed clinical study report, so there is nothing to compose Module 2.5 from…".
2. **`server/services/ana/AnaToolExecutor.ts`, 2.5 handler (L15806-15870):**
   - Delete the model-supplied `projectId` at L15809.
   - `readProgramArtifacts` (L15852) takes `sourced.projectId`.
   - The 2.7 handler (L5917) is unchanged apart from the new statuses.
3. **`server/services/m2-summary-builders.ts` L748:** 2.5.1 no longer counts caller text. It is `false`, as 2.5.2 is at L749, because no recorded input exists. The rationale still renders at L671. Update the comment at L740-742.

### Tests (red first)

- **New `server/services/ana/__tests__/module2-csr-inputs.pglite.test.ts`**, in the shape of `csr-latest-completed-generation.pglite.test.ts`, without mocking the loader:
  - a uuid project with a completed build gives `ok` (red: `needs_project`);
  - a numeric `ctx.projectId` with `userId` gives `ok` (red: 403 `CSR_PROJECT_ACCESS_DENIED`);
  - another project's `project_id` gives `CROSS_PROJECT`;
  - a class project with no builds gives `needs_data`;
  - an actor who is not a member gives `access_denied`.
- **`nonclinical-clinpharm-tools.test.ts` L345-420:** also mock `../../csr/project-scope.js` `resolveCsrScope` → `{ projectId: 9 }` and pass `userId`. Each expectation keeps its meaning.
- **`m2-summary-builders.test.ts` L195-245** and **`m2-summary-conclusions-from-recorded-fields.test.ts` L131:** completeness without 2.5.1 (red on HEAD).
- **Re-run:** `new-tool-handlers.test.ts`, `ana-tools-read-the-ctd-record.test.ts`, `tool-plan-labels.test.ts`, `csr-latest-completed-generation.pglite.test.ts`, `tests/unit/orchestrator-dry-run-identity.test.ts`, `tests/golden-journeys/submission-release-signature.journey.test.ts`.

**Evidence:** `3b-s1-csr-inputs-red.txt`, README §g.

**What a person sees:**
- In a project with completed CSR builds, AnA's 2.5 and 2.7 composers compose.
- In a component project with none, the answer is "This project has no completed clinical study report…", and 2.5 falls back to its outline mode.
- 2.5 completeness no longer rises because AnA wrote a rationale.

**Not done:** composing from another project's CSRs (F-C, P-14).

---

## Slice 2: The 2.4 and 2.6 composers compose only recorded studies (Rule 2); this is cleanup S44's composer half, done once

**Relies on:** E28, N3.

### Changes

1. **`AnaToolExecutor.ts` L5567 (2.4) and L5770 (2.6):**
   - A call that carries `studies` or `findings` is refused with `MODEL_SUPPLIED_NONCLINICAL_REFUSAL`, copying `cmc-quality-summary-tool.ts` L38-40 and L61.
   - The handlers require a positive integer `ctdProgramId` and read `loadNonclinicalProgram(ctdProgramId, ctx.organizationId)`:
     - `undefined` → `{status:'unavailable'}` (`PRECLINICAL_REVIEWER_ENABLED` off, or an invalid id);
     - `CtdProgramNotFoundError` → `{status:'not_found'}`;
     - `rowCount 0` → `{status:'needs_data'}`;
     - otherwise compose with `studies: loaded.studies` and no findings.
   - The result carries `source: { ctdProgramId, studies: rowCount }`, `adversityProfile: 'not composed: no target-organ findings are recorded'` and the instruction: "This CTD nonclinical program is not linked to the open project by any record; confirm it is this product's before using the draft."
2. **`AnaToolExecutor.ts` L5687:** the instruction becomes "Call draft_nonclinical_overview_m2_4 / draft_nonclinical_summaries_m2_6 with this ctdProgramId; never pass studies or findings."
3. **`server/services/ana/bla-biologics-tool-defs.ts`:**
   - L419-450 and L615-650: `input_schema` drops `studies` and `findings` and requires `ctdProgramId`. The descriptions say they compose the recorded studies of the named CTD program, refuse supplied studies, and leave the adversity profile uncomposed. Each stays at or under 1,024 characters.
   - L664 (`load_nonclinical_program`): drop "then pass the returned arrays into the relevant tool" for the two composers.
4. **`cleanup/inventory-plan.md` S44 (L571-579):**
   - The handler bullet reads "done in 3b Slice 2 (`<sha>`)".
   - Its loader is `loadNonclinicalProgram`, not `loadNonclinicalStudiesForProject` (builder shape, E28).
   - Its heading, `m26-m4-view` and `POST /document` bullets stay in the cleanup lane.

### Tests (red first)

- **`nonclinical-clinpharm-tools.test.ts`:**
  - L118-135, L199-215 and L418-420 become refusals (red: they compose today).
  - New cases with `../../preclinical/nonclinical-program-loader.js` mocked: `undefined` → unavailable; `[]` → needs_data; rows → drafted with `source.ctdProgramId`; `CtdProgramNotFoundError` → not_found.
- **Re-run:** `tool-selection*.test.ts`, `nonclinical-m24-adapter.test.ts`, `m26-nonclinical-summaries.test.ts`.

**Evidence:** `3b-s2-nonclinical-composers-red.txt`, README §h.

**What a person sees:** AnA no longer writes NOAELs, GLP status or adversity classes from conversation text. Without ingested studies it says so.

**Not done (filed):**
- `assess_nonclinical_safety`, `compute_fih_dose` and `assess_nonclinical_program` still take model input.
- No record links `ctd_programs` to a project (P-4).
- `drugSubstanceName` and `indication` are still narration from the call.

---

## Slice 3: A class project never becomes an application (creation, eCTD doors, readiness digest)

**Relies on:** N1, N2, E12, E31, E32, E33.

### Changes

1. **`server/services/submission-service/submission-service.ts`:**
   - Add `'NOT_AN_APPLICATION'` to `SubmissionErrorCode` (L119-136) with status 422 (L156-180).
   - In `insertSubmissionRow`, after L254, a class `applicationType` is refused: "`${filingTypeInSentence(c.docType)}` is authored as its own project, not created as a submission. `${classNotSequencedReason(c)}` Nothing was created." The wording copies `add-project-market.ts` L125-128.
   - `refuseForeignProgram` (L283-292) also returns `program_type`, in one query.
   - `createSubmission` (L319) and `createSubmissionTx` (L368) refuse a class project: "No submission is created for this project: it is `${filingTypeInSentence(c.docType, true)}`. `${classNotSequencedReason(c)}` Nothing was created." This copies `add-project-market.ts` L120-123.
   - A regional device project gets `DEVICE_PREPARATION_ONLY`: "This project is a regional device preparation outline; it does not support canonical submission creation. Nothing was created."
   - Intake is unaffected: `DRUG_APPLICATION_TYPES` holds no class.
2. **`server/routes/ectd-compile.ts` L332-339:**
   - Extend `refuseRegionalDeviceEctd` into `refuseNonApplicationEctd`. Its regional message is unchanged.
   - A filing class answers 422 `ECTD_NOT_APPLICABLE`: "This project is `${filingTypeInSentence(c.docType, true)}`, authored here and not compiled as an eCTD sequence. `${classNotSequencedReason(c)}`"
   - The same four call sites: L671, L1395, L1533, L1567.
3. **`client/src/concept2cure/v2/surfaces/EctdCompile.tsx` L998-1006:** a 422 whose `error.code` is `ECTD_NOT_APPLICABLE` sets `statusState 'not_applicable'` and keeps `error.message`.
4. **`EctdModuleReadiness.tsx` L124-131:** the state union gains `'not_applicable'`, rendered as `EmptyState` with title "Not compiled as an eCTD sequence" and hint set to the server message. This also corrects regional device projects.
5. **`server/services/report-os/orchestrator.ts` L163-168:** when `filingDocumentClassForFiling(registryId)` matches, call `readinessNotComputed('this project is ' + filingTypeInSentence(c.docType, true) + ", a document rather than an application; its completion is the approved or locked share of its governed outline, on the project's dossier.")`. This copies L167 and applies to every class, deliberately. It is independent of cleanup S48, which changes the blueprint, not this branch.

**Not changed:** `required-sections.ts` L207-218. After item 2 it has no route caller left (P-7). The CSR pin at `required-sections.test.ts` L131-137 stays.

### Tests (red first)

- **`submission-program-anchor.pglite.test.ts`:**
  - an `applicationType 'csr'` submission → 422 `NOT_AN_APPLICATION`, nothing written;
  - an `nda` submission anchored to a CSR project → refused;
  - an NDA project still creates.
  - Red: all three are created today.
- **`tests/routes/ectd-compile-ident.test.ts`:** `csr` and `pas` × compile / status / validate / filed-state → 422 with the class sentence. The regional regex still passes.
- **`ectdModuleReadiness.test.tsx`:** `not_applicable` shows the reason, and never "could not be read".
- **`report-os/__tests__/orchestrator-readiness.test.ts`:** `ICH_CSR` → not computed with the class reason. Pin on "not computed", not on blueprint codes (S48 moves them).
- **Re-run:** `newSubmissionRegionStatement.test.tsx`, the `projects-create*` suites, `required-sections.test.ts`, `vault-coverage.test.ts`, the submission-center tests.

**Evidence:** `3b-s3-class-not-an-application-red.txt`, README §i. The README also records a read-only query to run on a deployed database: submissions whose project's `program_type` is a class.

**What a person sees:**
- New submission on a class project answers with the class sentence.
- The eCTD compile surface says why the project is not compiled.
- A class project's readiness digest says why it is not computed.

**Not done (filed):**
- The general `isSameSubmissionType` check at creation (it exists at anchoring, L511-531).
- Sequences on any submission already anchored to a class project.

---

## Slice 4: Name where the QOS, drug substance and drug product are written, and correct the ICH / Global refusal

**Relies on:** E11, E10, E14, E16, E20-E26.

### Changes

1. **`server/services/regulatory/market-support.ts`:**
   - `FilingOffer` (L135-153) gains `reasonByFiling?: Readonly<Record<string, string>>`. Doc comment: "a reason of its own for named registered filings where one sentence cannot be true of every filing that asks this (type, market); the tier is unchanged."
   - `offerOf` (L165) gains an optional fourth parameter.
   - Export `WRITTEN_IN_THE_APPLICATION_PROJECT`, keyed `ICH_QOS`, `ICH_M3_DS`, `ICH_M3_DP`, with these strings:
     - **QOS:** "Not offered as its own project: a Quality Overall Summary summarises its application's Module 3, so it is written in that application's project (an IND, NDA, BLA or MAA) as Module 2.3, or started there in Authoring from “GLOBAL · Quality Overall Summary (QOS)”. For a small-molecule US IND, AnA composes it from the project's CMC / Module 3 records."
     - **DS:** "Not offered as its own project: drug substance quality is Module 3.2.S of its application, written in that application's project (an IND, NDA, BLA or MAA), or started there in Authoring from “GLOBAL · Module 3.2.S — Drug Substance — preparation worksheet”; for a small-molecule US IND it is composed there in CMC / Module 3. A drug substance filed on its own by its holder is a Drug Master File (US) or an Active Substance Master File (EU): choose that filing type instead."
     - **DP:** "Not offered as its own project: drug product quality is Module 3.2.P of its application, written in that application's project (an IND, NDA, BLA or MAA), or started there in Authoring from “GLOBAL · Module 3.2.P — Drug Product — preparation worksheet”; for a small-molecule US IND it is composed there in CMC / Module 3."
     - **Basis for each clause:** E22, E20, E21 ("started there", never "is its 2.3"), E26/P-28 and E25. A DMF's outline depth is deliberately not claimed (E24).
   - **`harmonisedSupport` (L545-569).** Where it returns null today (L550), for a type that is not an ICH-pack class, return the not-offered statement:
     - `agency 'ICH'`, `region null`;
     - outline `{ state:'unmapped', pack:null, detail:'ICH / Global names no agency, so no outline or channel is mapped for an application there' }`;
     - module1 `{ state:null, detail:'ICH takes no filing, so there is no Module 1' }`;
     - channel `{ state:'none', detail:'ICH takes no filing' }`;
     - `summary 'Not offered'`;
     - line "Not offered: ICH is no jurisdiction and takes no filing, and this filing is not authored here as a project of its own";
     - `buildable false`, `offered false`;
     - offer `offerOf('not_offered', line + '.', null, WRITTEN_IN_THE_APPLICATION_PROJECT)`.
     - Update the docstring at L527-541.
   - `unmappedSupport` and `describeUnmappedClass` stay unchanged.
2. **`server/routes/c2c/projects.ts` L728-729:**
   ```ts
   const own = offer.reasonByFiling?.[resolveFilingCatalogEntry(submissionTypeId ?? '')?.registryId ?? ''];
   ```
   Then `sendFilingNotOffered(res, own ? { ...offer, reason: own } : offer)`. `resolveFilingCatalogEntry` is already imported (L46).
3. **`client/src/concept2cure/v2/surfaces/AnaVerbs.tsx`.** Send the message first, then rebase on `d97388005`'s successors.
   - `FilingOfferView` (L23-27) gains `reasonByFiling?`.
   - At L133 the reason is the entry whose key equals `e.id`, compared lowercased (the `appliesTo` precedent, L135-136), otherwise `row.offer.reason`.

### Tests (red first)

- **`server/services/regulatory/__tests__/market-support-offer.test.ts`:**
  - `(nda, 'ICH / Global')` has tier `not_offered`, the new line, and `reasonByFiling` with exactly the three keys and strings;
  - `(nda, 'FDA')` has none;
  - `(dmf, 'FDA')` and `(dmf, 'EMA')` are author-only with a `mod3:ich` outline.
- **`registryPickerOffers.test.tsx`,** copying L116-125:
  - a search for "Quality Overall Summary" shows the QOS sentence;
  - "Comparability" shows the new generic sentence.
- **`server/routes/c2c/__tests__/projects-create-market-offer.test.ts` `BEFORE_SQL` (L136-151):**
  - `nda` / "ICH / Global" / `ich_m3_ds` → 422 matching `/^Not offered as its own project: drug substance quality is Module 3\.2\.S/`;
  - `ich_comparability` → the generic sentence.
- **Pins that keep the sentences true** (each shown failing when its fact is broken):
  - every quoted Start-from name is a `getBuiltinAuthoringTemplates()` name;
  - in the pack contract boot, live ind:fda, nda:fda, bla:fda and maa:ema hold keys 2.3, 3.2.S and 3.2.P;
  - no `(nda, 'ICH / Global')` line or detail says "No document agency is defined" or "no filing outline".
- **Re-run:** `market-support.test.ts`, `marketSupportLine.test.tsx`, `newProjectWizardNotOffered.test.tsx`, `add-project-market.pglite.test.ts`.

**Evidence:** `3b-routing-before.txt`, captured before this slice. Its columns are those of `routing-after.txt`: catalog id | family | `programTypeFor` | doc_type | tier | pack. It is produced from `programTypeFor` and `marketSupport` over the live pack set, with the script filed beside it. Also `3b-s4-quality-reasons-red.txt`, README §j.

**What a person sees:**
- A picker search for QOS, 3.2.S or 3.2.P shows where each is written.
- Every other ICH / Global row reads "Not offered: ICH is no jurisdiction and takes no filing…".
- A stale wizard gets the same sentence as its 422 banner.

---

## Slice 5: Reach 2.5 Clinical Overview and 2.4 Nonclinical Overview as author-only ICH filing document classes

**Relies on:** Slices 1–3, plus E1-E7, E9, E11, E13, E15-E18, E22, E23, E31, E34, E36.

**One commit:** class rows, specs, emitter header, emitted file, set entry and test lists, as `76e812360` did.

### Changes

1. **`shared/regulatory/filing-document-classes.ts`:**
   - After `dsur` (L94), add:
     ```ts
     // ── CTD Module 2 components (ICH M4), each the document of its own project (D2 3b) ──
     { docType: 'clin_overview', packAgency: 'ich', label: 'clinical overview', registryIds: ['ICH_CLIN_OVERVIEW'] },
     { docType: 'nonclin_overview', packAgency: 'ich', label: 'nonclinical overview', registryIds: ['ICH_NONCLIN_OVERVIEW'] },
     ```
   - Import `getApplicationType` from `./global-document-registry` (no cycle, E16). Add:
     ```ts
     /** The CTD Module 2 code a harmonised class's document is, read from its registry row; null for any other class. */
     export function ctdComponentOf(c: FilingDocumentClass): string | null {
       if (c.packAgency !== 'ich') return null;
       const m = getApplicationType(c.registryIds[0])?.ctdModule ?? '';
       return /^2\.[2-7]$/.test(m) ? m : null;
     }
     ```
   - In `classNotSequencedReason` (L137-145), before the ICH branch, copying the PAS/CBE branch:
     ```ts
     const code = ctdComponentOf(c);
     if (code) return `An application's Module ${code} is written in the application's own project. ${filingTypeInSentence(c.docType)} authored here stays this project's document: a filing holds only its own project's documents, and this platform sends nothing for this one on its own.`;
     ```
     "Sends nothing" is true from Slice 3. The CSR, protocol, IB, SAP, ICF and DSUR keep their sentence (pins `registryPickerOffers.test.tsx` L221, `projects-create-market-offer.test.ts` L277, `add-project-market.pglite.test.ts` L228).
   - Add a header paragraph: components are classes for P-14; their code comes from the registry row.
2. **`market-support.ts` `harmonisedSupport`.** When `ctdComponentOf(documentClass)` is set:
   - `channel.detail`: "a filing holds only its own project's documents, and this platform sends nothing for this one on its own";
   - `line`: `${lead}: authored here as its own document; an application's Module ${code} is written in the application's own project`.
3. **`server/services/c2c/filing-class-packs.ts`.** After L109, add (with `<D>` the commit date):
   ```ts
   { docType: 'clin_overview', agency: 'ich', version: 'ich-m4e-r2-v1.0', label: 'Clinical Overview × ICH M4E(R2) · CTD 2.5', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: null, minted: '<D>',
     basisNote: "ICH M4E(R2) 2.5 headings to the depth the platform's ICH M2–M5 record holds them, 2.5.6.1–2.5.6.5 included; each heading is recalled, and a verbatim re-read of M4E(R2) 2.5.6 is owed. 2.5.6.5 is conditional (when used): a document with no appendix says so in that section." },
   { docType: 'nonclin_overview', agency: 'ich', version: 'ich-m4s-r2-v1.0', label: 'Nonclinical Overview × ICH M4S(R2) · CTD 2.4', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: null, minted: '<D>',
     basisNote: "ICH M4S(R2) 2.4.1–2.4.6 headings from the platform's ICH M2–M5 record, recalled; not re-read against the guideline text." },
   ```
   Name the new file in the header comment (L15-22).
4. **`scripts/db/emit-filing-class-packs.ts` `render()` (L138-164).** Prepend, inside the first 40 lines:
   ```
   -- =============================================================================
   -- eCTD REGULATORY AUDIT CONTEXT
   -- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
   -- Compliance: 21 CFR Part 11 (11.10(a), 11.10(e)), ALCOA+ principles
   -- Purpose: seed ${packs.length} filing class rule pack(s) as new immutable versions
   --
   -- eCTD/CTD Context:
   --   - Module(s): the filing class outlines named below; no application dossier pack is changed
   --   - Integrity Risk Addressed: a project scaffolded against an outline other than its filing's own
   --
   -- Determinism Contract:
   --   - Literal trees generated from server/services/c2c/filing-class-packs.ts; a changed outline is a new version in a new file
   -- =============================================================================
   ```
   The file doc comment says: files emitted before `<D>` carry the earlier header, so a confirm run against them reports REFUSED by design, and no gate runs confirm mode.
5. **Emit.**
   - Run `npx tsx scripts/db/emit-filing-class-packs.ts` with no argument first: exactly these two are UNSEEDED.
   - Then run `… migrations/<D>_ctd_component_class_packs.sql`.
   - Expected content:
     - `clin_overview:ich ich-m4e-r2-v1.0`: 14 nodes; 2.5.6, 2.5.6.1 and 2.5.6.1.1–2 nested; 2.5.6.5 not mandatory, all others mandatory.
     - `nonclin_overview:ich ich-m4s-r2-v1.0`: 6 nodes, all mandatory.
     - The doc_type CHECK widened conditionally from 46 to 48 values; the agency CHECK untouched.
     - The `expected` JSON with 14 and 6; the RAISE loop.
6. **`scripts/db/migration-set.mjs`.** Insert directly after L3186, before the `20261006_document_data_dispositions` comment, with a comment in the L3178-3185 style:
   - minted from `getRegistryDocumentTemplate`;
   - CHECK widened only while needed;
   - versions avoid `ich-m4-%`;
   - ON CONFLICT DO NOTHING, provenance after 20260810c, exact-tree and one-live RAISE;
   - creates no table, so the sweeps stay last.
7. **`shared/regulatory/submission-type-bridge.ts` (L81-131).** Add `'CLIN_OVERVIEW': 'ICH_CLIN_OVERVIEW'` and `'NONCLIN_OVERVIEW': 'ICH_NONCLIN_OVERVIEW'`, copying `'DSUR'` at L126.

### Tests (each red on trunk first)

- **`tests/schema-contract/c2c-filing-class-packs.contract.test.ts`:**
  - Add `COMPONENTS` to `CLASS_FILES` (L51) and `PACK_FILES` (L54-73, after 20261020), and exclude it in the `'before-corrections'` filter (L78).
  - Depth cases (copy L160-171):
    - no `2.5` key;
    - `2.5.6.1.1` has parent `2.5.6.1`;
    - only `2.5.6.5` is not mandatory;
    - 2.4 is exactly 2.4.1–2.4.6.
  - Scaffold (L237-238): `clin_overview`/'ICH' gives 14; `nonclin_overview` gives 6.
  - Falsifiability (copy L345-361): boot without COMPONENTS, insert a `clin_overview:ich ich-m4e-r2-v1.0` row with 2.5.6.5 flipped, and applying COMPONENTS throws "tree matches: false".
  - E6 avoided:
    - after the full boot, apply `20260810c` alone and assert no class-pack row's `confidence`/`governing_rule` changed;
    - a static pin that no spec outside csr/ib/protocol has `/^ich-m4-/`;
    - shown red with a renamed version.
- **`tests/schema-contract/check-constraint-replay.pglite.test.ts` L118-152:**
  - add `20261020_regional_device_application_packs.sql` and the new file;
  - fixture `agency TEXT`;
  - `newestOnly` and `count` on `'clin_overview'`;
  - update the case name and header L18-27.
- **`market-support-offer.test.ts` L172-197:**
  - add both packs and both types at "ICH / Global";
  - the reason matches `/An application's Module 2\.5 is written in the application's own project/` and not `/placed into an application's sequence/`.
- **`projects-create-market-offer.test.ts`:** after L280, copy the CSR case for `clin_overview` / "ICH / Global" / `ich_clin_overview` (201, author-only, scaffold with ICH, no `createSubmissionTx`). Red: 400.
- **`project-intake-class.test.ts` L38-52:** "A clinical overview", "A nonclinical overview".
- **`wizardFilingType.test.ts` after L226:** `ich_clin_overview` → `clin_overview`, `ich_nonclin_overview` → `nonclin_overview`; `ich_qos`, `ich_m3_ds` and `ich_m3_dp` stay `nda` (decision 4).
- **`registryPickerOffers.test.tsx`:** `renderPicker(vi.fn(), 'ich_clin_overview')` → chosen offer matches `/^Author documents for this market\. Author the documents here\. An application's Module 2\.5/`.
- **`builtin-templates-carry-whole-outline.test.ts` L19-23:** add `['ICH_CLIN_OVERVIEW','clin_overview']` and `['ICH_NONCLIN_OVERVIEW','nonclin_overview']`.
- **`add-project-market.pglite.test.ts`:** add the file to the boot list (L35-48); a `clin_overview` project asked for an NDA market → 422 `NOT_AN_APPLICATION` with the component sentence.
- **`assembly-filing-scope.test.ts`:** a `registry:ICH_CLIN_OVERVIEW` builtin is still admitted into an NDA project's M2 copy and into a `clin_overview` copy (`authoring-assembly-source.ts` L212-216).
- **Pin:** `ctdComponentOf` is non-null for exactly the component classes, with their codes, and null for the other 21.
- **`tests/regulatory/submissionTypeBridge.test.ts`:** both aliases resolve, and each equals `resolveFilingCatalogEntry(alias).registryId`.
- **`ectd-compile-ident.test.ts`** and **`orchestrator-readiness.test.ts`:** add `clin_overview` / `ICH_CLIN_OVERVIEW` cases.
- **Re-run:** `market-support.test.ts`, `required-sections.test.ts`, `vault-coverage.test.ts`, `product-types.test.ts`, `documentClassSubmitTab.test.tsx`, `newProjectWizardNotOffered.test.tsx`, `ctd-component-outlines.test.ts`, `c2c-regional-device-packs.contract.test.ts`.

### Evidence

- `3b-s5-components-red.txt`.
- `3b-s5-header-gate-red.txt`:
  1. emit with the old `render()`;
  2. commit locally on `concept2cure-v2`;
  3. run `./scripts/ci/require-migration-headers.sh` (exit 1 naming the file);
  4. delete the never-pushed file, change `render()`, re-emit, amend;
  5. never push the red commit.
- README §k, including the counts and pins moved.

### What a person sees

- **Choose filing type:** "Clinical Overview (M2.5)" and "Nonclinical Overview (M2.4)" appear under "More filing types" / "Show N more filing types", agency "ICH / Global", chip "Author documents for this market".
- **Offer:** "Author documents for this market. Author the documents here. An application's Module 2.5 is written in the application's own project. A clinical overview authored here stays this project's document: …".
- **Configure:** "Required. A clinical overview covers drugs and biologics; the project records which." (`Projects.tsx` L692); "Outline only, no package".
- **Review:** "Clinical overview — eCTD" (L880, the registry's format).
- **The created project:**
  - one governed document, "<Product> — Clinical Overview × ICH M4E(R2) · CTD 2.5", with 14 sections;
  - Markets: "No market: this project is authored, not sequenced" plus the sentence;
  - Vault: folder `CLIN_OVERVIEW`, with 2.5.6 and 2.5.6.1 as sub-folders and 2.5.6.5 Optional;
  - dossier: "0 of 12 sections approved or locked";
  - Plan: ProjectPlan's generic sentence (theirs).
- **2.4:** six sections.

---

## Slice 6: Reach 2.7 Clinical Summary

**Relies on:** Slice 5, plus Slices 1 and 3.

### Changes

Copy Slice 5 item by item:
- **Row:** `{ docType: 'clin_summary', packAgency: 'ich', label: 'clinical summary', registryIds: ['ICH_CLIN_SUMMARY'] }`.
- **Spec:** `version 'ich-m4e-r2-v1.0'`, label "Clinical Summary × ICH M4E(R2) · CTD 2.7". basisNote: "ICH M4E(R2) 2.7 headings to 2.7.4.2.1.5 from the platform's ICH M2–M5 record; each heading's basis is the record's, and most are recall. 2.7.4.6 is conditional (if available): a product not yet marketed says so in that section."
- **Alias:** `'CLIN_SUMMARY'`.
- **Emit:** `migrations/<D>[b]_ctd_clinical_summary_class_pack.sql`: 1 pack, 49 nodes, 48 mandatory; CHECK from 48 to 49 values.
- **Set entry:** after Slice 5's file.

### Tests

- **Contract:**
  - `2.7.4.2.1.2` has parent `2.7.4.2.1`;
  - only `2.7.4.6` is not mandatory;
  - scaffold gives 49.
- **Replay:** `newestOnly`/`count` on `'clin_summary'`, plus the file.
- **Copied from Slice 5:** the offer, create, intake sentence, wizard, picker, builtin whole-outline, add-market and bridge cases.

**Evidence:** `3b-s6-clinical-summary-red.txt`, README §l.

**What a person sees:**
- a "Clinical Summary (M2.7)" tile;
- 49 sections, 40 counted;
- the composer answers from this project's own CSR builds only.

---

## Slice 7: Reach 2.6 Nonclinical Written and Tabulated Summaries

**Relies on:** Slices 5, 2 and 3, plus E17, E19 and FD-11.

### Changes

- **Row:** `{ docType: 'nonclin_summary', packAgency: 'ich', label: 'nonclinical summary', registryIds: ['ICH_NONCLIN_SUMMARY'] }`.
- **Spec:**
  - `version 'ich-m4s-v1.0'`;
  - label "Nonclinical Written and Tabulated Summaries × ICH M4S · CTD 2.6". Append " · preparation worksheet" only if FD-11 is decided as "worksheet" before emission.
  - basisNote: "ICH M4S 2.6.1–2.6.7 headings were checked against the FDA-hosted guidance on 2026-10-07; of the 2.6.4.x and 2.6.6.x leaves, 2.6.4.2, 2.6.6.2 and 2.6.6.10 were matched against a search extract and the rest are recall. Every heading is required, as the platform's 2.6 scaffold marks it; a section for a study type not conducted says so. The tabulated summaries (2.6.3, 2.6.5, 2.6.7) hold study figures entered from the versioned study reports."
- **Alias:** `'NONCLIN_SUMMARY'`.
- **Emit:** `migrations/<D>[c]_ctd_nonclinical_summary_class_pack.sql`: 1 pack, 34 nodes (7 top-level, nested by prefix, E2 L159-164); CHECK from 49 to 50.
- **Set entry.**

### Tests

- **Contract:**
  - `2.6.2.1` has parent `2.6.2`;
  - `2.6.4.10` and `2.6.6.10` are present;
  - scaffold gives 34.
- **Replay:** `'nonclin_summary'`.
- **Builtin whole-outline:** `['ICH_NONCLIN_SUMMARY','nonclin_summary']` (one order, flat and nested).
- **Offer, create and add-market** cases.
- **A pin** that the 2.6.3, 2.6.5 and 2.6.7 records keep "do not fabricate data" in their `generationPrompt` (N4).

**Evidence:** `3b-s7-nonclinical-summary-red.txt`; `3b-routing-after.txt` (same columns and script as before); README §m.

**What a person sees:** a "Nonclinical Summary (M2.6)" tile; 34 sections, 31 counted.

**Not done:** withholding "Draft with AnA" from the tabulated sections (FD-11). The per-section brief does not carry the `generationPrompt`'s no-fabrication line (N4); this is recorded for FD-11.

---

## Slice 8 (optional): A composed 2.4 / 2.5 / 2.7 draft lands in a class pack

- **Change:** the composers also return `sections: [{code, title, content}]`, split at the `heading(code)` boundaries (E29), so `filingSectionKey` can place each section (E30).
- **Gates:** `m2-composers-head-as-the-record.test.ts` and `ci:canvas-path`.
- **README:** §n.

---

## What 3b gives for "organize, build, customize, complete"

- **Organize:** one project per component document, with its nested governed outline and its Vault folder tree.
- **Build:**
  - per-section AnA drafting with record briefs;
  - the 2.5 / 2.7 composers from this project's CSR builds;
  - the 2.4 / 2.6 composers from a named CTD program's recorded studies.
- **Customize:** sub-headings under a leaf (E30); the status PATCH adds a key outside the pack (E35).
- **Complete:**
  - signature approval, `POST /:id/lock`, File to Vault;
  - submit by external attestation (E35).
- **The stated limit:** a conditional heading has no not-applicable status. 2.5 reaches 100% only when 2.5.6.5 states "not used" and is approved, otherwise 11 of 12. 2.7's ceiling is otherwise 39 of 40.

## Founder decisions

- **FD-11 (was F-A).** Is 2.6 a preparation worksheet, and is AnA drafting withheld from its tabulated summaries?
- **F-B.** A not-applicable status for conditional headings (`SUBMISSION_REQUIRED_DELIVERABLES_UI.md` L43).
- **F-C.** May a component project compose from another project's CSRs or CTD program? Recommendation: no (P-14).
- **F-D.** Any standalone QOS, DS or DP project, or any widening of P-28.

## Not in 3b (filed)

- **Classes not made:** QOS/DS/DP as classes; `mod2:ich`; `ICH_TABULATED_SUMMARIES` (BP-W1-4).
- **Wording left as is:** the CSR/IB/protocol/SAP/ICF/DSUR placement sentence.
- **Client items for others:**
  - picker duplicates (H11);
  - `DocumentWorkbench.tsx` L1266 `useState('M3')`;
  - the "— eCTD" Review suffix for classes (`Projects.tsx` L880).
- **Cosmetic or dormant:** the Vault folder code; `PATHWAY_BY_ID.ich_clin_overview`.
- **Owed record work:** the verbatim M4E/M4S re-reads (task 17; they force v1.1 packs).
- **Cross-checks not added:**
  - `submissionTypeId` against medicinal program types (`projects.ts` L795-806);
  - the general `isSameSubmissionType` at creation.
- **Rule 2 items elsewhere:**
  - the `/m2/*` routes compose from request bodies;
  - the other preclinical tools take model input.
- **Missing link:** no `ctd_programs`↔project link.

## Message to the client-journey session (`session_01JbQUvBxcGHdBgkgAydQKpx`), sent before Slice 4

> 3b (D2/W1) edits none of your listed files. It does touch files you have recently edited, so please hold edits to these lines until each slice is pushed:
> - **`AnaVerbs.tsx` (RegistryPicker; your `d97388005`):** `FilingOfferView` gains `reasonByFiling`. At L133 a not-offered row shows the filing's own reason when the server gives one: the QOS, drug substance and drug product. Every other ICH / Global row now reads "Not offered: ICH is no jurisdiction and takes no filing…".
> - **`EctdCompile.tsx` and `EctdModuleReadiness.tsx`:** a 422 `ECTD_NOT_APPLICABLE` becomes a "Not compiled as an eCTD sequence" state with the server's reason. It is no longer "could not be read", for regional device and filing-class projects alike.
> - **`NewSubmissionForm.tsx`:** no edit. The server now refuses a submission for a filing-class project, or of a class type, with the class sentence.
> - **`Projects.tsx`:** no edit. `programTypeFor` checks the class first (L130-131), so Clinical Overview (M2.5), Nonclinical Overview (M2.4), Clinical Summary (M2.7) and Nonclinical Summary (M2.6) route to `clin_overview`, `nonclin_overview`, `clin_summary` and `nonclin_summary`, author-only at "ICH / Global". The Review step shows "Clinical overview — eCTD" from the registry's format; changing it is your call.
> - **Your screens:**
>   - ProjectHome's `documentClass` branches carry the new classes unchanged; the header shows the lowercase label.
>   - `ProjectPlan.tsx` L152-154 will give these projects the generic sentence. `GET /api/c2c/documents/:id/outline` already serves their outline if Plan should list it.
>   - The component sentence reaches you through `ProjectMarkets` and `DispatchReadiness`.
> - **Pins:** picker counts grow by two, then one, then one. The QOS/DS/DP and ICH / Global not-offered texts change.

## Note to the cleanup lane (`inventory-plan.md`)

- **S44:** its handler bullet is done by 3b Slice 2 (name the commit). The loader there is `loadNonclinicalProgram`, not `loadNonclinicalStudiesForProject`.
- **S48:** it changes what Slice 3's orchestrator branch no longer depends on. Pins stay on "not computed".
- **FD-11:** it is 3b's former F-A. Slice 7's label waits on it.
- **Record edits:** any slice that edits 2.4–2.7 record rows or the 2.6 blueprint adds `c2c-filing-class-packs.contract.test.ts` as a pin, and mints new pack versions.

## Key files

**Server, shared and scripts:**
- /home/user/ClinicalSageAI-2-replit/shared/regulatory/filing-document-classes.ts
- /home/user/ClinicalSageAI-2-replit/shared/regulatory/submission-type-bridge.ts
- /home/user/ClinicalSageAI-2-replit/server/services/c2c/filing-class-packs.ts
- /home/user/ClinicalSageAI-2-replit/scripts/db/emit-filing-class-packs.ts
- /home/user/ClinicalSageAI-2-replit/scripts/db/migration-set.mjs
- /home/user/ClinicalSageAI-2-replit/server/services/regulatory/market-support.ts
- /home/user/ClinicalSageAI-2-replit/server/routes/c2c/projects.ts
- /home/user/ClinicalSageAI-2-replit/server/services/submission-service/submission-service.ts
- /home/user/ClinicalSageAI-2-replit/server/routes/ectd-compile.ts
- /home/user/ClinicalSageAI-2-replit/server/services/report-os/orchestrator.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ana/module2-csr-inputs.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ana/AnaToolExecutor.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ana/bla-biologics-tool-defs.ts
- /home/user/ClinicalSageAI-2-replit/server/services/m2-summary-builders.ts

**Client:**
- /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/AnaVerbs.tsx
- /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/EctdCompile.tsx
- /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/EctdModuleReadiness.tsx

**Tests:**
- /home/user/ClinicalSageAI-2-replit/tests/schema-contract/c2c-filing-class-packs.contract.test.ts
- /home/user/ClinicalSageAI-2-replit/tests/schema-contract/check-constraint-replay.pglite.test.ts

**Evidence and plans:**
- /home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-3/README.md
- /home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/cleanup/inventory-plan.md