# Document store consolidation — plan

**Status:** proposed 2026-10-17, from the app audit of that day; steps 1–3 and 5, and the TaskTray half of step 7, done the same day
(`docs/evidence/D2-APP-AUDIT/2026-10-17/`). Not yet decided or started. Row: **D2**.

Nine tables each hold "documents". A client cannot tell which one a screen reads, and some writers
say one store and write another. This plan reaches three canonical stores in seven steps. Each step
ships on its own, keeps every existing user outcome reachable, and follows CLAUDE.md RULE 1: data
moves are `INSERT … ON CONFLICT DO NOTHING`, and removing schema means amending its creator, never
appending a DROP.

## Target model

| Store | Holds | Notes |
|---|---|---|
| `authoring_documents` / `authoring_sections` | Every editable draft: human edits, AnA drafts, imports | Created by the deploy authoring step (`scripts/db/authoring-subsystem.mjs`) |
| `vault.documents` + `canonical_documents` | Every filed, immutable version, its bytes, SHA-256 and lifecycle | The one admission point is `vault-ingest.service.ts` |
| `c2c_documents` | A filing's outline and readiness only; section text derives from authoring | `c2c_document_sections` becomes write-through only |

`protocol_documents` stays as a structured register that feeds authoring. `concept2cure_artifacts`
keeps AI-output provenance only (version spine, seals, signed acts, rewrites, compute outputs).
New `submission_leaves` point at `vault_documents`; existing leaves are never rewritten.

## Today

| Table | Deploy path | Reachable writers at launch | Role |
|---|---|---|---|
| `vault.documents` | Created by the gcc tree (install-fresh); reshaped on the deploy path | Vault ingest, placement, metadata edit | Filed record |
| `canonical_documents` | Yes | `canonicalDocumentStore.ts` | Lifecycle per Vault version |
| `authoring_documents` | Yes (authoring step) | Authoring router, from-draft | Working draft |
| `protocol_documents` | Yes | Protocol development service | Protocol register |
| `coauthor_documents` | Drizzle baseline | Filing copies, CMC M3 placement, batch draft | Filing copy; leaves pin it |
| `concept2cure_artifacts` | Drizzle baseline | ~30 writer files | Mixed: AI outputs, upload copies, governance spine |
| `c2c_documents` | Yes | Project scaffold, markets, write-through | Filing outline |
| `unified_documents` | Yes | None reachable (AnA Command removed 2026-10-08) | Dead; read by old leaves |
| `project_sections` | Yes | Legacy numeric-project routes only | Dead for v2 programs |

**Defect found:** AnA's `save_document_to_vault` tool (`AnaToolExecutor.ts` ~21068) inserts a
`concept2cure_artifacts` row; it never writes `vault.documents`. A client told a document was saved to
the Vault will not find it in the Vault. Step 2 fixes it.

## Steps

1. **Identity.** *Done 2026-10-17.* Amend the store vocabulary in `migrations/20260814d_document_alias_map.sql` in place
   (its compare-then-replace CHECK idiom is RULE 1-safe) to admit `vault_documents` and
   `protocol_documents`; backfill aliases keyed `(store, native_id)`. No behaviour change.
2. **AnA saves where it says.** *Done 2026-10-17.* `save_document_to_vault` creates an authoring
   draft through the same path as `draft_authoring_document` (one section) and files nothing: under
   P-30 AnA prose is not credited as governed content without a passed PQ, so filing stays a
   person's act. Its audit record is the authoring CREATE row carrying the stated reason, as for
   `draft_authoring_document`. Existing artifact rows stay readable; no backfill.
3. **One record per uploaded file.** *Done 2026-10-17.* The plan said uploads "admit through
   `ingestVaultDocument`". That was wrong: it would file every capture into the Vault with no person
   deciding. By design a captured file is a data-room source (`cre_evidence_sources`), and only a
   person files it into the Vault, from the data room (VR-11a, D2). The real duplication was the
   `concept2cure_artifacts` copy some upload paths wrote beside that source. What was done, writer
   by writer:
   - **Chat upload** (`routes/chat/upload.ts`) no longer writes its `source_document` artifact, its
     provenance event or the source's `metadata.artifactId`. Its retrieval atom is keyed
     `cre_source:<id>`, as the UUID path's already was. A numeric project id whose `projects` row is
     the single live anchor of a program is recorded in that program
     (`services/chat-uploads/capture-scope.ts`), so both id-spaces write the same record and the
     program-bound reads admit it. That artifact was the reads' only binding from workspace to
     program. Otherwise the source keeps its workspace scope, as before.
   - **Knowledge-source upload** (`routes/c2c/knowledge-sources.ts`) is unchanged. Its artifact is
     the upload's only record: no data-room source is written. The Module 3 build board and
     `classifyAndMapArtifactToSource` read it, and so do the contextual-chunk ingest and the atom.
     Moving it onto the data room means moving those readers first. No client calls it today.
   - **MDx import approve** and AnA's `approve_import` keep their `imported` artifact. It is the
     placement record of an archive file (empty content, sha256, CTD section), not a copy of a
     source, and `import_job_files.artifact_id` and the Module 3 build board read it. The two were
     parallel copies of one loop. They are now one, `approveImportJob` in `routes/mdx-imports.ts`.
     The AnA copy had no transaction, job lock, project check or audit row. Both copies also failed
     every file, because an untyped parameter inside `jsonb_build_object` is refused.
   - **Auto-extraction** (`autoExtractionPipeline.ts`) writes `extracted` derivatives (the text,
     tables and sections it lifted out), not a copy of the upload, so it stays. It reads its input
     by artifact id, so a chat upload made after this step is refused there with
     `ExtractionSourceUnavailableError`. No client queues it.

   Artifact rows written before this step stay readable through their recorded bindings
   (`source-read-access.ts`, `document-catalog-actor-captures.ts`, `retrieval-source-link.ts`).
   No backfill and no data move.
4. **Placement files a Vault version.** "Place into filing" and CMC `place-module3` file to the Vault,
   then `upsertLeaf` with `vault_documents`. The coauthor resolver branch stays for existing leaves.
   **Riskiest step:** leaves pin SHA-256 and sequence history, and transmit gates read
   `coauthor_documents.status`. Prove PDF parity of the Vault leaf resolver
   (`leaf-document-tables.ts`) against the coauthor path before switching.
5. **One editor.** *Done 2026-10-17.* `c2c_document_sections` becomes read-only to the MDx pathway editor; authoring is
   the only editor and write-through the only writer.
   `PATCH /api/c2c/documents/:id/sections/:key` refuses any body carrying `content` with
   409 `SECTION_TEXT_IS_AUTHORED`, before anything is read or written. It still moves a section between
   the unsigned states (todo/drafted/review), under the seal, lock and approval guards it already had.
   The write-through (`commitSectionToFiling`) runs in-process in the authoring section save and never
   came through this route. The route's text-only branches (draftSource, the AnA-backlink GUC, the
   span-lineage gate, approval withdrawal on new text) went with it. The MDx dossier drawer's Document
   tab now shows the text read-only, with **Open in editor**: the same `onOpenEditor` hand-off the
   drawer footer already made (`MdxSurfaceHost` sets the editor target for the program and section
   code, then opens `document-authoring`). `mdx/hooks/useSectionSave.ts` is deleted. The drawer was
   reachable only from the device surfaces (510(k), PMA, CER, IVD), which are outside the launch scope.
   It was made read-only anyway, because the route itself is mounted for every client. Nothing now
   sets `app.ana_action_id`, since no client ever sent `anaActionId`. The trigger contract stays
   tested by driving the trigger directly. Tests: `tests/schema-contract/c2c-section-save.contract.test.ts`,
   `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.readOnly.test.tsx`; the editor path is
   pinned by `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts`.
6. **Retire the authoring → artifact projection** once `canonical_documents` carries review state;
   artifact readers move to it.
7. **Dead tables.** Remove the remaining launch reads (ectd-compile's numeric-project branch, the
   TaskTray approvals query), then amend the creators of `unified_documents`, `project_sections` and
   `coauthor_sections` once nothing writes them. Resolver branches stay for historic leaves.
   *First half, 2026-10-17:*
   - **TaskTray: done.** "Approvals — you sign" read `GET /api/approval-workflows/pending`
     (`document_workflows` / `workflow_approvals` joined to `unified_documents`), which nothing at
     launch writes. It now reads `GET /api/review/board?scope=mine`, the authoring approval chain
     (`authoring_workflow_steps`) that the Review surface reads, and lists the rows at the caller's
     sign-off (`atMySignOff`). Test: `client/src/concept2cure/v2/__tests__/taskTrayApprovalsFromAuthoring.test.tsx`.
     The MDx pathway Approvals tab (`usePathwayTabsData`, device surfaces, outside the launch scope)
     still reads the old endpoint.
   - **ectd-compile numeric branch: left, because a launch path still sends a numeric id.** Program
     intake creates a numeric `projects` anchor for every program
     (`requireProgramProjectAnchor`, `server/services/c2c/program-project-anchor.ts`). The c2c review
     routes write `c2c_project_work_items` keyed by that anchor (`server/routes/c2c/reviews.ts`).
     Tasks lists those rows as other-store cards with `home.projectId` (a number), and **Open in …**
     publishes that number as `window.C2C_PROJECT.id` (`TaskBoard.tsx` `onOpenHome`). `EctdCompile`
     then sends `C2C_PROJECT.id` as `:projectIdent`, so the numeric branch, and its
     `project_sections` read, is reachable from Tasks → Open in Submission Center → Compile. To remove
     it, first make `onOpenHome` publish the program UUID (resolve the anchor's
     `regulatory_program_id`), then delete the branch.

## Open before step 1

- Trace all 133 `concept2cure_artifacts` references by route mount, not by client grep.
- Decide whether `vault.documents`' creator moves onto the deploy set (it is install-fresh only today;
  later changes to it reach a running database only through the reshaping files).
