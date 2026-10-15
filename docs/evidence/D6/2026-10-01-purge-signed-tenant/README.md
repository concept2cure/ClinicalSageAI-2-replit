# A real client can be offboarded: the tenant purge on its real table list

Launch rows **D6** (security posture: offboarding) and **D5**, 2026-10-01.

## What was wrong

`purgeTenant` (`server/services/tenant/tenant-offboarding.ts`) runs over
`PURGE_CHILD_TABLES`. Every suite that called it passed a narrowed list: probe
tables, or one or two real ones. The real list had never run against a client
that had done real work. Run against one here, it failed twice. Either failure
alone was enough to stop the client being offboarded.

1. **Workspaces before projects.** The list deleted `client_workspaces` before
   `projects`, and a project references its workspace with no cascade. So the
   purge failed with 23503 for every client that had a project, which is every
   client. Seen: `update or delete on table "client_workspaces" violates
   foreign key constraint "projects_client_workspace_id_client_workspaces_id_fk"`.
2. **Signed artifacts.** `20260929_concept2cure_signatures_append_only.sql`
   made an artifact's signatures and lock snapshots append-only. It also
   refused the cascade from deleting the artifact, so a signed artifact cannot
   be deleted along with its signatures. Deleting `projects` cascades to the
   artifacts, so with (1) fixed, the purge of any client that had approved or
   locked an artifact failed with `IMMUTABILITY_VIOLATION`.

## Decision

This is the turn-record decision, applied to signatures
(`docs/evidence/D5-ANA-RECORD/2026-10-01-erasure-and-grants/`). MSA §10.2 and
DPA §3.5 delete Customer Data after the export window and retain audit-trail
records.

- **What stays.** Each signing writes a chained ledger row in its own
  transaction (`recordGovernedAction` in
  `server/services/artifact-signed-act.ts`). That row is the audit-trail
  record: who signed what, with what meaning, over which content hash, and
  when. The purge keeps it.
- **What goes.** The signature and snapshot rows are the client's records. The
  tenant export returns them, then the purge erases them.

## What changed

- **The migration.** `migrations/20260929_concept2cure_signatures_append_only.sql`
  is amended in place with a dated note (CLAUDE.md Rule 1).
  - A NOLOGIN, NOINHERIT, NOBYPASSRLS role, `artifact_record_purger`.
  - The row trigger admits a DELETE only when `current_user` is that role.
  - `public.purge_tenant_artifact_records(integer)`: SECURITY DEFINER, owned
    by that role, `search_path` pinned, EXECUTE revoked from PUBLIC. It refuses
    outside the platform scope, for an organization not pending deletion, and
    under an active legal hold.
  - Everything else still refuses: UPDATE for everyone, a direct DELETE, the
    cascade from deleting an artifact or project (so a signed artifact still
    cannot be deleted with its signatures), and TRUNCATE.
  - The function is on `scripts/db/security-definer-allowlist.json`
    (`reviewed-risk`, with its reason).
- **The purge.**
  - The two tables join `PURGE_CHILD_TABLES` before `projects`.
  - `projects` moves ahead of `client_workspaces`.
  - The AnA turn-record door from earlier today and this one now share one
    table, `PURGE_DOORS`, and one function, `eraseThroughDoor`, so there are
    not two copies of the door logic.
  - The purge result and `POST /api/tenants/:id/purge` report
    `artifactRecordErasure: {signatures, snapshots}`.

## Shown

`tests/db/tenant-purge-artifact-records.dbtest.ts` runs on PostgreSQL 16.13,
on a database built by install-fresh + deploy-migrate. The purge runs its
**real** list against a client with:

- a membership;
- a regulatory program with its anchor project, and a workspace;
- a locked artifact with its signed version, its signature, its lock snapshot
  and the signing's ledger row;
- a review thread with a comment;
- an AnA turn record.

| Case | Before (`red/dbtest-before.txt`) | After (`green/dbtest.txt`) |
|---|---|---|
| The client is purged. Signatures, snapshots, artifacts, comments, turn records, projects, workspaces and programs are gone; the ledger rows are all still there | **fails** (`client_workspaces` 23503) | passes |
| A direct DELETE of a signature, and deleting its project, are refused for the owner | passes (control) | passes |
| The door refuses an organization not pending deletion and erases nothing | fails (no door) | passes |

**Mutations** (`mutations.txt`): each one was applied, run, seen red, and
restored.

| # | Mutation | Red |
|---|---|---|
| R0 | HEAD's purge | the purge (23503) |
| R1 | The old order only | the purge (23503) |
| R2 | The two tables left out of the list | the purge (`IMMUTABILITY_VIOLATION`) |
| am1 | The trigger also admits the table owner | the owner's DELETE succeeds |
| am2 | The door does not check `pending_deletion` | an active client's signatures erased |

**Also run:**
- the signatures' own PGlite test, the trigger registry, the tenant and
  `server/db` suites: 25 files, 310 tests, all pass;
- `ci:purge-coverage`: no new residue.

- the whole real-database tier, on a database rebuilt from empty with the
  amended migration: 102 files, 999 tests, all pass
  (`green/db-tier-fresh-database.txt`);
- `tsc`: 0 errors. The ESLint ratchet shows no file gaining a warning.

## Not done

- **The purge still leaves 606 tenant-keyed tables behind**
  (`docs/reports/purge-coverage-baseline.json`). This change makes the purge
  complete without failing on a realistic client. It does not widen what the
  purge reaches. That is the coverage lane's ratchet.
- **Other references to artifacts without a cascade** (provenance
  `source_artifact_id`, submission-twin tables, governance boundary
  transitions) would also stop a purge where they hold rows. None is written
  on a launch path the seed exercises; they are listed for the coverage lane.
