# ADR-0002: Multi-Tenant Architecture Pattern

## Status

**Accepted**

- Date: 2025-07-01
- Deciders: Platform Architecture Team, Security Team
- Technical Story: Enterprise customer isolation requirements

## Context

The Concept2Cure platform serves multiple pharmaceutical companies, CROs, and medical device manufacturers. Each organization:

- Must have complete data isolation (regulatory requirement)
- May have different subscription tiers and feature access
- Requires separate audit trails for FDA inspection
- Needs customizable branding and workflows
- Must not see or access other tenants' data under any circumstances

The platform handles sensitive regulatory submissions including:

- IND applications with proprietary drug data
- 510(k) submissions with trade secrets
- Clinical trial protocols and results
- Patient safety data (anonymized)

## Decision

**We will implement a hybrid multi-tenant architecture using Row-Level Security (RLS) with organization_id columns and schema-level isolation for highly sensitive modules.**

### Tier 1: Row-Level Isolation (Default)

- All standard tables include `organization_id` column
- PostgreSQL RLS policies enforce tenant boundaries
- Single database, shared schema
- Cost-effective for standard operations

### Tier 2: Schema Isolation (Premium)

- Dedicated PostgreSQL schemas per enterprise customer
- Complete query isolation
- Independent backup/restore capabilities
- Higher cost, maximum isolation

### Implementation Pattern:

```typescript
// Every query automatically scoped by middleware
export const tenantMiddleware = (req, res, next) => {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new UnauthorizedError('No tenant context');
  req.tenantContext = { organizationId: orgId };
  next();
};

// Schema enforces organization_id
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  // ... other columns
});
```

## Consequences

### Positive

- **Regulatory Compliance**: Clear data boundaries for FDA audits
- **Scalability**: Single database scales to thousands of tenants
- **Cost Efficiency**: Shared infrastructure reduces overhead
- **Audit Trails**: Per-tenant audit logs for compliance
- **Flexibility**: Enterprise customers can upgrade to schema isolation

### Negative

- **Query Complexity**: Every query must include tenant filter
- **Risk of Leakage**: Developer error could expose cross-tenant data
- **Migration Complexity**: Schema changes affect all tenants
- **Performance**: RLS adds overhead to every query

### Neutral

- Requires tenant context in all API routes
- Developers must be trained on multi-tenant patterns
- Testing requires multi-tenant test fixtures

## Alternatives Considered

### Option A: Database-per-Tenant

**Description:** Separate PostgreSQL database for each organization

**Pros:**

- Complete isolation by default
- Independent scaling
- Simple mental model

**Cons:**

- Expensive at scale (connection pooling nightmare)
- Complex deployment and migration
- Cross-tenant analytics impossible

**Why not chosen:** Cost prohibitive beyond 50 tenants, operational complexity.

### Option B: Single-Tenant (On-Premise)

**Description:** Deploy separate instances for each customer

**Pros:**

- Maximum isolation
- Customer controls infrastructure
- Customization flexibility

**Cons:**

- Not SaaS-scalable
- High operational burden
- Version fragmentation

**Why not chosen:** Contradicts SaaS business model.

### Option C: Application-Level Filtering Only

**Description:** Filter by organization_id in application code only

**Pros:**

- Simple implementation
- No database complexity

**Cons:**

- Single bug exposes all data
- No database-level enforcement
- Fails compliance audits

**Why not chosen:** Unacceptable security risk for regulated data.

## Implementation Notes

### PostgreSQL RLS Policy

```sql
-- Enable RLS on documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant isolation
CREATE POLICY tenant_isolation ON documents
  USING (organization_id = current_setting('app.current_tenant')::integer);

-- Set tenant context at connection time
SET app.current_tenant = '123';
```

### Middleware Integration

```typescript
// server/middleware/tenant.ts
export async function setTenantContext(pool: Pool, organizationId: number) {
  await pool.query(`SET app.current_tenant = $1`, [organizationId]);
}
```

## Related Decisions

- ADR-0001 - Drizzle ORM (enforces organization_id in schema)
- ADR-0003 - 21 CFR Part 11 (audit trails per tenant)

## References

- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant SaaS Patterns](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [21 CFR Part 11 Data Integrity](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application)

---

## Revision History

| Date       | Author            | Description                      |
| ---------- | ----------------- | -------------------------------- |
| 2025-07-01 | Architecture Team | Initial decision                 |
| 2025-10-15 | Security Team     | Added RLS implementation details |
