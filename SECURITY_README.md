# TrialSage Security and Reliability Documentation

This document details the security measures, multi-tenant isolation, and reliability features implemented in the TrialSage platform.

## Table of Contents

1. [Environment Configuration](#environment-configuration)
2. [Security Measures](#security-measures)
3. [Multi-Tenant Isolation](#multi-tenant-isolation)
4. [Authentication & Authorization](#authentication--authorization)
5. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Health Checks](#health-checks)
8. [Performance Optimization](#performance-optimization)

## Environment Configuration

The platform supports multiple environments (development, staging, production) with separate configurations for each:

- Database connections
- JWT secrets
- API keys
- Security policies

Configuration is managed in `server/config/environment.ts` and automatically selects the appropriate secrets based on the `NODE_ENV` environment variable.

## Security Measures

### HTTP Security Headers

All responses include security headers set via Helmet:

- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection

### CORS Configuration

Cross-Origin Resource Sharing is configured with:

- Environment-specific origin restrictions (restrictive in production)
- Credential support
- HTTP method restrictions
- Allowed headers

### Rate Limiting

API endpoints are protected by rate limiting:

- Standard routes: 100 requests per 15-minute window
- Authentication routes: 30 requests per 15-minute window
- Rate limits are per IP address and tenant

## Multi-Tenant Isolation

### Database-Level Isolation

Row-Level Security (RLS) is implemented in PostgreSQL:

- Each tenant-scoped table has RLS policies
- Queries automatically filter by organization ID
- Database session variables track current tenant context

### Application-Level Isolation

Multiple layers ensure tenant data cannot be accessed across boundaries:

- Tenant context middleware sets the organization context
- AuthZ middleware verifies user belongs to accessed organization
- API parameters are validated against tenant context

## Authentication & Authorization

### JWT Authentication

- Environment-specific JWT secrets
- Token expiration and rotation
- CSRF protection

### Role-Based Access Control

- Role-based middleware for coarse-grained control
- Permission-based middleware for fine-grained control
- Cross-tenant access restrictions

## Backup and Disaster Recovery

### Automated Backups

- Daily code backups using `scripts/backup.sh`
- Database dumps for data protection
- Backup rotation (keeps 7 most recent backups)

### Disaster Recovery

- Documented restore procedures
- Verification process for backups
- Retention policies

## Monitoring and Logging

### Structured Logging

- JSON-formatted logs with standardized fields
- Context-aware logging with tenant information
- Environment-specific log levels

### Request Tracking

- Unique request IDs
- Cross-component correlation
- Performance tracking for slow requests

### Error Tracking

- Centralized error handling
- Production-safe error responses
- Unique error IDs for support reference

## Health Checks

Endpoints for monitoring application health:

- `/api/health/live` - Liveness check
- `/api/health/ready` - Readiness check with component status
- `/api/health/diagnostics` - Detailed system information (admin only)

## Performance Optimization

- Database connection pooling
- Automatic index creation
- Memory usage monitoring
- Freeze detection and recovery
- WebSocket server monitoring

## Deployment Instructions

To deploy with all security features enabled:

1. Set all required environment variables in Replit Secrets panel:

   - `DATABASE_URL_DEV`, `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`
   - `JWT_SECRET_DEV`, `JWT_SECRET_STAGING`, `JWT_SECRET_PROD`
   - `OPENAI_API_KEY`, `PUBMED_API_KEY`, `S3_VAULT_BUCKET_KEY`

2. Set `NODE_ENV` to the appropriate environment (`development`, `staging`, or `production`)

3. Initialize database with RLS policies:

   ```bash
   node scripts/setup-rls.js
   ```

4. Start the enhanced server implementation:

   ```bash
   node -r ts-node/register server/index-enhanced.ts
   ```

5. Schedule daily backups:
   ```bash
   node scripts/schedule-backup.js &
   ```

## Codebase Structure

Critical security files:

- `/server/config/environment.ts` - Environment-specific configuration
- `/server/middleware/security.js` - Security headers, CORS, rate limiting
- `/server/middleware/tenantContext.js` - Multi-tenant isolation
- `/server/middleware/auth.js` - Authentication and authorization
- `/server/utils/monitoring.js` - Logging and monitoring
- `/server/routes/health-routes.js` - Health check endpoints
- `/scripts/backup.sh` - Backup script
- `/scripts/schedule-backup.js` - Automated backup scheduler
- `/scripts/setup-rls.js` - Row-Level Security setup
