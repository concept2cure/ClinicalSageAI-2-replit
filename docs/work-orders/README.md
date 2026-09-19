# Work orders — index and session handoff

**Read this before starting work in this directory.** It exists because work on
these orders spans many sessions, and a session that starts from a fresh clone
inherits the repository and nothing else — no prior conversation, no plan file,
no task list. Everything a new session needs to avoid redoing settled work, or
repeating a mistake that has already been paid for, has to be written down here.

Last updated 2026-09-18.

---

## 0. Who is working on what — claim your lane here

Sessions cannot message each other. This table is the only coordination
mechanism, so **claim before you start and release when you stop.** Keep entries
to one line; edit only your own row to limit merge conflicts.

| Lane | Session | State |
|---|---|---|
| WO-15 finding 5 — `c2c_template_specs.doc_types` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| WO-15 finding 8 — the two blind gates | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed `b9152a016` |
| WO-15 finding 4 — `/api/design-risk` | `…session_01J935DZwfFEardJCv85SJds` | **released** — done `153481465` |
| WO-16C — fabrication sweep (`server/services/`, `server/routes/`) | `…session_01E8btkB8mcLirW4rNvsMNxK` (inferred from commits) | active |
| WO-15 finding 2 — `project_charters` 27 vs 48 columns | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| `KNOWN_UNLISTED` triage — 10 entries, 16 tables | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed, all ten now on the applier |
| Schema authority — live-schema baseline + the 61 tables behind it | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **active** — gate fixed, baseline 70→61→47; DEAD surfaces deleted (7 files, §7); triage corrected (§8) — 8 relations are LIVE and need provisioning |
| AnA client-files surface — `server/services/vault/document-*`, `vault-ingest/placement.service.ts`, `server/services/ana/document-*-tools*`, `ana-session-bootstrap*`, `server/startup/document-catalog-bootstrap.ts`, persona's CLIENT'S FILES section | `…session_01DiJJAkasGVrccrxjhYyjxG` | **claimed** 2026-09-17 |

If you are one of the sessions above, correct your own row. If a lane you want
is claimed, take the next unclaimed finding in §3 rather than duplicating it.

### Handed to the AnA / council lane (`…01DiJJAk`) — found, not fixed, by the schema-authority lane

Two findings surfaced inside that lane's files. Reported rather than edited,
per the claim above. **Neither is a regression from the reporting lane's work.**

1. **`ana_runs` does not exist on a provisioned database.**
   `server/services/ana/run-control.ts` queries it; it arrived with AnA commit
   `45748a8f5` and nothing creates it in any lineage. This makes
   `ci:tables-live-schema` **red on clean trunk**. It was deliberately NOT
   added to `scripts/ci/tables-live-schema-baseline.json`: that file's own
   comment says *"Re-running `--baseline` to make a failure go away converts a
   caught defect into an accepted one."* The fix is a migration in
   `C2C_MIGRATION_FILES`, not a baseline entry.

2. **`lumen.data_atoms` is read by live code and written by nothing.**
   `server/services/multi-agent-council.ts:864,1070` and
   `server/services/innovation/auto-traceability-service.ts:371` SELECT from
   the schema-qualified `lumen.data_atoms`. Every live INSERT
   (`routes/chat/upload.ts`, `routes/c2c/artifacts.ts`,
   `routes/c2c/knowledge-sources.ts`, `routes/cortexAdvisoryRoutes.ts`,
   `services/projects/contextual-ingest.ts`,
   `services/clinical-regulatory-evidence/retrieval-atoms.service.ts`) targets
   **`lumen_data_atoms`** — a different, public-schema table. Reads and writes
   have been aimed at two different relations.

   This split **predates** the 2026-09-18 deletion of
   `server/workers/enhanced-ingestion-pipeline.ts` and was not caused by it.
   That file was the only writer of the schema-qualified table, but nothing
   imported it, so it never ran: those reads already returned nothing. Deleting
   it removed the *appearance* of a writer, not a writer. Deciding which
   relation is canonical is a council-lane call.

**Cleared from another lane (2026-09-19):** the 16 dead symbols reported here on
2026-09-17 — unused imports and destructurings in
`client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx` and
`server/services/workflow/DecisionLineageService.ts` — were still there a day
later with the files untouched since, so they were deleted rather than left to
block the ratchet for whoever added the next legitimate warning. Nothing but
dead symbols was touched; both files' suites pass. Baseline relocked at 6522.

**Note for the vault-storage lane:** `server/services/vault/storage-migration.service.ts`
(`c029711ae`) landed `migrateVaultStorage` at complexity 17 / 102 lines, which put
`ci:eslint-warning-ratchet` one over its baseline. It was paid down elsewhere rather than
in your file, so the gate is green and the function is untouched — but it is still two
warnings you own. Splitting the per-document body out of the loop clears both.

**Live-schema baseline — where it stands, and the trap in it.** Ratcheted
70 → 61 (`e6b769525`), then 61 → 60, then **60 → 47** on 2026-09-18 when the
DEAD surfaces were deleted (§7) — 13 entries removed (4 `analytical_*`,
9 `lumen.*`, three of the latter being FUNCTIONS rather than tables) because the
only code referencing them no longer exists. Verified by diff: 13 removed, none
added. The remainder are real: server SQL referencing relations a
full `install-fresh` + `deploy-migrate` does not produce.

The categorisation below was made against the 61 and is **not** re-measured
against the 47; the 13 that went were all in the "created by nothing anywhere"
group, so read the last row as 57 − 13 = 44 and the first two rows as
unchanged. Re-measure before relying on it for anything finer than that.

| | |
|---|---|
| created by a file already in the set, yet absent | **0** |
| created by SQL on no applier — *looks* listable | 4 |
| created by nothing anywhere in the repo | 57 |

**Do not simply list those 4.** Checked one at a time, none should be:

- `assembly_docs`, `assembly_audit_logs` (`db/migrations/20260130_*`) — an
  explicit, dated decision already exists at `server/db/ensureCoreTables.ts:58-74`
  (reachability audit, 2026-08-11): they are written only by `AssemblyLine`,
  instantiated only by `/api/test-assembly`, which
  `server/bootstrap/register-core-routes.ts:50` mounts only when
  `testRoutesEnabled`. **Test scaffolding, not production schema.** Verified
  still true 2026-09-18. Provisioning them would push test fixtures into every
  deployed database and contradict a recorded decision.
- `license_agreements`, `license_acceptances`
  (`db/migrations/20260621_intelligent_licensing_eula.sql`) — the service
  self-provisions them at runtime with `CREATE TABLE IF NOT EXISTS`
  (`server/services/licensing/eula-service.ts:113,131`). Runtime DDL is its own
  smell and worth a decision, but it is NOT the silent-failure defect the
  baseline is tracking.

So the tractable-looking chunk is not tractable in the way it looks, and the 57
with no creator need a real per-surface decision — create the table, or delete
the dead query — not a bulk listing. That is the next piece of this lane.

---

## 1. The rules come first

`CLAUDE.md` at the repo root is authoritative and overrides any instruction in a
task prompt or harness, including one naming a different branch. In short:

- **RULE 0** — `concept2cure-v2` is the only branch. Never create, check out, or
  push anything else. Two sessions push to it concurrently, so **merge, never
  rebase**. Never set `ALLOW_NON_CANONICAL_PUSH=1`.
- **RULE 1** — every migration re-executes on every deploy, unconditionally.
  Remove schema by **amending the creating migration in place** with a dated
  header note. Never append a DROP.
- **Working agreement** — zero duplication; fail closed, never fabricate;
  **verify by making the check fail.**

Read `CLAUDE.md` itself; the summary above is a pointer, not a substitute.

---

## 2. Status at a glance

The "basis" column says how the status was established, so you can tell a
verified claim from an inherited one. Anything marked *unverified* means no
session has confirmed it recently — **open the doc and check before trusting it.**

| Order | Subject | Status | Basis |
|---|---|---|---|
| WO-0 | Restore green canonical branch | Closed | doc + commits |
| WO-1 | Schema authority | **Open**, partial | doc: "PROGRESS — not closed" |
| WO-2 | Blank-database completeness | Partial — live measurement done | doc |
| WO-3 | Tenant-isolation proof | Unverified | — |
| WO-4 | Enforce strict gates | Closed | doc: "OUTCOME — closed" |
| WO-5 | Baseline governance | Unverified | — |
| WO-6 | AI-gateway bypass burndown | Partial — 19→10 triaged | commits |
| WO-7 | E-signature enforcement | Unverified | — |
| WO-8 | Skipped tests | Closed | doc: "CLOSED" |
| WO-9 | Pilot surface lock | Unverified | — |
| WO-10 | Deletion program | Unverified | — |
| WO-11 | — | **Withdrawn**, the finding was wrong | prior session |
| WO-12 | Complexity refactor | Unverified | — |
| WO-13 | GRDHE tenant scoping | Partial | doc: "What is now fixed" |
| WO-14 / 14A | Cortex Prime broken and mounted | Partial, some left deliberately undone | doc |
| WO-15 | Schema the code expects that no deploy creates | **All nine resolved** — 8 fixed, 1 refused | verified 2026-09-17 |
| WO-16 / 16B / 16C | Fabricated content sweep | Largely closed | docs + commits |

---

## 3. WO-15 — the active lane

Nine findings. State as of 2026-09-17:

| Finding | State |
|---|---|
| 1 | **Refused** by adversarial review. Stays refused — do not reopen without new evidence. |
| 2 | **Fixed** — 21 declared columns added on the applier. Confirmed as written, and it corrected my own finding-3 error: push does NOT create the charter tables. |
| 3 | **Fixed** `0186d8d2d` — charter audit Part 11 append-only triggers |
| 4 | **Fixed** `153481465` — `/api/design-risk` deleted: 20 endpoints over ten tables that exist on no database |
| 5 | **Fixed** — `20260716_template_doc_types.sql` listed in the set, its false `KNOWN_UNLISTED` exemption removed. Confirmed, not corrected: the finding was right. |
| 6 | Fixed (earlier session) |
| 7 | **Fixed** `4c6f38153` — `contradiction_consequence_log` column name + fabricated `detected_by` default |
| 8 | **Fixed** `b9152a016` — the installer could not see the `vault` schema, which was hiding `vault.evidence_citations`: declared, INSERTed into by `advancedRAGPipeline.ts:1316`, created by no applier |
| 9 | Fixed (earlier session) |

Findings 3 and 7 in `WO-15-...md` each carry a **CORRECTED** block. The original
finding text is preserved beneath it under "Original finding, as written" — read
the correction first; in both cases the original headline was wrong.

**All nine findings are resolved: 8 fixed, 1 (finding 1) refused by adversarial
review and staying refused.** Three had wrong headlines (3, 7 and — in the
opposite direction — my own correction to 3); two were right as written (5, 2).
Check each claim, do not assume either way.

One item surfaced here was NOT part of WO-15's nine and is now also **fixed**:
10 of the 15 `KNOWN_UNLISTED` entries in
`tests/ops/apply-c2c-migrations-manifest.test.mjs` failed that list's own stated
reason, covering 16 tables. All ten are now on the applier and their exemptions
are gone, with `tests/schema-contract/known-unlisted-reason-holds.contract.test.ts`
enforcing the rule the list only stated in prose. The first figure published here
was "14 of 16" from a crude heuristic; re-measured it was 10 of 15. See WO-15
finding 5.

With WO-15 and the `KNOWN_UNLISTED` triage both closed, the next unclaimed work
is the untouched orders in §2 — WO-3, WO-5, WO-7, WO-9, WO-10 and WO-12 are all
marked *unverified*, meaning no session has confirmed their status recently. Start
by re-deriving the status rather than trusting the row.

---

## 4. Lessons that cost real time — do not relearn these

**A green migration against a database that happens to be complete is not
evidence that the migration *set* is complete.** Finding 3's first attempt added
`migrations/20260629_charter_tables_rebuild.sql` to `C2C_MIGRATION_FILES` and
passed a live-database proof. It was wrong: the file has five
`REFERENCES project_charters(id)` clauses and nothing in the set creates that
table. (This paragraph first said "Drizzle push does" — it does not, and that
error is itself WO-15 finding 2's subject: `project-charter.ts` is re-exported
from `shared/schema/index.ts`, which is not a drizzle entrypoint, so the charter
tables are outside the push surface and come from install-fresh's overlay.) The
live database already had the table from install-fresh, so the proof could not
expose the gap.
`tests/schema-contract/tenant-isolation-sweep.contract.test.ts` C-33 applies the
set to a **bare** database and caught it. Run the schema-contract shards before
believing any change to the set.

**There is no such thing as a standalone deploy-migrate-lineage database.**
`scripts/db/deploy-migrate.mjs` refuses an unprovisioned database ("Missing base
tables: organizations, users, c2c_documents, …"), so install-fresh provisions
every database and its step-3 overlay (`migrations/*.sql`) always applies first.
Several WO-15 findings are framed as two competing lineages. **That framing is
wrong wherever it appears** — check it before acting on it. In finding 7 it
*understated* the defect: it is always the same four writes that fail, on every
database, not four-of-nine depending on how the database was built.

**`CREATE TABLE IF NOT EXISTS` converges nothing.** It never adds a column to, or
alters a column on, a table that already exists. Amending a creating migration
fixes only what a *new* database gets; an existing one needs
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside `C2C_MIGRATION_FILES`, which is
the only applier that touches a populated database. Both halves are usually
required and neither substitutes for the other.

**A gate's blind spot is where the defects live.** The installer verified
`drizzle-kit push` by counting tables, and both halves of the count were
public-only — the regex matched `pgTable('name')`, the query filtered
`table_schema = 'public'` — so all six `vault.table('name')` declarations were
outside its view while it printed "declared tables verified present". Behind
that: `vault.evidence_citations`, declared in Drizzle, created by a file under
`db/migrations/_legacy/` that no applier's non-recursive glob descends into, and
INSERTed into by `advancedRAGPipeline.ts:1316` on every retrieval — the 42P01
swallowed by a `console.warn`. When a gate has only ever passed, ask what it
cannot see, then hide something it should catch and check that it fails.

**"A real implementation exists" and "which one is canonical" are different
questions.** An earlier fix in this sweep resolved a fabrication by wiring a
route to a real implementation that was not the canonical one, entrenching a
duplication while removing the fabrication. Check for a canonical implementation
(own test suite, multiple consumers) before wiring anything.

**Prove it by making the check fail.** For a schema change that means breaking a
real database in the exact way the migration exists to repair — drop the trigger,
drop the column, run the real applier, watch it come back. For a code change it
means running the new test against the unfixed code first and seeing it name the
real defect.

---

## 5. Verification commands

Per change, not batched at the end:

```bash
npm run ci:migration-set-order && npm run ci:migration-drop-safety
npm run ci:migration-reachability && npm run ci:duplicate-table-ddl

# Run in three shards — one invocation OOMs the container.
npx vitest run tests/schema-contract/ --shard=1/3   # then 2/3, 3/3

DATABASE_URL='postgresql://…' node scripts/db/deploy-migrate.mjs
npm run ci:tables-live-schema
```

A local Postgres may already be running with the socket in `/tmp` rather than
`/var/run/postgresql` — `PGHOST=/tmp` reaches it. `c2c_testdb` is an
install-fresh-provisioned database suitable for applier proofs.

---

## 6. If you are a new session picking this up

1. Read `CLAUDE.md`, then §3 and §4 above.
2. Open `WO-15-...md` and read findings 3 and 7's **CORRECTED** blocks — they
   record how the two most recent fixes were reached and what was wrong with the
   original analysis.
3. Start on finding 4 with the `audit:orphaned-endpoints` check.
4. Update this file when a status changes. A stale index is worse than none,
   because it is trusted.

---

## 7. The DEAD-surface deletion (2026-09-18, schema-authority lane)

The live-schema baseline listed relations that server SQL references and that no
database has. Grouped by referencing file, they were a handful of coherent
**surfaces**, not independent tables — so the unit of work was a surface, and the
decision per surface was binary: **LIVE** → provision it durably, **DEAD** →
delete it. This records the DEAD half.

### What was deleted, and the evidence for each

| File | Why it was safe to delete |
|---|---|
| `server/services/analytical/lims.ts` | Unreferenced module (nothing imports its exports). Sole referencer of 4 `analytical_*` tables. |
| `server/services/knowledge-graph.ts` | Unreferenced. Sole referencer of 6 `lumen.*` graph tables/views. |
| `server/api/neuro-symbolic/routes.ts` | Unmounted route module — on no router. |
| `server/workers/entity-extraction-worker.ts` | Imported only by the two modules above. |
| `server/workers/enhanced-ingestion-pipeline.ts` | Unreferenced. |
| `server/workers/layout-aware-ingestion.ts` | **Cascade** — imported *only* by `enhanced-ingestion-pipeline.ts:17`. |
| `server/db/database.js` | Self-described legacy shim; zero import specifiers anywhere. |

The last two were not in the original set. They became unreachable *because of*
the first five, and `ci:unreferenced-modules` reported them as NEW unreferenced
modules on the next run. **That gate finding the cascade is the reason to trust
the deletion**: deleting a module surfaces whatever only it kept alive, so the
gate, not the analysis, decides when the cascade has stopped.

### What the deletion moved

| Gate / baseline | Before | After |
|---|---|---|
| `scripts/ci/tables-live-schema-baseline.json` | 60 | 47 |
| `scripts/ci/unbacked-tables-baseline.json` | 37 | 27 |
| `scripts/ci/unreferenced-modules-baseline.json` | 97 | 94 |
| `scripts/db/referenced-tables-baseline.json` (`knownMissing`) | 10 | 9 |

Every baseline moved in the **shrink** direction only; the regenerated
`unreferenced-modules` baseline was diffed to confirm it removed exactly three
entries and added none. A `--write-baseline` that quietly adds an entry launders
a new defect into an accepted one, so the diff is the check, not the exit code.

### Two things the deletion forced, neither of them mechanical

- **`tests/schema-contract/c2c-apply-path.contract.test.ts`** pinned an INSERT
  column list by reading `enhanced-ingestion-pipeline.ts`. With that file gone
  the test failed on its own `read()`. It was **removed rather than re-pinned**,
  because there is no remaining writer to pin it to — and that absence is itself
  the finding now recorded in §0 for the council lane. The surviving assertions
  still carry C-12, and were proven to discriminate by deleting `atom_type` from
  the canonical migration and watching the suite go red.
- **`server/services/embedding-corpus-policy.ts:130`** named
  `layout-aware-ingestion.ts` as "the active writer" of `vault.document_chunks`.
  It was not: the real writer is
  `server/services/vault/document-chunking.service.ts:110`, which is imported by
  `vault-ingest.service.ts:333` and `startup/document-catalog-bootstrap.ts:48`.
  The registration's *conclusion* (3-small) was right by luck — the real writer
  independently uses the same model — but its stated evidence named a module that
  never ran. Corrected in the policy file and its test.

**The lesson worth keeping:** a comment naming the module that justifies a
config value is load-bearing evidence. When it names a module nothing imports,
the value has never actually been checked against anything.

---

## 8. Triage correction — two "DEAD" verdicts were wrong (2026-09-18)

The plan's cluster triage was produced by Explore agents. Re-verified by tracing
mounts directly, **two of the three DEAD verdicts do not hold.** Recording this
because acting on them would have deleted live surfaces.

| Surface | Agent verdict | Verified | Evidence |
|---|---|---|---|
| `server/api/cmc/playbookRoutes.ts` | DEAD | **LIVE** | `blueprintRoutes.ts:9` imports it, `:748` mounts it at `/playbook`; `register-core-routes.ts:68` mounts `blueprintRoutes` at `/api/cmc/blueprint` — unconditionally (a plain `try` block, not a feature gate). Reachable at `/api/cmc/blueprint/playbook/*`. |
| `server/api/cmc/portfolio.ts` | DEAD | **LIVE** | Same router: `blueprintRoutes.ts:8` imports, `:746` mounts at `/portfolio`. Reachable at `/api/cmc/blueprint/portfolio/*`. |
| `server/routes/cognitive-ecosystem.ts` | DEAD | **DEAD, but blocked** | Explicitly retired (#844, Phase 0.2) and unregistered — see the note at `register-document-routes.ts:246`. See below for why it was not deleted. |

So 8 of the 47 baselined relations belong to **live, mounted endpoints** and need
**provisioning**, not deletion:

- `/api/cmc/blueprint/playbook/*` → `cmc_workflows`, `cmc_workflow_instances`,
  `cmc_workflow_tasks`, `cmc_checklist_instances`, `cmc_ai_tool_executions`
- `/api/cmc/blueprint/portfolio/*` → `reg_submissions`, `reg_m3_sections`,
  `reg_rpi_snapshots`

**The method that caught this:** grep for the *exact* import path, not the
basename. A basename search for `portfolio` matches `ind-portfolio`,
`portfolio-simulation` and `protocol-portfolio-metrics`, none of which is the
file in question — and a bare `from './types'` matches every service directory
in the repo. A loose pattern produced a confident, wrong DEAD verdict; the same
loose-matching error cost this lane a day earlier (§4).

### Why `cognitive-ecosystem` was NOT deleted, though it is dead

It is a self-contained unmounted island: the route, plus the 11-file
`server/services/cognitive-ecosystem/` subtree. The **only** external importer of
that subtree is the route's own line 28 — and that import is empty
(`import { } from '../services/cognitive-ecosystem'`), the residue of the
retirement. Nothing else in `server/` or `client/` imports any of it.

Route and subtree are therefore **one decision, not two**: only the route is in
`unreferenced-modules-baseline.json`; the 11 service files are absent from it
precisely *because* that empty import still counts as a reference. Delete the
route alone and the whole subtree becomes newly unreferenced — the same cascade
§7 describes, but this time landing on files that must not be quietly baselined.

**The blocker is Part 11, and it is real.** `cognitive-audit.service.ts` is the
sole writer of four `cognitive_audit.*` tables that **do exist** on a provisioned
database (`db/migrations/064_gcc_cognitive_audit_schema.sql`) and are **not** in
the live-schema baseline. `server/services/audit/domain-history-link.ts:216-237`
records that service as the registered `owner` of all four, with semantics like
*"One AI reasoning step with its prompt and semantic content (own hash chain)"*
and *"One e-signature applied over cognitive-audit content."*

Deleting it would remove the only writer of provisioned electronic-signature and
audit-chain schema and leave four dangling owner entries in the audit domain map.
That is a compliance decision, not a cleanup, so it is **recorded rather than
guessed at**. Whoever takes it needs to answer: are the `cognitive_audit.*`
tables retired along with the subtree — in which case the domain-map entries and
migration 064 go too — or is the subtree meant to be re-mounted?

Contrast with `federated_*` (4 baselined entries, referenced by the route and by
`federated-learning.service.ts` only): those tables exist nowhere, so they carry
no such coupling. They are blocked only by being on the same island.
