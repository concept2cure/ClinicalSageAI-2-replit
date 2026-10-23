# MDX project workflow — 2026-10-23

Founder request: reach device and diagnostic capabilities from the client project as core MDX features, with a 510(k) engineering/quality workflow and a distinct clinical-led CER workflow. Work remains on `concept2cure-v2`.

## What already exists

- `shared/regulatory/work-packages.ts` deterministically compiles work packages, dependencies, deliverables, acceptance criteria and shared evidence across filings. Extend this compiler with discipline ownership and pathway tailoring; do not create another workflow engine.
- `server/routes/mdx-work-packages.ts` exposes that compiler over industry profiles. No client caller was found. Project home can use the same pure compiler with its verified program record, rather than substitute organization profile defaults for the project's product.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` owns project identity, evidence, documents, review, submissions and responses. Reach the compiler inside this workspace, alongside those existing stages.
- `client/src/concept2cure/mdx/MdxSurfaceHost.tsx` hosts existing engineering, software, 510(k), PMA, CER, IVD and postmarket features in the one shell. Its pathway/first-program fallback can silently select a different project. Replace that fallback with the shell's explicit selection and a missing/unavailable project state.
- `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` and `catalogWorkflows.ts` in the same v2 tree are the single searchable Workflows catalog; `AdminSurfaces.tsx` reexports it. Nest MDX solutions inside Projects while retaining search, unknown additional capabilities, module ids, original backend group indices, access verdicts and administrator controls.
- `shared/constants/launch-scope.ts` currently excludes these existing features. Admit them as Projects features without adding module grants or another launch app.
- `shared/constants/domain/product-types.ts` already distinguishes IVD/CDx/SaMD and IVDR PER versus MDR CER. Reuse that vocabulary.

Searches covered MDX, work packages, Projects, CER, IVD, engineering, software, design controls, risk, human factors, catalog and entitlements in client, shared, routes, services and tests. `git log --all --diff-filter=D` was run for corresponding names. This workspace began with a shallow checkout, so no deletion result proves anything about earlier unavailable history. No existing implementation is deleted by this change.

## Implementation contract

The project record determines product and primary filing. Recorded additional project submissions extend the shared plan; an unreadable submission list is stated and never treated as complete. Workstream owners are discipline expectations, not fabricated person assignments, status, signatures or readiness. Existing document/review state remains authoritative.

The existing searchable Workflows catalog stays canonical. MDX access rows live
inside its Projects workflow through `MdxCatalogSolution.tsx`; there is no
second catalog implementation in `AdminSurfaces.tsx`. The MDX solution opens
Projects, and feature work continues from the selected project's workflow.
Per-feature locks and governed switches retain their original module and
backend group identities after search and regrouping.

510(k) places regulatory strategy, engineering, risk, applicable testing, writing and eSTAR assembly in sequence. CER emphasizes clinical evaluation planning, systematic literature review, appraisal, synthesis, qualified evaluation and recurring PMS/PMCF updates. IVDR uses scientific validity, analytical performance, clinical performance, PER and PMPF. Neither EU evaluation is modeled as waiting for a US clearance.

## Validation

The extended compiler, MDX features, project integration, document isolation,
catalog, entitlement and shell cohort passed **93 files / 936 tests**. The
shared-register cohort passed **11 files / 69 tests**. After integrating the
canonical branch's assembly-template search changes, assembly/project
integration passed **5 files / 81 tests**. The final surveillance-scope
correction passed **2 files / 16 tests**, and the incoming Reporting chooser
cohort passed **3 files / 41 tests** after its clean canonical merge. These
cohorts overlap; their counts are not a unique-test total. Full logs and the
final source fingerprints are recorded in this directory.

Production builds passed. The repository's complete pre-push gate passed,
including a full typecheck with **zero errors**, SQL/schema reachability,
import tracking, security/lifecycle guards, size ceilings and changed-file
lint. Separate launch-scope/API admission and undefined-CSS checks passed.
Changed files reduced the warning count by seven. Companion-test verification
and the pre-commit security scan passed.
The final post-merge receipts identify the exact checked source.

Canonical updates were merged on `concept2cure-v2`; existing workflow discovery,
company/session qualification, assembly-template search and Reporting chooser
changes were preserved.
No development branch or worktree was created.

## Scope and remaining limits

The selected project now determines MDX navigation, document class and editor
handoff. Preview reads require a recorded project anchor, current access and
the exact governed document class; they cannot borrow another project's rows.
Absent documents and unavailable reads remain explicit states.

Design controls, risk, labeling, human factors and IVD completeness include
existing organization-wide registers and are labeled accordingly. Surveillance
combines organization-wide feeds with project-scoped reporting clocks; its
visible scope distinguishes those reads. Specialist reports and narrative
work use project evidence/documents; links to existing shared views retain
their explicit scope labels. This increment does not migrate the register
data model.

Builds and automated tests do not establish live deployment or human visual
acceptance. No authenticated browser verification, production regulatory
execution, external laboratory testing or agency transmission was performed.

## Continuation: verify the visible project journey

The browser follow-through reuses the existing actual-component Vite/Chromium
pattern from `D2-WORKFLOW-NAVIGATION/2026-10-23/ui/`. Its MDX fixture and results
live in [ui/](ui/). The shipped workflow, catalog and Project home are imported;
only synthetic API records and callback observations belong to the fixture.
This qualification remains separate from authenticated deployed acceptance.

Browser inspection found that the shell reset erased the new utility-styled
buttons' padding and border. The workstream now uses the shell's existing
`.btn` / `.btn.ghost` recipe in `v2/styles/app-v2.css`. Review also caught De
Novo assembly falling back to Evidence; it now opens the project's Author
stage without converting the filing into a 510(k). The focused regression
first failed on that handoff, then passed with the correction.

The founder also reaffirmed that customers need project journeys, not a number
of apps. The catalog's AnA grounding now describes project stages and feature
access instead of app totals. Its project entry and the MDX host's return
controls use the same native shell button recipe as the workstreams. Existing
route/module identifiers continue to enforce access internally; they are not
the customer-facing product model.

Final combined qualification passed **16 files / 261 tests**, **14 real-browser
checks**, a production build and the full pre-push gate with **zero TypeScript
errors**. The browser held **38 source fingerprints** unchanged, made only
explicitly intercepted GETs and reported no unexpected requests or page errors.
The fixture has zero lint errors or warnings. Exact receipts and owned source
fingerprints are in [continuation/qualification.json](continuation/qualification.json).
These tests overlap earlier cohorts; no unique-test total is asserted. The
newer canonical auth, reporting and task-board recovery changes were retained
and included in the combined test selection.

[release/release-audit.json](release/release-audit.json) records the separate,
timestamped release observation for the initially published source. Queued
checks and unverified runtime/reviewer setup are not deployment evidence.
No release dispatch, production configuration change or agency action is
performed by this follow-through.
