# Pivotal is the sponsor's declaration, per study (2026-10-29)

**Decision.** The founder, 2026-10-29: "The client can determine if it's
pivotal by a selection option." The platform's recommendation, accepted with
"Continue": the choice is per study, not per project. A project such as LMN-201
holds a Part A and a randomized Part B, so a project-level switch would label
every study in it pivotal. Launch row D5 (CSR path); a completion of Module 2
(`server/services/m2-summary-builders.ts`), not a new module.

## What already exists

Searched `pivotal`, `isPivotal`, `is_pivotal`, `pivotal_study`,
`development_phase`, `project settings` and `ProjectSettings` across `server/`,
`shared/`, `client/src/concept2cure/`, `migrations/` and `db/migrations/`, and
`git log --all` for deleted or reverted pivotal work.

| Exists | Path | What it does | Why it is not the answer |
|---|---|---|---|
| Module 2's pivotal rule | `m2-summary-builders.ts` (`isPhase3`) | Called a study pivotal when the first phase named was 3 | Phase 2/3 was never pivotal; Phase 3 always was, whatever the sponsor's position |
| The setup interview's "Development Phase / Stage" | `ana/intelligence-questions/flows/project-setup.ts` | Offers "Phase 3 Clinical / Pivotal" | Project-level, and the answer reaches no record (`project-setup-projection.ts` `NOT_PROJECTED`) |
| The device clinical-studies register | `mdx-clinical-studies.ts`, AnA `create_clinical_study` | Has a `pivotal` phase value | Device programs only; the CSR does not read it |
| The CSR's study information | `shared/csr-source-input.ts` `CsrStudyInfoSchema` | Phase, design, enrolment, from the approved Vault source | A data file, not a choice; a strategy claim would need a new approved data version to change |
| Project settings | — | No such screen exists | — |
| `primaryEndpointMet` | `CSRSummaryInput` | The recorded-outcome precedent: only `true` counts | Supplied by callers; no store holds it |

Nothing stores a pivotal choice for a drug study. Nothing was deleted.

## Design

- **The record.** `public.study_pivotal_declarations`
  (`migrations/20261029e_study_pivotal_declarations.sql`). It is keyed as the
  CSR loader keys a study: the project and `csr_build_jobs.study_id`. Each row
  holds `pivotal`, a reason of at least 8 characters, who declared it and when.
  - The latest row is current. A change is a new row, and earlier rows stay.
  - UPDATE and TRUNCATE are refused. DELETE belongs to the tenant purge
    (`PURGE_CHILD_TABLES`).
  - It is public, with `organization_id INTEGER NOT NULL`, so the tenant sweep
    gives it its policy. There is no foreign key.
- **The write.** `declareStudyPivotal`
  (`server/services/csr/study-pivotal-declaration.ts`). The study must be one
  the project's CSR builds name.
- **The route.** `GET`/`POST /api/csr-workflow/pivotal`
  (`server/routes/csr-study-pivotal.ts`).
  - Both use the CSR scope: project access, as the board does.
  - A declaration also needs a writing role (`requireEditorAccessForWrites`)
    and a project that is not archived.
- **The reader.** `loadCsrInputsForProject` sets `CSRSummaryInput.pivotal` to
  the current declaration, or null. That reaches every Module 2 path the loader
  feeds: the orchestrator's project path, AnA's 2.5 and 2.7 composers, and the
  saved Module 2 QC.
- **Module 2.**
  - Only a declared `true` makes a study pivotal.
  - A study with no declaration is named: "pivotal status not declared for …".
  - With none declared pivotal, 2.5 records "pivotal efficacy evidence (no
    study is declared pivotal)" and 2.7 records "no pivotal efficacy study
    declared".
  - "pivotal (Phase 3)" is gone from the text. The phase still decides
    clinical pharmacology, the Phase 2–3 count and the labels.
- **The screen.** "Pivotal studies" on the CSR workflow board
  (`StudyPivotalDeclarations.tsx`).
  - It lists each study the project's CSR builds name, with its declaration
    (who declared it, when, and why) or "Not declared".
  - It offers Declare / Change declaration (Yes / No plus a reason) to
    someone with the write permission.

## Not in this change

- Module 2 composed from a request body (`submission-orchestrator.ts`
  `CSRInputSchema`) carries no declaration, so every study there reads as
  undeclared. The schema does not accept a caller's `pivotal`: a claim made by
  a request is not the sponsor's recorded declaration.
- No electronic signature. A declaration is a recorded, attributed claim with a
  reason. The signature belongs to the documents that repeat it (Module 2.5 and
  2.7, approved and signed in Authoring).
