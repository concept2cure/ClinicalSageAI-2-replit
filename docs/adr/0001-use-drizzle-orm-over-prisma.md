# ADR-0001: Use Drizzle ORM over Prisma

## Status

**Accepted**

- Date: 2025-06-15
- Deciders: Platform Architecture Team
- Technical Story: Database layer modernization initiative

## Context

The Concept2Cure platform requires a robust ORM solution for PostgreSQL database operations. The system handles regulatory submissions (IND, 510(k), CER), clinical trial data, and audit trails that must comply with 21 CFR Part 11.

Key requirements:

- Type-safe database queries with full TypeScript support
- Complex query support (joins, aggregations, CTEs)
- Migration management for schema evolution
- Performance suitable for high-volume document processing
- Compatibility with Neon serverless PostgreSQL

Initial development used raw SQL queries and ad-hoc type definitions, leading to:

- Type mismatches between code and database
- Inconsistent query patterns across modules
- Difficult schema migration management
- Security vulnerabilities from string concatenation

## Decision

**We will use Drizzle ORM as our primary database abstraction layer.**

Drizzle provides:

- Schema-as-code with TypeScript inference
- SQL-like query builder (familiar to developers)
- Zero runtime overhead (compiles to pure SQL)
- First-class support for PostgreSQL features
- Lightweight bundle size (~35kb)

## Consequences

### Positive

- **Type Safety**: Compile-time checking of all database operations
- **Performance**: No ORM abstraction overhead at runtime
- **Developer Experience**: SQL-like syntax reduces learning curve
- **Audit Compliance**: Schema definitions serve as documentation
- **Migration Control**: Declarative migrations with rollback support

### Negative

- **Less Abstraction**: Developers must understand SQL concepts
- **Smaller Ecosystem**: Fewer plugins compared to Prisma
- **Manual Relations**: Relationship handling less automatic than Prisma

### Neutral

- Team must learn Drizzle-specific patterns
- Existing raw SQL can be incrementally migrated

## Alternatives Considered

### Option A: Prisma

**Description:** Full-featured ORM with declarative schema and auto-generated client

**Pros:**

- Large ecosystem and community
- Excellent documentation
- Built-in GUI (Prisma Studio)
- Automatic relation handling

**Cons:**

- Heavy runtime (~2MB bundle)
- Query engine adds latency
- Schema language (not TypeScript)
- Complex queries require raw SQL fallback

**Why not chosen:** Runtime overhead unacceptable for high-volume regulatory document processing. Schema language creates disconnect from TypeScript types.

### Option B: TypeORM

**Description:** Mature ORM with decorator-based entity definitions

**Pros:**

- Battle-tested in enterprise
- Active Record and Data Mapper patterns
- Good migration support

**Cons:**

- Decorator syntax adds complexity
- Performance issues with complex queries
- Maintenance concerns (slow updates)

**Why not chosen:** Performance and maintenance trajectory concerns.

### Option C: Kysely

**Description:** Type-safe SQL query builder

**Pros:**

- Extremely type-safe
- Minimal overhead
- Good PostgreSQL support

**Cons:**

- No schema management
- Smaller community
- Less tooling

**Why not chosen:** Lack of integrated migration system.

## Implementation Notes

```typescript
// Schema definition in shared/schema.ts
import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Type-safe queries
const docs = await db.select().from(documents).where(eq(documents.id, 1));
```

## Related Decisions

- ADR-0002 - Multi-tenant architecture (uses Drizzle for tenant isolation)
- ADR-0003 - 21 CFR Part 11 compliance (audit trails via Drizzle)

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle vs Prisma Comparison](https://orm.drizzle.team/docs/prisma)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)

---

## Revision History

| Date       | Author            | Description                   |
| ---------- | ----------------- | ----------------------------- |
| 2025-06-15 | Architecture Team | Initial decision              |
| 2025-09-01 | Platform Team     | Added implementation examples |
