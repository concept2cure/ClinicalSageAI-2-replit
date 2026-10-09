# W2 / D1 — a deploy with nothing to change rebuilds nothing, and a blank database installs again

Row **D1** (hosted production). Session `…013CtPf8pjozina2nVvDYkyB`, 2026-09-25/26.
This follows `../2026-09-25-migration-lock-timeout/`. That change capped how long a
deploy's migration **waits** for a lock. This one removes the locks a no-op deploy
**held** for full-table scans, and fixes two provisioning defects the new gate and the
installer found along the way.

## 1. Fourteen constraints re-validated on every deploy

Every file in `C2C_MIGRATION_FILES` re-runs on every deploy (Rule 1), while the previous
API tasks are still serving. Nine files ended with an unconditional
`DROP CONSTRAINT IF EXISTS … ; ADD CONSTRAINT …`. The resulting schema is the same, so
every existing check called them idempotent. But each `ADD` re-validates every row:

- **A CHECK** holds `ACCESS EXCLUSIVE` for the whole scan, so no reads and no writes.
  Nine of them, including `c2c_documents` (the Vault and Authoring document store),
  `c2c_document_aliases`, `document_span_lineage` and `submission_orchestrator_runs`.
- **A FOREIGN KEY** blocks writes to both the child and the parent for its scan. Five
  of them, all to `organizations`: `client_workspaces`, `connector_credentials`, and
  `supply_chain_{suppliers,materials,batches}`.

On an empty CI database this takes milliseconds. On a client's database it grows with
their data, and it happens on every deploy.

**Fix (Rule 1, amended in place).** Each file now replaces its constraint only when the
live `pg_get_constraintdef` differs from the definition it installs. Each file carries a
dated header note. The files:

- `migrations/20260814d_document_alias_map.sql`
- `migrations/20260810b_eu_mdr_ivdr_outlines.sql`
- `db/migrations/20260906_cmc_interview_sessions.sql`
- `migrations/20260908_span_lineage_machine_draft.sql`
- `db/migrations/20260224_binder_evidence_source_types.sql`
- `db/migrations/20260225_ivdr_pack_warnings_artifact_hashes.sql`
- `migrations/20260629_orchestrator_region_check_alignment.sql`
- `db/migrations/20260725_esig_gate_columns_port.sql`
- `db/migrations/20260730_fk_delete_policies_port.sql`

The definitions themselves are unchanged. If a future PostgreSQL renders a definition
differently, the comparison stops matching and the file falls back to replacing, which
is the old behaviour. The gate below reports that.

**Convergence still holds.** I narrowed `c2c_documents_doc_type_check` to two values and
dropped `ON DELETE CASCADE` from `connector_credentials`' foreign key by hand, then ran
`deploy-migrate`. Both came back to their full definitions.

## 2. The first deploy did not converge

`20260224_binder_evidence_source_types.sql` stood 25 entries before
`20260223_ivdr_binder_packs.sql`, the file that creates its table. On a database the set
was building for the first time, its `to_regclass` guard found no table and skipped. The
columns, the CHECK and three indexes arrived only on the **second** deploy. The file now
sits directly after its creator (`ci:migration-set-order` passes).

## 3. Every install from blank had exited 1 since `ba797ca6d`

`20260926_organizations_own_writes.sql` put RLS on `organizations`. The installer's
closing coverage gate (`scripts/db/rls-coverage-check.sql`) then flagged `public.users`
as an unprotected child of `organizations`, through `users.default_organization_id`.
Every CI job that provisions from blank, and every new environment, stopped there.

`users.default_organization_id` is a preference pointer, not tenancy:

- a user belongs to organizations through `organization_users`, and may belong to
  several;
- the row is read by email before any tenant scope exists, at sign-in.

So the edge is classified, next to the existing `identity.users` exclusion, schema- and
table-exact. **This is not a clearance.** `public.users` itself (password hash, MFA
secret) is readable from any tenant scope. That is recorded for D3 in
`docs/work-orders/README.md`, beside the `organization_users` item.

The check still catches a real case. A scratch `public.zz_probe_child` with a foreign key
to `organizations` and no RLS is flagged, and with the classification removed,
`public.users` is flagged again.

## The gate: `npm run ci:replay-rebuilds-nothing`

`scripts/ci/check-replay-rebuilds-nothing.mjs` records the OID of every constraint and
every index, runs the real `deploy-migrate` once more, and records them again. Anything
rebuilt (a new OID under the same name), dropped or created fails, named. It replaces the
blank-DB job's plain "idempotent" second run in `ci.yml`, and it runs that same replay.
It never skips: no database, or a failed replay, exits 2.

| | trunk `8606dcbbd` (`red-trunk.txt`) | this change (`green.txt`) |
|---|---|---|
| `install-fresh` from blank | **exit 1** (`public.users`) | exit 0 |
| constraints rebuilt by a replay | **13** (14 on a database replayed before) | 0 |
| objects created by a replay | **5** (`ivdr_binder_evidence`) | 0 |
| `rls-coverage-check.sql` | — | 0 rows |
| `deploy-smoke-assert` | — | all invariants hold |

## Checks run

- `tests/schema-contract`: 91 files, 1136 tests.
- The applier's `migration-lock-timeout.dbtest`.
- `ci:migration-drop-safety`, `ci:migration-set-order`.

`tests/schema-contract/esig-gate-columns.contract.test.ts` pinned the port as
"the original, verbatim". It now pins "the original, verbatim, except the one wrapped
pair, and that pair is the original's two statements character for character". Changing
one value in the port's `ADD` makes it fail.

Two real-database files, `entitlement-schema-posture` and `organizations-writes`, fail
identically on clean trunk in this environment: they need a minted `app_service` role
and an `APP_DATABASE_URL`. Not affected by this change.
