# `ci:compose-boot-contract`: a name only the deploy reads is not required of a Compose stack

Date: 2026-10-01. Lane: D6 (security tranche 4), porting a fix for a gate that was red on trunk.

## What was wrong

The P1-11 / INF-13 work (W2 lane) added `DB_AUDIT_REQUIRED` to the deploy preflight's boot-contract list in
`.github/workflows/deploy-aws.yml`, with its value pinned to `pgaudit`. `ci:compose-boot-contract` derives its
required names from that same list, so from that push on it failed for both Compose stacks
(`docker-compose.yml`, `docker-compose.beta.yml`): "DB_AUDIT_REQUIRED is not passed to the app". CI runs the gate
(`ci.yml`, compose boot contract step), so trunk CI was red on it.

Requiring it of Compose would be wrong, not merely inconvenient:

- the server never reads `DB_AUDIT_REQUIRED`. Only `scripts/db/deploy-migrate.mjs` does
  (`databaseAuditRequired`, `scripts/db/database-audit.mjs`), to refuse to roll services onto a database whose
  pgaudit is not recording;
- the Compose stacks run no deploy-migrate, and their Postgres (`pgvector/pgvector:pg15`) cannot preload pgaudit;
- `pgaudit` is the only non-empty value the variable accepts, so `${DB_AUDIT_REQUIRED:?…}` would demand a
  configuration these stacks cannot satisfy.

## What changed

- `scripts/ci/check-compose-boot-contract.mjs`: a `DEPLOY_ONLY` list (`DB_AUDIT_REQUIRED`), removed from the names a
  Compose stack must carry, with the reason in the header's "Excused for Compose". Two self-test cases: the name
  empty, and absent, both pass.
- `docker-compose.yml`, `docker-compose.beta.yml`: pass `DB_AUDIT_REQUIRED: ${DB_AUDIT_REQUIRED:-}` with a comment
  saying what it does, why these stacks default it empty, and that the application's chained trail is then the
  only record of a statement.

## Red, then green

| Run | Red (gate as it was, cases added) | Green |
|---|---|---|
| `node scripts/ci/check-compose-boot-contract.mjs --self-test` | `red/selftest.txt`: exit 1, both new cases FAIL ("may be empty", "is not passed") | `green/selftest.txt`: exit 0, every case behaves |
| `node scripts/ci/check-compose-boot-contract.mjs` | `red/gate.txt`: exit 1, 2 problems | `green/gate.txt`: exit 0, 2 stacks, 28 preflight names + ALLOWED_ORIGINS |

## What remains

- A self-host that points `DATABASE_URL` at a database that preloads pgaudit should set `DB_AUDIT_REQUIRED=pgaudit`;
  nothing requires it to. The deploy (Terraform, `terraform/stack`) still requires it, unchanged.
