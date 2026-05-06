# Archived: Prisma legacy schemas

These three Prisma schema files are preserved for historical reference. The
runtime ORM has been Drizzle since Phase 3 of the database consolidation; see
`shared/schema.ts` and `migrations/` for the canonical schema.

The matching seed script (`prisma/seed.js`) and one-off profile seeder
(`scripts/seedProfiles.ts`) were removed in the same change, along with
the `@prisma/client` package from `package.json`.

Moved out of `prisma/` on 2026-05-06.
