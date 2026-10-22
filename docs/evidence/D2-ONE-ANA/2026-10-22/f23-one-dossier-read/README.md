# F23: one source for readiness and module counts (D2, 2026-10-22)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, continuing `…01DiJJAkasGVrccrxjhYyjxG`, who claimed F23 on 2026-10-08 and has been idle since. Spec: `docs/design/FILING_SPINE.md` §7.2 F23. Launch row D2. The design was merged from three judged designs (minimal, spec, regulator).

## What already exists

These were inventoried at `3eb8e0eab0` before any design. Each claim was then checked against the code.

| Piece | What it did | What it did not do |
|---|---|---|
| `readinessByProject` (`server/routes/c2c/projects.ts`) | Counted approved or locked sections over every document of the project. It fed the Projects card, the detail read and the create. | It pooled the home filing with its added markets, so adding EMA's MAA lowered an FDA NDA's figure. Any error answered null, so a failed read looked like "no sections". |
| `GET /:id/workstreams` (`projects.ts`) | Project home's module rows. | It grouped by the text before the first dot, so `M1` and `1.1` were two modules. It weighted review as 75, drafted as 50 and locked as 0, so every section in review read 75% under a 0% header and every section locked read 100% over 0% modules. Its one caller (`ProjectHome.tsx`) had no shape guard and drew null as 0%. |
| `GET /:id/vault-structure` (`projects.ts`) | A project's section tree with live statuses. | No client had called it since at least 2026-07-21. |
| project-vault `GET /:id` (`project-vault.ts`) | The Vault's project tree. | It built a market document's folder from the whole market pack, so an MAA showed every Module 2-5 section as "Mandatory section — no content yet". A document with no sections read 0%. |
| `GET /api/ectd-compile/:id/status` (`ectd-compile.ts`) | Module readiness against a required set, by placement when the sequence had leaves. | It used the program's required set, never the sequence's market. A sequence with nothing placed fell back to a section store a program does not have. A module with nothing required read 0% and "ready". A program with no sequence read a measured-looking 0%. A 200 without `modules` drew "No module readiness yet". |
| The readiness trigger (`migrations/20260528_phase9_document_schema.sql`) | `c2c_documents.readiness` over every section row, pinned to `C2C_SECTION_COMPLETE_STATUSES`. | Headings that hold other sections are never approved, so no CTD document could reach 100%: an IND with every content section approved read 79. |
| Deleted earlier | `ProjectWorkstreams.tsx` (`2895218b8b`), `DossierMap.tsx` (`e5a74a4dfa`), `dossier_routes.ts` (`8e830f6da4`). | None of them measured governed sections. |

The disagreements, measured through the routes at head: `disagreements-at-head.txt`.

The work was a convergence. One read, `server/services/c2c/dossier-read.ts`, replaced two sources (`readinessByProject` and `/workstreams`). The Vault, the compile card and the list were corrected, not rebuilt.

## What changed

| Commit | Change |
|---|---|
| `b660daf1ef` (2/9) | `dossier-read.ts` and `GET /:id/dossier`: the home filing's figure, each added market's line, and one row per module, all on one definition of complete. Project home's card and module rows read it (`surfaces/ProjectDossier.tsx`). `/workstreams` deleted. |
| `e6058e4126` (3/9) | The list, detail and create read the home figure, with `readinessState` and `readinessReason`. `readinessByProject` deleted. On the Projects screen no figure draws no bar, an unavailable figure says so, and the mean says how many programs it covers. |
| `13337e02af` (4/9) | `GET /:id/vault-structure` deleted. The Vault tree is project-vault `/:id` and the figures are `/dossier`. |
| `ea79e00cbb` | The SQL-interpolation baseline for `projects.ts` moved from 8 to 6. |
| `3df9a2f722` (5/9) | `/status` module readiness and the shared leaf helpers moved unchanged to `server/services/ectd/compile-placement.ts`. |
| `de55d8bdaa` (6/9) | `/status` measures placement against the required set of the sequence's own market. A program with no sequence, or a market with no set, has no figure and says why. A module with nothing required is not "ready". The card moved to `surfaces/EctdModuleReadiness.tsx`. |
| `fe84064a6b` (review) | An upper-case project id reads the same measured figure (`review-commits-3-4.md`). |
| `1a9a7d2291` (7/9) | The Vault shows a market document's own part (`regionalSubtree`). A document with nothing counted shows no 0%. |
| `f466866fbd` (8/9) | Readiness counts sections, not headings. See "Commit 8" below. |

## How each disagreement ends

| At head | Now |
|---|---|
| Every section locked: header 100%, modules 0% | Both 100% (approved or locked is complete) |
| Every section in review: header 0%, modules 75% | Both 0%, with the count in review beside them |
| `M1` and `1.1` two modules | One Module 1 row |
| Adding EMA moved the NDA's header from 42% to 32% | The home figure does not move. EMA has its own line. |
| Compile card: "0%" beside "ready" | "none required" |
| A program with no sequence: "0% · incomplete" | "No sequence exists for this program yet, so nothing is counted as placed." with no figure |
| An EU sequence of an NDA program measured against FDA's set | Measured against EMA's |
| 100% unreachable: every content section approved read 79 | 100 |

## Commit 8: readiness does not count empty headings

- **The rule.** A section is counted unless it is an *empty heading*: still `todo`, and named by another section of the same document as its parent. An empty heading is never approved, so counting it kept every CTD document under 100%. A heading someone has written in is counted like any section, so unsigned text at a heading still holds the figure under 100%. The commit's first draft dropped every heading, and its review confirmed the false 100% that gave (`review-commit-8.md`). The rule is written once in SQL, as `countedSectionSql` in `server/services/c2c/section-content.ts`. The migration's function `c2c_document_counted_readiness()` carries that exact text, and the contract test reads it back out of the migration. The TypeScript form over rows already read is `markCountedSections`, which `dossier-read.ts` uses. Its rows carry a required `counted` mark, so a row that did not pass through the read cannot be counted by default.
- **The migration is amended in place** under Rule 1, with a dated header note and the eCTD audit header that `require-migration-headers.sh` asks of a changed 2026 file.
  - The trigger and the backfill share one function.
  - The trigger also fires on a change of `parent_key`.
  - An index on `(document_id, parent_key)` serves the heading probe. Each deploy's recount runs inside the migration's transaction.
  - The backfill recounts only documents that have sections, and only where the stored value differs, so it is idempotent on replay. A legacy document with no sections, inserted by `20260529_phase9_backfill`, keeps its figure: there is nothing to recount, and 0 would read as measured.
  - The backfill leaves `updated_at` alone. On a database that carries `db/migrations/20260526_updated_at_triggers`' `set_updated_at`, which would stamp `now()` on every recounted row, that trigger is disabled for the one statement inside the migration's transaction.
- **A writer fixed on the way.** `PATCH /api/c2c/documents/:id/sections/:key` inserted a missing section without its `parent_key`. The heading above it then read as holding nothing and was counted. It now takes the parent from the pack (`filing-section-respects-authoring-seal.test.ts`, which also checks the statements, since its stub answers whatever is asked).
- **Readers.** An inventory workflow (five read-only areas and a completeness critic) found every reader. Readers of the stored figure (the Vault, AnA's document list, the outline hooks) follow the trigger. `dossier-read.ts` counted rows itself and now uses the same rule. `ProjectDossier`'s meaning now says "Headings that hold other sections are not counted."
- **Other completion figures, over other stores, are not this one** (Rule 3). None of them is a reader of `c2c_documents.readiness`, and none was converged:
  - the Reporting readiness engine (`server/services/regulatory/readinessEvaluator.ts`, over `sections`);
  - `server/services/dossier/dossier-map-view-assembler.ts` (over `project_sections`);
  - `/api/dossier-readiness`;
  - `ProjectHome`'s canvas drafted counts.
- **Not touched.** RLS: the applier sets no `app.rls_enforce`, so the backfill sees every row, as the posture is documented. Locked and archived documents are recounted too. Readiness is derived and is not part of the lock snapshot.

## Red, then green

| Commit | Red at its parent | Green | Mutations |
|---|---|---|---|
| 2/9 | `red-dossier-read-at-head.txt`, `red-dossier-route-at-head.txt`, `red-project-home-at-head.txt` | `green-commit-2.txt` | `mutations-commit-2.txt` |
| 3/9 | `red-commit-3-at-head.txt`: 8 of 11 server cases and 4 client cases | `green-commit-3.txt`: c2c routes 669 passed (the 17 failures are four ai-editing/exports files red at head); client 435/435 | 14, all red |
| 4/9 | `commit-4-vault-structure.txt`. The first version of the "gone" pin passed against the old router and was strengthened until it failed there. | 342/342 | the pin itself, run against the old router |
| 5/9 | (a move) | `commit-5-move.txt`: the compile suites unchanged, 178/178 | — |
| 6/9 | `red-commit-6.txt`: 5/5 and 4/4 | `green-commit-6.txt`: 183/183 and 192/192 | 12, all red |
| review | `review-commits-3-4.md` | 30/30 | the red run is the mutation |
| 7/9 | `red-commit-7.txt` | `green-commit-7.txt`: 74/74 and 541/541 | 5, all red |
| 8/9 | `red-commit-8.txt` | `green-commit-8.txt` | 13, all red (`mutations-commit-8.txt`), including both rejected rules |
| 8/9 review | `review-commit-8.md`: 11 findings, 3 confirmed | the same | the first draft's rule, as a mutation |

## After landing: sections the old PATCH wrote without a parent

The F23 (8/9) hand-on, closed. `PATCH /api/c2c/documents/:id/sections/:key` inserted a missing section without `parent_key` from `f47d664dae` (2026-05-28) until `f466866fbd`. Such a row reads as a root. The heading the pack files it under then reads as holding nothing, so readiness counts that heading.

### What already exists

An inventory workflow ran at `59105431a9`: five read-only angles, each claim put to a refuter, and a completeness critic.

- **Writers.** Six production statements write `c2c_document_sections`, plus three INSERTs in `20260529_phase9_backfill.sql`.
  - The scaffold (`scaffold-project-documents.ts:173-186`) and add-a-market (the regional subtree with its ancestors) copy each pack parent verbatim.
  - The editor write-through and the signature approval update only content or status.
  - No path writes or keeps NULL on purpose for a key the pack files under a parent. No production statement updates `parent_key`.
- **The legacy backfill also writes NULL parents.** `20260529` does so for legacy 510(k) and CER rows. Their keys are slugs, not pack keys, and the CER pack is all roots, so the repair does not reach them in practice.
- **Readers.**
  - The trees people see nest by the pack's parent, not the row's: the outline route, the editor tree, the Vault and `regionalSubtree`.
  - The row's parent is read by three: the counted rule (SQL and TypeScript), `dossier-read.ts`'s module grouping for device packs (keys that are not CTD codes), and AnA's `read_governed_document` (raw).
  - All of them tolerate a parent that names no row.
- **Triggers.** The table has two, both from `20260528`.
  - The readiness trigger fires on `UPDATE OF parent_key` and stamps `c2c_documents.updated_at`.
  - The version snapshot acts only on a content change, so a parent change writes no version and needs no attribution GUC.
  - No database-level guard refuses an update to a locked or approved row.
  - `set_updated_at` exists only where `db/migrations/20260526_updated_at_triggers.sql` was run by hand (`scripts/db_migrate.sh`).
- **Packs.** Every pack writer in the set was replayed in order on PGlite: 86 pack versions, no key listed twice, no self-parent, no dangling parent, no cycle. Each document resolves to exactly one pack row through its composite foreign key.
- **Repairs.** None exists, and none was deleted: `git log --all --diff-filter=D` on parent_key, reparent, resync, reconcile, backfill, repair, outline sync and scaffold.
- **Trace convention.** No migration in the set writes an audit row when it rewrites rows. The convention is a dated header note and a `RAISE NOTICE`, which the applier copies into the deploy log.

### What changed

- **`20260528_phase9_document_schema.sql` is amended in place** (Rule 1). A dated note is added to the header and at the repair.
  - Between the `DROP TRIGGER` and the `CREATE TRIGGER` of the readiness trigger, a DO block files every section whose `parent_key` is NULL under the parent its document's own pack gives it.
  - The trigger cannot fire there, so no document is stamped. The backfill that follows recounts the figures without touching `updated_at`, as it already does.
  - `set_updated_at` on the section table is set aside for the one UPDATE where it exists, then put back.
  - The count goes to the deploy log as a NOTICE.
- **Only a NULL parent is filled.** A parent already set is not this repair's to change.
- **These are left alone:** a key the pack lists twice, a key that is its own parent, and a pack whose `required_sections` is not an array. Without that last guard `jsonb_array_elements` raises and the deploy fails.
- **Locked and approved rows are filed too.** `parent_key` is structure taken from the pack. It is not text, a status or a signature, and no version is written.
  - No signed digest moves. `server/services/part11/signature-persistence.ts:573-611` hashes a document's id, type, agency, pack version, title and status, and each section's key, version, status and content. It hashes no `parent_key`, `readiness` or `updated_at`.
  - The stored readiness of a locked or submitted *document* is recounted too, as the commit-8 backfill already does. Readiness is derived and is in no lock snapshot.
- **Market documents.** The PATCH has never checked filing scope, and a client called it until `981c27b3a7` (2026-10-17) deleted its last caller. So a market document can hold a key outside its own part, for example `2.5`.
  - The repair files such a row too. Its pack parent is either a heading the market document has no row for (`M2`) or the market's `M3` container (for `3.2.S`).
  - Neither changes a figure. A parent with no row marks nothing. `M3` already holds `3.2.R`, so it was already a heading.
  - No tree shows the row: the Vault and the outline cut a market document to its regional subtree of the pack.
  - A filter on `filing_scope` cannot be put in this block. That column arrives at set index 404 (`20261015e`), and the reference fails a fresh install with 42703 even on empty tables (the inventory critic's probe).
- **The repair does not require the parent's row to exist.** The canonical writers do not either, and every reader tolerates a parent with no row. With that guard, a heading inserted later as `todo` would be counted again.
- **Idempotent.** A filed row no longer matches, and with nothing to file the block returns before it sets any trigger aside.
- **A row `20260529` inserts in the same run is filed on the next replay.** That file runs after this one, and its keys are not pack keys in practice.
- **A test fixture gains `rule_pack_version`.** `authoringDraftTerminationAccept.pglite.test.ts` builds a narrow `c2c_documents` before it applies the migration, and it already adds the phase-9 columns the real file needs. On the deploy path the column always exists: this file creates it, and the composite foreign key depends on it.

### Red, then green

| | File | Result |
|---|---|---|
| Red at `59105431a9` | `red-parent-repair.txt` | The repair case is red on the defect: `expected null to be 'M1'` |
| Green | `green-parent-repair.txt` | The readiness suite and the contract test, 18/18. Every suite that applies the migration: 37 files. The fixture failure was this change's and is fixed. The two trunk reds fail the same 7 tests with the head migration |
| Mutations | `mutations-parent-repair.txt` | 9/9 red: no repair; overwriting a set parent; the trigger left in place (it stamps the document); the section stamp not set aside, or left off; no array guard (the deploy raises); a doubled key filed; a self-parent filed; the early return inverted |

**Not measured:** how many rows a deployed database holds. No deployment exists yet (D1). When a deploy files any row, its log carries a NOTICE with the count. No NOTICE means none was filed: the block returns early when nothing matches. The applier sets no `app.rls_enforce`, so the block sees every row, as the commit-8 backfill does.

The inventory's critic read the landed block at `7730e04ab4` and found no defect. It ran `ci:json-operator-types` and `db:sync-manifest:check` besides the gates above, all OK, and four test files, 38/38. The market, digest, locked-document and NOTICE notes above are its findings about this record.

## Handed on

- ~~**Two trunk reds, not F23's.**~~ Both pass at `4eacf0fd27`, in the 178-file run of `../filing-lock-write-through/green.txt`; other sessions' commits fixed them.
  - `tests/authoring-market-document-binding.pglite.test.ts` "creates the market's own Module 1 section" returns 500: `relation "authoring_audit_trail" does not exist`. The section-create path writes that table since `9a4da85005` (2026-10-21), and the fixture does not build it.
  - `tests/lineage/founder-path-lineage.pglite.test.ts` fails from hop 8 (`Invalid sequence id`).
  - Both fail identically at the pushed head without this work.
- **Own counts that still include headings, with no client caller.**
  - `server/routes/biopharma/programs.ts`: `completion_percentage` and `section_counts`. The design deferred it. Its comment's claim to match the Projects list is now false.
  - `server/routes/biopharma/ctd.ts` with `server/services/regulatory/ctd-module-structure.ts`: `/api/biopharma/ctd/build-state`, which AnA's BLA tool describes.
  - For L33 (`…01E8btkB`).
- **The trigger has no DELETE branch.** No production path deletes a section. The replayed backfill corrects a deletion at the next deploy.
- ~~**Rows the old PATCH path wrote have no `parent_key`.**~~ Closed: a replay files them under the parent their own pack gives them ("After landing", above).
- ~~**Denominators shown beside the figure.**~~ Closed by `dfe94a3002` (another lane, evidence `../ana-outline-denominator/`): AnA's outline read states the counted denominator. Its editor half does not apply, because no editor file draws the figure beside its "N sections".
- ~~**`server/services/ectd/leaf-source-resolver.ts`** comments named the old function.~~ Closed in `59105431a9`: it and two test headers name `c2c_document_counted_readiness()` and the counted sections.
- **`notOffered` on the scoped list** is still never sent (F18's hand-on).

## Not doing (from the design)

- No placement figure in the dossier read.
- No merge of `sectionMatches` and `ctdCodeWithin`.
- The numeric `project_sections` branch stays.
- No percentages on Submit rows.
- Canvas "drafted" counts are untouched.
- `SubmissionCenter.tsx`, dossier-map and `/api/dossier-readiness` are untouched.
