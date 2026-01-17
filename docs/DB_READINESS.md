# Database Production Readiness Checklist

Use this checklist before cutover to ensure Neon is operationally ready for enterprise workloads.

## Backups & recovery

- [ ] Enable automated backups/snapshots in Neon.
- [ ] Define retention policy (daily/weekly/monthly).
- [ ] Perform a restore test and document the steps.

## Migrations & schema safety

- [ ] Run schema migration in a staging environment first.
- [ ] Use `drizzle-kit push` or `runMigrations()` during CI/CD deploys.
- [ ] Capture migration logs/artifacts for auditability.

## Connection & pooling

- [ ] Validate pool sizing against Neon connection limits.
- [ ] Ensure SSL is enforced for Postgres/Neon URLs.
- [ ] Configure statement/query timeouts and monitor slow queries.

## Monitoring & alerting

- [ ] Add alerts for connection saturation, error spikes, and slow queries.
- [ ] Ship database logs to your observability platform.
- [ ] Set up uptime checks for DB connectivity.

## Security & access

- [ ] Rotate database credentials on a schedule.
- [ ] Store secrets in a vault, not in code or logs.
- [ ] Restrict access by network allowlists/VPC where possible.
