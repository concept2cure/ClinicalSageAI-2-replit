# Medical Device & Diagnostic — workflow click-through & UAT readiness

Two layers of evidence that the Device & Diagnostic client workflows are real,
mounted, and ready for human UAT once the DB is loaded.

## 1. Mount audit (runs anywhere, incl. CI) — DONE

`client/src/concept2cure/v2/__tests__/workflowAudit.test.tsx` mounts every
surface through the real V2 provider tree and records mount / console-errors /
content-size / data-state. Device & Diagnostic subset (34 surfaces):

- **34 / 34 mount, 0 console errors.** Deep surfaces render substantial content:
  `device-510k` (3,600 chars), `device-workstream` (3,016), `device-cer`
  (2,366), `device-diagnostics` (3,016), `device-submission` (1,992),
  `haq-manager` (2,950), `shadow-review` (3,352), `design-controls` (2,274),
  `human-factors` (1,695), `risk`/ISO-14971 (1,750), `precedent-intelligence`
  (1,835), `change-assessment` (2,070), `ectd-coauthor` (3,822).
- **Finding:** `ivd-completeness` renders thin (~226 chars) — it computes IVDR
  requirement families by matching against dossier fixtures; with sparse
  fixtures it shows near-empty (0 errors, not a crash). It should populate with
  real dossier data; verify during UAT once the DB is loaded.

## 2. Live E2E click-through (needs a running server + loaded DB)

`tests/e2e/mdx-workflows.e2e.spec.ts` logs in and drives the ui-v2 shell through
every Device & Diagnostic workflow, asserting each renders inside the shell with
no "coming soon" / "under development" / degraded error-boundary, and captures a
full-page screenshot per workflow as the UAT evidence pack.

This layer **cannot run in a sandbox that forbids binding a port** (the CCR
sandbox kills the server with exit 144). Run it in CI or a dev/UAT box:

```bash
# 0. one-time: install the browser runner if needed
#    npm i -D @playwright/test && npx playwright install chromium

# 1. load + seed the DB (matches how this repo boots)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable"
psql "$DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS vault; CREATE SCHEMA IF NOT EXISTS audit;"
for f in migrations/000*.sql; do psql "$DATABASE_URL" -f "$f"; done
APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c
npm run db:seed         # demo data
npm run db:seed:admin   # + the UAT login user

# 2. build + start the server (production bundle avoids the dev ESM ambiguity)
npm run build
NODE_ENV=production PORT=5000 node dist/index.js &

# 3. drive the click-through — supply the seeded UAT login via env (never commit it)
export UAT_EMAIL="<seeded-uat-user-email>"
export UAT_PASSWORD="<seeded-uat-user-password>"
BASE_URL=http://localhost:5000 \
npx playwright test tests/e2e/mdx-workflows.e2e.spec.ts
```

Output: per-workflow pass/fail (one Playwright test per workflow) plus
screenshots in `test-results/mdx-workflows/`. Green here = every Device &
Diagnostic workflow opens and renders real content end-to-end → ready for human
UAT.

## Honest status

- **Proven now:** all 34 Device & Diagnostic surfaces mount and render without
  errors; fail-closed data behavior verified (no fabricated "live" data offline).
- **Proven once the DB is loaded + server runs (in a port-capable env):** the E2E
  spec above executes the true click-through. It is written against real routes
  and selectors (V2App's `.c2c-v2 shell`, the login form, the `.surface-degraded`
  boundary) but has not been executed in this sandbox — run it per the runbook to
  get the UAT sign-off evidence.
