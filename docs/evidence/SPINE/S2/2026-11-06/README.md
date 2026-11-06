# S2, 2026-11-06: the data catalog across projects, graded, subscribed, and AnA over it

The founder, 2026-11-06: *"I also need to see the data room, data catalog, and how all the data is organized into
appropriate folders, files, and buckets, if you will. And then that data is essentially graded, if you will, too.
And then you know, like Amazon, subscribe to that data, and that data then is used in that project. Maybe that's a
CSR project. But Anna needs to have autonomous control over all of this, of course, agentically."*

Four steps, each walked in the running app before the next. This README grows with each step.

## What already exists (searched 2026-11-06, verified at HEAD before building)

| Piece | Path | Does | Did not |
|---|---|---|---|
| Capture record | `cre_evidence_sources` (`db/migrations/20260724_clinical_regulatory_evidence_spine.sql`, `migrations/20261001_cre_evidence_sources_capture_immutability.sql`, `20261008c`, `20261008d`) | write-once checksum, who captured, supersession (`is_current`, `previous_version_id`), stored text, `study_ref` | grade anything |
| Processing | `server/services/clinical-regulatory-evidence/data-room-processing*.ts`, `describeCapture` | the Vault classifier's proposal (`metadata.dossier`: evidence kind, folder, CTD section, confidence) | — |
| Catalog facts | `catalog-facts.ts`, `dataset-profile.ts`, `editor/SourceCatalogLine.tsx` | protocol number, registry id, dates, study match; dataset structure and CDISC standard/domain by rule | — |
| Search | `data-room-search.ts`, `GET /api/c2c/projects/:id/sources` (`server/routes/c2c/projects.ts`) | paged full-text over ONE project | read across projects; organize by study, kind, CTD or folder |
| The lane | `editor/DataRoomSourcesPanel.tsx` (Project files → Data room, on the Evidence step and in the editor) | list, search, Build in editor, Work on document, Ask AnA | show anything beyond one project; any grade |
| Vault filing | `server/services/vault/vault-data-room-filing.ts`, `surfaces/VaultDataRoomFiling.tsx` | file captures into Vault (Captured → Classified → Filed) | — |
| A person's confirmation | `vault.document_catalog.catalog_state` (`20261008e`), `VaultCatalogRecord.tsx` | suggested / confirmed / corrected | feed a grade |
| Fixity | `server/services/vault/vault-fixity.ts` | a `vault.document.fixity` verdict per version on the audit chain | feed a grade |
| Closest "grades" | `evidence_objects.quality_score` via `confidenceScoringEngine.ts` (literature evidence: DOI, PMID, evidence level I–V); classifier confidence ("not scientific confidence"); AnA's `score_rwe_data_source` (stored nowhere); the CDISC validators `cdisc-conformance-service.ts` (`validateSdtmDataset`, `validateAdamDataset`) | — | grade a captured item. `confidenceScoringEngine` scores `evidence_objects` rows from literature fields a capture does not have, so it is not reached here; the CDISC validators are |
| Subscription | `c2c_project_pinned_evidence` (`migrations/20260529_phase10_schema.sql`), `GET/POST/DELETE /api/c2c/projects/:id/evidence`, audited | pin an artifact, Vault doc, precedent or guidance | a data-room kind; any client caller |
| Per-document binding | `editor/SourceAssemblyDialog.tsx`, `SourceImportDialog.tsx`, `StudyDataSource.tsx` + `csr-study-data.ts` | bind sources to one document | know what the project uses |

Searches run: `grade`, `quality_score`, `evidence_level`, `subscribe`, `subscription`, `pinned_evidence`, `catalog`,
`fixity`, `catalog_state`, `validateSdtmDataset`, `score_rwe_data_source`, `data_room`, over `server/`, `client/src/`,
`shared/`, `migrations/`, `db/migrations/`, and `git log --all --diff-filter=D` on `*grade*`, `*catalog*`,
`*subscri*` (nothing deleted that did this).

## Step 1 and 2: the catalog across projects, each item graded

**Completes** `data-room-search.ts` (the read) and `editor/DataRoomSourcesPanel.tsx` (the lane); no new screen,
route file or table.

- **The read.** `GET /api/c2c/projects/:id/sources?scope=catalog` (the existing route, one new value). The projects
  are the person's verified accessible set (`getCurrentAccessibleProgramScope`, the Vault library's scope) narrowed
  to the open project's sponsor (the library's rule: one sponsor's data never in another's list): never a project
  the request names. `project`, `study`, `kind`, `ctd`, `folder` narrow it, and `facets` says how every match (not
  the page) is organized by project, study, evidence kind, CTD section and Vault folder.
- **The lane.** Data room → *This project | All my projects*. The catalog opens organized by study; *Organize by*
  regroups it by project, kind, CTD section or Vault folder, and a select per facet narrows it, each value with its
  count. Each item shows its grade, where it sits (study, kind, CTD section, proposed folder) and its lineage
  (version, the capture it revises, superseded or not, when captured, SHA-256). A capture of another project is read
  here; its working actions stay in its own project.
- **The grade** (`server/services/clinical-regulatory-evidence/data-room-grade.ts`, split inside that folder, RULE 6).
  A deterministic function of recorded facts; the model never sets it (RULE 2). Six criteria, each shown with the
  fact it read: provenance (SHA-256, who, how it arrived) 20; integrity (bytes held, the same bytes in Vault, the
  Vault copy's latest fixity verdict) 20; currency 15; processing (read in full, in part, not read; a dataset's
  structure profiled) 15; verification (the Vault catalog record confirmed or corrected by a person) 15;
  conformance 15, for a dataset only: the CDISC validators (`validateSdtmDataset` / `validateAdamDataset`, the
  engines behind AnA's tools) over each profiled table. A criterion that does not apply leaves the denominator; a
  fact not held earns nothing and says so. A ≥ 90, B ≥ 75, C ≥ 55, else D; a withdrawn capture is D, a superseded
  one at most C, a failed fixity D.
- **Stored on the capture**: `grade`, `grade_score`, `grade_basis` (criteria, cap, the facts' fingerprint),
  `grade_engine`, `graded_at` (`migrations/20261106_data_room_grade.sql`, additive, nullable; the capture guard
  leaves derived columns mutable). Every read grades its page and rewrites a stored grade only when the facts'
  fingerprint changed, so a grade follows a fact (a filing, a confirmation, a fixity run, a supersession) the next
  time anyone reads it.

### Walked (`walk.cjs`, `walk-before.json`, `walk-catalog.json`, `screenshots/`)

Codespace-shaped: `post-create.sh`'s `c2c_write_state`, `c2c_ensure_database`, `c2c_provision`,
`c2c_seed_accounts` into a scratch state, database `c2c_cs`; a copy of `post-start.sh` (demo packs seeding). Sign-in
by `/api/auth/dev-login` as Ana Author, signed out after each width.

- `setup`: five fictional captures through the product's own upload (`POST /api/chat/upload`, project open), four
  in the C2C-101 project, one in the NeuroPanel-Dx project; the SAP captured twice (v1.0, then v2.0).
- `before-1440.png`, `before-390.png`: the lane before. One project only, no grade; the two SAP captures look the
  same.
- `catalog-*`: after, at 1440 and 390. "Every captured file across your 3 projects of this sponsor"; organized by
  study, kind, CTD section, Vault folder and project; the SAP v2.0 *Grade C · 71*, its basis criterion by criterion,
  "version 2.0 · revises capture 160"; v1.0 *Grade D · 53* ("Superseded by a later capture"); the ADSL extract's
  conformance "0 of 1 table pass the ADaM validator with no error (ADSL: 1 error)".

### Checks

- `data-room-grade.test.ts`, 7 cases. `01-red-superseded-cap-removed.txt`: with the superseded cap removed, the case
  that pins it fails; `02-green.txt`: restored, 7 of 7.
- The lane's suites (`dataRoomSourceReads`, `editorSourceLibraries`, `sourceUiRules`, `sourceAssemblyEntry`): green.
- `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:migration-deploy-path`, `ci:migration-guard-order`,
  `ci:migration-prefix-collisions`, `ci:migration-reachability`, `ci:one-product`, `ci:undefined-css-classes`: OK.
  The migration replayed over itself leaves the CHECK as it was (same constraint oid).
- `ci:launch-scope-api` reports `/api/biostat-bridge/computation-runs/:p/reproduce` unmapped: a biostatistics
  route called by `biostatSizingRun.tsx`, not touched here (→ the R1/S3 session that added it).

### Found, not fixed here

- The container this ran in had a stale, untracked `.env` (`DATABASE_URL` to another database) that
  `scripts/startup.sh` loads over the Codespace's own; moved aside for the walk. A Codespace has none.
- The Vault classifier proposed "Protocol" for a statistical analysis plan; the grade does not depend on it, and a
  person's correction of the catalog record is what earns *verification*.
