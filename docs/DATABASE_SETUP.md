# Database Setup — you do NOT need Neon

The app talks to **standard PostgreSQL** via the `node-postgres` driver
(`server/db/runtime.ts` → `drizzle-orm/node-postgres` + `pg.Pool`). "Neon" is
only *detected* from the connection string to toggle SSL and skip extension DDL
(`server/db/ensureCoreTables.ts`) — it is one hosting choice behind a plain
`DATABASE_URL`, never a requirement.

One real constraint: the schema runs `CREATE EXTENSION vector` (pgvector, for the
CSR-knowledge tables), so the Postgres you point at should have **pgvector**
available.

## Pick whichever is free + fits (all behind `DATABASE_URL`)

| Option | Cost | Self-hosted | pgvector |
|---|---|---|---|
| **Bundled docker compose** (`pgvector/pgvector:pg15`) — recommended for self-host | free | ✅ | ✅ |
| Supabase / Neon / Railway / Render free tier | free tier | ❌ (managed) | ✅ (Supabase/Neon) |
| Your own local Postgres + `CREATE EXTENSION vector` | free | ✅ | needs install |
| **PGlite** (in-process, pure WASM) — dev/test only | free | ✅ | ext available |

### Self-host quickstart (no third party)
```bash
# .env: DB_PASSWORD=... ; DATABASE_URL=postgresql://postgres:...@localhost:5432/concept2cure
docker compose up -d db          # pgvector/pgvector:pg15, already in docker-compose.yml
npm run db:migrate               # or the project's migration runner
```

## PGlite dev/test harness (run DB-backed code with nothing installed)

For local development and integration tests with **no server, no daemon, no
cloud**, use the in-process PGlite harness:

- `server/db/pglite-harness.ts` — `createIndPgliteDb()` returns a Drizzle
  instance over PGlite with the IND tables applied (DDL mirrors the IND
  migrations).
- Example integration test:
  `server/services/ind-lifecycle/__tests__/ind-persistence-pglite.integration.test.ts`
  — mocks the services' `db` import to point at the PGlite instance and exercises
  the real master-data + dispatch-snapshot service code paths end-to-end
  (insert/select with RETURNING, org-scoping, jsonb, ordering).

```bash
npx vitest run server/services/ind-lifecycle/__tests__/ind-persistence-pglite.integration.test.ts
```

This is **dev/test only**. Production stays on the `pg.Pool` runtime over your
chosen `DATABASE_URL`. `@electric-sql/pglite` is a devDependency.
