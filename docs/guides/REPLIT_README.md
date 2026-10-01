# TrialSage Replit Environment

This document outlines the setup, maintenance, and disaster recovery procedures for the TrialSage platform hosted on Replit.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Security Features](#security-features)
3. [Backup Procedures](#backup-procedures)
4. [Disaster Recovery](#disaster-recovery)
5. [Monitoring](#monitoring)
6. [Deployment](#deployment)

## Environment Setup

### Initial Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/YourOrg/TrialSage.git
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables in Replit Secrets panel:

   - `DATABASE_URL_DEV`, `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`
   - `JWT_SECRET_DEV`, `JWT_SECRET_STAGING`, `JWT_SECRET_PROD`
   - `OPENAI_API_KEY`, `PUBMED_API_KEY`, `S3_VAULT_BUCKET_KEY`

4. Set up database with Row-Level Security:

   ```bash
   node scripts/setup-rls.js
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Security Features

The platform implements several security measures:

- **Multi-environment configuration** - Separate database URLs and JWT secrets for dev/staging/prod
- **Row-Level Security** - Database-level tenant isolation
- **Security headers** - Helmet implementation for HTTP security
- **CORS protection** - Restrictive CORS in production
- **Rate limiting** - Protection against abuse
- **RBAC** - Role-Based Access Control for authorization

See [SECURITY_README.md](./SECURITY_README.md) for detailed information.

## Backup Procedures

### Automated Backups

The system performs daily backups at 1:00 AM:

1. Code backup to `.backups/{date}_code_backup.tar.gz`
2. Database backup to `.backups/{date}_database_backup.sql.gz`

Backups are retained for 7 days (rolling deletion).

### Manual Backups

To trigger a manual backup:

```bash
bash scripts/backup.sh
```

### Backup Scheduler

The backup scheduler runs as a background process:

```bash
node scripts/schedule-backup.js &
```

## Disaster Recovery

### Restore from Backup

In case of environment corruption or data loss, follow these steps to restore:

1. Create a new Replit project

2. Clone the repository:

   ```bash
   git clone https://github.com/YourOrg/TrialSage.git .
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy the most recent backup from `.backups/`:

   ```bash
   # If you have a code backup
   tar -xzf /path/to/YYYY-MM-DD_code_backup.tar.gz

   # If you have a database backup
   gunzip -c /path/to/YYYY-MM-DD_database_backup.sql.gz | psql "$DATABASE_URL"
   ```

5. Configure environment variables in Replit Secrets panel (same as Environment Setup step 3)

6. Verify the restore:

   ```bash
   # Run integration tests
   node scripts/security-test.js

   # Start the server
   npm run dev
   ```

7. Verify application functionality manually through the UI.

### Emergency Recovery

If GitHub repository is unavailable:

1. Create a new Replit project

2. Upload the most recent code backup:

   ```bash
   tar -xzf /path/to/YYYY-MM-DD_code_backup.tar.gz
   ```

3. Follow steps 3-7 above

## Monitoring

### Health Checks

The application provides health check endpoints:

- `/api/health/live` - Basic liveness check
- `/api/health/ready` - Readiness check with component status

### Logs

Application logs are structured in JSON format and include:

- Request tracking
- Error reporting
- Performance metrics
- Tenant isolation information

## Deployment

### CI/CD Pipeline

CI runs in GitHub Actions (`.github/workflows/`). The production deploy is
`.github/workflows/deploy-aws.yml`, onto the AWS stack in `terraform/` (see
`terraform/README.md`). Its preflight refuses a task definition that lacks any
part of the production boot contract, and `scripts/ops/terraform-preflight-proof.mjs`
proves that preflight against what Terraform renders, in `terraform-tests.yml`.
A single-server install uses `docker-compose.yml`, held to the same contract by
`npm run ci:compose-boot-contract`.

_Retired 2026-10-01:_ `.replit-ci.yml` (a GitLab CI file nothing ran) and
`scripts/deploy-{dev,staging,prod}.sh`, which pushed a `main` branch to Replit
remotes that do not exist and migrated with `db:push` instead of the migration
set. `concept2cure-v2` is the only branch (`CLAUDE.md`, Rule 0).

### Branch Protection

`concept2cure-v2` is the only branch (`CLAUDE.md`, Rule 0), and it is the one
to protect. There are no `main`, `staging` or `release/*` branches.

Require:

- Passing CI checks
- 2 code review approvals
- No bypass options
