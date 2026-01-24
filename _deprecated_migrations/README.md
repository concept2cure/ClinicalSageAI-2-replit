# ⛔ DEPRECATED MIGRATIONS - DO NOT USE

> **Last Updated:** January 24, 2026  
> **Status:** ARCHIVED - Historical reference only

---

## 🚫 This folder contains old migration files

These migrations have been superseded or consolidated. They are kept for historical reference and troubleshooting only.

**DO NOT:**
- Run these migrations
- Copy patterns from these files
- Reference these in new migrations

**Instead:**
- See `db/migrations/` for active migrations
- Follow the naming convention: `{NNN}_{domain}_{description}.sql`
- Coordinate migration numbers with the team to avoid conflicts

---

## Why do migration conflicts happen?

We've identified duplicate migration numbers (e.g., multiple `031_*.sql` files) which indicates parallel development without coordination.

### Prevention

1. Check the latest migration number before creating new ones
2. Reserve migration number ranges for major features
3. Use the `db:status` script to check for conflicts

---

*These files will remain for historical reference but should never be executed.*
