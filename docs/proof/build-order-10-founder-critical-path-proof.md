# Build Order #10 — Founder Critical Path Proof

> Date: 2026-04-04
> Verdict: ALL 8 ACCEPTANCE CRITERIA PASS

---

## Acceptance Criteria

### 1. Core project records not localStorage-only

**PASS**

Projects use API-first persistence (POST/PUT/DELETE to `/api/concept2cure/projects`).
The localStorage fallback is feature-flagged via `VITE_ENABLE_LOCAL_PROJECT_FALLBACK`
and defaults to off (`USE_API=true`). Production users always hit PostgreSQL.

### 2. Sign out real and test-covered

**PASS**

Two no-op sign-out buttons were identified and fixed:
- `ZenSettings.tsx` line ~1438: now calls `authService.logout()` + redirects to `/login`
- `IndustryAwareApp.tsx` line ~291: now calls `authService.logout()` + redirects to `/login`

Server-side `POST /api/auth/logout` adds the token to a blacklist. Auth middleware
rejects blacklisted tokens on subsequent requests.

### 3. Onboarding/preferences persisted or disabled

**PASS**

- Onboarding tour flags use localStorage — intentionally ephemeral UI state.
  Re-showing a tour after cache clear is not a data loss event.
- User preferences stored in `users` table (JSON column) — persisted in PostgreSQL.
- Workspace settings stored in `clientWorkspaceSettings` table — persisted in PostgreSQL.

### 4. SSO controls real or hidden

**PASS**

Google and Microsoft OAuth buttons are wrapped in `import.meta.env.DEV` guards.
They do not render in production builds. SAML SSO remains visible and functional
for enterprise customers.

### 5. Document/artifact canonical truth

**PASS**

- `concept2cureArtifacts` designated as the canonical table for authored regulatory content.
- `artifactId` is the canonical document identity.
- Bridge service documents the relationship between `concept2cureArtifacts` and `documents`.
- The `documents` table serves compliance-scoped tracking, not authoring.

### 6. Editor integrity guarded

**PASS**

All 28 `@tiptap/*` packages verified as installed and importable. A CI guard script
checks package presence to prevent silent dependency loss during upgrades or installs.

### 7. No fake-prod behavior

**PASS**

- Two no-op sign-out buttons fixed (see criterion 2).
- No `setTimeout`-based fake auth flows found.
- SSO buttons hidden in production (see criterion 4).
- No "Coming Soon" placeholders in critical paths.

### 8. Founder critical-path tests exist

**PASS**

Test file: `tests/build-order-10-founder-critical-path.test.ts`

Covers: project persistence mode, sign-out handler presence, SSO dev-guard behavior,
onboarding flag storage classification, document table canonical designation,
TipTap package verification.

---

## Files Added

| File | Purpose |
|------|---------|
| `tests/build-order-10-founder-critical-path.test.ts` | Acceptance test suite for all 8 criteria |
| `docs/audits/build-order-10-founder-critical-path-truth-map.md` | Audit map of 7 critical-path areas |
| `docs/architecture/build-order-10-founder-critical-path-hardening.md` | Architecture reference |
| `docs/proof/build-order-10-founder-critical-path-proof.md` | This file — proof of acceptance |

## Files Modified

| File | Change |
|------|--------|
| `client/src/concept2cure/components/settings/ZenSettings.tsx` | Wired sign-out button to authService.logout() + redirect |
| `client/src/concept2cure/IndustryAwareApp.tsx` | Wired sign-out button to authService.logout() + redirect |
| Login component(s) | Google/Microsoft OAuth buttons wrapped in `import.meta.env.DEV` guard |

---

## Known Limitations (Not Blocking)

| Item | Severity | Mitigation |
|------|----------|------------|
| Token blacklist is in-memory | Medium | 24h JWT expiry limits exposure window. Redis migration needed for multi-instance production. |
| No FK between concept2cureArtifacts and documents | Low | Bridge service documents the relationship. Tables serve different domains. |

---

## Summary

All 8 acceptance criteria pass. No fake production behavior remains in the founder
critical path. Two no-op buttons were fixed, unimplemented SSO providers were hidden,
document identity was canonically defined, and editor dependencies were CI-guarded.
The token blacklist in-memory limitation is documented for future Redis migration.
