# Unified Auth Module

## Overview

This module consolidates authentication and authorization functionality from multiple legacy implementations.

## Migration Status

| Source File | Status | Notes |
|-------------|--------|-------|
| `middleware/auth.js` | ✅ Primary | JWT verification, production |
| `auth.ts` | ✅ Secondary | Dev mode, tenant context |
| `auth.js` | 🔴 Archived | Duplicate |
| `services/roleBasedAccess.js` | ✅ Integrated | RBAC service |
| `middleware/authAdapter.ts` | 🔴 Remove after | Bridge code |

## Usage

### Simple Authentication
```typescript
import { authenticateJWT } from '@server/auth';
app.use('/api', authenticateJWT);
```

### Role-Based Access
```typescript
import { authenticateJWT, requireRole } from '@server/auth';
app.get('/admin', authenticateJWT, requireRole('admin'), handler);
```

### Permission-Based Access
```typescript
import { authenticateJWT, hasPermission } from '@server/auth';
app.get('/reports', authenticateJWT, hasPermission('reports:read'), handler);
```

## Security Architecture

```
Request
   │
   ▼
┌──────────────────┐
│  JWT Validation  │  ← Extract token from Authorization header
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Token Verify    │  ← Verify signature, check expiry
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Tenant Isolation│  ← Set organizationId from JWT (NEVER from header)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Audit Log       │  ← Log access for 21 CFR Part 11
└────────┬─────────┘
         │
         ▼
    Route Handler
```

## Tenant Isolation

**CRITICAL**: Organization ID always comes from JWT payload, never from headers.

```typescript
// ❌ WRONG - Never do this
const orgId = req.headers['x-organization-id'];

// ✅ CORRECT - Always from JWT
const orgId = req.user.organizationId;
// or
const orgId = req.organizationId; // Set by middleware
```

## Roles

| Role | Access Level |
|------|-------------|
| admin | Full system access |
| manager | Team and project management |
| member | Standard user access |
| viewer | Read-only access |

## Delete After Migration

These files can be removed once all consumers are updated:
- `server/auth.js`
- `server/middleware/authAdapter.ts`
