# S4 · Anna runtime: the epic's own red on trunk, measured and cleared (2026-11-08)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k`, sole owner of the Anna-runtime epic (P-105). Plan §1d, §3a.

## What was red, and why

CI run `42515637919` at `c88d89239`, and run `42517353828` at `bc5a34030`, were red on every test shard. The
coordinator and the market-readiness session (`01Gx2fiw…`) handed the Anna items to this session: 63 tests on the S4
policy checks, `ci:ai-tenant-binding`, `ci:step-presentation` and `ci:launch-scope-api`.

**The standing-rule gate.** Since `4852aa78` and `a2f9264a` (P-104), every registered AnA tool reads the tenant's and
project's mandatory rules and the acting member's private rules before it runs (`governed-tool-gate.ts`
`loadToolSkillGates`). It fails closed with SKILL_POLICY_UNAVAILABLE, which is right in production. The global `pg`
stub (`tests/setup.ts`) answers every query with no rows, and the gate rightly reads that as "not an active member".

A local probe (an env-gated `appendFileSync` in the gate's catch, never committed) recorded every swallowed error
across the 366 suites that reach AnA's tools:

| Swallowed error | Count |
|---|---|
| PRIVATE_MEMBERSHIP_REQUIRED | 906 |
| PRIVATE_OWNER_REQUIRED | 273 |
| ANA_PROJECT_NOT_FOUND | 241 |
| `42P01` (a rule table missing in a fixture) | 29 |
| TypeError (a hand-built stub with no rows) | 23 |
| ANA_PROJECT_ACCESS_DENIED | 20 |
| Error ("Invalid policy tenant") | 14 |
| ANA_PROJECT_ANCHOR_UNRESOLVED | 10 |
| ANA_PROJECT_SCOPE_INVALID | 4 |
| ANA_PROJECT_ACCESS_UNAVAILABLE | 1 |

## Runs

| Run | Suites | Failing suites | Failing tests | Passing tests |
|---|---|---|---|---|
| Before: all 366 suites reaching AnA's tools | 366 | 170 | 1,358 | 4,953 |
| The 144 suites the gate refused, after the setup fix | 144 | 26 | 226 | 2,612 |
| The same 144, merged tree, with the helper and the eight declarations | 144 | 17 | 164 | 2,674 |
| The other 222 suites, after the setup fix (regression check) | 222 | 26 (the same 26 as before) | 98 | 3,375 |

No suite moved from passing to failing in any run.

## Commits (all on `concept2cure-v2`)

| Commit | What |
|---|---|
| `e739190890` | `tests/setup.ts`: a gate reading the global stub gets the real gate's empty-rule snapshot. A real client keeps the real gate. `_standing-rule-fixture.ts`: one declaration (`withNoStandingRules`) for suites with their own stub. Seven suites and `briefing-book-core`'s non-numeric organisation fixed. |
| `fd52dceb45` | `ci:ai-tenant-binding`: every round of `executeAgenticLoop` dispatches with `loopTenant()`, the caller's binding or else the tool context's. Two tenants are refused. Three cases; two fail without the fix. Gate self-test 35/35. |
| `02d0bad57a` | The RBM and tool-scope suites' hand-written stubs (`4e86c5ff7`) converge on the one declaration. |
| `c55704def0` | `ci:launch-scope-api`: production refused the P-104 credential vault (`/api/deep-research/connectors`), the placement setting (`/api/ai-placement-policy`) and the private-rule ledger (`/api/client-intelligence/ana/user-profile`). Each is declared narrowly; no parent namespace is claimed. 634 paths, none refused. |
| `df385e5984` | The gate answers a project the actor cannot use in the admission's own words (`projectScopeRefusal`), not as "rules could not be verified". Nine cases fail with the old catch. Eight real-database suites give their tools the verified request owner (`__tests__/support/request-owner.ts`) and release AnA drafts through the independent check, as production requires. 19 files / 431 tests pass. |

## Found and not yet fixed

- **`ci:step-presentation`, 7 findings.** None is a RULE 2 defect: every chain is import-only, and no model is called on
  a figure path. The two single cuts are:
  - `account-standing.ts:245`, the run stopper reached through report-os project access, then QMS evidence, then a
    service importing `routes/c2c/actions`;
  - `ana-biostats/workflow-integrator.ts:190`, the authoring save added in `c88d892390`.

  Correcting the register to a launch source would misstate the four biostatistics tools. The plan is to move
  `stopPersonsRuns` into `ana/run-control.ts`, with the routes calling it as SCIM and member removal already do, and
  to split the save out of the integrator within `ana-biostats/`.
- **About 40 AnA suites still red for other causes.** They cover the stream route, including `live-drive-turn`,
  plus source pins made stale by `a2f9264a`, several tool suites and the AnA-drive suites. They are being diagnosed now:
  a product regression is fixed in the product, proven failing then passing, and a stale harness is updated with its reason.
