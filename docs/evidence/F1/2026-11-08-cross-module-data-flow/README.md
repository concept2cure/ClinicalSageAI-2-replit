# Cross-module biotech evidence continuity

Plan: F1. Workstream W1, launch row D2. Inspected base: `f9631c065af8760d8b879232385fb94663d19a24`. This records the current continuation's repairs, remaining contracts and acceptance cases. It is an engineering assessment, not a claim that every biotech workflow or filing is qualified.

**Published:** the repairs are on `concept2cure-v2` in [c88d892390a15f01d258f7a72fb597858aaf4497](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/c88d892390a15f01d258f7a72fb597858aaf4497), after the complete ordinary pre-push passed. The published tree exactly matches the tested tree. The final qualification record below supersedes the intermediate gate-pending statuses retained for transparency.

## What already exists

| Existing home | What it already owns | Boundary exposed by this review |
| --- | --- | --- |
| `server/routes/c2c/project-intake.ts`, `server/services/c2c/add-project-market.ts` | Program intake, governed home/regional documents and canonical submission creation | Submission reuse omitted region; corrected in this pass. |
| `server/services/c2c/program-project-anchor.ts`, `current-program-access.ts` | Program/project reconciliation and current actor admission | A program UUID and a legacy project integer are different identifiers. Callers must retain the unique verified anchor and workspace. |
| `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`, `catalog-facts.ts`, `server/routes/chat/upload.ts` | Captured source identities, extraction, study matching, supersession and audit | Upload capture now resolves study before predecessor selection and serializes competing captures. Historical checksum reads retain their original contract. |
| `server/services/rbm/rbm-actuator.ts`, `server/routes/mdx-rbm.ts` | Assessment-derived monitoring plans, persisted actor and independent approval | Generation now retains the authenticated actor and refuses a missing recorded overall risk. |
| `server/services/capa-mdr/capaMdr.service.ts`, `server/services/qms/changeControl.service.ts` | CAPA and change-control lifecycles, links and evidence | Closure now checks recorded required work/current verifier and handles concurrent content/link changes. A required document link still cannot identify an exact accepted revision. |
| `server/services/cmc/batch-release-evidence.ts`, `server/api/cmc/batchRecordRoutes.ts` | Recorded QC evaluation and signed batch disposition | Exact nullable project scope, complete evidence fingerprint and final signing-authority/evidence rechecks are repaired. No native QMS deviation-to-CMC batch foreign-key bridge was found. |
| `server/services/analytical/method-validation.ts` | Deterministic linearity, precision and accuracy calculator | Undefined or unrepresentable precision refuses instead of becoming a numerical pass. |
| `server/routes/ana-biostats.ts`, `server/services/ana-biostats/`, existing Biostatistics surface and shared authoring handoff | Calculation, document composition and editor handoff | The existing document endpoint now recomputes results and saves the exact calculation, current design and distinct sizing-run basis with the document in one canonical transaction. Worked examples remain explicitly illustrative. |
| `server/routes/authoring.router.ts`, `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | The existing single editor, revisions, audit and optimistic version tokens | Ordinary saves now compare the supplied token under the write lock. Track-changes adopts only its own still-current returned token. Omitted tokens remain accepted for existing compatibility callers. |
| `shared/authoring/csr-scientific-review.ts`, existing CSR table, claim, narrative and evidence-map readers | CSR figure rendering and claim reconciliation | Numerical tokens require comparator, sign, precision, unit and contextual-span integrity. This is reconstructed and tested separately; historical hashes/receipts are not rebaselined. |
| `server/services/authoring/csr-import-into-document.ts`, `workflow-import-governance.ts` | Approved CSR build import and immutable origin verification | A document bound to one build refuses import from another. Two separate CSR-template documents retain separate cuts and imports; the existing refusal now explains that recovery path. |
| `server/services/tasking/task-project.ts`, `task-side-effects.ts`, `server/routes/taskManagement.routes.ts` | Source placement, dependency graphs, completion cascade and task audit | Explicit source-project mismatch and mixed dependency representations remain owner-scoped findings below. |
| `server/routes/c2c/agency-responses.ts`, `server/services/agency-responses/`, existing AgencyResponses surface | Correspondence, question proposals, response editing and governed writes | Proposal source/offset information is lost at the record-form boundary. Current coordination assigns this repair to the Spec lane. |
| Existing Vault, canonical document, authoring and submission services | Version custody, release/review, filing placement and transmission evidence | Captured source, working document, released version, rendered leaf and transmitted bytes are separate identities. None can substitute for another by title alone. |

Discovery used current-source searches for IDs, study/protocol labels, source hashes, capture/supersession, document import, task blocking and source placement, market reuse and question proposals. Bounded deleted-history checks and narrower inventories are recorded in the individual repair READMEs. No parallel service, new table, screen or route is introduced by this work.

## Identity contract across the workflow

| Identity | Meaning | It must not be confused with |
| --- | --- | --- |
| Organization and client workspace | Tenant and client boundary, rechecked against current actor access | A caller's body/header claim or a formerly valid membership |
| Regulatory program UUID | Product/development/filing program | `projects.id`, the integer task and legacy project anchor |
| Study design string ID | The design's public study identity | Numeric study row/reference or a sponsor protocol number |
| Numeric study reference | Resolved database study binding for retained sources/runs | Free-text study names, extracted protocol labels or a matching filename |
| Source ID + captured checksum + study binding | Exact captured material and its provenance | Latest similarly titled file, a withdrawn capture or an unverified protocol guess |
| Calculation inputs hash + results hash + engine version | Reproducible deterministic calculation basis | A saved design's sizing run when the workbench inputs have since changed |
| CSR frozen input ID + build/job ID | One clinical cut and its generated tables/sections | A protocol label alone or a newer build under the same study |
| Authoring document UUID + section UUID + revision | Exact collaborative working text | A separate colleague's copy, a template heading or a metadata-only response |
| Controlled document ID + approved version/digest | Released Quality content | A link to the mutable document's business ID or any earlier effective SOP |
| Batch ID + program + recorded QC row identities | The particular manufacturing/disposition evidence | Batch-number text reused by another project, or an unassigned project treated as a wildcard |
| Submission ID + program + application type + region | The filing's canonical application identity | Another region's application of the same type |
| Sequence + leaf identity + exact rendered digest | The version placed into a filing | The source's title, working text, an unsigned draft or a different export |

Every consumer needs both identity and applicability: product, formulation/strength, manufacturing site/process, study, population/estimand, cut date, jurisdiction, pathway and lifecycle stage. A valid hash proves which bytes were used; it does not establish that those bytes support the scientific claim or apply to the requested filing.

## CMC and Quality use-case coverage

The filing destinations below use the established CTD organization, not the January 2026 M4Q(R2) draft. FDA explicitly labels that draft **not for implementation**. Sources: [M4Q](https://www.fda.gov/media/71581/download), [M4Q(R2) draft status](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m4qr2-common-technical-document-registration-pharmaceuticals-human-use-quality).

| Evidence/use case | Typical downstream use | Required engineering distinction |
| --- | --- | --- |
| Substance identity, characterization and impurities | 3.2.S and the Quality summary | Substance/version, method, impurity identity and reporting basis |
| Manufacturer, process, materials and process controls | Substance/product manufacturing sections | Site, process version, scale, stage and affected batches |
| Formulation and pharmaceutical development | 3.2.P.1/P.2 | Strength, dosage form, presentation, excipient and clinical formulation |
| Specifications, analytical procedures and validation | 3.2.S.4/P.5 | Approved specification/method revisions, units and acceptance criteria |
| Batch analysis and release | Batch analysis sections and readiness decisions | Actual batch/test/result/reviewer/disposition; a passing flag alone is insufficient |
| Stability, packaging and storage | 3.2.S.7/P.7/P.8 | Lot, timepoint, condition, container closure and supported shelf-life scope |
| Biologic characterization and comparability | Relevant substance/product and supporting sections | Product-specific attributes, biological activity and pre/post-change evidence |
| Supplier or contract manufacturer change | Change assessment and affected filing content | Supplier/site qualification, exact affected records and market-specific reporting assessment |
| Deviation, OOS/OOT, investigation and CAPA | Release, change control, inspection evidence and relevant regulatory explanations | Investigation conclusion, required actions and recorded effectiveness |
| SOP revision, training and implementation | Quality execution and inspection readiness | Exact required released revision and effective-date/training completion |
| Master-file/authorization reliance | Cross-reference and applicable quality sections | Holder, authorization version, scope and current permitted reliance |
| Postapproval process/site/specification change | Applicable supplement, variation or lifecycle report | Approved baseline and jurisdiction/pathway-specific change classification |

These are routing and dependency cases, not a rule to file the entire Quality system in Module 3. ICH Q10 treats process/product monitoring, CAPA, change management and management review as connected quality-system elements; the proposed software contract preserves the evidence linking those activities. Source: [Q10](https://www.fda.gov/media/71553/download).

The existing CMC composer still has its approved **small-molecule US IND** boundary. It does not become a biologic, biosimilar, cell/gene therapy, marketing-application or global CTA composer because related source records exist. FDA's Phase 2/3 CMC guidance expressly excludes biotech-derived proteins and other biologics, so that guidance cannot supply a universal biotech rule set. Source: [Phase 2/3 CMC scope](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/inds-phase-2-and-phase-3-studies-chemistry-manufacturing-and-controls-information).

## Urgent Phase 2 CSR, including two concurrent reports

E3 provides the CSR organization; E9(R1) connects trial objectives, estimands, design, analysis and interpretation. The engineering acceptance cases below are our application of those principles, not verbatim regulatory requirements. Sources: [E3](https://www.fda.gov/media/71271/download), [E9(R1)](https://www.fda.gov/media/148473/download).

1. **Start from the assigned report.** Resolve its actual project, study, target document and intended clinical cut. A task title or shared filename is not the binding.
2. **Freeze the scientific basis.** Retain protocol/SAP versions, analysis populations, endpoint definitions, estimands, data-cut provenance, engine/version and table outputs. Separate planned sizing calculations from observed clinical results.
3. **Allocate collaborative work.** Assign sections to the same document. Source access, document editing and approval authority are separate permissions; inviting a collaborator does not confer all three.
4. **Handle simultaneous saves.** A valid supplied stale token must produce a conflict after the write lock. Preserve the losing user's text and expose the current saved revision. Metadata actions must not make the next content save stale against itself.
5. **Reconcile every numerical assertion.** Check all occurrences, including one correct and one conflicting occurrence. Preserve comparator, sign, scale, precision, denominator and unit. A bare scalar inside a ratio or longer token is not equivalent evidence.
6. **Keep review spans honest.** HTML/entity normalization must retain raw offsets; a matching digit outside the quote or selected section cannot support the claim. Multiple plausible source studies remain ambiguous.
7. **Run two reports side by side.** Same-named datasets or source files from study A and B must not supersede each other. Review, comments, saved tokens, receipts and import targets must stay attached to the correct document and cut.
8. **Treat late data as a controlled change.** Preserve the previous frozen input/build/review evidence. Do not mix another build into a document already bound to one. Reconcile changed tables, narratives, appendices and conclusions, and obtain the required new review before release.
9. **Release and file exact bytes.** Approval of working text, Vault custody, rendered leaf qualification and sequence placement are distinct checks. An assembled CSR is not automatically eligible for transmission.
10. **Rehearse failures.** Revoke access during a wait; lose an HTTP response after commit; retry the same source or handoff; reject an incomplete review; change a required source; and preserve uncertain transmission outcomes without resending blindly.

The two-report qualification uses real document creation, authenticated HTTP imports and reads, with synthetic frozen cuts and approved job rows. Both correct imports succeed. Wrong-target imports in both directions, and a second build replacing an existing origin, refuse without changing either document, revision history, receipt or retained cut. Two current collaborators read the same document and sections; revoking the document grant blocks subsequent access using the same token. The refusal directs a new cut to a new CSR-template document while collaborators continue opening the existing document.

This pass proves component and native transaction properties. It does not yet prove a complete two-person, two-report browser rehearsal from assignment through signed release and submission receipt. A separate document for another cut is supported; a formal successor/supersession relationship and a complete new scientific-approval ceremony are not established by these fixtures.

## Remaining owner-scoped findings and acceptance

| Finding | Current evidence | Required acceptance before closing |
| --- | --- | --- |
| Explicit task project bypasses source-derived project | `taskManagement.routes.ts` returns an explicit project before `projectForTaskSource` | Reject source/project mismatch after current source and project admission on the mutation transaction. Preserve legitimate unfiled task behavior. |
| Mixed dependency stores can unblock early | `task-side-effects.ts` returns when `blockedBy[]` becomes empty before considering other DAG predecessors | The union of active blocking predecessors must be satisfied. Test both storage forms, missing/retired predecessors, reopen, terminal history and route-controlled review tasks. |
| Dependency creation reads endpoints by tenant, not project permission | Existing dependency route selects tenant/task/status but not each endpoint's project grant | Recheck both actual parent projects, current actor and cross-project policy under the edge write. |
| Question proposals lose retained source descriptor | AgencyResponses retains only ref/text; creation schema has no source/span descriptor | Keep exact source ID/checksum/text/span, re-resolve under the letter lock, distinguish edited/manual text, and preserve immutable provenance. |
| Required SOP/document completion cannot be proven | Change link has business ID/reference but no required version/digest/acceptance contract | Agree and implement exact-revision evidence in existing authorized homes; never treat an old released SOP as completion of a new change. |
| Native deviation-to-batch join is unestablished | No verified QC deviation batch FK/current writer bridge to CMC batch records found | Establish authoritative relation and writer participation before claiming batch-wide native Quality closure coverage. |
| QC insertion/duplicate batch attribution | Existing read locks selected QC rows; batch-number/project matching is not a batch FK | Qualify concurrent new-result writers and same-project repeated batch labels; row locks alone do not lock an absent future QC row. |
| Formal late-cut report succession | Separate CSR-template documents and exact import targets are qualified; cross-build import refusal protects the original | Establish an explicit controlled successor relationship and new review without replacing prior origin/history or rebaselining receipts. |
| Current standards and scientific guidance | See currency findings below | Pin actual source assets, implement applicable rules and exercise positive/negative fixtures; a version-label change is not qualification. |

The coordination record `.design/claude-convergence/COORDINATION.md` currently assigns task/board/status/side-effect writers to Trust and agency proposal/record/read/UI provenance to Spec, with an additional RIM hold on the letter splitter/services. This pass records exact findings without overlapping their source edits. Other held source, editor dirty-buffer, training and submission-dispatch scopes remain intact.

## Regulatory currency findings, checked 2026-11-08

- FDA's current eCTD 4.0 standards page lists regional IG **1.9**, CV **1.2**, validation criteria **1.7** and TCG **1.5**. Support dates differ. FDA now supports forward compatibility for existing 3.2.2 applications from **2026-10-16**. Any older baked-in profile needs a source/rule/fixture reconciliation, not an assertion that newer labels are supported. Sources: [standards](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1), [implementation status](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd-v40).
- The October 2026 notice sets **2027-01-16** for rejection under specified new high-severity validations. Publication, support and enforcement dates must remain separate. Source: [Federal Register notice](https://www.govinfo.gov/content/pkg/FR-2026-10-16/html/2026-21195.htm).
- `server/services/biosimilar/biosimilar-knowledge.ts` still cites the 2015 quality guidance and the 2017 statistical draft as current bases for tier/lot advice. FDA's September 2025 final comparative-analytical guidance replaces the former; the latter was withdrawn in June 2018. The existing tier computations must not be represented as current universal FDA requirements without a fresh scientific contract. Sources: [2025 final](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/development-therapeutic-protein-biosimilars-comparative-analytical-assessment-and-other-quality), [withdrawn guidances](https://www.fda.gov/drugs/guidances-drugs/withdrawn-and-expired-guidances-drugs).

[The biosimilar guidance assessment](biosimilar-guidance-assessment.md) records the exact existing functions, caller contracts, current primary sources and 15 required regressions. It distinguishes final, draft and withdrawn material, including FDA's still-current recommendation for at least 10 reference-product lots. The finding is not that this number is obsolete: unsupported universal thresholds, stale attribution, categorical study requirements and automatic eligibility conclusions need correction together. No biosimilar source behavior was changed in this pass.

## Fresh execution environment and evidence

The prior unpublished checkout/bundle was not recovered after the workspace reset. Repairs were reconstructed against the canonical branch and tested anew. The precision source SHA-256 is `ee271ad3e8f7c66dbc03e6d82552a28893f161f786169013443db3041e49e3d4`; this is a source comparison, not recovery of the previous Git commit.

Node 22.23.4 and the repository lockfile install were used. Native tests used disposable PostgreSQL 17.7 provisioned through ordinary fresh-install and deploy-migrate paths, including pgvector and final tenant/grant checks. `native-provision.log` records provisioning. `native-runtime-role.log` confirms verified TLS, `app_service`, RLS on, non-superuser and no BYPASSRLS. No production database or customer data was used.

Initial implementation runs are below; subsequent source changes and their reruns are recorded in the publication follow-up.

| Repair | Fresh evidence | Limit |
| --- | --- | --- |
| RBM | 165 focused cases | Component/PGlite; no native RBM concurrency claim |
| Precision | 43 focused cases | Numerical/handler behavior only |
| Editor | 19 atomic, 3 actual Workbench/TipTap, 83 adjacent; 6 native | Supplied-token concurrency; full browser collaboration remains unproved |
| Source capture | 31 source/fact/checksum, 121 adjacent, 10 native | Durable capture verified; provider unavailable, so embedding/retrieval-vector success unclaimed |
| Quality/CMC | 146 focused/adjacent, 13 native CAPA, 7 native QMS | QMS concurrency starts from a synthetic verification state; no full signed lifecycle claim |
| Market identity | 77 focused/adjacent | Submission identity, not jurisdictional filing qualification |
| CSR numerical fidelity | 210 focused/adjacent in 14 files | Synthetic scientific evidence; no clinical validity or human-review claim |
| Two CSR reports | 26 focused: 10 server PGlite/HTTP and 16 client | Synthetic retained cuts/approved jobs; no clinical-source freeze, final signature or full browser rehearsal |
| Statistical authoring basis | 196 distinct component/PGlite/adjacent and 5 native | Deterministic planning draft, with independent review still required; no observed clinical-result or filing qualification |

Counts describe their respective repair scopes and are not a platform-wide test total. Adjacent tests can overlap between rows. CSR fidelity and statistical handoff have their own evidence directories, commands and source manifests.

The exact frozen production source passed `npm run build` on Node 22.23.4, including Vite, server, audit-chain verifier, qualification verifier and controlled runtime-asset packaging. The build emitted existing chunk-size warnings; `build.log` retains the full result. The required compiler and ordinary pre-push gates are a separate publication condition; targeted greens and a successful build do not substitute for them.

`scripts/ai/verify-tests.sh` exited 0. The first invocation examined only the remaining untracked documentation, so it was repeated with the script's supported `GITHUB_BASE_REF=concept2cure-v2` comparison to inspect the whole unpublished range. `test-presence-range.log` records its filename-only warnings, including the shared test fixture without a same-named companion. Behavioral coverage comes from the executed suites above, not this presence scan; no strictness flag or check implementation was changed.

Separately established test limitations remain visible in their evidence: the CSR release-order test fails identically against the original source because independent review is checked before evidence identity; the AnA QMS handler group is blocked before handler execution by `SKILL_POLICY_UNAVAILABLE`, also reproduced against the original service. Neither the gates nor the test expectations were changed to hide those outcomes.

## Publication integration follow-up

The first ordinary pre-push run stopped at SQL interpolation (`prepush.log`). An independent run of the existing pushed-warning check also found 34 net new warnings (`lint-warnings.log`); the pushed-error check found no errors. These were real publication failures, not passing gate results.

The follow-up keeps the existing write and review contracts while replacing new dynamic SQL with static statements and bound values, binding three existing clamped list limits, and extracting cohesive private validation helpers. Long test groups are divided by behavior; their assertions remain. QMS's existing SQL interpolation allowance is tightened from **9 to 8**, exactly as the scanner requires after the implementation removes an interpolation. No allowance grows, and no gate logic, lint suppression, typecheck baseline or design-plan rule is changed.

Fresh post-cleanup verification includes:

| Group | Result | Evidence |
| --- | --- | --- |
| Source and statistical server behavior | 77 passed in 8 files | Source-lineage `08-gate-repair-server-regressions.log` |
| Shared handoff, Biostatistics, recovery and canonical authoring | 174 passed in 12 files | Biostatistics `12-gate-repair-ui-canonical.log` |
| Native source concurrency, capture provenance and statistical basis | 15 passed in 3 files | `native-source-biostat-after-sql.log` |
| Quality, CMC and CSR route compatibility | 159 passed across 8 files; the last CMC run resolves a timezone-only fixture expectation | Quality `targeted-refactor-fixture.log` and `targeted-cmc-static-sql-final.log` |
| Native CAPA and QMS concurrency | 20 passed in 2 files | Quality `native-after-sql-lint.log` |
| Native editor save concurrency and version ordering | 6 passed in 1 file | Editor `native-after-lint.log` |
| Market test regrouping | 45 passed, zero scoped lint warnings | Market `lint-refactor-validation.log` |
| Final CSR numerical/representation/unit checks | 241 passed in 14 files | CSR `composite-unit-green.log` |

The independent filing-exit, signing-ceremony, discarded-audit-write, server-error-disclosure and repository-health diagnostics also pass. These diagnostics do not replace a complete ordinary pre-push run on the final quiet tree.

The final CSR follow-up additionally prevents inherited entity names from crashing the matcher, interprets already-rendered text only once, and refuses borrowing a bare count for a composite quantity such as `5 pg/mL`. It preserves exact composite source displays, ordinary subject counts, raw quote offsets and all 14 held saved-evidence exports. The helper remains a bounded numerical matcher, not a general clinical interpretation or unit-ontology engine.

After all production and test source was frozen, `build-final.log` records a second successful complete build. `lint-errors-final.log` records zero ESLint errors across 75 changed files; `lint-warnings-final.log` records a net decrease of one warning. `test-presence-final.log` records the required final comparison against the canonical branch. The 41 native cases above are distinct cases in six files, rerun after the SQL/lint cleanup. Full compiler and complete ordinary pre-push completion remain separate release evidence.

### Canonical program reservation follow-up

The next ordinary pre-push run (`prepush-final.log`) stopped at the program-ownership single-source check. Capture's direct row-lock query duplicated the canonical ownership helper and ignored an empty result. Two new regressions demonstrated that an absent locked program could allow capture to reach insertion before a later rollback, and that unavailable verification escaped as an unclassified failure.

Capture now calls the existing `programInOrganization` contract with `forShare: true` on the capture transaction. It retains the advisory reservation, project-lock order, current actor checks and post-wait admission. Absence returns `404 PROJECT_NOT_FOUND` before insertion; unavailable verification returns `503 PROJECT_ACCESS_UNAVAILABLE`. The canonical helper, gates and baselines are unchanged.

Source-lineage evidence records both initial failures and **78 passing cases across four files**, plus green ownership, SQL and scoped lint checks. The native capture/provenance rerun passes **10 cases in two files** (`16-native-canonical-program-lock.log`). These are reruns of the source cases within the 41 distinct native cases above, not additional cases. `build-final2.log` records a successful complete production build after this repair. The source manifest is refreshed to these exact source bytes; full ordinary pre-push and compiler completion are still required before publication.

### Compiler qualification follow-up

`prepush-final2.log` passed every ordinary gate preceding TypeScript, then failed when a full-program compiler worker was terminated by `SIGKILL`, after 1,600 of 15,470 source targets had completed. A supplemental compiler diagnostic overlapped that run. The termination is recorded as an incomplete gate; the available process samples do not establish an intrinsic failure of the 200-target configuration when run alone. Subsequent heavy verification is serialized.

The supplemental diagnostic used the same full program and option context, checking changed files to expose repair-specific errors sooner. Its first 20-file worker found `TS2322` in project intake: an unresolved region could be passed to a writer requiring a confirmed region. It stopped immediately. Of 75 changed TypeScript paths, 65 are included in the unchanged TypeScript program and 10 are excluded by that existing configuration. This partial diagnostic is not a substitute for the full publication gate.

The intake helper now refuses an unresolved requested market before any filing read or write. Two behavioral regressions demonstrated the previous database-constraint failure; two positive controls preserve the existing application-type fallback. The repaired market and route suites pass **81 cases in four files**. No typecheck configuration, error baseline, gate logic or filing support boundary was changed.

The next serial supplemental diagnostic completed 60 of 65 configured changed targets. The first 40, including the changed production files, were clean; the third group returned six errors in two PGlite fixtures, where the test shim deliberately exposes query rows as `unknown`. `changed-type-diagnostic-second.log`, its summary JSON and resource samples preserve that result. All workers completed normally; the driver stopped when it received the errors. The largest completed worker used approximately 6.58 GiB RSS.

The affected fixture setup/assertion queries now use the existing PGlite handle's generic result types. Nullable provenance and lineage fields remain nullable, and every assertion is retained. Production calls and transaction-trace checks still use their existing executors. `typed-fixture-regressions.log` records **22 passing cases in two files**, including all 10 CSR-import HTTP cases and 12 statistical-basis cases. `typed-fixture-lint.log` records zero scoped warnings/errors. Five configured changed targets still remained unchecked when this diagnostic stopped; none of these partial runs constitutes full compiler completion.

After the requested-region guard and fixture corrections, the complete production build passed again (`build-final3.log`): client, server, both verification tools and all four controlled runtime assets. The source manifest records the updated source and fixture bytes.

The subsequent supplemental run inspected all **65 configured changed targets**. Its first 60 were clean, including the corrected CSR-import and statistical-basis fixtures. The final group reported three remaining fixture errors: an efficacy result lacked its required numeric `value`, and the QMS test pool exposed unknown row types to two injected clients. `changed-type-diagnostic-third.log`, its summary and resource samples retain the complete result; final snapshot verification was correctly not run after errors.

The efficacy fixture now includes `value: 12`, matching its existing display. The existing QMS pool adapter now uses PGlite's typed object-row result; its interleavings, SQL and assertions are unchanged. The two affected suites pass **39 cases** in `final-fixture-regressions.log`; `final-fixture-lint.log` is clean. These last edits affect fixtures only, so the production source remains the source built in `build-final3.log`. Their source hashes are refreshed before the final compiler qualification.

The restricted follow-up checked exactly those two repaired fixtures in the full 15,470-file program. Discovery, their semantic checks and the final unchanged-snapshot verification all exited 0 with zero diagnostics (`changed-type-diagnostic-final-two.log` and its summary). The other 63 previously checked changed targets were not repeated. This is supplemental repair evidence; the complete ordinary pre-push remains the publication condition.

## Canonical branch integration

During qualification, the canonical branch advanced from `f9631c065af8760d8b879232385fb94663d19a24` to `7eb7346c54020ad68ac07fd6bb9c8b4116f6e62b`. Its 20 commits changed 35 paths, including S6 Vault folders/binders, the demo's Codespace session window, and project/Codespace handoffs. None overlapped this continuation's changed paths. A normal merge preserves both histories and all incoming changes.

The new Vault folder index, client folder list and folder-export tests pass **11 cases across three files** on the combined tree (`merged-vault-folders.log`). This is focused compatibility evidence, not a new browser or native folder-governance qualification. Upstream raw audit evidence is retained byte for byte, including its original display whitespace. The latest coordination releases the S6 folder, Codespace and D3 project-page holds; the task, agency, editor-drafting and submission holds relevant to this report were not released by these commits.

The complete merged production build also passes (`build-merged.log`), including the client, server, audit-chain verifier, qualification verifier and all four controlled runtime assets. The complete ordinary pre-push is run only after this combined tree is committed and quiet.

The final publication manifest must compare against the integrated canonical head `7eb7346c54020ad68ac07fd6bb9c8b4116f6e62b`, preserving its folders, migrations and evidence as the base. The repair's source manifest continues to name only this continuation's 76 changed code/configuration paths.

## Final qualification and publication

The complete ordinary `.husky/pre-push` exited **0** on local commit `51e0d82b3d03f80043cc3ca37f6baa3cc2cb2f47`, tree `a6b2ba7cc6f311ef2a17940e1e686aa0d33a750b`, against integrated canonical head `7eb7346c54020ad68ac07fd6bb9c8b4116f6e62b`. Every preceding repository gate passed. Pushed lint reported zero errors and a net decrease of one warning.

The unchanged full-program TypeScript gate checked **all 15,475 configured source files exactly once**, using **33 completed workers**, and verified the final snapshot unchanged. It reported **zero errors against the unchanged zero baseline**. The existing bounded mode used 500 diagnostic targets per process and a 7,168 MB heap cap, with heavy work serialized. `prepush-merged.log` retains the complete gate output; its SHA-256 is `650e27d708ee52c7833ad716690e294ca72d0653c9a871456bf4060b5e5556dd`. `prepush-merged-resources.log` records the actual head/tree/base, parameters, same-process resource samples and exit 0.

Publication used the connected GitHub integration because ordinary HTTPS Git write authentication was unavailable. GitHub created the exact tested tree, and the candidate commit's tree, parent and message were verified before the non-forced, expected-head branch update. The canonical branch was then read back and fetched normally: [c88d892390a15f01d258f7a72fb597858aaf4497](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/c88d892390a15f01d258f7a72fb597858aaf4497) has tree `a6b2ba7cc6f311ef2a17940e1e686aa0d33a750b`. A normal local merge preserves the prior local repair commits and the canonical publication; no reset, rebase, new branch or force update was used.

`publication-verification.json` records these anchors in machine-readable form. The published application source remains the exact source that passed the full gate and merged production build. The later synthetic browser-seed repair below is separately qualified. The qualification limits and remaining owner-scoped findings above still apply.

## Post-publication browser-seed follow-up

GitHub's [Tier 5 run at the published source](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42515637802/job/128837908716) failed before server or browser startup: `seed-governed-workflow.cjs` wrote the journey persona `author` into `organization_users.role`, which the current `organization_users_role_known` constraint refuses. The [immediate-parent run](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42509830621/job/128820260153) has the same failure. Both runs passed schema provisioning and Chromium installation. `tier5-ci-seed-failure.log` retains the synthetic-only excerpts and source comparison.

The existing seed now keeps the author's persona key, email and identity while persisting its canonical organization role, `member`. Admin, reviewer and viewer keep their existing membership roles. The existing member-to-authoring grant supplies the intended access; production role policy and the database constraint are unchanged. The existing role-claim and signing-role suites pass **26 cases in two files** (`tier5-role-controls.log`).

The native reproduction in `verify-tier5-seed.cjs` passes (`tier5-native-seed.log`): the original committed seed fails on the actual deployed constraint, the repaired seed succeeds twice, all four memberships and every seeded organization/user/workspace/project/artifact/version identity remain stable, and `users.author` retains its original ID. A rolled-back attempt to store `author` still fails with SQLSTATE `23514`; the constraint remains unchanged and validated. The tracked `seed-data.json` is restored byte for byte. This is a synthetic seed test using its ordinary provisioning connection, separate from the 41 runtime-role native cases above.

Local Chromium was actually launched through Playwright 1.55.0; the environment refused the required socket operation before any browser context or navigation (`tier5-local-browser-attempt.txt`). No local browser-test pass is claimed. GitHub's existing Tier 5 workflow remains the available browser runner, and its result on the seed repair must be distinguished from the earlier seed-blocked run.

## Separate GitHub CI findings

The local ordinary pre-push result is green; GitHub CI is **not fully green**. The separate `ci:lineage-save-gate` exits **1** locally (`tier5-lineage-gate.log`), reproducing the [parent Lint job](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42509830703/job/128820260912): `server/services/chat-thread-helpers.ts` has an `unguarded-writer` finding, and `server/services/c2c/charter-objectives.ts` no longer matches the fingerprint for its `reviewed-structured-intent` classification. Both files and the guard are byte-identical across the parent, published source and current checkout. The [published-source Lint job](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42515637919/job/128837909441) also reports that failed step. These need a separate review of the writers and classification; no fingerprint, waiver or guard was changed here.

The [published-source full-history secret scan](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42515637919/job/128837909704) reports **8 findings over 13,099 commits**; the [immediate-parent scan](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42509830703/job/128820260859) reports **8 over 13,098 commits**. The available logs omit individual rule/path/finding-commit identities, and the connected tool does not support the annotations endpoint. Equal totals do not prove identical findings or a clean new-commit scan. No sensitive values, history rewrite, scan-policy change or suppression is included in this work.
