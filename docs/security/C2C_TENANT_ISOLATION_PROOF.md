# C2C Tenant Isolation Proof

**Work order:** WO-02 · **Evidence refreshed:** 2026-07-29
**Evidence standard:** verified by reading or running code.

---

## 1. Boot-time enforcement

`server/config/environment.ts:276-284`:

```ts
// RLS boot posture: production unconditionally requires RLS_ENFORCE=on.
assertRlsEnforcementForProduction();
```

This runs at **module load**, so a misconfigured production process fails to
start rather than serving unscoped reads. This is the strongest available shape
for a fail-closed control: it cannot be reached around by a request path.

### Proven by test

| Test | Result |
|---|---|
| `environment.test.ts:321` — "refuses to load in production when `RLS_ENFORCE` is unset" | **passing** |
| `rlsEnforcement.test.ts` — rejects invalid, alias, `off`, and `shadow` production modes | **passing** |
| `environment.test.ts` — production audit-seal posture (4 cases: short key, sufficient key, explicit unsealed acceptance, non-production) | **passing** |

Verified in this pass: `server/config/__tests__/environment.test.ts` green.

---

## 2. Blocking CI controls

All in `.github/workflows/ci.yml`, all exit-code gating:

| Guard | Enforces |
|---|---|
| `ci:rls-allowlist-sync` | RLS allowlist TS ↔ SQL parity — the allowlist cannot drift from the policy |
| `ci:tenant-column-types` | no TEXT-typed tenant columns (prevents type-confusion scoping bugs) |
| `ci:tenant-isolation:no-regression` | raw-SQL tenant scoping, baselined; new unscoped SQL fails |
| `ci:ban-new-pool` | no direct `new Pool()` — all access goes through the tenant-scoped runtime |
| `ci:regulated-delete-audit` | regulated deletes must be audited |
| `ci:no-dev-auth-in-prod` | dev-login path cannot ship enabled |
| `ci:saml-fail-closed` | SSO failures deny rather than fall through |
| `ci:jwt-verify-pinned` | JWT verification cannot be downgraded |

Supporting runtime code: `server/db/tenantRls.ts`, `server/db/rlsEnforcement.ts`,
`server/db/rlsAllowlist.ts`, `server/db/tenantStore.ts`.

The controls deliberately reuse the established evidence artifacts rather than
creating another baseline format:

- `docs/reports/tenant-isolation-baseline.json` is the raw-SQL no-regression set;
- `docs/reports/tenant-isolation-justifications.md` owns reviewed exceptions;
- `docs/reports/requestdb-coverage-baseline.json` is the request-scoped adoption set;
- `docs/RLS_ENFORCEMENT_BURNDOWN.md` owns rollout status and sequencing; and
- `scripts/audits/generate-evidence-pack.mjs` packages repository evidence.

---

## 3. What is NOT yet proven — stated plainly

The master work order asks for negative cross-tenant contract tests across
regulated artifacts, decisions, assumptions, evidence, signatures, submissions
and receipts.

**Those tests are blocked, not skipped.** Writing a cross-tenant test against
`assumption_records` or `decision_records` today would assert against a table
whose physical shape is undetermined — conflict C-1/C-2, where two incompatible
DDL definitions race and the winner depends on migration order. A green test
there would prove nothing about production.

Likewise `bundle_execution_receipts` **does not exist** (C-4), so receipt-scoped
isolation cannot be tested at all.

### Ordering

1. ADR-0006 — canonical migration lineage
2. ADR-0007 — canonical operating-system schema
3. ADR-0009 — receipt persistence
4. **Then** cross-tenant negative contract tests, written against the
   `tests/schema-contract/` harness so they run on a real schema rather than a
   mock.

Until then, this document claims **boot-time and CI-time enforcement only**. It
does not claim proven per-table runtime isolation for the operating-system
stores, and no such claim should be made externally.

## 4. Current residual findings

The existing checks are ratchets, not declarations of zero risk:

- `npm run ci:tenant-isolation:no-regression` currently reports **25** baseline
  candidate raw-SQL statements. Passing means no new fingerprint was added; each
  candidate still requires remediation or a narrow documented justification.
- `node scripts/ci/audit-requestdb-coverage.mjs` currently reports **96** route
  files touching the database, **16** using `requestDb(req)`, and **77** still on
  the shared pool.
- `requireTenantContext` is not globally mounted. The fail-closed pool prevents
  unscoped execution when enforcement is on, but unconverted routes may fail for
  clients until middleware/adoption work is complete.
- Mock tests prove that cleanup paths call `release(error)`; live PostgreSQL tests
  are still required to prove driver destruction/replacement, connection reuse,
  policy `USING`/`WITH CHECK`, cancellation, and concurrent tenant switching.

These are go-live blockers. They must not be converted into an allowlist merely
to obtain a green check.
