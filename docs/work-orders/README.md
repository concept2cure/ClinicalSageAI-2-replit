# Work orders — index and session handoff

**Read this before starting work in this directory.** It exists because work on
these orders spans many sessions, and a session that starts from a fresh clone
inherits the repository and nothing else — no prior conversation, no plan file,
no task list. Everything a new session needs to avoid redoing settled work, or
repeating a mistake that has already been paid for, has to be written down here.

Last updated 2026-09-17.

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
| AnA client-files surface — `server/services/vault/document-*`, `vault-ingest/placement.service.ts`, `server/services/ana/document-*-tools*`, `ana-session-bootstrap*`, `server/startup/document-catalog-bootstrap.ts`, persona's CLIENT'S FILES section | `…session_01DiJJAkasGVrccrxjhYyjxG` | **claimed** 2026-09-17 |

If you are one of the sessions above, correct your own row. If a lane you want
is claimed, take the next unclaimed finding in §3 rather than duplicating it.

**Note for the UI/authoring lane (`AuthoringPlaceIntoFiling.tsx`):** the placement
dialog work (`0f8e6a84b`, `0e47244ec`) left 13 dead symbols in that file — the
`SubmissionRow`/`SequenceRow` types, `SC_SEQ_STATUS`, `normalizeCtdCode`,
`ctdFolderSlug`, and the `subs`/`subId`/`seqs`/`seqId`/`lockedSeqs`/
`pickSubmission`/`sectionCanonical`/`sectionFolder` bindings — plus 3 in
`server/services/workflow/DecisionLineageService.ts` (`sql`, `inArray`,
`unifiedDocuments`). Together that is 15 over the ratchet baseline, so
`ci:eslint-warning-ratchet` is red on trunk. They are all unused imports and
unused destructurings from a refactor, so deleting them is mechanical — but the
file is yours and mid-flight, so it is reported here rather than edited from
another lane. Clearing them puts the gate back at 6549 with nothing else needed.

**Note for the vault-storage lane:** `server/services/vault/storage-migration.service.ts`
(`c029711ae`) landed `migrateVaultStorage` at complexity 17 / 102 lines, which put
`ci:eslint-warning-ratchet` one over its baseline. It was paid down elsewhere rather than
in your file, so the gate is green and the function is untouched — but it is still two
warnings you own. Splitting the per-document body out of the loop clears both.

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
