# The data catalog as a person reaches and uses it, 2026-11-11 (for GA)

The founder, 2026-11-11: *"Focus entirely on getting what we built surfaced correctly on the UI and working for GA.
Stay aligned with our roadmap and rules."*

What was built for the founder's 2026-11-06 ask (the data catalog, graded, "Use in this project", AnA over it) was
walked at trunk head in a browser, as the Lumen lead, on a fresh-Codespace database. Every screen opened and worked.
One thing was wrong in substance, and one read was broken.

## What already exists (RULE 3)

| Path | What it does | What it did not |
|---|---|---|
| `server/services/clinical-regulatory-evidence/data-room-search.ts` | The catalog read: captures across the person's projects of the sponsor, filtered, faceted, paged | Listed captures only (`cre_evidence_sources`), never a Vault document |
| `server/services/clinical-regulatory-evidence/data-room-grade.ts` | The grade engine, six criteria over recorded facts | Graded captures only |
| `server/services/vault/document-catalog.service.ts` (`listProjectDocuments`) | The Vault's documents for AnA, by project, with the Vault's eligibility and current-version rules | Had no caller in the catalog screen |
| `server/routes/c2c/projects.ts` `GET/POST/DELETE /:id/evidence` | What a project uses; the kind `vault_doc` was already a valid kind | Checked nothing for `vault_doc`, and the list read failed when any reference was not a number |
| `client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx` | The catalog's screen (Vault → Data catalog; the editor's Data room) | Had no row for a Vault document |
| `docs/design/ONE_DESIGN_PLAN.md` §1, step 2 | "The data room is the project's catalog of everything… Items get in by upload, from AnA's paperclip, **from Vault**, and from study-conduct capture" | — |
| `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` LX-03 | "Every Vault version is a Data Room source": one source registry | Not landed; its founder decision (one registry or two) is not recorded |

Nothing new was built: no screen, route, table or AnA tool. The catalog read, its grade engine, its screen, the
project's evidence routes and AnA's existing catalog tool were finished.

## Found: the catalog showed almost no files

In every demo project the Data catalog was Quality records and little else. Measured on this database, current items
per project: LMN-201 2 files and 49 Quality records; the CDISC pilot CSR study 0 files and 21 Quality records, while
its Vault holds the study's seven files. The documents and study data people file go into the project's **Vault**, and
the catalog read only the data room's captures (files dropped in a conversation or on the Evidence step). So the
founder's "see how all the data is organized into folders, files and buckets… graded… subscribe to that data" showed
a list with nearly none of the data in it.

## Finished: the Vault's documents are in the catalog

- **Listed** (`data-room-vault.ts`, new file in the existing service folder): the Vault's current, eligible documents
  of the same projects (the person's verified accessible projects of the open project's sponsor), under the same
  search and narrowings (project, kind, CTD section, Vault folder, dates). The Vault's own predicates decide what is
  eligible and current (`vaultDataEligibleSql`, `supersededSql`). A document whose bytes are already a current capture
  of that project is listed once, as the capture. A narrowing a Vault document cannot answer (a study) matches none.
- **Organized**: the facets count captures and Vault documents together; the list is organized by **Vault folder** by
  default (was Study, under which every row sat in "Names no study"). Within a folder: captured files, Vault documents,
  then Quality records. Folders carry the Vault's own names in each project's Vault view.
- **Graded** by the same engine from the Vault's own facts: content hash, who added it, bytes held, fixity verdict,
  whether it was read, its catalog record. A dataset file whose structure was never read says so and earns nothing for
  conformance, instead of "not a dataset". The grade is computed at read; it is not stored on the Vault row.
- **Use in this project / Remove** on a Vault document, through the project's evidence routes with kind `vault_doc`.
  The server checks it is a current, eligible document of the person's catalog and records the document's own title.
  The project's room lists it under "Used in this project" with where it is from; the CSR document's study-data
  chooser marks a used Vault file as it does a used capture.
- **AnA** (`list_project_documents` with `catalog: true`, no new tool): the same Vault documents with their grades.
- A failed Vault read leaves the captures listed and says the Vault's documents could not be listed.

This is a read. No capture is written and no source identity changes: LX-03 stays the founder's decision.

## Fixed: "what this project uses" failed for any item that was not a capture

`GET /:id/evidence` cast every reference to an integer inside a join condition. SQL does not promise the order a
join's conditions are tested in, so one pinned artifact, guidance or Vault document made the whole read answer 500
("invalid input syntax for type integer"). The panel then said what the project uses could not be read. The casts now
sit inside `CASE`. Seen in the walk the moment a Vault document was used; pinned by a test with all three kinds.

## Walked (`walk.cjs`, `walk-1440.json`, `walk-390.json`, `shots/`)

Lumen lead, LMN-201, every step a click from the project page.

| Step | 1440 | 390 |
|---|---|---|
| Project page → Evidence → "Open the data catalog" lands on Vault → Data catalog | 50 rows | 50 rows |
| A row: grade chip, where it sits, grade basis line by line | yes | yes |
| Each filter narrows; each read 2 to 3.5 s | yes | yes |
| Search "protocol" | 27 rows, clears to 50 | same |
| Use another project's capture here; listed under "Used in this project"; Remove | yes | yes |
| **The Vault's documents**: "109 matching sources · showing 50. 31 Vault documents · showing 31."; groups Module 5 · Clinical 12, Agency correspondence 5, Module 3 · Quality 4, Module 4 · Nonclinical 4, Module 1 · Administrative 3; none ungraded | yes | yes |
| **Use another project's Vault document here**; "From the Vault of LMN-801…"; Remove | yes | yes |
| This project ↔ All my projects | yes | yes |
| Vault from the rail → Data catalog tab | yes | not walked: the script does not open the phone's navigation |

No API response ≥ 400 and no console error on any step after the fix.

## Checks

- `data-room-vault.test.ts` (new, 9 cases): the grade from Vault facts; an `.xpt` not called "not a dataset"; only the
  caller's projects; every narrowing bound, none in the SQL text; a document outside the admitted projects refuses the
  read; facets merged; use refused for absent, inaccessible and replaced.
- `projects-sources-window.test.ts`: the catalog's first page carries the Vault's documents and merged facets, a later
  page and the project's own room do not; a failed Vault read; the evidence read with a capture, a Vault document and
  an artifact together; a replaced Vault version reads as not current.
- `document-catalog-data-room.test.ts`: AnA's catalog answer carries the Vault's documents and says a failed read.
- `dataRoomCatalogVault.test.tsx` (new, 4 cases): the row, the grouping, Use and Remove, the project's room, the
  unavailable note.
- The editor, Vault, study-data and AnA catalog suites: 101 files, 1,517 cases (one unrelated editor case failed once
  under load and passes alone). Typecheck 0; no new lint warning; `ci:sql-interpolation` OK, with this file registered
  in `scripts/ci/lib/approved-sql-predicates.mjs` for the Vault's three canonical predicates, alias `d`.

## Not done, and why

- **LX-03** (every Vault version is a data-room source, so a Vault file is cited and walked by one identity) is the
  roadmap's own answer and needs the founder's recorded decision. Until then a Vault document in the catalog is read,
  graded and used, and is cited through the Vault's own citation path.
- **Datasets in the Vault are not profiled**, so CDISC conformance is not checked for them (the grade says so). A
  dataset dropped in the data room is.
- ~~The catalog lists the first 200 Vault documents.~~ **Done 2026-11-12:** the Vault's documents page with the
  captures (the catalog's own limit and offset), and "More sources" is offered while either has more.
- **Each catalog read takes 2 to 3.5 s** on this machine: it reconciles the Quality records and grades the page on
  every read. Not changed here.
- **AnA in a conversation** was not run: this container has no model key.
- Withdrawing a Quality record snapshot from data use on the project page (open since 2026-11-10).

## 2026-11-12: current by default, and the Vault half pages

- The catalog asks for what is current. What a later capture replaced is kept and listed with **Include replaced
  versions**. Before, the filter counts included replaced captures: "LMN-201 (81)" for a project with 45 current
  items and 17 Vault documents; it now reads (62).
- Walked as the Lumen lead: "90 matching sources · showing 50. 31 Vault documents · showing 31."; More sources → the
  remaining 40; Include replaced versions → 109. No API response ≥ 400.
- Tests: `dataRoomCatalogVault.test.tsx` (the read asks `current=true`, another page while the Vault has more, the
  option drops the narrowing and returns to the first page), `data-room-vault.test.ts` (the page's limit and offset
  are bound), `projects-sources-window.test.ts` (a later catalog page carries its Vault documents).
