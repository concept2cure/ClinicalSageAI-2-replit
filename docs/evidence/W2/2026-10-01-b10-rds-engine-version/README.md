# W2 / D1 — B10: RDS cannot create a retired minor version

Row **D1** (hosted production). Session `…013CtPf8pjozina2nVvDYkyB`, 2026-10-01. This
closes **B10** in `../2026-09-23/README.md`, which was recorded as "unverified until a
plan against a real account".

## The defect

Production and staging pinned `rds_engine_version = "15.4"`, and so did the RDS module's
default. AWS retires RDS minor versions on a schedule, and a retired minor cannot be used
to create an instance. RDS for PostgreSQL 15.4 is deprecated: its standard support ended
around May 2025. Major version 15 is supported until 29 February 2028. Sources:

- [Release calendars for Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html)
- [AWS re:Post, end of standard support for 15.4](https://repost.aws/questions/QU586x8RblToKSH-CBeF8B2g/aurora-end-of-standard-support-date-for-postgresql-15-4)

The AWS documentation pages could not be fetched from this environment (egress policy).
The dates above come from a web search of those sources. No AWS account was available to
show the refusal from a real `plan` or `apply`.

So the first `terraform apply` would have failed creating the database. So would every
later rebuild from nothing, including a disaster-recovery rebuild in a new region. Any
minor-version pin repeats this about a year after it is set.

## The fix

- **Major version only.** `rds_engine_version = "15"`, and the module default is `"15"`.
  RDS creates the instance on its current 15.x, and `auto_minor_version_upgrade = true`
  applies minor (security) patches in the existing `Mon:04:00-05:00` maintenance window.
  An unpatched database would itself be an audit finding.
- **No automatic major upgrade.** `allow_major_version_upgrade = false`. A major upgrade
  changes the validated system, so it is planned, tested and applied deliberately. Major
  15 matches CI's PostgreSQL 15 service image.
- **A minor pin is refused.** A validation on both the stack variable and the module
  variable refuses anything but a major number, so a retired pin cannot come back.
- **The running version is recorded.** A new module output, `engine_version_actual`,
  gives the version RDS is actually running, for the IQ record of each environment.

All five extensions the schema creates are available on RDS for PostgreSQL 15: `vector`,
`uuid-ossp`, `pg_trgm`, `pgcrypto` and `unaccent`. The local list comes from a database
built by `install-fresh` and `deploy-migrate` at HEAD, plus a search of every migration
for `CREATE EXTENSION`.

## Proof

| | before (`terraform-test-red.txt`) | after (`terraform-test-green.txt`) |
|---|---|---|
| `refuses_a_pinned_rds_minor_version` (`"15.4"`) | **fail**: "var.rds_engine_version was expected to report an error but did not" | pass |
| `terraform/stack` suite | 28 passed, 1 failed | 29 passed |

- `terraform validate` passes for `environments/production` and `environments/staging`.
- `node scripts/ops/terraform-preflight-proof.mjs`: every check holds.

## Still owed (needs the account)

The first `plan` against the real account should show the instance creating on a 15.x
minor. After the apply, record `engine_version_actual` in the IQ.
