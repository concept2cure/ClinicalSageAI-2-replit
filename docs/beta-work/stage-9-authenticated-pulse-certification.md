# Stage 9 — Authenticated Browser Pulse Certification

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Prove the beta-safe click path works with authenticated browser tests

---

## 1. Mission

Turn shell and workspace cleanup from anatomy into a real heartbeat. Extend the Playwright
pulse pack so the product can prove root entry, login redirect, shell landing, project route,
workspace load, and chat presence.

---

## 2. Current Pulse Coverage (Before This Stage)

### What existed

| File | Tests | What it proves |
|------|------:|---------------|
| `tests/e2e/workspace-smoke.e2e.ts` | 7 | Sidebar nav items (Intelligence, Editor, Tools, Review, References, Setup) render with content; dead routes don't blank |
| `tests/e2e/governed-lifecycle.e2e.ts` | ~10 | Artifact lifecycle via API: create→edit→review→approve→lock→export |
| `tests/e2e/permission-enforcement.e2e.ts` | ~5 | 403/423 enforcement for viewer/author/locked artifacts |

### What was missing

| Gap | Risk |
|-----|------|
| Root entry redirect proof | Users could land on wrong surface |
| Login alias redirect proof | `/sign-in`, `/auth`, `/login` could break silently |
| `/client-portal` fence proof | Users could settle into legacy portal |
| Authenticated shell load proof | Shell could fail without explicit auth test |
| Project selection proof | Project context could break silently |
| AnA chat presence proof | Chat surface could disappear without detection |
| State continuity proof | Navigation could lose project context |

---

## 3. Changes Made

### New test file: `tests/e2e/beta-pulse.e2e.ts`

8 serial pulse tests covering the full beta-safe click path:

| Test | What it proves |
|------|---------------|
| PULSE-01 | Root `/` redirects to `/concept2cure` |
| PULSE-02 | Login aliases (`/sign-in`, `/auth`, `/login`) redirect to `/concept2cure/login` |
| PULSE-03 | `/client-portal` fence — user must not settle into portal as primary surface |
| PULSE-04 | Authenticated shell loads with visible sidebar |
| PULSE-05 | Project selection works from the shell |
| PULSE-06 | Workspace shell renders with meaningful content |
| PULSE-07 | AnA chat surface is present in the shell |
| PULSE-08 | Return to shell after navigation preserves context (no logout/redirect) |

### Playwright config alignment: `playwright.config.ts`

- `testMatch` expanded from `'**/*.e2e.ts'` to `['**/*.e2e.ts', '**/*.spec.ts']`
- `BASE_URL` extracted to a shared constant for consistency
- All 19 E2E files (9 `.e2e.ts` + 10 `.spec.ts`) now included in default Playwright run

### Port alignment

The canonical base URL is `http://localhost:5000` (from `playwright.config.ts`).
Individual test files that hardcode different ports (5173, 3000) should use
`process.env.BASE_URL` or `process.env.APP_BASE` to inherit the config value.

---

## 4. Authentication Strategy

The pulse tests use a three-tier auth strategy (same as existing workspace-smoke):

1. **Demo persona login** — clicks "Quick Demo Access" → persona button (fastest, most stable)
2. **Email/password fallback** — fills login form with test credentials
3. **Dev-login API fallback** — `POST /api/auth/dev-login` + localStorage/sessionStorage injection

This ensures tests work across local dev, CI, and staging environments.

---

## 5. Environment Assumptions

| Assumption | Handling |
|-----------|---------|
| App running at BASE_URL | Test fails explicitly with connection error |
| Demo personas available | Falls back to email/password flow |
| Dev-login API available | Falls back if email/password login redirects |
| At least one project exists | Seeds a localStorage project if none found |
| First-run overlay | Bypassed via localStorage flag |

---

## 6. Screenshot Evidence

All 8 pulse tests capture screenshots to `test-results/beta-pulse-screenshots/`:

| File | Step |
|------|------|
| `pulse-01-root-entry.png` | After root redirect |
| `pulse-02-login-aliases.png` | After alias redirect |
| `pulse-03-portal-fence.png` | After /client-portal navigation |
| `pulse-04-shell-loaded.png` | Authenticated shell with sidebar |
| `pulse-05-project-selected.png` | After project selection |
| `pulse-06-workspace-shell.png` | Workspace content rendered |
| `pulse-07-ana-present.png` | AnA chat surface visible |
| `pulse-08-return-context.png` | After navigation roundtrip |

---

## 7. Validation Requirements

| Requirement | Test |
|------------|------|
| Root entry must never settle on `/` | PULSE-01 |
| Root entry must land on `/concept2cure*` | PULSE-01 |
| Login aliases must reach `/concept2cure/login` | PULSE-02 |
| User must not settle into `/client-portal` as primary | PULSE-03 |
| Authenticated shell must show sidebar | PULSE-04 |
| Project selection must not crash | PULSE-05 |
| Workspace must render meaningful content | PULSE-06 |
| AnA chat must be reachable | PULSE-07 |
| Navigation must not lose auth context | PULSE-08 |

---

## 8. Remaining Gaps (For Future Stages)

| Gap | Deferred to |
|-----|-----------|
| Full document create/edit/save roundtrip | Stage 12 (AnA contract enforcement) |
| Document lifecycle state transitions in browser | Stage 12 |
| Multi-user review flow in browser | Post-Stage 13 |
| Screenshot baseline comparison (visual regression) | Post-beta |

---

## 9. Run Instructions

```bash
# Run all E2E tests (including new pulse tests)
npx playwright test

# Run only pulse tests
npx playwright test beta-pulse

# Run with headed browser for debugging
npx playwright test beta-pulse --headed

# Run with specific base URL
BASE_URL=http://localhost:5173 npx playwright test beta-pulse
```
