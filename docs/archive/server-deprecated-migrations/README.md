# Archived: server/_deprecated_migrations

These SQL files and the `runMigrations.ts` runner were the pre-Drizzle multi-tenant migration scaffolding. They have not been wired into any runtime path for some time — `server/db/runtime.ts` is the canonical migration runner now (Drizzle).

Moved out of `server/` on 2026-05-06 so the deprecated label is honoured by the directory tree, not just by `dangerfile.js` (which still bans new imports from `_deprecated_migrations/`).

If you find a reason these need to come back, they came from `server/_deprecated_migrations/`.
