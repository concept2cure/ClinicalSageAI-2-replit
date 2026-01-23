import bcrypt from 'bcrypt';
import { getPool } from './pool';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('db-bootstrap');

export async function ensureCoreTables(): Promise<void> {
  let pool;

  try {
    pool = getPool();
  } catch (error: any) {
    logger.warn('Skipping core table bootstrap: database connection not available', {
      error: error?.message || String(error),
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        domain TEXT,
        logo TEXT,
        settings JSON,
        api_key TEXT UNIQUE,
        tier TEXT DEFAULT 'standard' NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        max_users INTEGER DEFAULT 5,
        max_projects INTEGER DEFAULT 10,
        max_storage INTEGER DEFAULT 5,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        title TEXT,
        department TEXT,
        avatar TEXT,
        bio TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        last_login TIMESTAMP,
        default_organization_id INTEGER REFERENCES organizations(id),
        preferences JSON,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_users (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT DEFAULT 'member' NOT NULL,
        permissions JSON,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        CONSTRAINT unique_user_org UNIQUE (user_id, organization_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        revoked BOOLEAN DEFAULT false,
        revoked_at TIMESTAMP WITH TIME ZONE,
        ip_address VARCHAR(45),
        user_agent TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_password_resets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP WITH TIME ZONE,
        ip_address VARCHAR(45)
      )
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS rule_id TEXT UNIQUE
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS module TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS section TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS agency TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS category TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS rule_type TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS severity TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS rule_name TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS description TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS check_logic JSON
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS remediation_text TEXT
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS auto_fix_available BOOLEAN DEFAULT false
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS auto_fix_logic JSON
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    `);

    await client.query(`
      ALTER TABLE IF EXISTS coauthor_validation_rules
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    `);

    const shouldSeedAdmin = process.env.SEED_DEFAULT_ADMIN !== 'false';

    if (shouldSeedAdmin) {
      const adminEmail = (process.env.ADMIN_EMAIL || 'jm.smith@concept2cure.pro').toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD || 'demo123';
      const adminOrgName = process.env.ADMIN_ORG_NAME || 'Concept2Cure';
      const adminOrgSlug = process.env.ADMIN_ORG_SLUG || 'concept2cure';
      const adminName = process.env.ADMIN_NAME || 'JM Smith';

      const passwordHash = await bcrypt.hash(adminPassword, 10);

      const orgResult = await client.query(
        `
        INSERT INTO organizations (name, slug, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        `,
        [adminOrgName, adminOrgSlug]
      );

      const organizationId = orgResult.rows[0]?.id as number | undefined;

      if (organizationId) {
        const usernameBase = adminEmail.split('@')[0]?.replace(/[^a-z0-9_]/gi, '') || 'admin';
        let authUserId: string | null = null;

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const username = `${usernameBase}${attempt === 0 ? '' : attempt}`.slice(0, 24);

          try {
            const authResult = await client.query(
              `
              INSERT INTO auth_users (email, username, password_hash, email_verified, is_active)
              VALUES ($1, $2, $3, true, true)
              ON CONFLICT (email) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    username = EXCLUDED.username,
                    is_active = true,
                    email_verified = true
              RETURNING id
              `,
              [adminEmail, username, passwordHash]
            );

            authUserId = authResult.rows[0]?.id ?? null;
            break;
          } catch (error: any) {
            if (error?.constraint === 'auth_users_username_key' && attempt < 4) {
              continue;
            }
            throw error;
          }
        }

        if (!authUserId) {
          throw new Error('Failed to seed default auth user after multiple attempts.');
        }

        const userResult = await client.query(
          `
          INSERT INTO users (email, name, password_hash, status, default_organization_id)
          VALUES ($1, $2, $3, 'active', $4)
          ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                name = EXCLUDED.name,
                default_organization_id = EXCLUDED.default_organization_id
          RETURNING id
          `,
          [adminEmail, adminName, passwordHash, organizationId]
        );

        const userId = userResult.rows[0]?.id as number | undefined;

        if (userId) {
          await client.query(
            `
            INSERT INTO organization_users (organization_id, user_id, role)
            VALUES ($1, $2, 'admin')
            ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role
            `,
            [organizationId, userId]
          );
        }
      }
    }

    await client.query('COMMIT');
    logger.info('Core tables ensured');
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to ensure core tables', { error: error?.message || String(error) });
    throw error;
  } finally {
    client.release();
  }
}
