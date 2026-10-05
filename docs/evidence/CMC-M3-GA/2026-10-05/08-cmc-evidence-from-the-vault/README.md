# A CMC record cites the Vault document it was taken from

Row **D2** (Projects: Data Room → Vault → CMC → Module 3). Discovery map
2026-10-04: `no-data-room-to-cmc-source-path` (P0), `data-room-to-module3-disconnected`
(P0) and `data-room-usage-blind-to-module3` (P1). This also fixes
`readiness-ready-while-gate-refuses` (P1), found on the way.

## The gap

The product owner asked that CMC connect "through the project and data room
(data catalogue)". That connection did not exist:

- A batch's results, a specification and a stability study were typed into the
  registers and composed into Module 3.
- The certificate of analysis, the specification document and the stability
  report they came from sat in the same program's Vault, with nothing recorded
  between them. The Data Room files its captures into that Vault.
- On the local database, five programs each held `stab-summary.txt` at
  `ctd_section = 3.2.P.8` beside an approved §3.2.P.8, with nothing between
  the two.
- A reissued certificate superseding the one a batch was transcribed from left
  the approved §3.2.P.5.4 reading "current".
- The Vault's "where used" never showed a Module 3 use.

## What was built

**`migrations/20261005b_cmc_source_evidence.sql`** (in `C2C_MIGRATION_FILES`,
before the tenant sweep) creates `public.cmc_source_evidence`. One row per
link, from a CMC record (its `cmc_source_objects` key under the program) to one
Vault version of the same program.

- The link keeps the version's content hash, version label and title as they
  were, and the person's reason.
- It is append-only. Removal is one-way, names who removed the link and why,
  and needs a reason (21 CFR 11.10(e)).
- DELETE is admitted only through the tenant purge's cascade. TRUNCATE is
  refused.
- It has `organization_id INTEGER NOT NULL`, so the sweep gives it row
  security: forced RLS and `tenant_isolation_policy`, confirmed on the local
  database after `deploy-migrate`.
- It is replay-safe: CREATE IF NOT EXISTS, no DROP.

**`server/services/cmc/source-evidence.ts`** holds the rules.

- **Link.** A link needs a reason, a record of this program, and a **current**
  Vault version of the same program. Another program's or organisation's
  document reads as not found. A superseded version is refused with the current
  version's number.
- **Re-verifying.** Linking a later version of a document the record already
  cites moves the link: the earlier one is closed, in the same transaction, with
  the same reason. That records "re-verified against the reissued certificate"
  as one act.
- **Unlink.** Removal needs a reason and keeps the row.
- **Audit.** Every link and unlink is a chained audit row on the Vault
  document's own history, so the Vault shows the CMC use.
- **List.** The records that feed a section are those its compile read
  (lineage), plus those whose type feeds it by the write-through's own impact
  map. Each comes with its evidence, and each evidence item with what became of
  its version: current, superseded (naming the replacement) or withdrawn.
- **`findEvidenceDrift`.** This finds compiled sections that read a record whose
  linked version has since been superseded or withdrawn.

**Holds.** A superseded or withdrawn linked version holds the sections that read
the record:

- `POST …/sections/:p/:s/approve` refuses with 409 `EVIDENCE_SUPERSEDED`,
  naming the record and the document. It rolls back and signs nothing.
- The final export gate (and so placement into the IND) refuses with
  `supersededEvidenceSections`, saying to verify each record against the
  current version and move its link, or correct the record and recompile.

**Readiness is the gate's verdict.** `GET /readiness` built `exportReady` from a
hand-kept list of the gate's conditions. That list missed lineage drift and
unplaceable sections, so the board could offer placement for a project the gate
then refused. It now calls `evaluateFinalExportGate` and returns `exportReady =
allowed`, plus `blockedBecause`, the gate's own sentence. The board renders that
sentence.

**Routes** (`server/api/cmc/sourceEvidenceRoutes.ts`, mounted at
`/api/cmc/module3-os`):

- The Module 3 project guard answers another organization's project with 404
  before a handler runs.
- The writes sit behind `requireEditorAccess`, so a viewer gets 403.
- `GET /source-evidence/:p[?sectionKey]` lists the records with their evidence.
- `GET /source-evidence/:p/documents` lists the program's current Vault
  versions. It puts Module 3 placements first and includes the catalogue's
  `document_kind`.
- `POST /source-evidence/:p` links. `POST /source-evidence/:p/:id/unlink`
  removes a link.

**Vault where-used.** `readVaultCmcEvidenceUses` adds a CMC arm to the version
list: "evidence for CMC batch:1 (Module 3 §3.2.P.5.4)". It is additive; the
placement and eSTAR arms are untouched.

**UI.** On the Module 3 build board, each section row has an **Evidence**
button, which opens `CmcSectionEvidence.tsx`.

- It lists the section's records and each record's linked documents with their
  state.
- For a superseded version it says what to do: "Version 2.0 has replaced it.
  Verify this record against the current version, then link that version".
- **Link** offers a picker of current Vault versions and a reason. **Remove
  link** takes a reason.
- A refusal shows the server's sentence and "Nothing was changed". A failed
  read is an error, never "no records".

## Red, then green

- **The gate.** With `findEvidenceDrift` removed from the gate
  (`red-gate-without-evidence-check.txt`), the gate test fails:
  `expected 200 to be 409`. The gate would have cleared export of an approved
  §3.2.P.5.4 whose certificate had been reissued.
- **Approval.** With the approve-route check disabled
  (`red-approve-without-evidence-check.txt`), "refuses to approve a section that
  read a record whose Vault document was since superseded" fails.
- **A real bug the mocked tests could not see.** The first PostgreSQL run of
  the drift query failed with `operator does not exist: text = uuid`. One
  parameter was used as both the text `project_id` and the uuid `program_id`.
  The unit tests' `proj-1` is not a uuid, so the query never ran there. Fixed
  by joining on `e.program_id::text = s.project_id`.

**Green** (`dbtest-green.txt`). `tests/db/cmc-source-evidence.dbtest.ts` ran on
PostgreSQL as the minted non-superuser runtime role with `RLS_ENFORCE=on`,
through the real Vault ingest (a reissued CoA is a real `supersedesDocumentId`
upload) and the real routes. 12/12 pass:

- link;
- refusals: reason, unknown record, another program's document, another
  organisation's document, duplicate, viewer, another organisation's project;
- no hold while current;
- superseded is named;
- the gate and readiness hold;
- a superseded version is refused;
- moving the link lifts the hold;
- withdrawn is named;
- unlink with reason, kept;
- the history rows;
- UPDATE, DELETE and TRUNCATE are refused for the runtime role and the owner,
  and another organisation reads nothing.

Also run:

- `vault-document-relationships.dbtest.ts` 9/9 and `vault-where-used.dbtest.ts`
  8/8 on the same database;
- `module3SectionApproveSignature`, `module3OperatingSystemRoutes`,
  `module3ProjectScope` and all of `server/services/cmc`: 38 files, 446 tests;
- client: `cmcSectionEvidence` 4, `vaultWhereUsed` 9, `cmcSuiteWrites`,
  `cmcContradictionsHeader` and `emptyState.contract`, all green.

**Staff simulation** (`scripts/dev/cmc-staff-simulation.sh`, step 21b,
`staff-simulation-21b.txt`): **126 passed, 0 failed** against a running
server. A CoA filed into the program's Vault is linked to the batch record. The
Vault version names the use: "read by Module 3 §3.2.P.3, 3.2.R.1.US". A
reissued CoA uploaded as its next version holds both approved sections, and
readiness says why. Linking the reissued version, with a re-verification reason,
moves the link and lifts the hold.

The local database's tables were partly owned by the app role and partly by
`postgres`. The immutability guards compare `current_user` with the table
owner, so local DB tests ran with ownership aligned to the app role. CI builds
one owner.

## Not yet

- **Proposals.** Proposing register rows from a catalogued document's verified
  `key_data`, for a person to confirm, is the next step. Today a person links
  after recording. No machine writes a value.
- **The Data Room's own "Used in".** The Data Room's "Used in"
  (`source-usage.service.ts`) still reads authoring citations only. The Vault
  version list shows the CMC use, and a Data Room capture is the same bytes as
  its filed version. Adding the CMC arm there is a small follow-up.
