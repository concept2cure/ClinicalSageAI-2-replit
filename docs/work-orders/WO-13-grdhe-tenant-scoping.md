# WO-13 — the audit trails carry no tenant key

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** DISCLOSURE CLOSED — the schema gap is not
**Blocks:** external pilot on real customer data

---

## Correction, stated first because the original scope was wrong

The first version of this work order was titled *"`regulatory_harmonization` has
no tenancy at all"* and asked, as item 5, for the schema to be given RLS on the
grounds that `canonical_adverse_events` and `canonical_products` "hold
patient-level adverse event and product data and are protected today only by
whatever predicate each query happens to carry."

**That was wrong, and it was wrong the same way two earlier findings in this
evaluation were wrong: I read one sweep and concluded there was only one.**
`db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql` is a second sweep,
built for exactly this problem — an explicit 28-entry `(schema, table, column)`
list, keyed per table because the tenant column name differs across subsystems
(`org_id` / `organization_id` / `tenant_id`). It covers `core`,
`manufacturing`, `compliance`, `global_dossier`, `cortex`, `federated_ml`,
`regulatory_intel` and `regulatory_harmonization`. Within this schema it
policies:

```
('regulatory_harmonization', 'canonical_products',        'tenant_id'),
('regulatory_harmonization', 'canonical_adverse_events',  'tenant_id'),
('regulatory_harmonization', 'export_jobs',               'tenant_id'),
('regulatory_harmonization', 'gdpr_processing_records',   'tenant_id'),
('regulatory_harmonization', 'tenant_data_residency',     'tenant_id')
```

The patient-level tables are isolated. Item 5 asked for work that was already
done, and the sentence justifying it was false.

What survives the correction is narrower, and worse.

## The actual finding

The sweep policied everything with a tenant key. Three tables in the Part 11
path have no tenant key, so nothing could policy them, and nothing does:

| Table | Tenant column | Policied | What it holds |
|---|---|---|---|
| `regulatory_harmonization.audit_log` | **none** | ❌ cannot be | `old_data` / `new_data` JSONB — the before and after of every audited change |
| `audit.tamper_proof_log` | **none** | ❌ cannot be | the hash-chained Part 11 event log |
| `regulatory_harmonization.electronic_signatures` | **none** | ❌ cannot be | Part 11 signature manifestations |

`audit_log`'s only org-ish field is `user_organization TEXT` — a display string
about the **actor**, not a tenant key. `tamper_proof_log` has nothing at all:
id, sequence_number, event_type, actor, resource, action, details, hash chain,
client context (`db/migrations/20260813_audit_tamper_proof_log.sql:64`).

**Two unrelated subsystems arrived here independently, which makes it a pattern
rather than an oversight: the tenant isolation is on the data and not on the
record of what happened to the data.**

### The precedent that shows this is a decision, not an accident

The 2026-08-01 sweep did consider audit trails. It exempted one, in writing:

> *`audit.event_log` — 21 CFR Part 11 immutable audit trail, written by DB
> triggers (org_id captured at write, NULL for system events) and read only by
> cross-org compliance views and a background hash-integrity job; **there is no
> per-tenant request reader to isolate**, and a policy would drop NULL-org
> system events and break the compliance/export readers. Those readers must run
> under a privileged role, which is a role-posture matter, not a table policy.*

That is the correct way to make the call, and for that table the reasoning
holds. The other two audit tables never reached the same triage — and unlike
`audit.event_log`, both acquired exactly the per-tenant request reader the
exemption assumed away.

## What was live

`GET /api/grdhe/audit/:tableName/:recordId` served any tenant's Part 11 audit
trail to any authenticated user of any other tenant.

| | Evidence |
|---|---|
| No tenant column | `regulatory_harmonization.audit_log` DDL (`db/migrations/081_grdhe_regulatory_mapping_layer.sql:1121`) |
| No RLS | Nothing policies it, and with no tenant column nothing could |
| No predicate | `grdheService.getAuditLog` ran `SELECT * FROM audit_log WHERE table_name = $1 AND record_id = $2` and took no tenant argument |
| No authorization | The route's only check was an allowlist its own comment labels *"prevent SQL injection"* |
| Deployed | `081_grdhe_regulatory_mapping_layer.sql` is on the production applier (`scripts/db/migration-set.mjs:705`) |
| Reachable | `app.use('/api/grdhe', authenticateToken, grdheModule.default)` — authentication only, no tenant guard |
| Enumerable | Record ids are sequential |

The disclosed rows carry `old_data` and `new_data` — the actual content of the
audited record — on a table whose own `COMMENT` reads *"Immutable,
tamper-evident audit log for 21 CFR Part 11 compliance"*.

**`RLS_ENFORCE=on` does not mitigate this.** That setting makes
`poolInstrumentation.ts` apply a tenant scope per statement, but RLS filters only
where a **policy exists**. For this table none can.

This is the same IDOR shape the header of `assertTenantMatchesAuth`
(`server/routes/grdheRoutes.ts:80-86`) describes PRs #496-#499 closing elsewhere
in this very router. The audit endpoint was missed.

## What is now fixed

**With no tenant column on the audit row there is nothing to police, so both
fixes derive the scope from somewhere that has one.**

*grdhe* — ownership is proven by joining the **audited** table, where the tenant
key does live. `getAuditLog` now requires a tenant and classifies every auditable
table explicitly (`AUDITABLE_TABLE_SCOPES`):

| Class | Tables | Behaviour |
|---|---|---|
| `tenant` | `tenant_data_residency`, `export_jobs`, `canonical_adverse_events`, `canonical_products` — all `tenant_id UUID NOT NULL`, all policied | EXISTS probe against the audited table; non-owners get `[]` |
| `global` | `terminology_versions`, `terminology_mappings`, `mapping_rules` | Served. MedDRA/SNOMED registries and approved mapping rules are platform reference data, not customer content |
| `unscopable` | `electronic_signatures` | **Withheld.** No tenant column, so ownership cannot be proven |
| unlisted | anything else | Throws. Adding a table to the route allowlist without classifying it here now fails instead of leaking |

Non-owners receive `[]` rather than 403 **on purpose**: a distinct "exists but
not yours" response is itself a cross-tenant existence oracle over regulated
record ids.

*`auditService.getAuditLog`* — its Drizzle path filters on `tenantId`; its
tamper-proof fallback had no tenant parameter to pass one to, and dropped it. A
scoped request now throws `AUDIT_LOG_TENANT_SCOPE_UNAVAILABLE` **before** the
fallback query is issued. Nothing reaches that path today — `queryAuditEvents`
in `services/audit/auditLogger.ts` is the only caller and nothing imports it —
so this is a refusal rather than an incident. Pinned by
`server/services/__tests__/auditService-tenant-scope-fallback.contract.test.ts`,
which reports the leak verbatim when the guard is disabled.

## What is NOT fixed

Both fixes withhold. Neither repairs the record.

1. **Signatures cannot be attributed to a sponsor.**
   `regulatory_harmonization.electronic_signatures` stores Part 11 signature
   manifestations with no tenancy at all (`grdheService.ts:1307` INSERT names
   none — there is no column to name). For a Part 11 record that is a defect in
   the record itself, not in an endpoint.
2. **`GET /api/grdhe/signatures/:signatureId/verify` is still a cross-tenant
   validity oracle.** It returns only `{ valid, reason }`, so no content leaks,
   but the existence and validity of another tenant's signature id are
   observable. Closing it needs the same tenant column.
3. **The tamper-proof log still cannot answer a tenant-scoped question**, so the
   first surface that needs one gets a refusal rather than an answer.

### The work

1. Add `tenant_id UUID NOT NULL` to
   `regulatory_harmonization.electronic_signatures`, per `CLAUDE.md` RULE 1 —
   amend the creating migration in place with a dated note, do not append a
   DROP. Add it to the `20260801_uuid_tenant_isolation_nonpublic.sql` list in
   the same change, so the policy lands with the column.
2. Backfill from `signed_object_type` / `signed_object_id` where the referenced
   object carries a tenant. Rows that cannot be attributed are a finding for a
   human, **not a guess** — an unattributable Part 11 signature is a compliance
   question, and inventing an owner for one is worse than leaving it flagged.
3. Populate on write, filter on read, and reclassify `electronic_signatures`
   from `unscopable` to `tenant` in `AUDITABLE_TABLE_SCOPES`.
4. Scope `/signatures/:signatureId/verify` the same way.
5. **Decide the two audit trails explicitly, and write the decision down.** For
   each of `regulatory_harmonization.audit_log` and `audit.tamper_proof_log`:
   either give it a tenant column (and the policy), or exempt it the way
   `audit.event_log` was exempted — naming the cross-org readers that require
   it and the privileged role they must run under. What is not acceptable is
   the current state, which is neither: no key, no policy, no exemption, and a
   per-tenant reader mounted over it.

## Regression tests to add

Two tenants, one record each. Assert tenant A gets `[]` for tenant B's
`record_id` on every `tenant`-class table, that `electronic_signatures` returns
409, and that an unclassified table name throws rather than falling through.
Run it before the fix to see it fail — the repo's own rule.

The `auditService` half of this already has its test; use it as the shape.

## The meta-finding, for WO-5 and the gate layer

No gate reported any of this, and none could have. A sweep that finds
"tenant-keyed tables without a policy" is structurally blind to a table with **no
tenant key** — the absence removes it from the population being checked rather
than flagging it. The gate that would have caught all three does not exist:

> *For every table reachable by a per-request reader, assert it carries a tenant
> key, or a policy, or a written exemption.*

That is worth building, and it belongs in WO-5 alongside baseline governance.
Recorded here so the next audit table does not repeat this.
