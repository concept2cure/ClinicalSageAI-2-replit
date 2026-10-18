# Regulated project workflow reachability — read-only assessment

Reviewed branch: concept2cure-v2. Code assessment only: no build, browser, compiler or test execution. Existing regional/free-plan/protocol/QMS sources were not changed.

## Product assessment

The platform already contains substantial regulated workflow code. The gap is continuity and scope: clients can reach the canonical editor, protocol workspace, submissions and reporting, while several specialist boards remain outside the launch catalog. Some older planning models are organization-wide or use a different project identity. A registry entry or mounted API alone does not establish a client-ready end-to-end workflow.

| Capability | Actual code/UI state | Governed retained/output path | Limit |
| --- | --- | --- | --- |
| Reporting and analytics | Launch app for every client type; canonical Insights catalog/history/schedules/bundles and compliance navigation. `shared/constants/launch-scope.ts:162`; `client/src/concept2cure/v2/surfaces/Insights.tsx:1888`. | Run computation, retained scope/history, seal, export PDF and retained report packets through `/api/report-os`. | Catalog applicability and actual engine availability are separate. Actual computed scope must stay visible; most domain registers are organization-wide. |
| Protocol | Launch Authoring surface. GET `/api/protocol-dev`, create/register/edit/sign APIs, assembled export and explicit saved-source editor import. `ProtocolDevWorkspace.tsx:164`, `:188`, `:440`. | Stored protocol tree, signed manifestations, export; `/api/authoring/import/source` creates a separately governed draft preserving provenance. | Current UI takes `rows[0]` from newest organization protocols (`ProtocolDev.tsx:220-225`); assembler filters organization only (`pdev-view-assembler.ts:389-397`), independent of selected program. Selected-program continuity needs a separate bounded fix. |
| CSR | Registered specialist board with current program-scoped read, real saved job/section outputs, explicit exact saved-source import. `BiopharmaProject.tsx:306-329`, `:513-515`. | `/api/csr-workflow/board?programId=UUID`; `/api/csr/jobs`, status, sections, cancel; canonical `/api/authoring/import/source` preserving source origin and gaps. | CSR board is absent from launch app surfaces. No-job board tells the user to start a build but supplies no actual native build-start control (`:484-488`). Mounted execution API does not establish qualified/model-ready operation. |
| IND | Canonical submission path is launch-visible; built-in IND module/section/deliverable templates load through existing authoring create (`AuthoringCreateExport.tsx:120`, `:180`). Specialized lifecycle board exists separately. | GET `/api/authoring/ind-document-catalog`, GET `/templates`, POST `/docs`; saved sections, review/sign, filing copy/export through canonical editor. | Built-in templates are working scaffolds/preparation worksheets, not completed official forms, datasets, signed records or filing-readiness evidence (`ind-authoring-templates.ts:13-18`). |
| NDA/BLA/CTD | Canonical SubmissionCenter is launch-visible with selected submission/sequence and Builder/Validation/Shadow Review/Dispatch. Specialist NDA/BLA boards are registered separately. `SubmissionCenter.tsx:1655`. | Canonical `/api/submissions`; placed leaves, governed precheck/sign/freeze/dispatch/transmit, sequence compile and package download (`SubmissionSeqWorkspaces.tsx:1971`). | Specialist NDA/BLA cockpit, IND lifecycle, Pyramid and Twin are not included in launch app surfaces. Do not restore unmounted legacy `/api/submission-center`. |
| Submission WBS/Pyramid | Existing deterministic type/phase/task/reference-document UI, GET `/api/v1/pyramids/types`, `/:type`, `/global-pyramids`; mounted `register-regulatory-routes.ts:473`. | Progress GET/PATCH `/api/v1/pyramids/:type/progress[/taskId]` persists via existing feature store. | Progress belongs to organization + submission type, not program (`pyramid.routes.ts:315-318`, `:340-357`). It cannot be represented as the selected client's project progress. Current explicit authoring handoffs are IND-only (`Pyramid.tsx:719-730`). |
| Four-level hierarchy | Existing Program/Project/Study/Subproject API mounted `/api/project-hierarchy`: programs/tree/ancestors/children/rollup/flat/create/move. | Numeric `projects.id` hierarchy and rollup. | Current ProjectHome uses regulatory-program UUIDs, deliberately avoids numeric `/api/project-home` (`ProjectHome.tsx:35-39`). Hierarchy reads use global db/pool and organization filters (`project-hierarchy.ts:19-30`, `:60-85`); current per-project access and request-DB posture need reconciliation before native exposure. |

Reporting engine evidence: `server/services/report-os/report-engine.ts:44-99` selects readiness/domain/lineage/regional providers and refuses unsupported scope. Current domain engines cover FCOI, HA commitments, IACUC, IRB, IBC, SEND, grants, RIM, inspection, controlled substances, lifecycle, eTMF, training, effort, research security and research-admin; these are code availability, not a guarantee of deployed source records or entitlement. No generic fallback should turn an unsupported report into a readiness digest.

## One concrete next increment

**Add a required-deliverables view inside the existing Submission Center, backed by its currently unused canonical pathway manifest, after correcting the input/access contract.**

The existing APIs are GET `/api/submissions/sequences/:seqId/pathway-readiness?pathway=...` and `/pathway-manifest?pathway=...&memberStates=...` (`server/routes/submissions.ts:1324`, `:1352`), mounted by `server/bootstrap/register-governance-routes.ts:65`. They already deterministically project sequence leaves into framework-required slots. There is no native v2 consumer. This is a bounded way to expose real code in the existing submission workflow and make missing/undetermined requirements inspectable rather than hiding them behind an API.

Implementation scope:

1. Extend the current SubmissionCenter workspace selector and reuse its selected `sub` + `seq`, `SeqPicker`, existing buttons/chips/tables/EmptyState/notice patterns. Put the new focused renderer beside `SubmissionSeqWorkspaces.tsx`, avoiding another global app, dialog, editor or WBS store.
2. Use only supported recorded/explicitly selected framework inputs. Render groups, required flag, present/missing/optional-absent/undetermined/not-applicable, source links and disclosed evaluation scope. Show the result as structural coverage; preserve existing governed dispatch readiness separately.
3. Correct canonical backend route leaf projection to use actual retained leaf/document identity and verified substantive/content/evidence status, using existing authoring/current source guards. Do not derive substantive presence merely from a title/code. Preserve unknown states.
4. Enforce fresh actor access to the selected submission's actual program/project before leaves or source metadata are read. Keep request-scoped DB and access revalidation through completion. Strengthen shared canonical read boundary where practical rather than adding parallel route authorization.
5. Enrich manifest source references with actual leaf/document IDs/table/program plus available section identity. Reuse `setEditorTarget`/canonical navigation for supported actual saved authoring IDs; show a disclosed source reference without a link when exact identity is unavailable. Do not title-match or guess IDs.
6. Align shared response types to the real backend status/undetermined totals. Scope/key all native reads by program + submission + sequence + framework/member-state parameters, clear old scope on changes, refuse late results, and preserve authoring unsaved-work protection.

Exact production files/boundaries to extend:
- `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` and one focused sibling renderer if needed
- `client/src/concept2cure/v2/editorTarget.ts` existing exact-ID handoff API; do not create another handoff store
- `shared/types/submission-api.ts` manifest types
- `server/routes/submissions.ts` existing two read routes
- `server/services/submission-service/submission-service.ts` canonical sequence/leaf read access boundary
- `server/services/pathway-engines/pathway-manifest.ts` source-reference envelope (mapper evaluation remains canonical)

Confirmed blockers before UI exposure:
- Routes currently project only `sectionCode/title/documentType` (`submissions.ts:1339`, `:1368`). eSTAR counts only `substantive` leaves (`estar-mapper.ts:467-468`), so these inputs cannot establish present eSTAR content.
- Manifest `sources` are section-code/title strings, not editor document IDs (`ctis-mapper.ts:172`).
- Shared UI type omits actual `undetermined/not-applicable` states and undetermined totals (`shared/types/submission-api.ts:470-485`; backend `pathway-manifest.ts:29,49`).
- `listLeaves` calls `getSequence`, which checks org/deletion only; actor project membership is not part of that signature (`submission-service.ts:626-633`, `:2344-2360`).

Verification required for implementation: actual canonical sequence leaves yielding present versus empty/placeholder/missing/undetermined; private/sibling-project and revoked-access refusal before bytes/metadata; cross-program/sequence late-result suppression; exact saved-ID navigation; CTIS state-specific applicability; no inferred submission approval or automatic writes; existing sign/freeze/export behavior preserved. Browser review in desktop/mobile light/dark against actual persisted fixtures after source/gates are green. No tests were run for this assessment.

The next later workplan step should make the existing Pyramid progress genuinely program-specific and connect canonical tasks/documents; current organization-wide progress must not be copied into every new program. Legacy hierarchy should follow current UUID-to-numeric anchored identity and access reconciliation, not direct UUID coercion.
