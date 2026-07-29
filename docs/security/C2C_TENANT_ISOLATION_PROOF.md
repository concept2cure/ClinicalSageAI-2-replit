# C2C Tenant Isolation Proof

**Work order:** WO-02 · **Base SHA:** `2a5b46d1`
**Evidence standard:** verified by reading or running code.

---

## 1. Boot-time enforcement

`server/config/environment.ts:276-284`:

```ts
// RLS boot posture: in production RLS_ENFORCE must be an EXPLICIT operator
// decision. No-op outside production. See server/db/rlsEnforcement.ts.
assertRlsEnforcementForProduction();
```

This runs at **module load**, so a misconfigured production process fails to
start rather than serving unscoped reads. This is the strongest available shape
for a fail-closed control: it cannot be reached around by a request path.

### Proven by test

| Test | Result |
|---|---|
| `environment.test.ts:321` — "refuses to load in production when `RLS_ENFORCE` is unset" | **passing** |
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
