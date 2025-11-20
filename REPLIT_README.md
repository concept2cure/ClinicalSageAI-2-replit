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

Continuous Integration is configured with `.replit-ci.yml`:

1. **Lint**: ESLint and Prettier checks
2. **Type Check**: TypeScript validation
3. **Test**: Unit and integration tests
4. **Security**: Dependency and vulnerability checks
5. **Build**: Application packaging
6. **Deploy**: Environment-specific deployment

### Deployment Environment

Deployment scripts:

- **Development**: `scripts/deploy-dev.sh`
- **Staging**: `scripts/deploy-staging.sh`
- **Production**: `scripts/deploy-prod.sh`

_Note:_ Production deployments must run from the `main` branch and pass all tests and security checks.

### Branch Protection

GitHub repository should have branch protection on:

- `main` - Production code
- `staging` - Staging code
- `release/*` - Release branches

Require:

- Passing CI checks
- 2 code review approvals
- No bypass options
