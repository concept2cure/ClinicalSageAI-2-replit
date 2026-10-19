# Regulatory information management: where the product stands (2026-10-18)

**Why this exists.** The founder asked, on 2026-10-18, to finish building out the
RIM system, and supplied a competitor's product map (a commercial RIM/DMS/eTMF/QMS
suite) as the benchmark a buyer will hold us to. This document maps each RIM task
a buyer expects onto what this repository does today, with the files that do it,
and names the gap. No competitor wording or claim is reused here or in the product.

**Rule 2 applies.** New capability is limited to the launch catalog
(`shared/constants/launch-scope.ts`). A row below marked *outside the catalog* is
a founder decision before any session builds it.

## The map

| RIM task a buyer expects | What exists | Gap | In the catalog? |
|---|---|---|---|
| **Correspondence: agency letters, questions, responses** | Project inbox `concept2cure_agency_communications` (Communication, Project home's Respond). Since 2026-10-18 each letter holds its questions (`agency_communication_questions`) and a response per question, approved by a Part 11 signature over the exact text, by someone other than its author; the response package assembles only from approved answers, through the audited export; a letter with questions closes only when every response is signed (`server/routes/c2c/agency-responses.ts`, `client/.../surfaces/AgencyResponses.tsx`). After the review round the same day: every text a response has had is kept append-only with the signature that approved it; nobody who wrote any part of the text since the last approval may approve it; a question recorded in error is withdrawn with a reason; a letter that requires a response closes only with its questions answered, or marked as asking nothing with a reason, checked under the letter's lock (`docs/evidence/D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18-review/`). | Questions are recorded by hand; nothing extracts them from the letter file yet. Five other correspondence stores remain (below); `reg_questions` converged 2026-10-19 and is read-only. | Yes: Projects (`communication-center`, `project-home`) |
| **Commitments (PMR / PMC / REMS)** | `regulatory_commitments` (C2C-03) with due dates, derived overdue status, milestones, fulfil. Since 2026-10-18 a commitment names the project, letter and question it was made in; Meetings & commitments records and fulfils them; a viewer can no longer fulfil one and a fulfilment cannot be future-dated. A commitment made in a project's letter belongs to that project: it is listed and fulfilled behind project admission and the letter's visibility (`/api/concept2cure/projects/:projectId/commitments`), and the organisation's register (`/api/ha-interactions`) reaches only the organisation's own. Since 2026-10-19 (P-41) a fulfilment names the dispatched sequence the agency received, the Vault version (pinned at its sha256), or both; a PMR, PMC or REMS is recorded fulfilled only by a Part 11 signature over the commitment, its date and what met it, held by the database at COMMIT (`docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/`). | Milestones have no screen (decided out of the fulfilment slice: one write route with no caller, no read, a stored 'missed' that would have to be derived from dates; next, "milestone met" reuses the fulfilment's evidence check). A fulfilment signed in error has no correction path yet. Three other commitment trackers remain (below). | Yes: Projects (`communication-center`) |
| **Submission assembly (eCTD)** | Submission Center: builder, compile, validation, dispatch verdict, Shadow Review, signed release (`SubmissionSeqWorkspaces.tsx`, `EctdCompile.tsx`, `programSequence.ts`). | — | Yes: Submission Center |
| **Dossier templates (IND, CTA, NDA, BLA, MAA, 510(k)…)** | New-project wizard scaffolds sections from seeded rule packs (`POST /api/c2c/projects`, `scaffoldProjectDocuments`). | Fourteen regional blueprints in `server/services/regulatory/registry/blueprints/` are reachable only from a legacy route; no screen picks one. | Yes: Projects, Authoring |
| **eCTD viewing** | The Builder lists each sequence's leaves (section, operation, source document, content pin, approval). Compile renders the latest `index.xml` as a tree. | A past sequence's tree cannot be reopened; a backbone leaf does not link to its Vault document; `GET /api/ind-lifecycle/sequence/:id/diff` exists with no caller and is outside the IND allow-list. | Yes: Submission Center (the viewer is a gap in an in-catalog app) |
| **Multi-region submission planning** | `submissions` → `submission_regions` → `ectd_sequences`; a per-project market view. `POST /api/submissions/:id/plan` computes a plan that is not stored and has no caller. | No plan entity with target dates per market; no timeline. | Partly: the market view is in Projects; a planner is new capability |
| **Registrations and labels** | Backend: `rim_products`, `rim_registrations`, `rim_labels`, renewal urgency, label currency, signed label approval (`server/routes/rim.ts`). | `migrations/20260610_rim_lite.sql` is not in `C2C_MIGRATION_FILES`, so a deployed database never gets the tables; the `registrations` screen is read-only. | **No: outside the catalog (P-37)** |
| **Configurable review/approval workflows** | Workflow tables and templates (`/api/approval-workflows`, task workflow templates). | No screen authors a workflow. | Partly: Tasks is in the catalog; a designer is new capability |
| **Integrations (SSO, APIs, import/export)** | SSO/SCIM (`identity-console`), the Claude connector (D8), audited exports. | QMS/CTMS/ERP connectors are not built. | Gateway/connector scope per the launch definition |

## Duplicates still standing (zero-duplication debt)

The 2026-10-18 change retired one (`/api/haq-manager`). These remain, each a
second home for a capability that now has a canonical one:

| Store | Route | Canonical home | Note |
|---|---|---|---|
| `c2c_correspondence` family | `/api/regulatory-correspondence` | the project inbox | Has the issue parser and response clock worth keeping; read by device pathway tabs and the out-of-scope program journey. Migrating means moving the parser and clock onto the inbox. |
| `reg_questions` | `/api/cmc/agency-questions` | the project inbox | **Converged 2026-10-19 (P-39 item 1), read-only.** CMC reads a program's Module 3 questions from the letters (`GET /api/concept2cure/projects/:projectId/agency-questions`) and opens each on its letter; the file's writes answer 410 and the database refuses them. Owed: the act that moves a row not closed there onto a letter (`docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/`). |
| `project_memory_entries` `haq_session` | `/api/concept2cure/projects/:id/haq-session` | the project inbox | No client caller. |
| `c2c_commitments` | `/api/c2c/commitments` | `regulatory_commitments` | AI extraction with an ungoverned create; no screen. |
| `lifecycle_obligations` | `/api/lifecycle` | `regulatory_commitments` (or a renewal register) | Its migration is not in the deploy set. |
| `c2c_agency_meetings` minutes JSON | `/api/agency-meetings` | `ha_interactions` | Two meeting stores. |

## Decisions (taken 2026-10-18 under the founder's delegation)

Recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`:

1. **Registrations and labels stay outside the catalog (P-37)**, as does a multi-region planner, until the
   P-28 boundary widens to a marketing application or a non-US application. A launch customer holds no
   marketing authorisation, so the register would be empty for every one of them.
2. **`haq-manager` stays closed (P-38).** Agency questions have one home: the letter, in Communication and
   Respond.
3. **The duplicates converge in the order of P-39**, CMC's `reg_questions` first (done 2026-10-19, read-only;
   `c2c_commitments` is next).

## Next in-catalog work, in order

1. eCTD viewer: reopen any past sequence's tree, link each leaf to its Vault
   document, and give the sequence diff a caller under Submission Center's claims.
2. Extract a letter's questions from its file into the question list for a person
   to confirm (deterministic parser; the existing `issue-parser` is the candidate).
3. ~~Fulfilment of a commitment names the sequence or document that met it.~~ Done 2026-10-19 (P-41;
   `docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/`). Milestones were decided out of it, with the reasons in
   the map above; a milestone's "met" is the next commitments slice and reuses the fulfilment's evidence check.
