# WO-13 — `regulatory_harmonization` has no tenancy at all

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** PARTIALLY FIXED — the live disclosure is closed; the schema gap is not
**Blocks:** external pilot on real customer data

---

## What was live

`GET /api/grdhe/audit/:tableName/:recordId` served any tenant's Part 11 audit
trail to any authenticated user of any other tenant.

Every link verified:

| | Evidence |
|---|---|
| No tenant column | `regulatory_harmonization.audit_log` DDL (`db/migrations/081_grdhe_regulatory_mapping_layer.sql`) has none. Its only org-ish field is `user_organization TEXT` — a display string about the **actor**, not a tenant key |
| No RLS | Zero `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` for the schema anywhere. It cannot be swept: `db/migrations/20260801_tenant_isolation_sweep.sql:99` is `WHERE c.table_schema = 'public'` |
| No predicate | `grdheService.getAuditLog` ran `SELECT * FROM audit_log WHERE table_name = $1 AND record_id = $2` and took no tenant argument |
| No authorization | The route's only check was an allowlist its own comment labels *"prevent SQL injection"* |
| Deployed | `081_grdhe_regulatory_mapping_layer.sql` is on the production applier (`scripts/db/migration-set.mjs:705`) |
| Reachable | `app.use('/api/grdhe', authenticateToken, grdheModule.default)` — authentication only, no tenant guard |

The disclosed rows carry `old_data` and `new_data` JSONB — the actual before and
after content of the audited record — on a table whose own `COMMENT` reads
*"Immutable, tamper-evident audit log for 21 CFR Part 11 compliance"*.

**`RLS_ENFORCE=on` does not mitigate this.** That setting makes
`poolInstrumentation.ts` apply a tenant scope per statement, but RLS only filters
where a **policy exists**, and this schema has none.

This is the same IDOR shape the header of `assertTenantMatchesAuth`
(`server/routes/grdheRoutes.ts:80-86`) describes PRs #496-#499 closing elsewhere
in this very router. The audit endpoint was missed.

## What is now fixed

Ownership is proven in the service by joining the **audited** table, because that
is where the tenant key lives. `getAuditLog` now requires a tenant and classifies
every auditable table explicitly (`AUDITABLE_TABLE_SCOPES`):

| Class | Tables | Behaviour |
|---|---|---|
| `tenant` | `tenant_data_residency`, `export_jobs`, `canonical_adverse_events`, `canonical_products` — all `tenant_id UUID NOT NULL` | EXISTS probe against the audited table; non-owners get `[]` |
| `global` | `terminology_versions`, `terminology_mappings`, `mapping_rules` | Served. MedDRA/SNOMED registries and approved mapping rules are platform reference data, not customer content |
| `unscopable` | `electronic_signatures` | **Withheld.** No tenant column, so ownership cannot be proven |
| unlisted | anything else | Throws. Adding a table to the route allowlist without classifying it here now fails instead of leaking |

Non-owners receive `[]` rather than 403 **on purpose**: a distinct "exists but not
yours" response is itself a cross-tenant existence oracle over regulated record ids.

## What is NOT fixed — the actual root cause

**`regulatory_harmonization.electronic_signatures` has no tenant column.** 21 CFR
Part 11 signature manifestations are being stored with no sponsor attribution at
all (`grdheService.ts:1307` INSERT names no tenancy — there is no column to name).

Withholding its audit trail closes the disclosure path. It does not fix the
record. Two consequences remain:

1. **Signatures cannot be attributed to a sponsor.** For a Part 11 record that is
   a defect in the record itself, not in an endpoint.
2. **`GET /api/grdhe/signatures/:signatureId/verify` is still a cross-tenant
   validity oracle.** It returns only `{ valid, reason }`, so no content leaks,
   but existence and validity of another tenant's signature id are observable.
   Closing it needs the same tenant column.

### The work

1. Add `tenant_id UUID NOT NULL` to `regulatory_harmonization.electronic_signatures`,
   per `CLAUDE.md` RULE 1 — amend the creating migration in place with a dated
   note, do not append a DROP.
2. Backfill existing rows from `signed_object_type`/`signed_object_id` where the
   referenced object carries a tenant; rows that cannot be attributed are a
   finding for a human, not a guess.
3. Populate it on write and filter on read; reclassify to `tenant` here.
4. Scope `/signatures/:signatureId/verify` the same way.
5. **Give the schema RLS.** Every other table here is equally unpoliced —
   `canonical_adverse_events` and `canonical_products` hold patient-level adverse
   event and product data and are protected today only by whatever predicate each
   query happens to carry. The public-only sweep will never reach them; this
   schema needs its own.

## Regression test to add

Two tenants, one record each. Assert tenant A gets `[]` for tenant B's
`record_id` on every `tenant`-class table, that `electronic_signatures` returns
409, and that an unclassified table name throws rather than falling through.
Run it before the fix to see it fail — the repo's own rule.
