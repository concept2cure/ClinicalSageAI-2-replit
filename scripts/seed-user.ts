import bcrypt from 'bcrypt';
import { getPool } from '../server/db/pool';

const DEFAULT_EMAIL = 'jm.smith@concept2cure.pro';
const DEFAULT_PASSWORD = 'demo123';
const DEFAULT_ORG_NAME = 'Concept2Cure';
const DEFAULT_ORG_SLUG = 'concept2cure';

async function seed() {
  const email = process.env.ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const orgName = process.env.ADMIN_ORG_NAME || DEFAULT_ORG_NAME;
  const orgSlug = process.env.ADMIN_ORG_SLUG || DEFAULT_ORG_SLUG;
  const normalizedEmail = email.toLowerCase();

  const passwordHash = await bcrypt.hash(password, 10);
  const pool = getPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      `
      INSERT INTO organizations (name, slug, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
      `,
      [orgName, orgSlug]
    );

    const organizationId = orgResult.rows[0].id as number;

    const usernameBase = normalizedEmail.split('@')[0]?.replace(/[^a-z0-9_]/gi, '') || 'admin';
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
          [normalizedEmail, username, passwordHash]
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
      throw new Error('Failed to seed auth user after multiple attempts.');
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
      [normalizedEmail, 'JM Smith', passwordHash, organizationId]
    );

    const userId = userResult.rows[0].id as number;

    await client.query(
      `
      INSERT INTO organization_users (organization_id, user_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role
      `,
      [organizationId, userId]
    );

    await client.query('COMMIT');
    console.log(`✅ Seeded user ${email} with org ${orgSlug}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

seed();
