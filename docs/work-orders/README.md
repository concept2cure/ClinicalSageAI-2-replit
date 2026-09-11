# Work orders — index and session handoff

**Read this before starting work in this directory.** It exists because work on
these orders spans many sessions, and a session that starts from a fresh clone
inherits the repository and nothing else — no prior conversation, no plan file,
no task list. Everything a new session needs to avoid redoing settled work, or
repeating a mistake that has already been paid for, has to be written down here.

Last updated 2026-09-11.

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
| WO-15 | Schema the code expects that no deploy creates | **Open** — see §3 | verified 2026-09-11 |
| WO-16 / 16B / 16C | Fabricated content sweep | Largely closed | docs + commits |

---

## 3. WO-15 — the active lane

Nine findings. State as of 2026-09-11:

| Finding | State |
|---|---|
| 1 | **Refused** by adversarial review. Stays refused — do not reopen without new evidence. |
| 2 | Open — `project_charters`, 27 columns versus 48 selected |
| 3 | **Fixed** `0186d8d2d` — charter audit Part 11 append-only triggers |
| 4 | Open — `/api/design-risk`, next in order |
| 5 | Open — `c2c_template_specs.doc_types` reaching no populated database |
| 6 | Fixed (earlier session) |
| 7 | **Fixed** `4c6f38153` — `contradiction_consequence_log` column name + fabricated `detected_by` default |
| 8 | Open — two gates that cannot see what they were written to catch |
| 9 | Fixed (earlier session) |

Findings 3 and 7 in `WO-15-...md` each carry a **CORRECTED** block. The original
finding text is preserved beneath it under "Original finding, as written" — read
the correction first; in both cases the original headline was wrong.

**Suggested order for the remainder: 4 → 5 → 2 → 8.**

Finding 4 first step: `/api/design-risk` mounts 20 endpoints, eight of whose
tables exist on no database, and `migrations/20260609_design_risk.sql` can never
apply. Verify the zero-caller claim with `audit:orphaned-endpoints` **before and
after**, following the `/api/leaves` (`890260a77`) and `/api/cortex` Route B
precedents. Ledger C-29 blocks the *reconciliation* decision — it does not block
unmounting a surface on which every endpoint already fails.

---

## 4. Lessons that cost real time — do not relearn these

**A green migration against a database that happens to be complete is not
evidence that the migration *set* is complete.** Finding 3's first attempt added
`migrations/20260629_charter_tables_rebuild.sql` to `C2C_MIGRATION_FILES` and
passed a live-database proof. It was wrong: the file has five
`REFERENCES project_charters(id)` clauses and nothing in the set creates that
table — Drizzle push does. The live database already had it from install-fresh,
so the proof could not expose the gap.
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
