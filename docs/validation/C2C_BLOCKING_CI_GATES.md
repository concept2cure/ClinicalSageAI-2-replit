# C2C Blocking CI Gates

**Work order:** WO-02 · **Base SHA:** `2a5b46d1`
**Evidence standard:** measured by resolving npm aliases and aggregate suites
against `.github/workflows/*.yml`.

---

## 1. Coverage

| Measure | Value |
|---|---:|
| Guard scripts in `scripts/ci/` | 37 |
| **CI-covered (blocking)** | **34** |
| Not covered | 3 (one advisory reporter, one reporter, one helper) |

### Update 2026-07-25 — counting the scripts in `scripts/ci/` was the wrong denominator

The measurement above answers "how many of the guards **in one directory** run in
CI?" A later audit asked the question that actually matters — "which guard
scripts exist **anywhere** in `package.json`, and what enforces each?" — and
found controls that existed and were wired to nothing:

| script | was | now |
|---|---|---|
| `check:security-patterns` | pre-commit hook only, so any `--no-verify` commit skipped it and nothing checked the branch | **blocking in CI** (and it found 11 real violations the moment the C-18 rule was added) |
| `ci:ban-new-pool` | enforced nowhere | **blocking in CI** |
| `ci:ectd-stubs`, `ci:risk-codes` | pre-push hook only | **blocking in CI** |
| `ci:ui-kits` | enforced nowhere — **and exits 1 today** (7 issues, incl. a shared-scope `useState` collision) | still unwired; wiring it as-is would land CI red. Recorded, not hidden. |

Of 68 scripts matching `ci:|check:|audit:|verify:`, 38 run in CI. Most of the
remainder are `:strict` and `:write-baseline` variants that are *deliberately*
manual.

`audit:dead-code` was the sharpest instance of the shape this document is about,
and it was worse than unwired — it was **wired to an analysis that never ran**.
It invoked knip with `--no-exit-code`, so the job could not fail; and knip itself
aborted on two config-load errors (`drizzle.config.ts` wants `DATABASE_URL`,
`vitest.workspace.ts` calls a removed `defineWorkspace`), so it built no module
graph at all. The output was therefore a clean bill of health assembled from
nothing: zero unreferenced files, and 188 "unused dependencies" including
`@anthropic-ai/sdk`, `drizzle-orm` and `zod`. One of its three entry points,
`client/src/concept2cure/ZenApp.tsx`, had also been deleted from the repo.

It is now `ci:unreferenced-modules` (`scripts/ci/check-unreferenced-modules.mjs`),
blocking in CI on a baseline that may only shrink. The scanner is small enough to
audit by reading, and `tests/ci/unreferenced-modules.contract.test.ts` pins the
two repo-specific resolution quirks that make the obvious implementation call
live routers dead — ESM `.js` specifiers naming `.ts` files, and routers mounted
from a manifest of path strings rather than import literals. Both were
mutation-verified: reverting either behaviour fails the suite.

**The lesson generalises past CI:** a control that exists, looks right, and is
attached to nothing is the same defect shape as a service that ships without
storage (C-8, C-10, C-11, C-12, C-14, C-16). Both pass review by existing.

### Measuring this correctly

Two wrong answers were produced before the right one. Both are easy to repeat:

1. Grepping workflows for guard **filenames** → misses `npm run ci:*` aliases.
   Produced a false *"~7 of 38 wired."*
2. Resolving aliases only → misses **aggregate suites**.
   `ci:reasoning-tier-readiness` runs four guards internally
   (`check-reasoning-tier-readiness-suite.mjs:7-10`). Produced a false
   *"2 governed-export guards unwired."*

**Correct method:** resolve npm aliases, then follow aggregate scripts
transitively into the scripts they spawn.

---

## 2. Blocking gates in `ci.yml`

| Gate | Guards |
|---|---|
| Migrations | `ci:migration-prefix-collisions`, **`ci:duplicate-table-ddl` (new)**, `require-migration-headers` |
| Tenancy / RLS | `ci:rls-allowlist-sync`, `ci:tenant-column-types`, `ci:tenant-isolation:no-regression`, `ci:ban-new-pool` |
| Auth / identity | `ci:no-dev-auth-in-prod`, `ci:password-hygiene`, `ci:saml-fail-closed`, `ci:jwt-verify-pinned` |
| Regulated data | `ci:regulated-delete-audit`, `ci:no-mock-in-prod-routes` |
| Routes | `ci:audit-route-mounts:no-regression`, `ci:route-ownership-matrix:check` |
| AI | `ci:gateway-bypass`, `ci:check-embedding-runtime` |
| Runtime canonicality | `ci:check-docx-runtime`, `ci:check-pdf-runtime`, `ci:check-editor-integrity` |
| Governed exports | `ci:reasoning-tier-readiness` (aggregate of 4) |
| Hygiene | `ci:js-ts-shadows`, `ci:check-legacy-dep-quarantine`, `ci:design-system`, `ci:i18n-integrity`, `ci:baseline-justifications` |
| Contracts | `ci:ectd-stubs`, `ci:risk-codes` (also enforced pre-push) |

Advisory (`continue-on-error: true`) by explicit, documented decision:
`ci:token-cascade` (12 known unresolved `var()` refs), coverage measurement, and
one IaC scan. Each carries an in-file comment stating the condition for flipping
it to blocking.

---

## 3. Added by this work order

### 3.1 `ci:duplicate-table-ddl` — blocking

`scripts/ci/check-duplicate-table-ddl.mjs`

Closes the gap that let conflicts C-1, C-2 and C-3 pass CI: **no guard checked
table names across both migration lineages.**

- Scans all 436 non-archived `.sql` files.
- **Schema-qualified** extraction — `CREATE TABLE audit.foo` is `audit.foo`, not
  a table named `audit`. (Getting this wrong inflates the count ~10x.)
- Baseline pins table → **exact file set**, so an already-colliding table cannot
  quietly accumulate more definitions.
- Baselined at the 72 pre-existing collisions; every one is a defect to
  reconcile under ADR-0006, not an approved pattern.

Negative-tested both ways:

| Case | Result |
|---|---|
| New file defining an already-colliding table | **fails** ✓ |
| Two new files defining a brand-new table | **fails** ✓ |
| Repository as-is | passes ✓ |

### 3.2 `test:schema-contract` — new test tier

`tests/schema-contract/` — applies **real migration files** to PGlite and asserts
schema conformance. 8 tests passing, 2 skipped (acceptance criteria for
ADR-0006/0007).

**Not yet wired blocking in CI.** It runs in ~53s because each case builds a
fresh in-process Postgres. Wiring it should follow the reconciliation, when the
skipped acceptance tests flip on and the suite asserts the *fixed* state rather
than documenting the broken one. Wiring it now would freeze a broken schema as
the expected baseline — the opposite of the intent.

Run it with: `npm run test:schema-contract`

---

## 4. Requested but not delivered

| Master WO-02 §5 item | Status |
|---|---|
| Grounding as a blocking gate | **deferred to WO-12** — needs context-of-use thresholds (see `docs/ai/C2C_GROUNDING_AND_INJECTION_GATES.md` §3) |
| Key Playwright journeys as blocking gates | **not possible** — no product E2E suite exists; this is WO-01's deliverable |
| Coverage ratchets replacing zeroed thresholds | not attempted — needs a per-subsystem baseline exercise |
| Strict TypeScript on new files | `ci:typecheck:no-regression` exists with a frozen baseline; per-file strictness not added |

Each is named rather than quietly omitted. Items 1 and 2 are dependency-blocked.
