# Security lens: launch catalog, 2026-09-22

**This repository has no security auditor agent.** `.claude/agents/` defines
Part 11 UX, honest-state, design-system, a11y, microcopy, motion and design
reviewers, and nothing for security. The DoD's weekly clause names four
auditors; the fourth does not exist. The security lens below is the repo's
deterministic security and tenant gates, run by the control tower, with each red
result read by hand. This covers regressions against known patterns, not
discovery. See *Gaps* in `README.md`.

Run on `f9a948422` (the remote head at the time of the review).

## Gates

| Gate | Result on head | Verdict after reading |
|---|---|---|
| `ci:committed-secrets` | PASS | — |
| `ci:no-dev-auth-in-prod` | PASS | — |
| `ci:no-mock-in-prod-routes` | PASS (0 / baseline 0) | — |
| `ci:fixture-fallback` | PASS (0 ungated, 0 baselined) | — |
| `ci:launch-scope` | PASS: 6 apps, 41 surfaces, 21 modules, 36 files | — |
| `ci:drizzle-tenant-scope` | PASS: 140 baselined, 11 fixed since | — |
| `ci:tenant-resolvers` | PASS: 189 / 189 | — |
| `ci:session-scoped-rls-bypass` | PASS: 34 baselined, all in unmounted services | — |
| `ci:rls-allowlist-sync` | PASS: 6 entries across 4 consumers | — |
| `ci:tenant-column-types` | PASS | — |
| `ci:tenant-blind-models` | PASS: 4 / 4 | — |
| `ci:tenant-isolation-justifications` | PASS | — |
| `ci:tenant-isolation:no-regression` | **FAIL**: 2 new | **False positive; fixed.** Both statements are in `server/mcp/__tests__/mcp-connector.dbtest.ts`: a fixture `INSERT INTO users` and the matching cleanup `DELETE`. `users` is global; tenancy is the `organization_users` row. Marked `tenant-isolation-safe:` with reasons |
| `ci:tenant-entry-points` | **FAIL**: 1 new | **False positive; fixed.** `server/routes/audit-trail-ledger.routes.ts` matched the "alternative-auth router" shape only because its header mentions *SCIM* in prose. It is mounted behind `authenticateToken` (`server/bootstrap/register-regulatory-routes.ts:313`), which chains `enforceTenantLifecycle` (`server/middleware/auth.ts`, inside `authenticateToken`). The header now says so |
| `ci:path-containment` | **FAIL**: `server/routes/analytics-routes.ts:322` | **False positive; not fixed.** The flagged line is `fs.writeFileSync(tempFilePath, text)`. The path is `path.join(cwd, 'temp', \`protocol-${Date.now()}.txt\`)`, with no request input. The request value `text` is the file's contents. The baseline file says it "may shrink, never grow", so adding an entry is the owner's call |
| `ci:unkeyed-request-tables` (+ selftest) | **FAIL**: 2 tables | **Needs owner judgement.** `mcp_oauth_clients` (`migrations/20260920_mcp_oauth.sql`, read by `server/mcp/auth/store.ts`, `0e83825ca`) is probably global by nature: OAuth dynamic client registration happens before a tenant is known. `c2c_document_section_versions`, newly read by `server/services/governance/separation-of-duties.ts` (`610f68788`, today), probably scopes through its parent document. Neither is verified; both need a baseline reason or a key |
| `audit-requestdb-coverage --strict-no-regression` | **FAIL**: 3 new routes on the shared pool | **Needs owner.** `server/routes/dossier-map.routes.ts` (launch: Submission Center, `b98ac05f0`), `server/routes/data-origins.routes.ts` (`8a11a0f48`), `server/routes/ana-ri/utility.ts` (`90d8c25e0`). All three are behind the JWT boundary, which opens a tenant scope, so this is RLS-in-depth adoption, not an open read |
| `ci:unreferenced-modules` | **FAIL**: 2 new | Not a security finding. `server/mcp/client-transcript.ts` (`0e83825ca`) and `server/eval/register/run-eval.ts` (`873b3fc9d`) are imported by nothing. Wire or delete; owners W7 and WJ |

## Security-relevant Part 11 findings

Signature ceremony and audit-trail integrity are security controls as well as
Part 11 ones. See `part11-ux.md` findings 1–3:

- a `sign` ledger row written without credential re-entry
- two governed mutations with no audit write

## What was not done

- No dependency or supply-chain review beyond the CI `Security Scan` job, which
  was green on the last completed run (`35791541373`: SBOM, lockfile audit,
  Trivy fs + config).
- No authz walk of each launch route. No review of the AnA tool-execution path
  that QMS SOP and change-control actions delegate to (listed as SUSPECT in
  `part11-ux.md`).
