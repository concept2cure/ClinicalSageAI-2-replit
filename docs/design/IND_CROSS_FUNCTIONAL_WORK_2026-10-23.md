# Complete cross-functional work in the existing project workflow

Date: 2026-10-23. Launch row D2, workstream W2. Canonical branch: `concept2cure-v2`.

This records the founder's product direction and the next extension identified by read-only discovery. It does not replace `WORKFLOW_DISCOVERY_2026-10-23.md`, claim that the extension is implemented, or admit another capability to the launch catalog.

## What already exists

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `shared/project-team.ts`; `client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx`; `server/services/c2c/project-team.ts` | Reads verified project lead/owner responsibilities, current sharing membership and unlinked recorded names. Explicitly separates coordination responsibilities from access and document approval authority. | No functional leads, contributor assignments or CTD-deliverable responsibility map. The responsibility union is currently `project_lead` / `project_owner`. |
| `client/src/concept2cure/v2/surfaces/Projects.tsx`; `server/routes/c2c/projects.ts` | The wizard records team names; the creating user becomes the program lead. | A recorded name does not establish account identity, access or functional accountability. |
| `server/services/c2c/programme-profile-write.ts` | Accepts team entries containing a name and optional role, deliberately excluding user ids. | Profile/interview answers cannot assign an authorized account by supplying a user id. |
| `server/services/c2c/scaffold-project-documents.ts` | Creates the canonical rule-pack document and section skeleton within the project creation transaction. Sections begin `todo`, with empty content. | Does not assign functional owners/contributors. A skeleton is not a draft or completed deliverable. |
| `server/services/c2c/document-outline.ts` | Reads canonical section status, version and content presence, distinguishing home and market filing scope and showing missing common sections as gaps. | Its query selects `owner_id`, but `withLive` does not project it into the returned outline. It has no functional responsibility mapping. |
| `server/services/tasking/workflow-templates.ts`; `server/routes/taskManagement.routes.ts` | Provide existing IND/NDA/510(k) task templates and transactional, audited instantiation. The IND template currently contains four broad tasks: nonclinical, CMC, protocol/IB and forms/assembly. | No detailed functional-owner/contributor map or canonical section binding. Template instantiation does not assign named people. |
| `shared/schema.ts`, `unifiedTasks` and `taskTemplates` | Existing task records hold project, assignee, module/category, deliverable task type, source entity, `moduleData`, dependencies and approval records. Templates hold task definitions and dependencies. | There is no qualified structured CTD functional-contributor contract yet. Generic JSON capacity alone is not a finished user workflow. |
| `server/services/projects/schedule-of-events/templates.ts`, `generator.ts`, `service.ts` | Existing deterministic milestone blueprints carry owning-role suggestions including CMC Lead, Nonclinical Lead, Clinical Lead, Regulatory Lead/Ops, QA and Submission Ops. | Suggested owning roles are not named-person assignments, completed milestones or document approval rights. |
| `server/services/unified-work/unified-work-view.ts`; `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`, `ProjectWorkPanel` | Consolidate program tasks, reviews, agency correspondence and filing work, including recorded owner names, and disclose partial reads. | The current work projection does not provide a CTD-deliverable/function/contributor view. |
| `client/src/concept2cure/v2/surfaces/ProjectDossier.tsx` | Shows measured CTD module completion and opens the project's existing authored documents. | No accountable-owner/contributor overlay. |
| `db/migrations/20260220_ind_section_tracking.sql`; `server/routes/project-sections.ts` | A separate integer-project section store already tracks section assignee, reviewer and deadline; an assignment endpoint exists. | It is not the canonical `c2c_document_sections` outline. Reaching it as another content plan would create competing ownership and status paths. |
| `server/services/governance/separation-of-duties.ts` | Uses recorded `c2c_document_sections.owner_id` as part of the authorship set, alongside version-ledger authors and accepted-draft authors. | This field is not a neutral functional-coordinator field. Changing its meaning changes independent-signature eligibility. |
| `shared/constants/launch-scope.ts`; `shared/constants/deferred-capability-inventory.ts` | Distinguish current launch scope from retained/deferred capabilities and name canonical convergence targets. | Product taxonomy and client demand do not, by themselves, qualify or admit an unsupported tool, market or filing path. |

Discovery searched project-team and responsibility contracts, wizard/profile inputs, CTD section scaffolding and outlines, task definitions and templates, schedule owner roles, unified work, dossier rendering, routes, schema/migrations, AnA setup material, and retained or unreachable section/content-plan paths. Deleted-history searches covered ProjectTeam, project-team, ContentPlan and content-plan names.

### Superseded content-plan history

`7a144fd1e` removed the legacy content-plan clients. `35785b4cb` subsequently removed the dead `/api/content-plan` server path. `server/bootstrap/register-document-routes.ts` records why: its handlers queried tables no deploy applier created or returned fabricated regulatory content. That comment also identifies existing section tracking and evidence-link stores. Restore neither the old handlers nor their undeployed tables as a competing content plan. Extend the current project, task, authoring and filing contracts instead.

## Founder direction: functions belong inside client work

The founder identified eight possible durable work areas: **RBM, Biostatistics, CMC, Quality, Reporting, Vault, Project Management and Tasking**. These are broad areas of work, not a separate application for each individual function or deliverable. The current discovery increment consolidates entry and guidance; it does not establish that all eight areas are released, qualified or independently entitled. Existing launch policy and the actual server verdict remain authoritative.

A biotech client needs its cross-functional work represented within the project. Regulatory Affairs, Regulatory Operations, medical writing, nonclinical development, clinical development and the supporting functions are participants in the same program. Making each a separate application would reproduce the confusion this direction addresses. Availability must be described from implemented capabilities, with incomplete or unsupported work named honestly.

The IND responsibility model to extend includes:

- **Regulatory Affairs:** strategy, pre-IND planning, agency interactions and correspondence, and application lifecycle coordination.
- **Regulatory Operations:** filing structure, eCTD assembly/publishing, technical validation and recorded gateway delivery.
- **Medical writing:** investigator brochure, protocol and Module 2 document preparation with the relevant scientific contributors.
- **CMC:** process and analytical development, drug substance/product content, manufacturing/quality inputs and clinical supply coordination.
- **Nonclinical:** pharmacology, toxicology and DMPK contributions and study-report deliverables.
- **Clinical:** clinical development, clinical pharmacology, operations, biostatistics and pharmacovigilance contributions, as applicable to the program and stage.
- **Supporting functions:** program/project management, translational science, legal and commercial input where the program requires them.

This is a functional responsibility skeleton to confirm against a particular program. It is not an assertion that every listed function has a finished tool, that every deliverable is required for every IND, or that any existing stage is complete.

Small biotechnology companies often have one person covering several functions and outsource work to consultants, CROs, CMOs or CDMOs. The model must allow role overlap and external contributors without assuming a separate employee or licensed application per function. A named organization or consultant without a linked account remains a recorded participant; it does not gain platform access, editing rights or signature authority. Recorded participation, delivery ownership, sharing permission and independent review/approval remain separate facts.

## Smallest coherent next extension — not implemented here

Extend the existing Tasking templates and governed task records with typed **responsible function, contributor functions and canonical filing-document/section references**. Keep a named task delivery owner in the existing `unified_tasks.assignee_id`. Validate every linked contributor account against current organization/project access; never infer a person from a functional title or a free-text team name.

Use the existing task source and `moduleData` capacity through an explicit validated contract, rather than create another ownership table or content-plan engine. Preserve existing template provenance: template-created tasks already use `sourceEntityType = taskTemplate` and `sourceEntityId` for their origin, so section binding must not overwrite that lineage. The implementation contract must decide and validate the typed field placement before code changes.

Expose these facts beside the existing CTD deliverables in ProjectHome's Author/dossier/work view. Each item should identify its canonical filing section or authored document, recorded task owner, contributing functions/accounts, actual recorded work state and existing next action. Open the current Tasking detail or authoring editor for the work itself. Leave unknown owners and contributors unassigned; disclose unreadable data rather than converting a failed read into an empty plan.

Expand the existing four-task IND template into appropriately scoped deliverables tied to the program's existing skeleton. Reuse existing dependencies, reasons, audit records and approval ceremonies. Reuse recorded work for status; do not invent a second completion meter, auto-complete sections because a task was visited, or treat task completion as a document signature.

Do **not** repurpose `c2c_document_sections.owner_id` for accountable functional coordination or reviewer assignment. Its existing authorship meaning participates in separation of duties. A functional assignment must neither grant sharing access nor change who may independently approve/sign a document.

Do not revive the separate legacy `project_sections` store as the source of a second canonical plan. Any future convergence involving that store needs a named migration/read contract that preserves its recorded work and leaves one authoritative outcome, rather than a second overlay that disagrees with the current filing outline.

## Qualification boundary

This document is a read-only inventory and repository decision record for the next extension. It contains no implementation, new tests, executed workflow or readiness claim. The current UI increment is governed by `docs/design/WORKFLOW_DISCOVERY_2026-10-23.md` and its evidence under `docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/`; its results must be reported from that evidence.

Before the next ownership extension ships, its concrete contract needs independent review and qualification of canonical program/section identity, current membership, role overlap, external/unlinked participants, existing template lineage, audit transactions, concurrency, partial/error states and unchanged signature independence. Scope must follow the actual program/market/document class. CTD ownership guidance for a US IND is not evidence for every other jurisdiction, medical device or diagnostic filing, and this record admits no deferred or unsupported tool.
