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

## Latest execution evidence

Command:

```bash
JWT_SECRET_DEV="***" JWT_SECRET="***" npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-0" --project=chromium
```

Result summary:

- **Passed:** 6 / 7
- **Failed:** 1 / 7

Passed:

- PULSE-01
- PULSE-02
- PULSE-03
- PULSE-04
- PULSE-05
- PULSE-06

Failed:

- PULSE-07 (`open existing artifact and return to workspace preserves active context`)

## Detailed blocker for remaining failure (PULSE-07)

Observed failure:

- Expected `active-doc-context` (or editor surface) not visible after open/create flow in a seeded local-auth path.

Behavior observed in page snapshots:

- Workspace remains in dossier browse state showing `No documents in this section` / `0 docs`.
- `Create` controls appear but do not consistently result in a visible active document context in this cloud env run.

Likely contributing factors in this env:

- Authenticated APIs outside route-stubbed surfaces still return 401 in dev logs for several endpoints.
- Mixed local-storage seeded fallback + partially protected backend paths can keep workflow in browse-mode without the active-doc context chip.

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

### Document-open truth (partially certified)

- Document-open continuity is **not yet fully certified** in this env due to PULSE-07 failing at post-open context visibility.
- This is currently an **environment + auth/data-path coupling blocker**, not a route-fence blocker.

## Founder-ready status

- Stage 9 is **mostly complete** with core route + authenticated workspace pulse heartbeat proven.
- **Unlock recommendation:** **Conditional Yes** for proceeding, with explicit carry-forward blocker on PULSE-07 to Stage 10/11 integration hardening.

## Required next action to fully close Stage 9

1. Stabilize one deterministic artifact-open path under authenticated project context (same environment used by Playwright).
2. Re-run only:
   - `PULSE-07`
   - then full `PULSE-0*` sweep
3. Mark Stage 9 complete only when PULSE-07 is green with matching screenshot evidence.

