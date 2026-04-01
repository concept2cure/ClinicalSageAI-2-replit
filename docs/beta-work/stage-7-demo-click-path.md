# Stage 7 — Demo Click Path (Beta Honesty)

Stage: Stage 7 — UI-Only Beta Honesty Pass  
Branch: `cursor/critical-files-management-f38a`  
Baseline commit: `45ed2dfc` (`45ed2dfc`)  
Stage 7 implementation commit chain: `082ef07c` -> `185ab0fd` -> `d8046d56` -> `7e49bcac` -> `d097be99` -> `1034efbf` -> `4e994db4` -> `ab6c97af` -> `d273d530`  
Validation snapshot commit (A6 final): `d273d530` (`d273d530`)

## Founder-recommended partner demo path

This is the cleanest beta-safe path that avoids preview wrappers and avoids legacy route embarrassment.

1. Open `/` (or directly `/concept2cure/login`).
2. Sign in via `AnA 1.0 RI` login page.
3. Land at `/concept2cure` canonical shell.
4. Open/select a project from sidebar project list.
5. Click **Editor** in Workspace group (left sidebar).
6. Verify governed shell appears (`project-workspace-shell`) with real document lifecycle controls.
7. Optional: click **Intelligence** (AnA in context), then back to **Editor**.
8. Optional: click **References** to show vault/documents access.

## Routes and fences to call out during demo

- `/client-portal/*` is fenced to `/concept2cure`.
- `/login`, `/auth`, `/sign-in` are aliases to `/concept2cure/login`.
- `/` is routed through Zen shell auth-aware landing behavior.

## What to avoid in partner demo

- `Switch Module` legacy button flow (demoted from primary CTA).
- CSR shortcut row in top nav (removed from primary nav because mounted routes do not match those links).
- Legacy `/client-portal/*` direct links as a "destination" (use `/concept2cure` only).

## Runtime proof checkpoints

Use these checks while demoing:

- URL never settles under `/client-portal/*`.
- Login deep-link returns to intended `/concept2cure/project/:projectId` path.
- Sidebar and governed workspace shell render without redirect surprise.
- No obvious dead-end CTA in top nav.

## Validation run (latest)

- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-" --project=chromium`  
  Result at current snapshot: **PASS (4/4)**
- `npx vitest run --config vitest.config.ts client/src/__tests__/shellTruthRoutes.test.ts tests/stage6-governed-workspace-verifier.test.ts`  
  Result at current snapshot: **PASS (15/15)**

## A6 certification result

- Founder-facing Stage 7 Wave A certification rerun completed and passed at this snapshot.
- Commit chain, route heartbeat proof, and shell contract proof are now aligned to one explicit validation snapshot.

## Current known runtime risk (separate from Stage 7 honesty labels)

- Existing environment-dependent runtime failures may still occur if backend/session setup is unstable.
- Stage 7 scope addresses UI honesty and click-path trust, not deep backend stabilization.
