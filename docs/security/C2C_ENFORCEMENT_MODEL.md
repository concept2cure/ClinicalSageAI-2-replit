# C2C Enforcement Model

**Work order:** WO-02 (enforce tenant, grounding, prompt-injection, audit, CI gates)
**Base SHA:** `2a5b46d1` · **Branch:** `claude/chatgpt-assessment-review-hfuwlh`
**Evidence standard:** every claim verified by reading or running code. No prior
document was treated as evidence.

---

## 1. The headline correction

The master work order scopes WO-02 as converting *"documented 'built but not
enforced' controls into production-default, fail-closed behavior."*

**That premise is largely false at this SHA.** Measured directly:

| Control | Plan assumption | Verified reality |
|---|---|---|
| RLS in production | not enforced | **fails closed at module load** |
| CI guards | mostly advisory | **34 of 37 covered and blocking** |
| Prompt-injection library | not wired | wired into gateway + AnA input guard |
| Gateway bypass | unbounded | **frozen by a baselined blocking guard** |
| Schema conformance | assumed covered | **genuinely absent — the real gap** |

WO-02 is therefore **verify-and-ratchet**, not rebuild. Rebuilding enforcement
that already exists would have been the single most wasteful thing this program
could do.

---

## 2. RLS and tenant isolation — already fail-closed

`server/config/environment.ts:284` calls `assertRlsEnforcementForProduction()` at
**module load**, not behind a request path. A production process with
`RLS_ENFORCE` unset cannot boot.

Proven by test, not by inspection:

```
server/config/__tests__/environment.test.ts:321
  "refuses to load in production when RLS_ENFORCE is unset"   ✓ passing
```

Supporting blocking guards in `.github/workflows/ci.yml`:

| Guard | Enforces |
|---|---|
| `ci:rls-allowlist-sync` | RLS allowlist TS ↔ SQL parity |
| `ci:tenant-column-types` | no TEXT-typed tenant columns |
| `ci:tenant-isolation:no-regression` | raw-SQL tenant scoping, baselined |
| `ci:ban-new-pool` | no direct `new Pool()` bypassing the tenant-scoped runtime |

**Remaining work (not done here):** the master work order also asks for extended
negative cross-tenant contract tests across regulated artifacts, decisions,
assumptions, evidence, signatures, submissions and receipts. Those cannot be
written meaningfully until the schema conflicts are reconciled — a cross-tenant
test against `assumption_records` would be testing a table whose shape is
undetermined (C-1). **Deferred to after ADR-0006/0007, and recorded as such
rather than silently skipped.**

---

## 3. CI guard posture — 34 of 37 covered

This figure was measured wrong twice. Both errors are recorded because they are
easy to repeat:

1. Searching workflow YAML for guard **filenames** misses that workflows invoke
   `npm run ci:*` **aliases** → produced a false "~7 of 38 wired."
2. Resolving aliases still misses **aggregate suites**:
   `ci:reasoning-tier-readiness` runs four guards internally
   (`check-reasoning-tier-readiness-suite.mjs:7-10`) → produced a false
   "2 governed-export guards unwired."

Correct method: resolve npm aliases, then follow aggregate scripts transitively.

The three uncovered scripts are not meaningful gaps:

| Script | Nature |
|---|---|
| `check-env-var-docs.mjs` | **advisory reporter — exits 0.** Wiring it is a no-op; making it blocking requires documenting ~40 env vars first. Tracked, not done. |
| `report-branch-drift.mjs` | reporting |
| `generate-test-summary.js` | helper |

---

## 4. The genuine gap this work order closes

No guard detected **duplicate `CREATE TABLE` definitions across the two migration
lineages.** The two existing migration guards have exactly complementary blind
spots:

| Tool | Scans | Checks |
|---|---|---|
| `scripts/db/sync-migration-manifest.mjs:8` | `db/migrations/` only | manifest generation |
| `scripts/ci/check-migration-prefix-collisions.mjs:44` | `migrations/` only | 4-digit filename prefixes |

Neither scans both directories. **Neither checks table names at all.** That is how
`assumption_records`, `decision_records` and the contradiction tables came to be
defined twice with incompatible DDL while CI stayed green.

### 4.1 New guard — `ci:duplicate-table-ddl`

`scripts/ci/check-duplicate-table-ddl.mjs`, wired blocking in `ci.yml`.

- Scans **all** non-archived `.sql` files (436 at this SHA), both lineages plus
  `sql/`, `server/sql/`, `scripts/db-verify/`.
- Extracts **schema-qualified** table names, so `CREATE TABLE audit.foo` is not
  miscounted as a table named `audit` — getting this wrong inflates results badly.
- Ignores `_legacy/`, `_deprecated_migrations/`, `docs/archive/` as historical.
- Baselined at the **72 pre-existing collisions**
  (`scripts/ci/duplicate-table-ddl-baseline.json`).

**The baseline pins table → exact file set, not just the table name.** An earlier
draft baselined by name alone; a negative test caught that this let an
already-colliding table accumulate unlimited new definitions while the guard
stayed green. Both cases now fail:

| Negative test | Result |
|---|---|
| New file defining an already-colliding table (`organizations`) | **fails** ✓ |
| Two new files defining a brand-new table | **fails** ✓ |
| Repository as-is | passes ✓ |

---

## 5. Schema-contract enforcement (ADR-0010)

The deepest gap: **mocked-database unit tests cannot detect schema divergence.**

`server/services/__tests__/operating-system.test.ts:31` calls
`vi.mock('../../db')` and replaces the entire Drizzle surface with `vi.fn()`
stubs. It passes while asserting nothing about the schema — mocks accept any
column name and any enum value.

Combined with the fact that `/api/operating-system`, `/api/resolution` and
`/api/study-design` have **no client consumer**, nothing in the system — no user,
no test — had ever driven the assumption/decision/resolution stack against a real
schema.

### 5.1 New tier — `tests/schema-contract/`

`tests/schema-contract/harness.ts` applies **real migration files** to an
in-process Postgres (PGlite) and exposes introspection. It deliberately does not
hand-mirror DDL the way `server/db/pglite-harness.ts` does — hand-mirrored DDL is
itself a second copy that can drift, so it cannot detect drift.

`tests/schema-contract/operating-system-collision.contract.test.ts` — **8 passing
tests** that reproduce the conflicts as executable evidence:

| Assertion | Outcome |
|---|---|
| Drizzle migration first → raw-SQL migration is a **silent no-op** | reproduced |
| Raw-SQL migration first → Drizzle migration **fails**: `column "confidence" does not exist` | reproduced |
| Surviving schema differs by application order | reproduced |
| Service `INSERT` rejected: `assumption_code does not exist` | reproduced |
| 4 of 5 service status values absent from the pgEnum | reproduced |
| `domain_track` carries modality vs. discipline — zero overlap | reproduced |
| `decision_records` collides identically | reproduced |
| action/approval/escalation are three orthogonal enums the service collapses | reproduced |

Two further tests are `describe.skip` — they are the **acceptance criteria** for
ADR-0006/0007 and flip on when reconciliation lands.

### 5.2 What this proved that the audit had only inferred

WO-00 stated that *one* of the two consumers must be broken. The contract tests
establish **which**, and under what conditions: whenever
`migrations/0010_operating_system_foundation.sql` applies first,
`assumption-registry-service.ts` is **entirely non-functional** — every query
references columns that were never created.

---

## 6. Controls verified but NOT changed

Recorded so no one re-does them:

| Control | Status |
|---|---|
| Prompt-injection detection | `ai-gateway/promptInjection.ts` with tests (passing); wired via `ana/ana-input-guard.ts`, `ana-ri/stream.ts`, `ai-gateway/gateway.ts` |
| Gateway bypass | `ci:gateway-bypass` blocking (`ci.yml:95`) with `gateway-bypass-baseline.json` — bypasses frozen, ratchet down over time |
| Embedding canonicality | `ci:check-embedding-runtime` blocking; corpus policy governs 8 pgvector corpora |
| Audit seal posture | `environment.ts` refuses production boot on short/absent `AUDIT_HMAC_KEY` (tests passing) |
| Route mount integrity | `ci:audit-route-mounts:no-regression` blocking |

---

## 7. Explicitly not done in this work order

Stated plainly rather than implied by omission:

1. **Cross-tenant negative contract tests** across regulated artifacts — blocked
   on ADR-0006/0007 (§2).
2. **Grounding made blocking** for high-risk tiers — requires the context-of-use
   definitions from WO-12; making grounding blocking without them would either
   block legitimate work or enforce an arbitrary threshold.
3. **Coverage-threshold ratchets** — the master work order asks for subsystem
   ratchets replacing zeroed thresholds. Not attempted; needs a per-subsystem
   baseline that is its own exercise.
4. **Receipt verification** — depends on ADR-0009; there is no receipt to verify.
5. **`check-env-var-docs` made blocking** — needs ~40 env vars documented first.

Items 1, 2 and 4 are **dependency-blocked, not skipped**. Items 3 and 5 are
scoped-out with a stated reason.
