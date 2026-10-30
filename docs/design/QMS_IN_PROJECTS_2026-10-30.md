# Quality from a project, and from the notices that reach people (2026-10-30)

Founder request, 2026-10-30: *"Get QS on the main page left rails and also a selection from within Projects and connected to talking and messaging and other up stream or down stream dependencies."*

Launch row D2. The work is in the catalog's Quality (QMS controlled documents) and Projects. It adds no surface, no module and no rail entry (Rule 2). Each part below **completes or reaches** something that already exists (Rule 3).

## What already exists

**The rail.**
- Quality is already on the main rail. It is the second entry of "Work areas", after CMC / Module 3 (`client/src/concept2cure/v2/registryModel.ts:174`, `RAIL_CORE`).
  - It was placed there on 2026-10-22 (`1528c78303`, "CMC / Module 3 sits directly before Quality, so QS is beside CMC, Vault and Tasking").
  - The short rail of 2026-10-25 kept it (`d973880052`, P-47).
- `shellNav.test.tsx` pins it ("Quality is on the rail, and opens Quality").
- The rail hides an entry only when a feature flag is off or the deployment's launch-scope verdict locks it (`Shell.tsx`, `railVisible`).
  - The only flag is the CRL library's (`clinicalRegulatoryGraphFlag.ts`, `flagAllowsSurface`).
  - Quality is the launch row `qms` (`shared/constants/launch-scope.ts`).
- So in this build every organization sees Quality on the rail. Nothing is to be built. A deployment that does not show it is older than `1528c78303`, or its entitlement verdicts lock `quality`, which **Plan & features** names.

**Quality records already belong to projects.**

| Record | Project | Where |
|---|---|---|
| CAPA | required ("A CAPA belongs to a project") | `qmsCapaRegister.tsx:33`; the list filters by `programId` (`capaMdr.service.ts` `listCapaRecordsTx`) |
| Change control | optional: "Organisation-wide" or the open project | `ChangeControl.tsx:543`; `createChange` with `admittedProject` (`mdx-qms.ts:1214`). `GET /qms/changes` has **no** project filter. |
| Nonconforming product | optional | `mdx-qms-records.ts:336-368` (`admitProject`). `GET /qms/nonconforming` has **no** project filter. |
| Controlled document | the project its authored copy was created in | `authoring_documents.client_program_id` (create and revise take `programId`; `controlled-document-service.ts`). The register has **no** project filter. |
| Deviations, suppliers, internal audits, management reviews | organization-wide | `mdx-qms-deviations.ts`, `mdx-qms-records.ts` |

**Project home has no door to Quality.**
- `ProjectHome.tsx` reaches Vault, Tasks, Review, AnA conversations, Authoring, Protocol, CMC and Reporting from its steps.
- Reporting's door is the pattern: `ProjectReportsDoor`, "See this project's reports in Reporting & analytics", opens the work area on the shell's open project.
- Nothing on a project lists its CAPAs, its change controls, its nonconformances or the controlled documents authored in it.

**Talking.**
- Quality asks AnA from every tab (`quality/App.tsx`, `ASK_STARTER`; `onAskAna`).
- AnA's QMS tools write through the routes (`1e63f5a59a`; `revise_qms_document` shares the service).
- Each project lists its own conversations beside every step (`ProjectHome.tsx`, `ProjectConversations`).

**Messaging (notices).**
- A notice opens through one door: `GET /api/mdx/notifications/:id/target` (`server/services/notifications/notification-record-target.ts`).
- A controlled document's notice opens Quality on it (`qualityTarget`, `params: { qmsDocumentId }`). For an authored document this requires view of its editing copy.
- A task's notice opens the Tasks board (`taskTarget`).
- The training tasks that slice 4 writes (`61902478ed`) therefore open the board, not the reader that completes them. That is the training design's slice 4b (`QMS_TRAINING_ASSIGNMENT_2026-10-29.md` §3.9, "The notice opens the reader").

**Upstream and downstream.**
- A change control's cross-references to deviations, CAPAs, validations and documents (`qms_change_links`; `GET/POST /qms/changes/:id/links`) are shown on the change (`ChangeControl.tsx`).
- A CAPA names its source (`CapaSourceRef`).
- Approval writes the training tasks and the periodic-review task (slice 4; `periodic-review-task.ts`).
- What is missing is the other direction: a controlled document does not show the change controls that reference it.

**Searches run:**
- `quality|QMS|qms` in `registryModel.ts`, `Shell.tsx`, `launch-scope.ts`, `ui-surface-registry*.ts`, `ProjectHome.tsx`, `HomeSections.tsx`;
- `programId|program_id|client_program_id` in `server/routes/mdx-qms*.ts`, `server/services/qms`, `server/services/capa-mdr`, `client/src/concept2cure/quality`;
- `qualityTarget|taskTarget|qmsDocumentId|qmsIntent` in server, shared and client;
- `qms_change_links|links` in Quality;
- `git log --all --diff-filter=D -- '*Quality*' '*ProjectQuality*' 'client/**/*qms*' 'client/**/*Qms*'`. What was deleted:
  - `client/src/concept2cure/mdx/surfaces/QualitySurface.tsx` and `useQuality.ts`: a disconnected legacy island (`e5a74a4dfa`, 2026-06-02);
  - `useQmsReadiness.ts` (`4aa2043903`, 2026-08-04), which read the organization-wide `GET /qms/readiness` (still in `mdx-qms.ts`);
  - the kit mirror's `Quality.jsx` (`b67cb52c8b`);
  - pre-Claude-Design CMC and CER quality panels (April 2026).

  None of them listed a project's quality records.

## The work, in slices

Each slice lands green on `concept2cure-v2` on its own, tests first.

1. **QP1, the notice opens what completes it (training slice 4b).**
   - `taskTarget` gives a `qms_training` task's notice Quality on its document with `qmsIntent: 'read'`, for the person assigned (`isQmsTrainingAssignee`), without asking view of the editing copy. Anyone else gets today's check.
   - `notification-navigation.ts` admits `qmsIntent` (absent or `read`).
   - `QualityModule`, `QualityRoute`, `App` and `SopRegister` pass it through, and the register opens the training reader there, on the version approved for a later day when there is one.
2. **QP2, a project's quality records, from the project.**
   - Complete the three list routes with an optional `programId`, each admitted as `admitProject` admits it, a project the reader cannot open refused:
     - `GET /qms/changes`;
     - `GET /qms/nonconforming`;
     - the register (documents whose authored copy is in the project).
   - The CAPA list already takes one.
   - Project home's Review step gains **Quality**: this project's open CAPAs, change controls and nonconformances, and its controlled documents by status. Each is a count read from those routes, with an honest failure per row (an error is never 0). It has one door, "See this project's quality records in Quality", which opens Quality on the shell's open project, as Reporting's does.
3. **QP3, Quality on one project.** Opened from a project, Quality says "This project: <name> · Show the whole organization". Its register, Change control, CAPA and Nonconforming tabs read with `programId`; organization-wide tabs say they are organization-wide.
4. **QP4, the other direction.** A controlled document's row (the version history drawer) lists the change controls that reference it, from `qms_change_links`, each opening its change.

**Not in this work:** a second Quality screen inside Projects, a new rail entry, or new records. Project home links to Quality; it does not hold a copy of it (zero duplication).
