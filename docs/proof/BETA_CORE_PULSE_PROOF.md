# Stage 8 — Beta Core Pulse Proof

## Scope
Primary beta-safe path pulse verification for:
1. root entry
2. login redirect behavior
3. `/client-portal/*` compatibility fence
4. authenticated `/concept2cure/project/:projectId`
5. project shell load
6. governed workspace shell visible
7. project context surface open
8. workspace open + return without blank state
9. no dead portal truth landing
10. no primary beta CTA to dead/unmapped route

## Commands run
```bash
# branch proof
git branch --show-current
git rev-parse --verify concept2cure-v2
git rev-parse --verify cursor/critical-files-management-f38a
git remote -v
./scripts/integration/stage8_compare_map.sh
tests/integration/stage8_compare_map.test.sh
node --test tests/ops/stage8-ga-readiness.test.mjs

# targeted tests (environment-limited in this clone)
npx vitest run tests/computeRedirect.test.ts tests/concept2cure/project-module-route-policy.test.ts server/__tests__/security/auth-hardening.test.ts
npx playwright test tests/e2e/beta-core-pulse.e2e.ts
```

## Viewport
- Intended viewport for pulse test: Playwright default chromium desktop (1280x720 unless overridden).
- Live run status in this environment: blocked before browser execution due missing local Playwright/Vitest toolchain and package registry access.

## Screenshots
- No runtime screenshots were captured in this environment.
- Expected artifact path when executable: `test-results/beta-core-pulse/beta-core-pulse-final.png`.

## Pulse cases executed
- Implementation status: **test authored** in `tests/e2e/beta-core-pulse.e2e.ts`.
- Runtime execution status in this environment: **not executed to completion**.

## Pass / fail table
| Case | Status | Notes |
|---|---|---|
| Test authoring for all 10 required pulse assertions | PASS | Implemented in dedicated e2e file |
| Branch compare automation | PASS | Scripted compare exists; currently fails closed when refs are missing |
| Compare script self-test harness | PASS | `tests/integration/stage8_compare_map.test.sh` passed in isolated temp git repo |
| Stage 8 GA readiness ops test | PASS | `node --test tests/ops/stage8-ga-readiness.test.mjs` passed (7/7) |
| Auth middleware hardening ops check | PASS | stage8 ops test validates bearer extraction hardening markers |
| Local branch ref verification | FAIL (env) | `concept2cure-v2` and `cursor/critical-files-management-f38a` refs absent in clone |
| Local vitest execution | FAIL (env) | `npx` blocked by npm registry 403 + no local bin |
| Local Playwright execution | FAIL (env) | no local playwright binary and no browser run bootstrapped |
| Runtime screenshots | FAIL (env) | Browser run did not execute |

## What remains unproven
- Live browser pulse pass/fail against running app instance.
- Stability across repeated pulse runs (at least 2 consecutive passes recommended).
- Human click-through verification under founder demo conditions.

## Environment assumptions
- Assumes a reachable app at `BASE_URL` (default `http://localhost:5000`).
- Assumes seeded demo auth path (`/api/auth/dev-login`) or demo persona login UI availability.
- Assumes Playwright + browser dependencies installed in CI/runtime environment.
- Assumes refs `concept2cure-v2` and `cursor/critical-files-management-f38a` exist locally or via fetched remote tracking branches.

## Founder-readiness position
- **Code-level pulse contract is now explicit and auditable.**
- **Compare automation exists and fails closed when refs are unavailable.**
- **Browser execution proof remains pending in this local environment.**
- Beta-safe path should be considered **conditionally ready** pending one real browser run in a fully provisioned environment.
