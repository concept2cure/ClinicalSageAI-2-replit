# Local Development Infrastructure Warnings

These warnings are expected in local Codespaces/Replit/dev-shell sessions when cloud infrastructure is partially configured.

## 1) Neon DB authentication warning (`neondb_owner` password mismatch)

If your app reports a password mismatch for `neondb_owner`, it usually means the local `.env` value for `DATABASE_URL` is stale or copied from another environment.

### What to do

1. Open the Neon Console and copy the **current** connection string for your target branch/database.
2. Update `.env`:

```bash
DATABASE_URL=postgresql://neondb_owner:<current_password>@<pooler-host>/neondb?sslmode=require&channel_binding=require
```

3. Restart the app after updating environment variables.

> Security note: if a database password was shared in chat/logs, rotate it in Neon and update all local `.env` files.

---

## 2) Redis not configured (`in-memory fallback`)

When `REDIS_URL` is missing or Redis is unreachable, the platform falls back to in-memory cache. This is acceptable for local development, but not for shared/staging/production environments.

### What to do

- **Local only (acceptable):** Keep using in-memory fallback.
- **If you want Redis locally:**

```bash
docker run --name c2c-redis -p 6379:6379 -d redis:7
```

Then set:

```bash
REDIS_URL=redis://localhost:6379
```

---

## 3) Missing relations (`pm_settings`, `project_memory_entries`)

If the schema exists but specific tables are missing, apply schema changes once a reachable DB connection is configured.

### What to do

```bash
npm run db:push
```

If needed, verify table existence manually:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pm_settings', 'project_memory_entries');
```

---

## Quick local checklist

- `DATABASE_URL` points to the intended Neon branch and current password.
- `REDIS_URL` is either configured, or fallback is intentionally accepted for local dev.
- `npm run db:push` has been executed after schema changes.
