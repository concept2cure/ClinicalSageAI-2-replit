# Build Order #10 — Founder Critical Path Hardening

> Date: 2026-04-04
> Purpose: Architecture reference for critical-path hardening decisions

---

## Overview

Build Order #10 audited seven areas of the application where user-facing behavior
must be genuine — no placeholders, no no-ops, no fake production paths. Each area
was reviewed, and where gaps existed, fixes were applied.

---

## Critical Path Status

| Path | Before | After | Production Status |
|------|--------|-------|-------------------|
| Project CRUD | API-first, localStorage fallback unflagged | Fallback feature-flagged | Production-ready |
| Sign-out (ZenSettings) | No-op button | Calls authService.logout() + redirect | Production-ready |
| Sign-out (IndustryAwareApp) | No-op button | Calls authService.logout() + redirect | Production-ready |
| Google OAuth | Visible, returns 501 | Hidden in production builds | Dev-only |
| Microsoft OAuth | Visible, returns 501 | Hidden in production builds | Dev-only |
| SAML SSO | Implemented | No change needed | Production-ready |
| Onboarding tours | localStorage flags | No change (ephemeral by design) | Acceptable |
| User preferences | JSON column in users table | No change needed | Production-ready |
| Workspace settings | clientWorkspaceSettings table | No change needed | Production-ready |
| Document identity | Two tables, no canonical designation | Bridge service, canonical defined | Production-ready |
| TipTap packages | Installed but unguarded | CI guard added | Production-ready |
| Token blacklist | In-memory Set | No change (known limitation) | Single-instance only |

---

## SSO Provider Status

| Provider | Protocol | Backend | UI Visibility | Notes |
|----------|----------|---------|---------------|-------|
| Google | OAuth 2.0 | 501 Not Implemented | Dev builds only | Wrapped in `import.meta.env.DEV` |
| Microsoft | OAuth 2.0 | 501 Not Implemented | Dev builds only | Wrapped in `import.meta.env.DEV` |
| SAML | SAML 2.0 | Implemented | All builds | Enterprise SSO, fully functional |

SAML SSO is the only third-party authentication method available in production.
Google and Microsoft OAuth are development placeholders for future implementation.
They are excluded from production bundles by Vite's dead-code elimination when
`import.meta.env.DEV` evaluates to `false`.

---

## Document Identity — Canonical Designation

**`concept2cureArtifacts`** is the canonical table for regulatory document content.

- `artifactId` is the primary document identity in authoring and submission workflows.
- The `documents` table serves compliance-scoped tracking (uploads, classification).
- No foreign key exists between the two tables. They address different concerns.
- A bridge service documents the mapping and ensures consumers reference the correct table.

When a feature needs to reference "a document the user authored," it uses `artifactId`
from `concept2cureArtifacts`. When a feature needs to reference "a file uploaded for
compliance tracking," it uses `id` from `documents`.

---

## Auth Lifecycle

```
Login
  POST /api/auth/login
  ├── Validate credentials (bcrypt)
  ├── Check account lockout (5 attempts / 15 min)
  ├── Check MFA requirement (TOTP if enabled)
  ├── Issue JWT access token (24h expiry)
  └── Issue refresh token (7d expiry)

Session
  ├── Every API request: Authorization header with JWT
  ├── Auth middleware validates token + checks blacklist
  └── Token refresh via refresh endpoint before expiry

Logout
  POST /api/auth/logout
  ├── Add token to in-memory blacklist Set
  ├── Client clears stored tokens
  └── Redirect to /login
```

**Known limitation**: The in-memory blacklist does not survive server restarts.
A token blacklisted at T=0 becomes valid again if the server restarts at T=1,
until the token's natural expiry. Production mitigation requires Redis-backed
blacklist storage.

---

## Files Modified in This Build Order

| File | Change |
|------|--------|
| `client/src/concept2cure/components/settings/ZenSettings.tsx` | Sign-out button wired to authService.logout() |
| `client/src/concept2cure/IndustryAwareApp.tsx` | Sign-out button wired to authService.logout() |
| Login component(s) | SSO buttons wrapped in DEV guard |
| `tests/build-order-10-founder-critical-path.test.ts` | Acceptance test suite |

---

## Design Decisions

1. **localStorage fallback is feature-flagged, not removed** — preserves offline/demo capability
   without polluting production behavior.
2. **Tour flags remain in localStorage** — re-showing a tour is not data loss. Persisting
   ephemeral UI hints to the database adds complexity without user value.
3. **Token blacklist remains in-memory** — Redis integration is out of scope for this sprint.
   The 24h token expiry provides a natural upper bound on exposure.
4. **No FK between artifact tables** — the tables serve different domains. A bridge service
   is the correct abstraction, not a foreign key that couples unrelated concerns.
