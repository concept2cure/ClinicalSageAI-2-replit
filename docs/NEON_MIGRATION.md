# Neon Database Migration & Verification

Use this guide to migrate the Supabase schema to Neon and validate connectivity without
printing secrets to logs.

## 1. Set environment variables once (no secrets in code)

Export secrets in your shell (do **not** hardcode them in scripts):

```bash
export SUPABASE_URL="your-supabase-host"
export SUPABASE_PASSWORD="your-supabase-password"
export NEON_CONNECTION_STRING="postgresql://user:password@host:port/dbname?sslmode=require"
export DATABASE_URL="$NEON_CONNECTION_STRING"
```

## 2. Export Supabase schema (schema-only)

```bash
pg_dump --schema-only --no-owner --no-acl \
  "postgresql://postgres:${SUPABASE_PASSWORD}@${SUPABASE_URL}:5432/postgres" \
  > /tmp/supabase-schema.sql
```

## 3. Remove Supabase-specific artifacts

```bash
sed -i '/^CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/d' /tmp/supabase-schema.sql
sed -i '/^CREATE EXTENSION IF NOT EXISTS "pgjwt";/d' /tmp/supabase-schema.sql
sed -i '/^CREATE EXTENSION IF NOT EXISTS "supabase_vault";/d' /tmp/supabase-schema.sql
sed -i '/^CREATE POLICY/d' /tmp/supabase-schema.sql
sed -i '/^ALTER POLICY/d' /tmp/supabase-schema.sql
sed -i '/^CREATE PUBLICATION/d' /tmp/supabase-schema.sql
```

## 4. Import schema into Neon

```bash
psql "$NEON_CONNECTION_STRING" -f /tmp/supabase-schema.sql
```

## 5. Verify connectivity (simple query)

```bash
psql "$NEON_CONNECTION_STRING" -c "SELECT 1"
```

## 6. Optional data migration

If you need to migrate data, repeat the export without `--schema-only`, or use
`pg_dump`/`pg_restore` to transfer data between databases. Keep secrets in environment
variables and avoid echoing them in logs.
