# Gate proofs: every security and tenant gate shown failing, 2026-09-24

A supplement to `security.md`, filed by a second session the same day. `security.md` §6
runs its gates **read-only**: pass or fail, and baseline sizes. This file answers a
different question: **would each gate fail if the defect it exists for came back?**

CLAUDE.md, working agreement: *"A gate that has only ever been seen to pass has not been
tested."* The 2026-09-22 review ran seventeen gates. Only three of them carry a selftest,
so the other fourteen had, on the record, only ever been seen passing.

- **Head:** probes run on `5117c0cf`, re-checked on `abffeb53`.
- **Rows informed:** D3 (the regression half of tenant isolation), D2 (the two fixture
  gates the row names). Neither turns green: D3's contract run against staging and D2's
  CI run are owed with D1.
- **Performed by:** the periodic-review session `session_015oLV2vDRUbUF8eLLs8zyGt`.

## Method

Each gate was given the smallest violation of its **own stated defect shape**, taken from
the header of its script, and run. The violation was then removed, and the gate re-run.
After every probe the touched file was restored byte-identical (`md5sum -c`) or deleted,
and `git status` was clean. Where a gate reads `git ls-files`, the probe file was
**staged**, because in the real flow (pre-push and CI) a new file is always tracked.

## Results: 17 of 17

| Gate | Probe (its own defect shape) | With the violation | Removed |
|---|---|---|---|
| `ci:launch-scope` | its selftest: `SELFTEST_FAKE_ROWS` in Vault; `ectd-publishing` dropped from the 20260810 keep-list; an unregistered route | exit 1 ×3, each naming the site | pass |
| `ci:drizzle-tenant-scope` | its selftest, both defect shapes | 6/6 | pass |
| `ci:unkeyed-request-tables` | its selftest | fails on its case and only on it | pass |
| `ci:fixture-fallback` | `live ?? FIXTURE_DOCS` appended to `v2/surfaces/Vault.tsx` (launch: Vault) | rc 1 | rc 0 |
| `ci:no-mock-in-prod-routes` | `const MOCK_PROGRAMS = […]` appended to `server/routes/taskManagement.routes.ts` (launch: Tasks) | rc 1, names the file | rc 0 |
| `ci:tenant-isolation:no-regression` | `pool.query("SELECT * FROM project_tasks WHERE id = $1")`, no tenant clause | rc 1 | rc 0 |
| `ci:tenant-resolvers` | a local `resolveOrgId(req)` reading `r.user?.organizationId ?? r.tenantId`, staged | rc 1: "190 (baseline 189)", names the file | rc 0 |
| `ci:tenant-column-types` | a `pgTable` under `shared/` with `organizationId: text('organization_id')` | rc 1 | rc 0 |
| `ci:session-scoped-rls-bypass` | `SET app.bypass_rls = 'true'` on a pooled client | rc 1 | rc 0 |
| `ci:committed-secrets` | an AWS-key-shaped literal (`AKIA…`, fabricated, never committed), staged | rc 1 | rc 0 |
| `ci:no-dev-auth-in-prod` | `if (process.env.NODE_ENV !== 'production') return true` in `server/middleware/authReviewProbe.ts` | rc 1 | rc 0 |
| `ci:path-containment` | `fs.writeFileSync(req.body.filePath, …)` in a route | rc 1 | rc 0 |
| `ci:unreferenced-modules` | a `server/services/` module nothing imports, staged | rc 1 | rc 0 |
| `ci:rls-allowlist-sync` | a table added to `RLS_ALLOWLIST` and not to its four hand copies | rc 1 | rc 0 |
| `ci:tenant-isolation-justifications` | a fingerprint appended to `tenant-isolation-baseline.json` with no justification row | rc 1: "baseline entries with NO justification row", names the file | rc 0 |
| `ci:tenant-entry-points` | a `server/jobs/` sweep: `setInterval` over `project_tasks`, no lifecycle check | rc 1: "1 NEW tenant entry point(s) with no entitlement check" | rc 0 |
| `ci:tenant-blind-models` | a second `pgTable('project_tasks', …)` that omits its `organization_id` | rc 1: "5 blind (baseline 4)" | rc 0 |

Seven of these overlap `security.md` §6 (`committed-secrets`, `no-dev-auth-in-prod`,
`path-containment`, `session-scoped-rls-bypass`, `drizzle-tenant-scope`,
`tenant-entry-points`, `tenant-isolation:no-regression`). There they are shown passing;
here they are shown able to fail. The other ten are not in §6, and all ten pass at head.
`audit-requestdb-coverage --strict-no-regression` also holds: 229 shared-pool routes against
a baseline of 229. Of those, 227 sit behind the JWT boundary, 2 are explicit pre-tenant, and
0 are unclassified.

## Two of the probes were wrong on the first run

Recorded so that neither is read as a gate defect.

- **`ci:tenant-resolvers`** came back green on a new `resolveOrgId`. The gate reads
  `git ls-files` and the probe file was untracked. Staged, it fails as shown above. That is
  also why the `committed-secrets` and `unreferenced-modules` probes were staged from the
  start.
- **`ci:tenant-isolation-justifications`** came back green because the probe wrote a
  top-level key the gate never reads. The baseline stores entries under `fingerprints`. With
  a real fingerprint appended, it fails as shown above.

A probe that silently misses its target reads exactly like a gate that silently misses its
defect. Both cases were run down to the gate's source before a verdict was recorded.

## A gap the proofs exposed: D2's two gates did not block anything

D2 requires `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` "set to block". Both ran
in `ci.yml`'s `lint` job, with no `continue-on-error` at step or job level, so they did turn
CI red. But under RULE 0 every change is pushed straight to `concept2cure-v2` with no PR, so
red CI stops nothing. The fixture lands on the only branch and the red arrives afterwards.
`.husky/pre-push` ran about twenty gates and neither of these two.

**Fixed in `6f2694b1`:** both now run in `.husky/pre-push`, the one check that runs before
code lands.

| Probe of the hook itself | Result |
|---|---|
| fixture present | stops at the first gate, exit 1 |
| mock present | passes the first, stops at the second, exit 1 |
| clean tree | exit 0 |
| the real push of `6f2694b1` | ran the new block ("No ungated fixture fallback") |

Each gate adds about 0.5 s. This is a local proof. D2's named evidence is a **CI** run
showing the block, and that is owed with staging.

## What was not done

- **No selftest was written** for the fourteen gates that lack one. These proofs are
  recorded, reproducible and dated, but they are not in CI. Until each gate carries its own
  selftest, the next edit to a gate can stop it firing and nothing will report it. That is
  the durable fix, and it is recommended as separate work, not taken here.
- The gates in `security.md` §6 that are outside the 2026-09-22 set were not probed.
  `ci:org-path-param-guards`, `ci:jwt-verify-pinned`, `ci:sign-ceremony`, `ci:gateway-bypass`
  and the others there are shown passing, not shown able to fail.
