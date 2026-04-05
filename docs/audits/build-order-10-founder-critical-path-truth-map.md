# Build Order #10 — Founder Critical Path Truth Map

> Audit date: 2026-04-04
> Scope: Seven critical-path areas reviewed for production truthfulness

---

## 1. Project Persistence

**Status: REAL**

Projects are API-first. All CRUD operations route through:

- `POST /api/concept2cure/projects` — create
- `PUT /api/concept2cure/projects/:id` — update
- `DELETE /api/concept2cure/projects/:id` — delete

A localStorage fallback exists but is feature-flagged via `VITE_ENABLE_LOCAL_PROJECT_FALLBACK`.
The default is `USE_API=true`. The fallback is intended for offline/demo scenarios only and
is not active in standard production builds.

**Verdict**: Core project records are persisted to PostgreSQL via API. No fake persistence.

---

## 2. Sign-Out

**Status: NOW REAL (two no-op buttons fixed)**

Two sign-out buttons were found to be non-functional:

| File | Location | Issue | Fix |
|------|----------|-------|-----|
| `client/src/concept2cure/components/settings/ZenSettings.tsx` | Line ~1438 | `<button>` with no `onClick` handler | Now calls `authService.logout()` + redirect to `/login` |
| `client/src/concept2cure/IndustryAwareApp.tsx` | Line ~291 | `<button>` with no `onClick` handler | Now calls `authService.logout()` + redirect to `/login` |

Server-side: `POST /api/auth/logout` blacklists the JWT token in an in-memory set.
Subsequent requests with a blacklisted token are rejected by auth middleware.

**Verdict**: Both buttons now execute real logout. Server invalidates tokens on logout.

---

## 3. SSO / OAuth

**Status: HIDDEN IN PROD**

| Provider | UI Present | Backend Status | Production Behavior |
|----------|-----------|----------------|---------------------|
| Google OAuth | Yes (dev) | 501 Not Implemented | Hidden via `import.meta.env.DEV` guard |
| Microsoft OAuth | Yes (dev) | 501 Not Implemented | Hidden via `import.meta.env.DEV` guard |
| SAML SSO | Yes | Implemented (enterprise) | Production-ready |

Google and Microsoft OAuth buttons were visible in production but returned 501 when clicked.
Fix: buttons are now wrapped in `import.meta.env.DEV` conditional — they render only in
development builds. SAML SSO is the real enterprise authentication path and remains active.

**Verdict**: No fake SSO buttons visible in production. SAML is real.

---

## 4. Onboarding / Preferences

**Status: MIXED (ephemeral OK, core prefs in DB)**

**Onboarding tour flags** (`hasSeenModule32Onboarding`, etc.) use `localStorage`.
This is intentional — tour state is ephemeral UI state. Seeing a tour again after
clearing browser storage is acceptable behavior, not a data loss scenario.

**User preferences** are stored in the `users` table via a JSON column.
**Workspace settings** are stored in the `clientWorkspaceSettings` table.

Both preference stores use PostgreSQL and survive browser resets.

**Verdict**: Tour flags are ephemeral by design. Meaningful preferences persist in DB.

---

## 5. Document / Artifact Tables

**Status: DOCUMENTED, CANONICAL DEFINED**

Two independent tables exist:

| Table | Purpose | Identity Key |
|-------|---------|-------------|
| `concept2cureArtifacts` | Canonical regulatory content (sections, drafts, versions) | `artifactId` |
| `documents` | Compliance-scoped records (upload tracking, classification) | `id` |

There is no foreign key relationship between these tables. They serve different domains.
A bridge service now documents the relationship and defines `concept2cureArtifacts` as
the canonical table for authored regulatory content. `artifactId` is the canonical
document identity within the authoring and submission workflow.

**Verdict**: Dual-table structure is intentional. Canonical identity is now explicit.

---

## 6. TipTap Editor

**Status: COMPLETE**

All 28 `@tiptap/*` packages are installed in `package.json` and imported by the
`UnifiedDocumentEditor` and its extensions. A CI guard script verifies that all
required TipTap packages are present and importable.

Packages verified: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`,
`@tiptap/extension-*` (collaboration, placeholder, highlight, table, image,
link, color, text-style, underline, text-align, task-list, task-item,
character-count, typography, dropcursor, gapcursor, history, and others).

**Verdict**: Editor dependency chain is complete and CI-guarded.

---

## 7. Token Blacklist

**Status: KNOWN LIMITATION**

The server-side token blacklist is an in-memory `Set<string>`. On server restart,
the blacklist resets and previously-invalidated tokens become valid again until
their natural JWT expiry (24h for access tokens, 7d for refresh tokens).

**Production concern**: A Redis-backed blacklist is needed for multi-instance
deployments and restart resilience. This is documented as a known limitation
and is not addressed in this sprint.

**Verdict**: Functional for single-instance. Redis migration required for production scale.

---

## Summary

| Area | Status | Risk |
|------|--------|------|
| Project Persistence | REAL | None |
| Sign-Out | NOW REAL | None (buttons fixed) |
| SSO/OAuth | HIDDEN IN PROD | None (dev-only) |
| Onboarding/Preferences | MIXED | Low (ephemeral tour flags acceptable) |
| Document/Artifact Tables | DOCUMENTED | Low (no FK, but canonical defined) |
| TipTap Editor | COMPLETE | None (CI guard) |
| Token Blacklist | KNOWN LIMITATION | Medium (needs Redis for prod scale) |
