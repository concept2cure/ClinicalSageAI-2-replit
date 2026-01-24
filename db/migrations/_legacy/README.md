# Migration Legacy Archive

**Archived:** 2025-01-24

## Background

The original 112 migrations had 25+ numbering conflicts (duplicate numbers like 003, 007-015, etc.).
These conflicts occurred during parallel development and can cause unpredictable migration order.

## Conflict Summary

| Number | Files |
|--------|-------|
| 003 | 2 files |
| 007-015 | 3, 2, 2, 2, 2, 2, 2, 2, 2 files |
| 031-035 | 2, 2, 2, 2, 2 files |
| 042-046 | 2, 2, 2, 3, 2 files |
| 060-063 | 2, 2, 2, 2 files |
| 071 | 2 files |

## Resolution Strategy

1. Migrations in `_legacy/` are preserved for reference
2. New migrations use timestamp format: `YYYYMMDD_HHMMSS_description.sql`
3. For fresh deployments, use Drizzle schema push or consolidated baseline

## Commands

```bash
# Fresh deployment (recommended)
npx drizzle-kit push:pg

# View schema diff
npx drizzle-kit generate:pg --schema=shared/schema.ts

# Apply specific migration (if needed)
npx drizzle-kit migrate
```

## Note

Do NOT run migrations from this `_legacy/` folder directly.
They are preserved only for audit and reference purposes.
