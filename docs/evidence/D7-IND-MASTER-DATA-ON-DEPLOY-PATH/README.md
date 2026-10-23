# D7 — the IND Form 1571/1572 master-data registries reach a deployed database

**Row moved.** D7 (one real sequence) — prerequisite under P0 **CAT2-02** (MR-10),
remaining item (1): the FDA `us-regional.xml` applicant `<id>` is always the
placeholder `UNASSIGNED-ORG-<orgId>` on the canonical sequence path. This change
does not close CAT2-02; it removes the blocker underneath it. See **What this does
not do** below.

## The finding

`migrations/20260609_ind_master_data.sql` creates three tables —
`ind_sponsors`, `ind_regulatory_agents`, `ind_investigators`, the reusable
Form 1571/1572 master data an IND assembly draws from — and **nothing a deploy
runs creates them**. The file is in none of `C2C_MIGRATION_FILES`,
`AUTHORING_SUBSYSTEM_FILES` or the drizzle journal, and `drizzle-kit push` does
not push `shared/schema/ind-master-data.ts`.

They are not unreached code. `/api/ind-master-data` is **mounted in production**
(`server/bootstrap/register-ind-lifecycle-routes.ts:24`), and
`server/services/ind-master-data/ind-master-data-service.ts` both inserts into
and selects from all three; the IND documents, filing and forms routes and the
IND OpenAPI spec use the same service. On any database this set provisioned,
every one of those answers `relation "ind_sponsors" does not exist`.

`install-fresh` overlays every top-level `migrations/*.sql`, so a *fresh* install
has the tables — which is why nothing has failed yet, and why it would begin
failing the first time the schema has to reach a database that already exists.

This is the **third instance of the same gap in the same subsystem**. It is the
incident `scripts/ci/check-migration-deploy-path.mjs` was written for
(2026-10-01: `ind_amendments`, `ind_annual_reports` and three others), and that
gate's baseline — 106 files, "must only shrink" — still carried this one. The
file's own header asked for two things from "a human — NOT done here": the schema
export, and the migration. The export half was done; the deploy half was not.

## Why it blocks CAT2-02

FDA's `us-regional.xml` names the applicant's `<id>` (a D-U-N-S number) and an
`<applicant-contacts>` block. The sequence path has no recorded home for either,
so it writes the placeholder — `package-identity.ts`'s header records exactly
that gap. `ind_sponsors.duns` and its `contact_name` / `contact_phone` /
`contact_email` are that home, and a column cannot be read on a database where
its table was never created.

## Evidence

| File | Shows |
|---|---|
| `red/before.txt` | the gate lists the file as off-deploy-path; 0 entries on the set; baselined (106); the only file creating these tables; the route mounted in production |
| `green/after.txt` | on the set (411 entries, sweep still last); baseline 105 and the file gone from it; five migration gates pass; the gate's self-test still fails on an unlisted file |
| `green/rule1-replay-proof.txt` | applied **twice** to an empty PostgreSQL 16.13 database, clean both passes; 3 of 3 tables with `organization_id NOT NULL` |
| `green/tenant-sweep-proof.txt` | the sweep run against that database: `applied to 3 newly-provisioned table(s) … 0 skipped`, and each table then has `rls=true` with 1 policy |

## RULE 1 compliance

The set re-executes every entry on every deploy, so an entry must be replayable
and must sit above the final tenant-sweep pair.

- `CREATE TABLE/INDEX IF NOT EXISTS` only. No `DROP`, no `ALTER` — so it is a
  no-op where the tables already exist. Proven by applying it twice.
- `public`, each table keyed by `organization_id INTEGER NOT NULL` and indexed on
  it, so the sweep policies it rather than skipping it for a non-integer tenant
  key. Proven against a real database, not inferred from the sweep's criteria.
- Listed above `TENANT_ISOLATION_SWEEP`; `ci:migration-set-order` confirms the
  sweep is still last.
- No baseline was widened. The one baseline that moved is the deploy-path
  ratchet, which shrank by exactly one, in the direction its note permits.

## What this does not do

CAT2-02 item (1) is **not closed**, and this evidence does not claim it is. Two
things remain, and one of them is not engineering:

1. No route records a D-U-N-S number or a regulatory contact against a
   submission's sponsor on the sequence path, and nothing refuses the
   placeholder. That is the rest of item (1).
2. The pilot customer's actual D-U-N-S number and regulatory contact are a
   founder item (the finding's own `dependencies` says so).

Item (6) of CAT2-02 — `us-regional.xml` has never been DTD-validated — stays
blocked on CAT2-01, the licensed agency DTDs, which is procurement.
