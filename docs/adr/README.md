# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the Concept2Cure Platform (TrialSage/Concept2Cure.RI).

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences. ADRs are critical for:

1. **AI Agent Context** - Provides historical knowledge that AI coding agents lack
2. **Team Onboarding** - New team members understand why things are the way they are
3. **Decision Auditing** - Track the evolution of architectural choices
4. **Avoiding Re-litigation** - Prevents rehashing decided issues

## ADR Index

| ID                                                     | Title                              | Status   | Date       |
| ------------------------------------------------------ | ---------------------------------- | -------- | ---------- |
| [ADR-0001](0001-use-drizzle-orm-over-prisma.md)        | Use Drizzle ORM over Prisma        | Accepted | 2025-06-15 |
| [ADR-0002](0002-multi-tenant-architecture.md)          | Multi-Tenant Architecture Pattern  | Accepted | 2025-07-01 |
| [ADR-0003](0003-21-cfr-part-11-compliance-strategy.md) | 21 CFR Part 11 Compliance Strategy | Accepted | 2025-08-20 |
| [ADR-0004](0004-lumen-cortex-ai-architecture.md)       | LUMEN CORTEX AI Architecture       | Accepted | 2026-01-15 |
| [ADR-0005](0005-client-portal-v2-design.md)            | Client Portal V2 Design Approach   | Proposed | 2026-01-25 |

## Creating a New ADR

1. Copy the template: `cp TEMPLATE.md XXXX-title-with-dashes.md`
2. Fill in all sections
3. Submit PR for review
4. Update this README index

## ADR Statuses

- **Proposed** - Under discussion, not yet accepted
- **Accepted** - Decision has been made and is in effect
- **Deprecated** - Decision is no longer relevant
- **Superseded** - Replaced by a newer ADR (link to replacement)

## Template Location

See [TEMPLATE.md](TEMPLATE.md) for the standard ADR format.

## References

- [ADR GitHub Organization](https://adr.github.io/)
- [Michael Nygard's ADR Article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
