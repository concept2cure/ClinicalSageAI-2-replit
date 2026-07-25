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
