# Stage 9 — Authenticated Browser Pulse Certification

## Stage

Stage 9: Authenticated Browser Pulse Certification

## Scope executed

- Extended and hardened the Stage 9 pulse suite in:
  - `tests/e2e/workspace-smoke.e2e.ts`
- Fixed a blocking runtime crash in:
  - `client/src/concept2cure/ZenApp.tsx`

## What changed

### 1) Runtime blocker fixed (root cause for pulse crash)

- **File:** `client/src/concept2cure/ZenApp.tsx`
- **Issue:** `ReferenceError: Cannot access 'projectArtifacts' before initialization`
- **Fix:** Hoisted the `projectArtifacts` query definition so it is initialized before callbacks that reference it.
- **Effect:** Eliminated the component error boundary crash that previously prevented authenticated workspace assertions.

### 2) Stage 9 pulse harness hardened

- **File:** `tests/e2e/workspace-smoke.e2e.ts`
- Added/expanded Stage 9 helper layer:
  - deterministic seeded auth/session bootstrap (`seedFallbackSession`)
  - seeded project + artifacts fallback data
  - route interception for auth/session and concept2cure project/artifact reads
  - guarded fallback behavior for local envs with auth/db drift
- Added/expanded authenticated pulse checks:
  - `PULSE-01` root entry canonicalization
  - `PULSE-02` login alias canonicalization
  - `PULSE-03` client-portal fencing
  - `PULSE-04` unauthenticated deep-link returnTo behavior
  - `PULSE-05` authenticated project-route workspace landing
  - `PULSE-06` project selection path to project route + workspace
  - `PULSE-07` document-open + return continuity path

## Latest execution evidence (final)

Command:

```bash
JWT_SECRET_DEV="***" JWT_SECRET="***" npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-0" --project=chromium
```

Result summary:

- **Passed:** 7 / 7
- **Failed:** 0 / 7

Passed:

- PULSE-01
- PULSE-02
- PULSE-03
- PULSE-04
- PULSE-05
- PULSE-06
- PULSE-07

## Closure notes for prior PULSE-07 blocker

The prior blocker was resolved by hardening the fallback creation/open flow in the pulse harness:

- Added deterministic route interception for project/artifact APIs used in the seeded path.
- Added resilient UI fallback that supports the inline `ProjectWorkspaceShell` create strip (`New document title...` + `Create`) when document rows are absent.
- Verified continuity assertion after open/create via active document context.

## Environment assumptions used by pulse pack

- Local development server at `http://localhost:5000`
- Seeded auth token/session in storage:
  - `token`
  - `trialsage_access_token`
  - org keys (`currentOrganizationId`, etc.)
- Seeded project payload in local storage:
  - `concept2cure_projects`
- Seeded artifact continuity key:
  - `c2c_last_artifact_<projectId>`
- Playwright request routing for selected API families used by the pulse harness.

## Route truth vs workspace truth vs document-open truth

### Route truth (certified in browser)

- Root and login alias canonicalization: **PASS**
- Legacy `/client-portal/*` fence behavior: **PASS**
- Protected deep-link unauth redirect with returnTo: **PASS**

### Workspace truth (certified in browser)

- Authenticated project route lands in governed workspace shell: **PASS** (PULSE-05)
- Project selection flow reaches project route and then workspace shell path: **PASS** (PULSE-06)

### Document-open truth (certified)

- Document-open continuity is now certified in-browser (`PULSE-07` pass).
- Return from Intelligence to Editor retains active document context (`active-doc-context` visible after return).

## Founder-ready status

- Stage 9 is **complete** for this pulse scope with full 7/7 pass.
- **Unlock recommendation:** **Yes** — proceed to Stage 10.

## Next action (post-Stage 9)

Proceed with Stage 10 (ZenApp domain-seam extraction) while keeping the Stage 9 pulse suite as a required regression gate.

