# Security and tenant gate selftests (2026-10-01)

Nineteen CI gates had no test that showed them failing. Workflow `wf_dbd6eefe-bcf` handled each one
in three stages:
- **Build:** one agent wrote `scripts/ci/<gate>.selftest.mjs`. It builds throwaway trees containing
  the defect the gate exists to catch, runs the real gate on them and expects the failure, then
  covers the safe forms and the baseline semantics. It then mutation-checked the selftest against
  copies of the gate.
- **Critique:** an independent agent attacked the selftest.
- **Fix:** an agent applied the critique.

`workflow-results.json` holds every agent's return: the mutations each selftest killed, and the
critics' problems, each with its evidence and a suggested fix.

## State as landed

- All 19 selftests pass. Each has an npm script (`ci:<gate>:selftest`), and one CI step runs them all
  ("Guardrails — the security and tenant gates fail on what they exist to catch").
- Eight fix-round agents did not run (session limit): org-path-param-guards, no-dev-auth-in-prod,
  tenant-isolation, password-hygiene, regulated-delete-audit, route-ownership-matrix,
  tenant-resolvers and server-error-leaks.
  - Their critics' problems are recorded in `workflow-results.json` and are open.
  - Most add missing cases, for example a detection pattern with no failing case. Some name gate
    defects, such as gateway-bypass's legacy `allowed` baseline key, which skips the reason check.
- Two fixes made while landing:
  - `check-tenant-blind-models.mjs --write-baseline` wrote `{ entries }` only and so deleted the
    baseline's `_readme` warning. It now keeps every other key. The selftest case that caught this
    fails on the previous gate.
  - The regulated-delete-audit selftest's fixtures now carry `server/services/coauthor`. The gate
    began scanning that directory on 2026-10-01 (D5), after the selftest was written.
- `check-tenant-entry-points.selftest.mjs` passes and names three known gaps the gate does not catch.
  Those gaps are recorded, not fixed.
