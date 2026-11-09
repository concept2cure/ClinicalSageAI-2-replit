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
| `b7eec7bf34` | `ci:step-presentation`, biostatistics half: the authoring save (`statistical-document-save.ts`) leaves `ana-biostats/workflow-integrator.ts`, so the four biostatistics engine tools no longer reach a model by import. |
| `b4c57f5a27` | `ci:step-presentation`, run-stopper half: `endEverySessionOf` and `stopPersonsRuns` leave `account-standing.ts` for `ana/`, and the routes call them as SCIM and member removal already did. The gate is green: no `source: 'engine'` tool reaches `gateway.ts`. |
| `105a28e291` | A product regression since `5144702d21`, when the Vault became global. AnA's `navigate_to` dropped the program the person named, and `act_on_screen` searched a Vault with no program open. The navigation register now says which screens take a program optionally (`programNeedOf`, `surfaceActionNeedsProgram`), and only one that requires one asks "which program?". |
| `0d6e906a3a` | Seventeen executor and tool suites (85 failing tests) meet the P-104 runtime. Each updated source pin was run against mutated sources and goes red on its regression. |
| `58ceb06186` | The request-connection scope test expects the caller's account, as P-104 scopes it. |
| `271838332f` | A product regression since `e6a7c391cc`: a missing embedding key was reported to the ledger and `/readyz` as a failed provider request. Three cases fail without the fix; 48/48 pass with it. |
| `fb7be60ea1` | Group B. Every release reads the chained ledger since `b8cee0745c`. Two fixtures built `audit_logs` unlike production: `actor_id` was text, so no link re-derived, and `chain_seq` was missing. Each fixture now applies the real migration. Nine suites pass, 168/168, and neither gate was loosened. |
| `5944bf4275` | Proof tier: the `chat-thread-access` contract gets the owner-private marker store production has. Before, 1 of 13 failed; now 13/13. The shared PGlite harness is not changed. |
| `41d32ca4b4` | Group E: six suites whose product changed on purpose (`a2f9264a5d`, `5144702d21`, `c88d892390`, `026c0e96ff`, `5c5b89836`). |
| `e1e672f400` | The AnA stream route's sixteen suites meet P-104's conversation step, with one model-side declaration (`withNoPrivateRules`). An unowned run is now proven refused before any model call. |

## Fixed later the same day

- **`ci:step-presentation`, 7 findings.** None was a RULE 2 defect: every chain was import-only, and no model is called on
  a figure path. Both single cuts are made (`b7eec7bf34`, `b4c57f5a27`), so the register still names the tools as the
  engines they are. `run-control.ts` then passed the repository's 100,000-byte ceiling
  (`audit:repo-health:ceiling`), so the session-end half was split, inside the same folder, into
  `ana/run-session-end.ts`.
- **About 40 AnA suites red for other causes.** They covered the stream route (16 suites), the executor and tools (17)
  and AnA drive. Two of them were product regressions, each fixed in the product and proven red then green:
  - AnA drive's Vault program (`105a28e291`);
  - the embedding key report (`271838332f`).

  The rest were harnesses left behind by changes the product made on purpose (`0d6e906a3a`, `e1e672f400`,
  `41d32ca4b4`).
- **Group B, the release gates.** The fixtures built `audit_logs` unlike production (`fb7be60ea1`), and neither gate was
  loosened.
- **Proof tier.** The `chat-thread-access` contract is fixed (`5944bf4275`). `authoring-review-audit-comment` was a
  stale expectation (`fb7be60ea1`).
- **`figure-reconciliation-not-assessed`, named under group A.** The gate was not the cause. The executor's cold import
  took 12 s, past the 10 s timeout, and the timed-out case leaked its ownership switch into the next one
  (`4a98f8d330`).

- **The secret scan, 8 hits.** Each fingerprint was read with its value masked:
  - five test canaries and evidence prose from the P-104 batch (`b8cee0745c`, `3ad2bb0712`, `1458f32d3e`, `00bcdd0c57`);
  - two placeholder DSNs in the Codespaces startup and doctor tests (`9315a787de`, `18569049dd`), whose hosts are
    `ep-diagnostic` and `ep-example`;
  - one probe-only audit key, set for a throwaway local database (`a06ae96c83`).

  All are recorded in `.gitleaksignore` with reasons (`887c4d9402`). The full-history scan was run as CI runs it (gitleaks 8.28.0,
  `--full-history --diff-filter=tuxdb HEAD`) on an unshallowed clone: 13,206 commits, no leaks, exit 0. On the shallow
  clone the scan cannot finish, because every shallow-boundary commit reads as adding the whole tree.

- **`uploaded-file-access-tenancy`, the last red case in the AnA run** (1 of 9,144). Importing the module now constructs
  `AuditService`, whose store probe consumed the case's queued answer. The mock now answers by SQL (`bae9a11ef2`).
- **A parallel merge with the coordinator's `67e7720ace`** broke two drive cases, reconciled with `Vault.tsx`
  (`0da9fae4b8`).
- **Pushed.** Every commit above is on `concept2cure-v2` (`cb9ef43aea` and after), through every pre-push gate:
  - the plan gate;
  - ESLint errors and the warning ratchet;
  - typecheck, with 0 errors;
  - the repo-health ceiling.

## Handed to others

- `tests/routes/chat-governed-upload.test.ts` → the owner of `c88d892390`. The upload stores its bytes first, and the
  test's environment has no storage.
- `shellNav.test.tsx`, the rail tests → the coordinator (group D).
