# D1: the local database the repository provisions can run the migration set

**`Plan: F1`.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-06.

## The defect

`scripts/setup-local-db.sh` runs at every session start (`.claude/settings.json`). It creates the role that applies
the migration set (`c2c`) with `CREATEDB` only. On a fresh cluster with pgvector installed, `deploy-migrate` then
stopped at `db/migrations/20260617_audit_logs_immutability.sql`, 214 of 462, with "permission denied to create
role". The script reported the failure and went on, so every session started on a database missing half the set.

A database the script did not create itself kept its existing owner. The first `GRANT … ON SCHEMA public` in the set
then failed, as found on 2026-11-05.

The production applier, the RDS master, holds both rights: `CREATEROLE`, and ownership of its database. It is not a
superuser, and neither is the local role, so a migration only a superuser could apply still fails here as it would
in production.

## What already exists (RULE 3)

The script already creates the database owned by the role (when it creates it) and creates `vector` as the
superuser. Only the two rights above were missing.

## The change

On every run, the role gets `CREATEROLE NOSUPERUSER` (also at creation) and the database is owned by the role.

## Evidence (two fresh clusters, same machine, pgvector installed)

- `01-red-trunk-script.txt`: trunk's script. `deploy-migrate failed`, halted at 214 of 462.
- `02-green-fixed-script.txt`: the fixed script. "Schema migration complete — safe to roll services", 1,023
  tables, pgvector installed, the demo account ready.

## Still needed on a fresh machine (not repository changes)

The session-start hook runs before anything installs `node_modules` or `postgresql-16-pgvector`, so `install-fresh`
cannot run, and `vector` cannot be created. Those two belong in the cloud environment's setup script, not in this
repository.
