> **Filed 2026-10-26.** This is the Rule 2 audit's design after its adversarial review, as executed. The founder
> decisions it names (F1–F8) are listed as R-1–R-8 in
> `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md`.
>
> | Slice | Status | Evidence |
> |---|---|---|
> | S1 | done | `s1-orchestrator-inline-inputs/` |
> | S2 | done, with its review fixes | `s2-nonclinical-drafts/` |
> | S3–S14 | queued | — |

# Adversarial review of the Rule 2 design: the corrected design and the evidence behind it

I re-checked the design against the code on `concept2cure-v2` at `7855b5115`. I only read files and ran grep and git; I edited, staged and ran nothing.

The core findings hold. 22 points need changing:
- **Stale facts:** 2 (the working tree, and an appendix that contradicts correction 2).
- **A "fine" that is not fine:** 1. `assess_nonclinical_program` with no studies returns a verdict.
- **Missed tools:** 4 groups.
- **Rule 3 duplicates in the slices:** 6.
- **Gaps or errors shown as empty:** 4.
- **Red-first and test problems:** 5.

## Part A — What I confirmed

- **S1 is real.** `POST /runs` and `/runs/:runId/regenerate` are launch-scoped (`ui-surface-registry.ts:452-453`). No client calls bare `/runs`; the client uses only `/runs/for-program`, `/runs/:id`, `/audit` and `/resume`.
  - Mode B accepts `nonclinicalStudies` and `csrInputs` (`submission-orchestrator.ts:484-491`).
  - Both modes accept `clinicalStudyData` (`:448-451`).
  - The service turns them into tables and Module 2 (`submission-package-orchestrator.ts:1641-1644, 1672-1698, 1915-1919, 2112-2113`).
  - Only `cmcSources` is refused outside development (`:520`, called at `:599` and `:855`).
- **M2.4, M2.6 and `assess_nonclinical_safety` compose from tool input.** The handlers at `AnaToolExecutor.ts:5567`, `:5770` and `:5797` read no record. M2.6 and the safety tool pass `input as any`.
- **The test line numbers are right:** `nonclinical-clinpharm-tools.test.ts` 58-78, 80-96, 126-151, 207-222, 224-250, 252-279, 355-404 and 424-431.
- **The S3 defaults are as described:**
  - `benefit-risk-knowledge.ts:1740` (0.15), `:2061`, `:2139`, `:2143`
  - `digital-health-knowledge.ts:1704-1762`
  - `biomarker-knowledge.ts:1734`
  - `AnaToolExecutor.ts:6763` (`ivdError`) and `:6963-6982`
- **The device surfaces are launch surfaces** (`launch-scope.ts:68-73`). `anaCapabilityInLaunchScope` checks them live (`ana-launch-scope.ts:59-66`).
- **Precedent:** `461f00e9a` committed `module2-csr-inputs.ts` with `answersBeforeOutline`.

## Part B — Issues, with evidence

### Stale facts

**I-1. The working-tree statement is wrong.**
- No files are untracked.
- Four tracked files carry another session's uncommitted changes:
  - `server/services/regional-ctd-templates.ts`
  - `server/services/templateService.ts`
  - `services/regulatory/ind-ectd-sections.ts`
  - `services/regulatory/pyramids/ind-pyramid.ts`
- The appendix's line "someone else's uncommitted changes to the precedent" is out of date: the precedent is committed.
- No slice may stage those four files.

**I-2. The appendix contradicts correction 2, and the slices inherited it.** The appendix still says these are hidden:
- `compose_correspondence_cover_letter`
- `assess_stored_cer`
- `generate_se_matrix`
- the IVD performance writers

In fact `record_analytical_performance_study` (`AnaToolExecutor.ts:8879`) and `record_clinical_performance_study` (`:8929`) are now offered. Their register class is `confirm`. They write `ivd_analytical_performance` and `ivd_clinical_performance` (sensitivity/specificity with CIs).

So the IVD verdict tools in S5b have a record inside the catalog. Rule 3 says to reach it, not to label them as stated basis only. Also, the device `labeling` surface is a launch surface; only `labeling-pi` is outside the catalog.

### A false "fine"

**I-3. `assess_nonclinical_program` with no studies is not a pure requirements lookup.**
- The handler sets `present = []` (`AnaToolExecutor.ts:5829`).
- The engine (`nonclinical-program-requirements.ts:199-260`) then adds a gap for every required study ("Missing rodent repeat-dose tox…", "Ames … not present").
- The handler returns that as `adequate: false` with those `gaps`.
- So "nothing was read" becomes "this program lacks every study".

S4 plans to call `assessNonclinicalProgram(program, [])` inside `assess_nonclinical_safety`, which repeats the same error. The fix is `requiredNonclinicalBattery(ctx)` only, with `adequate: null` and `gaps: null`.

### Missed tools

**I-4. `calculate_safety_margin` is a second first-in-human dose engine, and it renders an error as a dose.**
- Definition `toxicologyTools.ts:153`; handler `AnaToolExecutor.ts:19180`, wrapped by `runStatsTool`.
- It takes the NOAEL from the model and returns HED and MRSD.
- It has its own Km table (`toxicology-knowledge.ts:177`) beside `fih-dose-engine.ts:41`.
- For an unknown species it returns `hed: 0, mrsd: 0` (`toxicology-knowledge.ts:915-924`) inside a `computed` envelope.
- No slice covers it. Labelling `compute_fih_dose` alone leaves this door open.

**I-5. Stated-input twins of recorded engines are not in any list:**
- `estimate_shelf_life` (`shelfLifeTools.ts:10`, `AnaToolExecutor.ts:18108`) beside `estimate_recorded_shelf_life` (`:17692`).
- `assess_dissolution_similarity` (`:19106`) beside `compare_recorded_dissolution` (`:17597`). The f2 engine is already one implementation (`bioequivalence-knowledge.ts:1293` calls `cmc/dissolution-comparison.ts`).
- `assess_shelf_life_stability` and `assess_accelerated_stability` (`:6809`, `:6818`). The stability intake flow points to the first of these (`intelligence-questions/engine.ts:633`).
- `assess_analytical_method_validation` (`:18218`, ICH Q2 pass/fail).

**I-6. Intake flows end in `generate_document` for regulated documents.** This is the same shape as `plan_ind_module_authoring`.
- The flow actions are at `intelligence-questions/engine.ts`:
  - `:552` — CSR "from collected data"
  - `:568` — 510(k)
  - `:580` — CER
  - `:594` — PMA
  - `:604` — "CMC Module 3"
- `generate_document` (`AnaToolExecutor.ts:7122`) renders the model's `sections[].content` into a DOCX.
- The Module 3 action is a second Module 3 path. It goes around the P-28 composition boundary and the refusal in `draft_quality_overall_summary_m2_3`.
- The CSR action runs beside `csr_build_jobs` and the CSR Vault source.
- The handler already refuses `ectd_backbone` and `icsr` with a replacement path (`:7181-7190`). That is the refusal pattern to extend.

**I-7. Two governed documents are built from identity facts the model types:**
- **`compose_510k_summary`** (`AnaToolExecutor.ts:18185`) is offered since device-510k became a launch surface. Correction 2 does not name it. It prints these model-typed values into the public §807.92 summary:
  - predicate K-numbers and holders
  - device class
  - product code
  - regulation number
- **`generate_declaration_of_conformity`** (`ivdLifecycleTools.ts:205`, handler `:6827`) builds an EU Declaration of Conformity from model fields and returns `valid: true`. The fields include the notified body number, certificate number, Basic UDI-DI and class.
- Records exist: `udi_records` (its writer `create_udi_record` is now offered) and the program's classification.

### Rule 3: duplicates and parallel readers inside the slices

**I-8. S3 says to leave `triageEngine.classify` unchanged, but the defect already reaches the record.**
- Complaint intake `createComplaintTx` defaults `isMalfunction`, `anticipatesCorrection` and `trendThresholdCrossed` to `false` (`capaMdr.service.ts:311-318`).
- The `complaints` table stores none of the three; it has only `event_location_country`, `patient_harm` and `preliminary_classification` (`migrations/20260504_capa_mdr.sql`).
- So S10's "read the stored `preliminary_classification`" reads a classification computed from defaults.
- Fix it in `classify` (unknown means not determined). Extend the existing `requireComplaintAssessments` (`capaMdr.service.ts:295`) rather than adding a new gate.

**I-9. The S3 biomarker fix patches a second 2×2 implementation.**
- `computeDiagnosticAccuracy` (`stats/clinical-performance.ts:79-92`, used by `compute_diagnostic_accuracy` at `AnaToolExecutor.ts:16715`) already refuses an empty positive or negative stratum and gives Clopper–Pearson CIs.
- `assessBiomarkerClinicalValidation` (`biomarker-knowledge.ts:1726-1740`) should call it.

**I-11. The S2 resolver is a parallel resolver.**
- Its `programId` branch re-implements the legacy branch of `resolveOpenProgram` (`c2c/program-access.ts:232-250`).
- Nothing in S2 uses `programId`; S8 is the first consumer. Putting it in the shared resolver adds a DB read to M2.5 and M2.7, so "no change in behaviour" is false.
- It also breaks the planned red tests. `nonclinical-clinpharm-tools.test.ts:27` mocks `db.js` as `{db:{}, pool:{query: vi.fn()}}`. `pool.query()` returns `undefined`, so the test gets a TypeError and status `error`, not `needs_data`.

**I-12. The S2 M2.6 outline comes from a hand-written scaffold.**
- `m2-6-nonclinical-summaries` (`templates/nonclinical-templates.ts:141-172`) has the first level only.
- The record's 2.6, including 2.6.4.x and 2.6.6.x, is served as `ICH_NONCLIN_SUMMARY`:
  - `regulatory/sectionBlueprintCatalog.ts:86`
  - `registry/blueprints/nonclinicalSummaryBlueprint.ts`, via `ctdRecordSubtree`
  - `getRegistryDocumentTemplate` (`document-template-library.ts:497`)
- The scaffold is itself scheduled for convergence (inventory-plan S40, `inventory-plan.md:550`).
- 2.4 is `getDocumentTemplate('nonclinical_overview')` (`:264`).

**I-17. S12 has no extracted dissolution loader to chain.** The read in `compare_recorded_dissolution` is inline in the handler (`AnaToolExecutor.ts:17615-17625`) and scoped to the organization only, with no project check. Extract it before `assess_biowaiver` calls it.

**I-15. The S12 cover-letter mapping is wrong, and it duplicates an existing reader.**
- `agency_communication_questions.severity` is `NOT NULL DEFAULT 'major'` (`20261018b_agency_response_questions.sql:124-125`). Printing it reprints a default.
- No eSTAR section is recorded per question, but the composer needs `sectionNumbers` (`cover-letter-composer.ts:22`).
- A reader exists: `readQuestions` by letter (`agency-responses/response-service.ts:349`).
- Communication Center already composes the response package (`agency-responses/response-package-docx.ts`).
- The composer pulls eSTAR sections by `documentId` scoped to the organization only, so it can read a document of another project.

### Gaps left open, and errors rendered as empty

**I-13. S8 and S9 call the wrong loader.** `previewCsrVaultSource` (`csr/vault-source-input.ts:151-153`) uses `requireApproval: false` and returns `{source, approved, tables}`, with no envelope.
- S8 promises "approved sources only".
- S9 needs the participants, demographics and AE rows from the envelope.
- Both must use `withCsrVaultSource({requireApproval: true, consume})`, as `/runs/for-program` does (`submission-orchestrator.ts:327`).

**I-14. S11 would read `predicate.se_matrix_rows`, which nothing in `server/` reads or writes.**
- Grep finds only a type (`shared/types/predicate-intelligence.ts:1025`).
- Its writer `generate_se_matrix` posts to the external shadow service; the register says "unverified whether it persists".
- No SE determination can honestly come from that table.

**I-16. The S12 replacement for `assess_output_confidence` is not equivalent.** The tool's `n` means "supporting data points" (`AnaToolExecutor.ts:1229`). Receipts count documents read. The tool has no skill, no test and no client, so retire it.

**I-18. S1 leaves the model-extracted nonclinical (A1) path open.**
- Mode A `ctdProgramId` (`submission-orchestrator.ts:627`) composes M2.4 from `ctd_nonclinical_studies` rows, which are LLM extractions, into the signed package.
- With the flag unset, the loader returns `[]` (`load-nonclinical-studies-for-project.ts:56`). The audit then records `nonclinicalStudyCount 0`: an unavailable read reported as "no studies".
- Regenerate in Mode A (`:857-868`) runs with no loader at all.
- The design defers this to S14d. It belongs in S1.

**I-10. S5's opt-in mechanism leaves most calculators unlabelled.**
- `runStatsTool` (`AnaToolExecutor.ts:16576`) wraps 209 handlers and never reads a record.
- Opting in per family leaves out I-4 and I-5, `assess_carcinogenicity_need`, and many more.
- The stated-basis label should be the default in `runStatsTool`, in `ivdComputed` (`:6759`) and in the inline calculators.

**I-22. Records that only an AnA confirm-tool writes need a provenance line.** Readers built under P-A over such records must say "entered through AnA, confirmed by <user>; no source document". Examples: `ivd_*_performance`, `complaints`, `clinical_study_endpoints`.

### Red-first and test problems

**I-19. A sharper red is available for the pregnancy and lactation labeling slice.** The check at `labeling-intelligence-knowledge.ts:1664` is a substring match. "no malformations observed" therefore produces "Based on animal data, advise pregnant women…".

**I-20. S7 misses a test file.** `server/services/regulatory/__tests__/benefit-risk.test.ts` imports the module S7 deletes.

**I-21. Three red-first problems:**
- **S2 resolver test:** it fails on trunk only because the export does not exist. That is a refactor, kept green by the existing suites, not a red.
- **"≤1024 characters":** this already passes on trunk. It is a pin, not a red.
- **S3 `ivdError`:** the red needs a mocked engine. For example, mock `postmarket/report-authoring` so that `buildEmdr` throws a TypeError.

**Also in S9.** The CSR source holds demographics only for randomized participants. A safety-population subject who was not randomized has no age or sex, and the narrative must list those as missing.

---

# Corrected design: AnA tools and routes that compose or decide from figures the model supplies (Rule 2)

Read-only design. Trunk is `7855b5115`. The precedent is `461f00e9a`. Four modified tracked files belong to another session; no slice stages them. Row D2. Evidence goes under `docs/evidence/D2-RULE2-MODEL-FIGURES/2026-10-26/<slice>/` with `red.txt`, `green.txt` and a "What already exists" section.

## 0. Corrections to the sweep

1. **The orchestrator runs route is reachable in production with inline inputs.** It accepts inline `nonclinicalStudies`, `csrInputs` and `clinicalStudyData` (A2 and B2 lines above). Mode A also accepts `ctdProgramId`, which composes M2.4 from model-extracted A1 rows, or reports "no studies" when the reader is switched off. Only `cmcSources` is refused today.
2. **Device surfaces are launch surfaces** (since `62a8d5e7f`). Now offered:
   - `assess_stored_cer`, `compose_correspondence_cover_letter`, `compose_510k_summary`, `generate_se_matrix`
   - `log_study_ae`, `record_endpoint_result`
   - `record_analytical_performance_study`, `record_clinical_performance_study`, `create_per_document`
   - `create_complaint`, `create_udi_record`, `create_risk_item`
   - the device `labeling` tools

   Still outside the catalog: `nonclinical`, `pharmacovigilance`/`pv-cockpit`, `etmf`, `labeling-pi`, `research-admin`.
3. **Inventory-plan S44's `loadNonclinicalStudiesForProject(ctx project)` cannot run.** Nothing maps a project to a `ctdProgramId`. S2 below replaces that bullet; S44's other bullets stand. S40 (converge the nonclinical template headings onto the record) stands.
4. **The A2 limits stand:**
   - no primary-pharmacology `study_type`;
   - `listStudiesForSummary` counts planned and cancelled studies;
   - its creator and the `iacuc_protocols` creator are off the applier.
5. **`complaints` and `mdr_events` are created only off the applier.** Any reader reports 42P01 as `read_failed`. Complaint intake also defaults three triage booleans to `false` and stores none of them (I-8).
6. **Two SPL generators:** `generate_spl` and `generate_spl_xml`. The record path is `labeling-pi.routes.ts:321` (out of catalog).
7. **The CSR Vault source (B2) is the clinical record in the catalog.** It is read with `withCsrVaultSource`, never `previewCsrVaultSource`, when approval matters or the envelope is needed.
8. **`regulatory/benefit-risk.ts` has one caller**, `assess_benefit_risk`.
9. **Missed by the sweep:**
   - `calculate_safety_margin`
   - `estimate_shelf_life`, `assess_dissolution_similarity`, `assess_shelf_life_stability`, `assess_accelerated_stability`, `assess_analytical_method_validation`
   - `compose_510k_summary`, `generate_declaration_of_conformity`
   - the intake-flow actions that end in `generate_document` for CSR, CER, Module 3, 510(k) and PMA
10. **Refuted:** "`assess_nonclinical_program` without `present` is fine" (I-3).

## 1. What already exists (Rule 3)

### Patterns
- **P-A (compose from the record).** `ana/module2-csr-inputs.ts`:
  - `scopeInputOf`, `readScopedCsrs` (`resolveCsrScope` with the actor, plus the `cross_project` check), `answersBeforeOutline`;
  - the refusal union `needs_project | needs_data | cross_project | access_denied` with `ignoredSuppliedFigures`.
  - Consumers: M2.7 (~5917) and M2.5 (~15806).
  - Tests: `nonclinical-clinpharm-tools.test.ts:355-404` and `module2-csr-inputs.pglite.test.ts`.
- **Refusal patterns:**
  - tools: `MODEL_SUPPLIED_CMC_REFUSAL` (`cmc-quality-summary-tool.ts:38`);
  - routes: `refusedInlineCmcSources` (`submission-orchestrator.ts:520`, tests `orchestrator-module3-governed.test.ts:186-245`, OQ `tests/validation/oq/cmc/steps-surface.mjs` OQ-CMC-30);
  - document types: the `ectd_backbone`/`icsr` refusal in `generate_document` (`AnaToolExecutor.ts:7181-7190`).
- **P-B (hypothetical over stated inputs):** `DEVICE_ASSEMBLY_HYPOTHETICAL_BASIS` (~16953) and `loadProgramDeviceAssemblyInput` (`device-assembly/assemble-device-submission.ts:290`).
- **Retirement tests:** `ind-tools-retired.test.ts`, `cross-region-retired.test.ts`.
- **Scope helpers:**
  - `resolveCsrScope` (`csr/project-scope.ts:85`) gives the integer project with an access check;
  - `resolveOpenProgram` (`c2c/program-access.ts:232`) gives the program uuid, owned by the organization;
  - `integerProjectForRef` (`c2c/project-ref.ts:26`);
  - `RECORD_SCOPES` (`tool-record-scope.ts:109`);
  - `runStatsTool` / `STATS_VERBATIM` (`AnaToolExecutor.ts:16565-16598`) and `ivdComputed` (`:6759`).
- **Intake gate:** `requireComplaintAssessments` (`capaMdr.service.ts:295`).

### Outlines (the one ICH M2–M5 record)
- 2.4: `getDocumentTemplate('nonclinical_overview')` (`document-template-library.ts:264`).
- 2.6: `getRegistryDocumentTemplate('ICH_NONCLIN_SUMMARY')` (`:497`), through `ctdRecordSubtree('2.6')`.
- 2.5: `clinical-overview-outline.ts` (`toSection`, `CITES`).
- The hand scaffold `templates/nonclinical-templates.ts` is converged by inventory S40 and is **not** used as an outline here.

### Record readers
- **Nonclinical:**
  - A2: `listStudiesForSummary` (`nonclinical-service.ts:209`), `composeM26WrittenSummary`/`toStudyInput` (`m26-m4-view.ts:162`);
  - A1: mappers in `preclinical/nonclinical-program-loader.ts`; bridge `preclinical-governed-bridge.ts`;
  - `requiredNonclinicalBattery` (`nonclinical-program-requirements.ts`).
- **Clinical:**
  - `csr/load-csr-inputs-for-project.ts`;
  - `csr/vault-source-input.ts` `listCsrVaultSources` (`:36`) and `withCsrVaultSource` (`:132`);
  - `buildCSRTables`.
- **Statistics:** `computeDiagnosticAccuracy` (`stats/clinical-performance.ts:79`); `cmc/dissolution-comparison.ts` `compareDissolutionProfiles` (already the single f2 engine).
- **Device:**
  - `capaMdr.service.ts` `getComplaint`/`getMdrEvent`;
  - `market-specs/stored-cer-assessment.ts` `assessStoredCer`;
  - `ivdr_per_documents`, `risk_items`/`risk_controls`;
  - `ivd_analytical_performance` and `ivd_clinical_performance` (their writers are now offered, confirm class);
  - `udi_records`;
  - `cerv2_510k_sections`, read through `cover-letter/section-pull`.
- **Correspondence:** `agency-responses/response-service.ts` `readQuestions` (`:349`) and `response-package-docx.ts`.
- **CMC:** the dissolution read inside `compare_recorded_dissolution` (inline, `:17615-17625`, organization only) and `estimate_recorded_shelf_life` (`:17692`).
- **Receipts:** `ana_source_read_receipts`.

### Searches run
The design's own searches, plus:
- the tool names above;
- `runStatsTool(` (209 call sites);
- `KM_FACTORS`;
- `actionType:` in `intelligence-questions/engine.ts`;
- `se_matrix_rows`;
- `previewCsrVaultSource`;
- `requireComplaintAssessments`;
- `ICH_NONCLIN_SUMMARY`;
- the register classes of the device writers;
- `git log --all --diff-filter=D -- '*ind-module*'` (none).

## 2. Rules every slice follows

- **Two answers only.**
  - **P-A** for governed content and any verdict about a program or product.
  - **P-B** (`basis: 'stated'`) for calculators and worksheets over stated inputs. P-B never feeds a governed document. P-B depends on F2.
- **Absence of a record is not absence of the thing.** No gap list, `adequate: false`, "not conducted" or 0 is derived from an empty input or an empty read (I-3).
- **Unavailable is not empty.** A switched-off feature, 42P01, a scope error or a read failure is `read_failed` or `error`, never `[]` or "none".
- **Remove figure fields from schemas; do not deprecate them.**
  - Handlers still detect the removed keys on the raw input to set `ignoredSuppliedFigures`.
  - Use `required: []` where the required field was a figure array.
  - Add `project_id` where P-A reads the project.
- **Descriptions:** each says "do not pass …", is ≤1024 characters, and is pinned by a description test in the style of `compute-lifecycle-description-names-the-filed-state.test.ts`.
- **New logic goes in its own module, not inline in `AnaToolExecutor.ts`.**
- **One implementation per capability.** A twin engine is converged in the same commit (I-4, I-9).
- **Gates every slice:** `ci:typecheck:no-regression`, `ci:eslint-ratchet` and the named vitest suites. Add when relevant:
  - `ci:launch-scope` and `ci:launch-scope-api` when scope or routes change;
  - `ci:migration-set-order`, `ci:migration-drop-safety` plus its selftest, and the deploy-path baseline when migrations change;
  - `npm run manifest:ana` when a description changes.
- **Red means a behavioural failure on trunk.** A refactor's evidence says "existing suites green before and after".

## 3. Slices, in order (one commit each, red first)

### S1. The orchestrator refuses inline clinical and nonclinical inputs, and the A1 path, outside development

**Files:** `server/routes/submission-orchestrator.ts`.

Generalize `refusedInlineCmcSources` into `refusedInlineRunInputs`, checked on the raw body before parsing:
- **`cmcSources`** keeps `INLINE_CMC_SOURCES_REFUSED`.
- **Non-empty `nonclinicalStudies`, `csrInputs` or `clinicalStudyData`** get 400 `INLINE_RUN_INPUTS_REFUSED` with `field` and the replacement by path: `POST /runs/for-program` with `clinicalSource` and the project's completed CSR builds. Module 2.4 has no record source until S14.
- **Mode A `ctdProgramId`** gets 400 `CTD_PROGRAM_INPUTS_REFUSED`. A1 is an LLM-extraction landing zone; with the flag off its read reports "no studies".
- **Mode A on regenerate** gets 400 `REGENERATE_MODE_A_UNSUPPORTED`. The route runs no loader (`:857-868`); the refusal points to `/runs/for-program`.
- Empty arrays are not refused. Development stays open.
- Rewrite the `clinicalStudyData` comment (`:448`) to say development fixtures only.

**Red** (extend `orchestrator-module3-governed.test.ts`, with `h.isDevelopment = false`):
- Mode B `csrInputs: [{…, primaryResult: 'ORR 42%'}]` → 400, and `runOrchestrator` is not called. On trunk it starts a run.
- The same for `nonclinicalStudies` with `noael: '50 mg/kg/day'`.
- Mode A `{projectId, clinicalStudyData: [...]}` → 400.
- Mode A `{projectId, ctdProgramId: 7}` → 400. Move the trunk expectations in `orchestrator-foreign-ctd-program-is-refused.test.ts` into a development-only case.
- Regenerate with the same bodies → 400, and `regenerateAffected` is not called.
- Development still gives 200.

**OQ:** add the analogue of OQ-CMC-30 for `INLINE_RUN_INPUTS_REFUSED`, under the W3 posture.

**User-visible:** none in the UI.

### S2. M2.4 and M2.6 stop composing from model-written studies (P-A); extract the shared scope helper

**`server/services/ana/record-source-project.ts` (new, a pure move):**
- Move `integerId`, `scopeInputOf`, the `cross_project` check and the mapping from `CsrScopeError` to a refusal out of `module2-csr-inputs.ts`.
- Export:
  - `resolveRecordSourceProject(input, ctx, subjectText)`, returning `{ok: true, projectId, open}` or the refusal union;
  - `suppliedAny(input, keys)`;
  - `answersBeforeOutline` over the shared union.
- **No `programId` here** (I-11). Uuid-keyed readers call `resolveOpenProgram` in their own slice (S8).
- `module2-csr-inputs.ts` becomes its first consumer, with no change in behaviour.

**`server/services/ana/module2-nonclinical-inputs.ts` (new):** `loadModule2NonclinicalInputs(input, ctx, '2.4' | '2.6')`.
- `ignoredSuppliedFigures` is true when `studies` or `findings` is non-empty.
- It resolves the project, then returns `needs_data` with `projectId`: "This platform does not yet record nonclinical studies against a project, so Module 2.x cannot be composed from records. Studies, NOAELs and findings given in the conversation are not used."
- S14 replaces only this branch.

**Outline:** generalize `clinical-overview-outline.ts` into `ctdComponentOutline(templateOrRegistryId)`.
- 2.4 reads `getDocumentTemplate('nonclinical_overview')`.
- 2.6 reads `getRegistryDocumentTemplate('ICH_NONCLIN_SUMMARY')`.
- `CITES` stays 2.5-only. `clinicalOverviewOutline()` delegates. The hand scaffold is not used (I-12).

**Handlers** (`AnaToolExecutor.ts` ~5567 and ~5770):
- They take `ctx`.
- They return the refusal when `answersBeforeOutline` is true.
- Otherwise they return `{structure, nonclinical_data: {status, message}, next_step}`, as M2.5 does.

**Definitions** (`bla-biologics-tool-defs.ts:419`, `:615`):
- Remove `studies` and `findings`; set `required: []`; add `project_id`.
- New description: "…its studies, NOAELs and findings come from the project's recorded nonclinical studies only: do not pass studies, doses, NOAELs or findings. Until nonclinical studies are recorded against a project it returns the ICH M4S outline and says so."

**Text to change:**
- the `load_nonclinical_program` instruction (~5687) and its definition (~668);
- `skills/library/nonclinical.ts:455-466` (method steps 1, 3 and 4);
- `biotech-program.ts:151`, which drops M2.4 from `anaCanDoNow` until S14.

**Red** (`nonclinical-clinpharm-tools.test.ts`, existing mocks; the S2 path makes no `pool` call):
- M2.4 with `[{repeat_dose_tox, rat, 13, noael: '50 mg/kg/day', keyFindings: 'hepatocellular hypertrophy'}]` and `{organizationId: 3, projectId: 9}` → `needs_data` with `ignoredSuppliedFigures: true`, and `JSON.stringify(out)` does not contain `50 mg/kg/day`. Trunk drafts "NOAEL range: 50 mg/kg/day".
- The same for M2.6. Trunk prints the 2.6.7 table row.
- Figures supplied with no project → `needs_project`.
- Project open, nothing supplied → the outline's codes equal the record's 2.4.x and 2.6.x, including 2.6.4.x and 2.6.6.x. Trunk returns `needs_parameters`.
- The definitions have no `studies` or `findings` and contain "do not pass".
- **Pin** (not red): length ≤1024.

**Refactor evidence:** `module2-csr-inputs.pglite.test.ts` and the M2.7 cases are green before and after.

**Pins to move:**
- `:126-151`, `:207-222` and `:424-431`. Move the "M2.4 returns its tables" assertion to `preclinical/__tests__/nonclinical-m24-adapter.test.ts`.
- Record in the README that S44's bullet is superseded.

**User-visible:** every 2.4 and 2.6 request returns the ICH M4S outline until S14. State this in the commit.

### S3. Invented defaults (fail closed; no records needed)

Each item gets its own red in the same commit.

- **`planBRCommunication`** (`benefit-risk-knowledge.ts:2058-2145`):
  - No `verdict` → `needs_parameters` ("the benefit-risk conclusion is the sponsor's").
  - Absent messages are named as not stated.
  - Red: `({})` returns `favourable_with_conditions` and "manageable, characterized risks" on trunk.
- **`assessBRUncertainty`** (`:1740`):
  - No `netBalanceEstimate` → `robustness: 'not_assessed'`.
  - Red: sources only → trunk computes robustness.
- **`assessDeviceCybersecurity`** (`digital-health-knowledge.ts:1700-1762`):
  - `true` means present; `false` means missing; omitted means `not_stated` and counts as a gap.
  - It never returns `pass` while anything is unstated.
  - Red: `({})` → trunk `pass` and "Threat model provided."
- **`assessBiomarkerClinicalValidation`** (`biomarker-knowledge.ts:1726-1740`):
  - Converge its 2×2 onto `computeDiagnosticAccuracy` (`stats/clinical-performance.ts:79`), which refuses an empty stratum and adds Clopper–Pearson CIs.
  - The verdict cannot pass when either stratum is empty.
  - Red: no diseased subjects → trunk sensitivity 0.
- **MDR reportability, in the engine and at intake:**
  - `classify` (`triageEngine.ts:95-101`): an omitted `isMalfunction`, `anticipatesCorrection`, `trendThresholdCrossed` or `eventLocationCountry` is unknown, and the result says the determination is incomplete. Never false.
  - Extend `requireComplaintAssessments` (`capaMdr.service.ts:295`) to require the three booleans and the country (or an explicit "unknown").
  - `preliminary_classification` records which inputs were stated. No new column; it is json.
  - The `assess_mdr_reportability` handler (~6963) returns `needs_parameters` naming each omitted input.
  - Reds:
    - `{patientHarm: 'serious_injury'}` → trunk 30-day;
    - `createComplaintTx` without `anticipatesCorrection` → trunk stores a classification computed with `false`.
- **`ivdError`** (~6763):
  - Only messages matching `isStatsParamError` become `needs_parameters`; anything else is `error`.
  - Red: mock `postmarket/report-authoring` so that `buildEmdr` throws a TypeError → trunk reads it as `needs_parameters`.
- **`assess_nonclinical_program` with no `present`** (~5823):
  - Return `required` from `requiredNonclinicalBattery(ctx)`, with `adequate: null` and `gaps: null`, plus "no studies were read; this is the requirement list, not a gap analysis".
  - Red: `{maxClinicalDurationWeeks: 4}` → trunk `adequate: false` with "Ames … not present".

**Pins:**
- `capa-mdr-tools.test.ts`
- `ivd-lifecycle-tools.test.ts`
- `device-tools-leave-unstated-facts-undetermined.test.ts`
- `nonclinical-clinpharm-tools.test.ts:224-250`
- capaMdr service tests

**User-visible:** none of these answers is produced from nothing stated any more: a favourable benefit-risk conclusion, a cybersecurity "pass", 0% sensitivity, an under-reported MDR, or "your program lacks every study".

### S4. Nonclinical engines (P-A for readiness, P-B for calculators per F2; after S2)

**`assess_nonclinical_safety`** (~5797; new `ana/nonclinical-safety-tool.ts`):
- Remove `studies`, `presentStudies`, `findings` and `fih.speciesNoaels` from the schema. Keep `program`, `drugSubstanceName` and `indication`.
- Resolve the project. With no record (until S14), return:
  - `readiness: 'not_assessed'`;
  - `requiredBattery` from `requiredNonclinicalBattery(program)`, never `assessNonclinicalProgram(program, [])`;
  - no dose.
- In `nonclinical-safety-assessment.ts:111`, replace `'the drug substance'` with `DRUG_SUBSTANCE_NAME_NOT_RECORDED`.
- Red: a full stated battery, a dog NOAEL of 30 and program `{4 weeks, phase 1}` → trunk `ready_for_fih` and `recommendedStartingDoseMg`. After the fix, neither appears, `ignoredSuppliedFigures: true`, and `programGaps` is null.

**One first-in-human dose engine:**
- `calculate_safety_margin` (`toxicologyTools.ts:153`, handler `:19180`) becomes an adapter over `computeFirstInHumanDose` (`fih-dose-engine.ts`).
- Delete the second `KM_FACTORS` and `SAFETY_FACTORS` (`toxicology-knowledge.ts:177-200`). Keep its AUC/Cmax margins, which take stated exposures.
- An unknown species throws, giving `needs_parameters`, never `hed: 0`.
- Red: species `'axolotl'` → trunk `{hed: 0, mrsd: 0}` with status `computed`.
- Deleting the engine needs no history search: the capability stays, through one engine.

**`compute_fih_dose`** (~5491) and `calculate_safety_margin` under F2(i):
- `basis: 'stated'` (from S5).
- Instruction: "a calculation from the NOAEL you stated; not read from the program's studies; not the program's starting dose."
- Drop "Gather the per-species NOAELs" from the description.
- Under F2(ii): both refuse.
- Pins: `:58-78`, `fih-dose-engine.test.ts`, toxicology tests.

**`assess_nonclinical_program` with `present` supplied:** `adequate: null`, `basis: 'stated'`, gaps labelled "against the studies you listed". Red: a full stated battery → trunk `adequate: true`.

**`classify_tox_findings`** (~5513): `basis: 'stated'`; drop "Use … for the M2.4 target-organ profile". Pins: `:80-96`.

**`assess_carcinogenicity_need`** (~19192): P-B. Genotoxicity reads as stated by the person, never as the program's result.

**`assess_pregnancy_lactation_labeling`** (~19605): P-A for label statements.
- Return the PLLR 8.1–8.3 structure with `requiredStatements: null` and the reason.
- Red: findings "no malformations or embryolethality observed" → trunk prints "Based on animal data, advise pregnant women…" (substring match at `labeling-intelligence-knowledge.ts:1664`).

**Definitions:**
- `bla-biologics-tool-defs.ts:303, 344, 544, 701`
- `toxicologyTools.ts:153, 286`
- `labelingIntelligenceTools.ts:228`

**Skill text:** `nonclinical.ts:56-82, 301-328`.

**User-visible:** AnA never says "ready for first-in-human", and never gives a program a starting dose from typed figures.

### S5. A stated basis everywhere a calculator runs (P-B per F2)

**S5-0, one commit for the mechanism.**
- `runStatsTool` (`:16576`), `ivdComputed` (`:6759`) and the inline calculator envelopes add, by default:
  - `basis: 'stated'`;
  - `appliesTo: 'the inputs stated in this conversation'`.
- `STATED_BASIS` is appended to `STATS_VERBATIM`: "Every input was stated, none read from a record. Report this as an assessment of what was stated, never as the program's or product's verdict."
- Inline calculators covered:
  - `compute_fih_dose`, `classify_tox_findings`
  - `estimate_shelf_life`, `assess_analytical_method_validation`
  - `assess_mdr_reportability`, `characterize_pk`, `assess_concentration_qtc`, `assess_ddi_risk`
  - `select_exposure_response_dose`, `compute_sample_size`
- Record-reading tools never pass through these wrappers. Pin this with a test that `compare_recorded_dissolution` and `estimate_recorded_shelf_life` carry no `basis: 'stated'`.
- Red: a table-driven test over a sample from each wrapper asserts `basis: 'stated'`; it is absent on trunk.

**S5a–S5d, one commit per definition family.** Each engine audit makes an omitted boolean read as `not_stated`, never true or false (the GCP engine already does this). Red: each family's "omitted means not stated" case.
- **S5a (clinical):** `coaProTools`, `doseOptimizationTools`, `pediatricTools`, `vaccineTools`, `rweMethodologyTools`, `pharmacovigilanceTools`.
- **S5b (device and diagnostics):**
  - `biomarkerTools` and `ivdLifecycleTools`: `assess_iso17511_traceability`, `assess_scientific_validity`, `assess_shelf_life_stability`, `assess_accelerated_stability`;
  - `digitalHealthTools`, `medicalDeviceTools`, `assess_qms`, `assess_pathway_eligibility`.
  - For an IVD program, `assess_biomarker_clinical_validation` and `assess_biomarker_analytical_validation` also take an optional `study_id`. They then read `ivd_clinical_performance` / `ivd_analytical_performance` (P-A, scoped to the organization and program, through a `RECORD_SCOPES` entry), with the I-22 provenance line.
- **S5c (quality):** `gcpOperationsTools`, `gmpQualitySystemsTools`.
- **S5d:** `benefitRiskTools`, `biosimilarTools`, `immunogenicityTools`, `postApprovalTools`, `regulatoryStrategyTools`, `bioequivalenceTools`.
  - `assess_orphan_designation`: a prevalence with no stated source gives `fdaEligible: null`.
  - `assess_dissolution_similarity` instruction: "for recorded profiles use `compare_recorded_dissolution`."

**Pins:** `submission-center-tools.test.ts`, `ivd-lifecycle-tools.test.ts`, `deepening-tools.test.ts`, and the immunogenicity, bioequivalence and orphan tests where they exist.

### S6. Retire `plan_ind_module_authoring` onto the record-composed 2.5 and 2.7 tools

**Delete:**
- the definition (`evidence-literature-tool-defs.ts:490`) and its `ALL_ANA_TOOLS` entry;
- the handler (~3038) and its import (`AnaToolExecutor.ts:150-158`);
- the inventory entry (`:838`) and the register entry (`:5089`);
- `ana/ind-module-authoring.ts`;
- `ind-module-authoring.test.ts` and `ind-module-tool.test.ts`;
- the `plan_ind_module_authoring` describe block in `ana-tools-read-the-ctd-record.test.ts`.

**Repoint:**
- `intelligence-questions/engine.ts:558` → `draft_clinical_overview_m2_5` / `draft_clinical_summary_m2_7`;
- `submission-context-block.ts:32, 108` and `submission-context-block.test.ts:46`;
- `skills/library/medical-writing.ts:120, 191` and `submissions.ts:124, 145`;
- `biotech-program.ts:152`;
- `tool-selection-tokenize.test.ts`.

**Replacement by path:** the M2.5 and M2.7 handlers and `nonclinical-clinpharm-tools.test.ts:355-404`.

**History search:** `git log --all --diff-filter=D -- '*ind-module*'` returns nothing; record that in the commit.

**Red:** `plan-ind-module-authoring-retired.test.ts`, in the `ind-tools-retired` pattern.

### S6b. Intake flows stop ending in model-written regulated documents (new)

**Extend the refusal in `generate_document`** (`AnaToolExecutor.ts:7181-7190`) to these document types, each answered with its record path:
- **`ctd_module3`:**
  - `POST /api/cmc/module3-os/compile/:projectId`, approve, then `place-into-submission`;
  - `draft_quality_overall_summary_m2_3`.
- **`csr`:** the CSR build job / Authoring CSR template, and the CSR Vault source.
- **`cer`:** the device-cer stored CER (`assess_stored_cer`, `cer_documents`).
- **`510k`:**
  - eSTAR sections through `write_kit_section`;
  - `compose_510k_summary` (after S12).

**Repoint `intelligence-questions/engine.ts` to those paths:**
- `:552` (CSR)
- `:568` (510(k))
- `:580` (CER)
- `:604` (Module 3)

**Keep for now:**
- `protocol` and `sap`, whose content is design, not results;
- `pma`, which is F7.

**Red:** `generate_document {document_type: 'ctd_module3', sections: [{content: 'Assay 99.8%'}]}` → trunk writes a DOCX. The same for `csr`.

**Pins:** the generate_document and docbuilder tests; the intelligence-questions engine tests.

**Deletion rule:** this is a refusal, not a deletion. The replacement is named by path in the commit.

### S7. Retire `assess_benefit_risk` onto `assess_benefit_risk_balance`

**Delete:**
- `regulatory/benefit-risk.ts` and `regulatory/__tests__/benefit-risk.test.ts`;
- the `deepeningTools.ts:124` definition and its header line `:8`;
- the inventory and register entries.

Move the `deepening-tools.test.ts` cases. Red: a retirement test.

### S8. `build_effects_table` from the approved CSR Vault source (P-A)

**New `ana/effects-table-inputs.ts`:**
- Resolve with S2's `resolveRecordSourceProject`, then `resolveOpenProgram` for the program uuid (required).
- `listCsrVaultSources` with `{organizationId, userId, programId}`. Keep entries with `approved: true` as candidates; none → `needs_data`.
- Source choice:
  - a `source {documentId, expectedSha256}` in the input; or
  - the only approved source;
  - with several approved sources, `needs_parameters` listing them. No pooling.
- Load with `withCsrVaultSource(pool, scope, selection, {requireApproval: true, consume})`, never `previewCsrVaultSource` (I-13).
- **Favourable rows:** efficacy entries with a `comparatorArmId`.
- **Unfavourable rows:** SAE and discontinuation incidence by arm, from `loaded.tables` (`buildCSRTables`); do not recount.
- Importance and uncertainty: stated basis, or "not assessed". No derived magnitude.
- Receipt: `{documentId, version, sha256, dataCutDate, sourceApproval, clinicalVerification: 'not-established'}`.
- A Vault or scope error is `read_failed`, never `needs_data`.

**Schema** (`benefitRiskTools.ts:180`): remove `treatmentValue`, `controlValue`, `ciLow`, `ciHigh`, `magnitude`, `evidenceSource` and `reference`.

**Red:** a supplied `treatmentValue: 42` reaches the trunk row. After the fix it is ignored, and the fixture envelope composes the rows (mock the loader as `orchestrator-csr-readiness.pglite.test.ts` does).

### S9. `draft_safety_narrative` from the CSR Vault source (P-A; PV records are F4)

- **`safety-narrative.ts`:** add `narrativeInputFromCsrSource(envelope, subjectId, pt?)`.
  - Mapped: age and sex (randomized subjects only, as the contract records them), arm name, protocol number, investigational product, pt, severity, `related` → causality, outcome, `ledToDiscontinuation`.
  - Listed in `missingFields`: onset date, day on study, first dose, dose, seriousness criteria, action taken, dechallenge, rechallenge, history, concomitant medications; plus age and sex for non-randomized safety subjects.
- **Handler** (~3838) moves into `ana/safety-narrative-tool.ts`.
  - It loads with `withCsrVaultSource` (approval required), as in S8.
  - It requires the subject in `participants` and refuses free facts (`ignoredSuppliedFigures`).
- **Schema** (`evidence-literature-tool-defs.ts:1003`): `subject_id`, optional `event_term`, optional `source`.
- **Red:** a typed `age: 63` reaches the trunk narrative. After the fix it does not; the fixture subject gives "58-year-old", and `missingFields` contains "onset date".
- **Also update:**
  - the text at `intelligence-questions/engine.ts:615`;
  - the playbooks `pharmacovigilance.ts`, `medical-information.ts` and `risk-management.ts`;
  - `flows/safety-narrative.ts` (its terminal tool now needs a recorded subject; F4).

### S10. Device post-market from records (after S3)

**`build_postmarket_report`** (~6837):
- eMDR and MIR are built from `mdr_event_id`, through `getMdrEvent` and the source complaint's `getComplaint`.
- Manufacturer, brand and product code come from the program record; otherwise they are listed as missing and `valid: false`.
- FSN returns the outline only.
- Remove `fields` from the schema.
- Add a `RECORD_SCOPES` entry for `mdr_event_id`, joining through `regulatory_programs` as `capaMdr.service.ts` does.
- A 42P01 error is `read_failed`.

**`assess_mdr_reportability`:**
- An optional `complaint_id` reads the stored classification.
- A classification stored before S3 cannot show which inputs were stated. It is reported as "computed at intake with possibly unstated inputs", not as the determination.

**Red:** free `fields` give a trunk payload with `valid: true`. After the fix they are refused.

**Pins:** `capa-mdr-tools.test.ts`, `postmarket/__tests__/report-authoring.test.ts`.

### S11a–S11b. Device premarket from the program

- **`assess_device_cybersecurity`:** reads `loadProgramDeviceAssemblyInput` (the `cyberDevice` flag and governed cybersecurity/SBOM leaves). It reports presence and status only, never `pass`.
- **`build_device_blueprint` and `assess_device_evidence_structure`:**
  - project mode from the same loader;
  - CER from `assessStoredCer` (`market-specs/stored-cer-assessment.ts`), PER from `ivdr_per_documents`, RMF from `risk_items`/`risk_controls`;
  - typed `present` and `present_section_ids` are hypothetical only, with `DEVICE_ASSEMBLY_HYPOTHETICAL_BASIS` wording.
- **`assess_substantial_equivalence`:** no SE or NSE determination from AnA.
  - `predicate.se_matrix_rows` has no reader or writer in `server/`, and its writer's persistence is unverified (I-14).
  - Return the 510(k) decision flow with `basis: 'stated'` and `determination: null`.
  - Revisit if the SE matrix gains a governed record path.
- **Pins:**
  - the `build-device-blueprint-*.test.ts` files;
  - `cer-tools-leave-an-omitted-equivalence-claim-unrecorded.test.ts`;
  - `rmf-jurisdiction-input.test.ts`;
  - `submission-center-tools.test.ts`.

### S12. Remaining records in the catalog

**`compose_correspondence_cover_letter`** (~18165, offered):
- It takes `communication_event_id` and reads that letter's questions with `readQuestions` (`agency-responses/response-service.ts:349`) for the open integer project. No new SQL.
- `discipline` maps to category; `question_ref` and `question_text` are shown.
- `severity` is printed as "as triaged in Communication". A row never triaged carries the column default `'major'`, and the letter says so.
- `blocker` and per-question section numbers are not recorded, so neither is printed or inferred. The eSTAR sections to pull are given by `documentId`, which must belong to the open project.
- Typed `issues` are refused.
- State in the design how this relates to `response-package-docx.ts`: the package is the signed response, and this tool writes the 510(k) cover letter over eSTAR sections. If the founder wants one letter, converge them (F8).
- Pins: `advanced-modeling-cover-letter-tools.test.ts`.

**`compose_510k_summary`** (~18185, offered):
- Predicates, class, product code and regulation number come from the program's classification record. Typed values are refused, and missing ones are listed in `missingSections`.
- Red: typed `predicates` appear in the trunk body.

**`generate_declaration_of_conformity`** (`:6827`):
- Basic UDI-DI comes from `udi_records`; class comes from the program classification.
- Notified-body and certificate numbers have no record, so they are listed as missing and the result is never `valid: true`.
- Red: typed fields → trunk `valid: true`.

**`assess_output_confidence`** (~1227): retire it. Its `n` has no record equivalent (I-16). Delete the definition (`evidence-literature-tool-defs.ts:1561`), the handler, the inventory and register entries, and add a retirement test. `honesty-envelope.ts` stays for its other callers.

**`assess_biowaiver`** (~19113):
- First extract the dissolution read from `compare_recorded_dissolution` (`:17615-17625`) into `cmc/recorded-dissolution.ts`, scoped by organization and project.
- `assess_biowaiver` takes the two profile ids and calls it on the server. A typed `f2` is refused. The BCS booleans keep a stated basis.

**`generate_spl` / `generate_spl_xml`:** decision F5.

### S13. Delete the dead request-body routes (inventory-plan S13 as written)

> **Added 2026-10-26 (S1 review):** `POST /runs/:runId/regenerate` has no client caller. Outside development, S1 refuses
> every body it could carry except one with every array empty, which re-runs every step over nothing. Refuse it outside
> development, or retire it, with `POST /runs/for-program` as the replacement.

- **Delete:** `/m2/nonclinical`, `/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate` and `/validate/hardened` (`submission-orchestrator.ts:918-1094`), and the schemas only they use.
- **Keep:** `NonclinicalStudySchema`, `CSRInputSchema` and `StudyDataSchema` while Mode B uses them in development; `csr-readiness-launch-claim.test.ts`.
- **Red:** in development the five paths return 404. On trunk they are handled.

### S14a–S14e. Nonclinical records (after F1; assumes A2)

- **S14a, migrations:**
  - Put `migrations/20260610_iacuc_animal_governance.sql`, then `migrations/20260610_nonclinical_send.sql`, on `C2C_MIGRATION_FILES`, before `db/migrations/20260716_nonclinical_display.sql` and above the final pair. First check that every statement is replayable with `IF NOT EXISTS`. This adds research-admin tables to deployed databases (schema only, no surface).
  - Shrink the deploy-path baseline.
  - New additive file:
    - `ADD COLUMN IF NOT EXISTS program_id uuid`;
    - an idempotent backfill from `submissions.program_id`;
    - an index on `(organization_id, program_id)`.
  - Primary pharmacology, if admitted: amend the creator's inline CHECK in place with a dated header note, and add a replacement conditional on `pg_get_constraintdef` for deployed databases. Do not append a DROP.
  - Red: `ci:migration-set-order`, plus a replay test that applies the set twice.
- **S14b, writers:**
  - `createStudyTx` and `routes/nonclinical.ts` `studySchema` accept `programId` (checked with `programInOrganization`), `durationLabel` and `keyFinding`.
  - The bridge passes them through.
  - Red, pglite: POST, then `listStudiesForSummary` returns them.
- **S14c, the tools read the record:**
  - `listStudiesForSummary(orgId, {programId, statuses})`, with statuses per F1. Export `toStudyInput`.
  - The `module2-nonclinical-inputs.ts` branch returns `ok`. M2.4 composes, and findings read "target-organ findings (not recorded)". M2.6 composes through `composeM26WrittenSummary`.
  - S4's tools read the same rows through a governed-row → `NonclinicalRow` adapter. The genotox component cannot be derived, so the battery stays open.
  - 42P01 or a missing table is `read_failed`.
  - Red: a project's NOAEL appears in its M2.4; another project's NOAEL and a study with no project do not.
- **S14d, the orchestrator:**
  - `/runs/for-program` (`:324`) passes the loader's output instead of `[]`.
  - S1's `ctdProgramId` refusal stays.
  - `load-nonclinical-studies-for-project.ts:56` returns unavailable, not `[]`, when the feature is switched off (development only).
  - Move `submission-orchestrator-inputs.pglite.test.ts`.
- **S14e:** if F1 admits the surface, `GET /api/nonclinical-summary` takes a program. Delete `POST /document` (the S44 bullet).

## 4. Routes

| Route | Recommendation |
|---|---|
| `POST /runs` and `/runs/:id/regenerate` with inline `nonclinicalStudies` / `csrInputs` / `clinicalStudyData`, Mode A `ctdProgramId`, regenerate Mode A | Refuse outside development (S1) |
| `/m2/nonclinical`, `/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate`, `/validate/hardened` | Delete (S13) |
| `POST /api/nonclinical-summary/document` | Delete (S44 / S14e) |
| `GET /api/nonclinical-summary` | Keep; fix in S14e if admitted |

## 5. Founder decisions

- **F1. Which nonclinical store M2.4 and M2.6 read.** Recommendation: A2 (`nonclinical_studies`), with its costs as listed in the original design. That includes deciding which statuses count: `in_reporting` may count for an IND; `planned` and `cancelled` never do.
- **F2. Whether calculators over stated inputs stay** (with `basis: 'stated'` and no program verdict) or are withheld until a record exists. S5-0 makes the label universal either way.
- **F3. Whether `assess_bla_filing_risk` stays.** Recommendation: withhold it in production.
- **F4. Whether PV `adverse_events` is admitted as a narrative source.**
- **F5. Whether `labeling-pi` is in launch.** Either way the two SPL generators converge.
- **F6. Whether eTMF is admitted for `assess_inspection_readiness`.**
- **F7 (new). Whether the PMA "Generate Document" action stays.** There is no record path for a PMA document today. Until decided, it stays with a stated-basis label.
- **F8 (new). Whether the device cover letter and the Communication response package are one letter.**

## Dependencies

- Independent: S1, S3, S5-0, S6, S6b, S7, S13.
- S2 comes before S4, S8, S9, S10, S11 and S12.
- S3 comes before S10.
- S14 depends on F1.
- S12's SPL item depends on F5.
- S9's PV variant depends on F4.