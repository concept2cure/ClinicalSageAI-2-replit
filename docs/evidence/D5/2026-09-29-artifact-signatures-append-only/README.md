# An artifact's signatures and lock snapshots are append-only in the database

**Row:** D5 (Part 11 §11.10(e), §11.70: a signature cannot be altered or
excised). **Session:** `…01P6GWSv`. **Date:** 2026-09-29. **Source:** the
adversarial review of `docs/evidence/D5/2026-09-28-artifact-approval-signature/`,
which recorded it as this lane's next item.

## What was wrong

`concept2cure_signatures` holds the approval and release signatures of
concept2cure artifacts. These are the rows the readiness engine, the Artifacts
Center and the DOCX signature block read, and since 2026-09-28 the rows the
status route's signed approve and lock write. `concept2cure_submission_snapshots`
holds each lock's record. Neither was protected on any applier:

- **The only trigger on the signatures** is in
  `db/migrations/_legacy/20260128_concept2cure_signatures.sql`, and no applier
  runs `_legacy/`.
- **The only protection of the snapshots** is in
  `db/migrations/20260318_ga_immutability_hardening.sql`, which is not in
  `C2C_MIGRATION_FILES`.

So on a deployed database, any role could:
- UPDATE a signature's printed name, meaning or hash;
- DELETE a signature, directly or through the `ON DELETE CASCADE` from its
  artifact or its version, while the artifact stayed approved;
- TRUNCATE either table.

Nothing at boot or in the integrity sweep asked.

## The change

- **`migrations/20260929_concept2cure_signatures_append_only.sql`**, in the
  applier set before the final pair, refuses UPDATE, DELETE and TRUNCATE on
  both tables for every role.
  - A cascade from deleting an artifact or a version is refused with it. A
    signed artifact cannot be deleted together with its signatures.
  - It replays safely:
    - `CREATE OR REPLACE FUNCTION`, with new function names so it never
      replaces the legacy one;
    - `CREATE TRIGGER` only when the trigger is absent;
    - tables guarded with `to_regclass`.
- **Census first.** No server code or script updates or deletes either table
  (grep of `server/` and `scripts/` for `UPDATE`, `DELETE FROM`, `.update()`,
  `.delete()` on them, 2026-09-29). The tenant purge (`PURGE_CHILD_TABLES`)
  touches neither, and nothing deletes an artifact or a version. So no writer
  is broken. A future revocation of an artifact signature would need a
  supersession rule like `electronic_signatures` has, written into this file
  in place.
- **Required at boot.** The four triggers are added to
  `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`
  (`server/services/audit/audit-immutability-triggers.ts`).
  - A database without them is reported by the security health check and the
    integrity sweep.
  - In production with `AUDIT_REQUIRE_ENFORCE=true`, it refuses to boot.
  - The registry's PGlite test builds the two tables, so its drift guard and
    catalog probe cover them.
- **The record-class policy** (`docs/compliance/part11-immutability-record-class-policy.md`)
  lists both record families and their enforcement.

## Proof

`server/services/audit/__tests__/concept2cure-signatures-append-only.pglite.test.ts`:
the four tables exactly as the baseline builds them, with the baseline's two
cascading foreign keys into the signatures, and the migration file itself.

| Case | HEAD (no protection on any applier) | Change |
|---|---|---|
| A new signature can be recorded | yes | yes |
| Rewrite a signature's printed name, or its meaning | allowed | refused, the row unchanged |
| Delete a signature; truncate the table | allowed | refused |
| Delete the signed artifact, or the signed version (the cascade) | the signature is deleted with it | refused, the signature stands |
| Rewrite, delete or truncate a lock snapshot | allowed | refused |
| Run the migration again (every deploy does) | — | succeeds; still exactly four triggers |

The evidence files:
- `red.txt`: the suite with the migration emptied, which is HEAD's state.
  10/11 fail; the one that passes is the INSERT, correctly.
- `green.txt`:
  - the suite, 11/11;
  - the registry's two suites, 28/28;
  - **real PostgreSQL 16**, on a database built by `install-fresh`: the
    migration applied twice, exactly four triggers, and TRUNCATE refused with
    `IMMUTABILITY_VIOLATION`;
  - the migration gates: set order, drop safety and its selftest, column
    reachability, manifest, runtime DDL, unrun tests;
  - `tests/schema-contract`, 1145 passed. The one failing file,
    `tenant-isolation-sweep`, stops before this file, on
    `migrations/20260928_invitations_for_member.sql` (the D3 session's, handed
    on).
