# Database disaster recovery proof and runbook

## Scope and verified inventory

This runbook covers the executable **synthetic, ephemeral PostgreSQL** restore proof in
`scripts/ops/dr-restore-drill.sh`. It does not authorize access to production, customer data,
a secret manager, or cloud storage.

| Area | Repository implementation | What is and is not proven |
| --- | --- | --- |
| Database backup | This drill uses PostgreSQL `pg_dump --format=custom` and `pg_restore` | This is a real logical database backup. Git archives, generated audit evidence packs, `storage/ir-packs/*.zip`, and application export ZIPs are source/application artifacts, **not database backups**. |
| Migrations/schema | `migrations/`, Drizzle journal, and `scripts/db/*migrate*` | The drill records a fixture migration level and a normalized schema fingerprint after restore. It does not claim every production migration is restorable. |
| Audit integrity | `scripts/run-chain-verify.mjs`, `scripts/run-audit-archive.mjs`, and audit migrations | The drill independently restores and validates synthetic event hashes and predecessor links. |
| Object storage | Server storage providers and tenant storage reporting; repository ZIP fixtures | The proof restores a binary payload plus provider/key reference through a deliberately local test adapter. It does not back up S3 or any cloud bucket. Database and object-store recovery must be coordinated in production. |
| Encryption | Deployment/cloud configuration contains encryption controls; no backup key is used by this local proof | The transient dump is mode `0600`, checksummed, never uploaded, and deleted. A production backup must use provider-side encryption at rest and TLS in transit, with a separately governed key. |
| Operations/CI | `.github/workflows/database-dr-restore-proof.yml` | Weekly/manual CI proves backup, target replacement, restore, integrity, an application DB boot/read probe under the RLS role, and evidence generation against PostgreSQL 16. |

## Run the non-production drill

Prerequisites are PostgreSQL client tools compatible with the server and two disposable database
names beginning `c2c_dr_`. Supply URLs through environment variables; never place credentials in a
script, command committed to Git, or retained evidence.

```bash
export DR_SOURCE_DATABASE_URL='postgresql://<user>:<password>@localhost:5432/c2c_dr_source'
export DR_TARGET_DATABASE_URL='postgresql://<user>:<password>@localhost:5432/c2c_dr_restored'
export DR_TARGET_ADMIN_URL='postgresql://<user>:<password>@localhost:5432/postgres'
export DR_APP_DATABASE_URL='postgresql://c2c_dr_app@localhost:5432/c2c_dr_restored'
npm run db:dr:restore-proof
```

The isolated PostgreSQL instance must permit the generated, passwordless `c2c_dr_app` role to connect
(CI uses PostgreSQL `trust` authentication). Do not reuse this authentication configuration outside a
disposable local/CI cluster. The direct application-role URL proves both `session_user` and `current_user`
are non-superuser rather than relying on a superuser session that merely issues `SET ROLE`.

The source must be an empty disposable database because the drill seeds its own schema. The target
is dropped with `dropdb --force` and recreated; no cluster-wide or filesystem deletion is used. Both
names and hosts are validated before any PostgreSQL command runs. Production/cloud-looking endpoints
are always refused. A non-local lab endpoint additionally requires the exact destructive acknowledgement
and a ticket in `DR_OVERRIDE_TICKET`; the emitted audit line must be retained with the approved change.
The evidence also records the lab environment classification, ticket, and override timestamp without
recording a database URL or credential. This override is not permission to use production.

The custom-format dump stays in a private temporary directory, receives a SHA-256 checksum, and is
deleted by an exit trap. CI uploads only `dr-evidence.json` for seven days. Treat even synthetic dumps
and evidence as sensitive; never upload the dump as a CI artifact.

## Verification and evidence interpretation

The drill records client/server versions, UTC backup timestamps, a pre-restore-verified dump checksum,
matching source/restored row-count manifests and normalized schema fingerprints, target database replacement,
and observed timings. It verifies tenant/user foreign keys, row counts, regulated text and
binary hashes, the audit chain, fixture migration level, RLS isolation, and the minimal authenticated
application DB boot/read probe (one tenant can read one user and one regulated record under `c2c_dr_app`). Failure is
fail-closed (`ON_ERROR_STOP`, `set -Eeuo pipefail`, and `pg_restore --exit-on-error`).

`observed_rpo_ms` is the measured interval from the last synthetic write marker to dump completion.
`observed_restore_and_verify_rto_ms` is target destruction, replacement, restore, and verification time. These are **single CI
observations, not production RPO/RTO commitments or an SLA**. Production targets must account for data
volume, WAL/object-store coordination, network, key recovery, validation, and incident decision time.

## Human-owned operating controls

The following fields must be completed and approved by people before a production DR program exists:

| Control | Human-owned value |
| --- | --- |
| Service owner | **TBD — VP Engineering to assign** |
| Drill operator/on-call | **TBD — SRE manager to assign** |
| Security/key-access approvers | **TBD — Security Officer to assign named roles** |
| Production RPO target | **TBD — business/system owner approval required** |
| Production RTO target | **TBD — business/system owner approval required** |
| Backup schedule and PITR/WAL policy | **TBD — SRE and database owner** |
| Backup retention/legal hold policy | **TBD — Privacy, Legal, and Records Management** |
| Encryption/KMS key, rotation, and break-glass access | **TBD — Security and SRE; dual control recommended** |
| Evidence retention location and period | **TBD — Quality/Compliance; CI proof currently 7 days** |
| Failure escalation contacts and paging path | **TBD — Incident Commander and Compliance escalation** |

### Scheduled review procedure

1. The assigned owner reviews every scheduled run and compares observed trends without promoting them
   to an SLA. Record the run URL, commit, evidence checksum, outcome, and ticket.
2. On failure, preserve logs/evidence without the dump, page the assigned database owner, open an incident
   ticket, and notify Security/Quality if integrity, tenant isolation, audit chain, or keys are implicated.
3. Do not retry destructively against another environment. Diagnose in a fresh ephemeral database and
   document root cause, corrective action, and a successful rerun.
4. Quarterly (proposed; human approval pending), review tool/server compatibility, retention, encryption,
   key recovery, owners, and whether a production-scale controlled exercise is authorized.
5. Annually (proposed; human approval pending), obtain Quality/Security sign-off on the runbook and evidence
   retention controls. Production exercises require a separate approved change plan and rollback authority.
