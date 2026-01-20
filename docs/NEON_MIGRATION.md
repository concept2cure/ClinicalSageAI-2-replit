# Neon Database Setup & Migration

This guide covers setting up the Neon database and migrating from any previous database setup.

## 1. Set environment variables

Export your Neon connection string in your shell (do **not** hardcode them in scripts):

```bash
export NEON_DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
export DATABASE_URL="$NEON_DATABASE_URL"
export JWT_SECRET="your-strong-random-secret-min-32-chars"
export REFRESH_TOKEN_SECRET="your-different-strong-random-secret"
```

Add these to your `.env` file:

```bash
# Neon Database
NEON_DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require
DATABASE_URL=${NEON_DATABASE_URL}

# Authentication
JWT_SECRET=your-strong-random-secret-min-32-chars
REFRESH_TOKEN_SECRET=your-different-strong-random-secret
```

## 2. Setup Authentication Schema

Run the auth setup script to create user authentication tables:

```bash
node scripts/setup_neon_auth.js
```

This creates:
- `auth_users` - User accounts
- `auth_refresh_tokens` - JWT refresh tokens
- `auth_password_resets` - Password reset tokens

## 3. Verify connectivity

Test the database connection:

```bash
psql "$NEON_DATABASE_URL" -c "SELECT 1"
```

Or use Node.js:

```bash
node -e "import('./server/lib/db.js').then(db => db.query('SELECT NOW()'))"
```

## 4. Migrating from Previous Setup

If you're migrating from a previous database:

### From Supabase

1. Export your existing schema:
```bash
pg_dump --schema-only --no-owner --no-acl \
  "your-old-connection-string" \
  > /tmp/existing-schema.sql
```

2. Remove provider-specific artifacts:
```bash
# Remove Supabase-specific extensions and policies
sed -i '/^CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/d' /tmp/existing-schema.sql
sed -i '/^CREATE EXTENSION IF NOT EXISTS "pgjwt";/d' /tmp/existing-schema.sql
sed -i '/^CREATE EXTENSION IF NOT EXISTS "supabase_vault";/d' /tmp/existing-schema.sql
sed -i '/^CREATE POLICY/d' /tmp/existing-schema.sql
sed -i '/^ALTER POLICY/d' /tmp/existing-schema.sql
sed -i '/^CREATE PUBLICATION/d' /tmp/existing-schema.sql
```

3. Import into Neon:
```bash
psql "$NEON_DATABASE_URL" -f /tmp/existing-schema.sql
```

4. Then run the auth schema setup:
```bash
node scripts/setup_neon_auth.js
```

### Data Migration

If you need to migrate data:

```bash
# Export data
pg_dump --data-only --no-owner --no-acl \
  "your-old-connection-string" \
  > /tmp/data-export.sql

# Import data
psql "$NEON_DATABASE_URL" -f /tmp/data-export.sql
```

## 5. Update Application Configuration

1. Remove all Supabase environment variables from `.env`
2. Update `DATABASE_URL` to point to Neon
3. Ensure `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are set
4. Restart your application

## 6. Security Best Practices

- Use strong, random secrets for JWT tokens (min 32 characters)
- Never commit secrets to version control
- Use different secrets for access and refresh tokens
- Enable SSL for database connections (`sslmode=require`)
- Rotate secrets periodically
- Use environment-specific secrets (dev, staging, production)

## Troubleshooting

### Connection Issues

If you can't connect to Neon:
- Verify SSL is enabled in your connection string (`?sslmode=require`)
- Check that your Neon project is active
- Verify IP allowlist if configured
- Check credentials are correct

### Migration Issues

If schema migration fails:
- Review the SQL file for provider-specific syntax
- Remove any RLS policies or publication statements
- Ensure extensions are compatible with Neon
- Run migrations in the correct order (schema first, then data)

### Authentication Issues

If authentication doesn't work:
- Verify JWT secrets are set in environment
- Check that auth tables were created successfully
- Ensure passwords meet minimum length requirements (8 chars)
- Verify access token hasn't expired (15 min lifetime)
