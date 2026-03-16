/**
 * Phase 11 E2E Test Seed Data
 *
 * Seeds multi-role users + a governed project ready for E2E governed workflow tests.
 * Run with: node tests/e2e/seed-governed-workflow.cjs
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
// Load from .env file (not shell env which may have stale creds)
require('dotenv').config({ override: true });
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_9SIEbtA2hKsw@ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Strip psql wrapper if present
const cleanUrl = DB_URL.replace(/^psql\s+'?/, '')
  .replace(/'$/, '')
  .trim();

const USERS = [
  {
    email: 'e2e-admin@trialsage.test',
    password: 'Admin123!test',
    role: 'admin',
    fullName: 'Admin User',
  },
  {
    email: 'e2e-author@trialsage.test',
    password: 'Author123!test',
    role: 'author',
    fullName: 'Author User',
  },
  {
    email: 'e2e-reviewer@trialsage.test',
    password: 'Reviewer123!test',
    role: 'reviewer',
    fullName: 'Reviewer User',
  },
  {
    email: 'e2e-viewer@trialsage.test',
    password: 'Viewer123!test',
    role: 'viewer',
    fullName: 'Viewer User',
  },
];

async function seed() {
  const client = new Client({ connectionString: cleanUrl });
  await client.connect();
  console.log('Connected to database');

  try {
    // 1. Ensure organization exists
    let orgId;
    const orgCheck = await client.query("SELECT id FROM organizations WHERE slug = 'e2e-test-org'");
    if (orgCheck.rows.length > 0) {
      orgId = orgCheck.rows[0].id;
      console.log(`Organization exists: id=${orgId}`);
    } else {
      const orgInsert = await client.query(
        `INSERT INTO organizations (name, slug, industry_mode, tier)
         VALUES ('E2E Test Organization', 'e2e-test-org', 'biotech', 'enterprise')
         RETURNING id`
      );
      orgId = orgInsert.rows[0].id;
      console.log(`Created organization: id=${orgId}`);
    }

    // 2. Upsert users with hashed passwords
    const userIds = {};
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (existing.rows.length > 0) {
        await client.query('UPDATE users SET password_hash = $1, name = $2 WHERE email = $3', [
          hash,
          u.fullName,
          u.email,
        ]);
        userIds[u.role] = existing.rows[0].id;
        console.log(`Updated user: ${u.email} (id=${userIds[u.role]})`);
      } else {
        const ins = await client.query(
          `INSERT INTO users (email, name, password_hash, default_organization_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [u.email, u.fullName, hash, orgId]
        );
        userIds[u.role] = ins.rows[0].id;
        console.log(`Created user: ${u.email} (id=${userIds[u.role]})`);
      }

      // Link user to organization
      await client.query(
        `INSERT INTO organization_users (user_id, organization_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id) DO UPDATE SET role = $3`,
        [userIds[u.role], orgId, u.role]
      );
    }

    // 3. Ensure client workspace exists
    let workspaceId;
    const wsCheck = await client.query(
      "SELECT id FROM client_workspaces WHERE slug = 'e2e-test-workspace' AND organization_id = $1",
      [orgId]
    );
    if (wsCheck.rows.length > 0) {
      workspaceId = wsCheck.rows[0].id;
      console.log(`Workspace exists: id=${workspaceId}`);
    } else {
      const wsIns = await client.query(
        `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgId, 'E2E Test Workspace', 'e2e-test-workspace', 'active', userIds.admin]
      );
      workspaceId = wsIns.rows[0].id;
      console.log(`Created workspace: id=${workspaceId}`);
    }

    // 4. Create a governed test project
    const projCheck = await client.query(
      "SELECT id FROM projects WHERE name = 'E2E Governed Workflow Test' AND organization_id = $1",
      [orgId]
    );
    let numericProjectId;
    if (projCheck.rows.length > 0) {
      numericProjectId = projCheck.rows[0].id;
      console.log(`Project exists: id=${numericProjectId}`);
    } else {
      const projIns = await client.query(
        `INSERT INTO projects (name, code, description, status, type, organization_id, client_workspace_id, owner_id, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          'E2E Governed Workflow Test',
          'E2E-GOV-TEST',
          'Test project for Phase 11 E2E governance tests',
          'active',
          '510k',
          orgId,
          workspaceId,
          userIds.admin,
          userIds.admin,
        ]
      );
      numericProjectId = projIns.rows[0].id;
      console.log(`Created project: id=${numericProjectId}`);
    }

    // 5. Create a template-based artifact in draft state
    const artifactId = `art_e2e_${Date.now()}`;
    const contentHash = crypto
      .createHash('sha256')
      .update('Initial draft content for E2E testing')
      .digest('hex');
    const artIns = await client.query(
      `INSERT INTO concept2cure_artifacts
       (artifact_id, project_id, organization_id, type, category, title, content, content_hash, version, status, created_by_id, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        artifactId,
        numericProjectId,
        orgId,
        'document',
        'regulatory',
        'E2E Test — 510(k) Summary',
        'Initial draft content for E2E testing.\n\nThis document serves as a test artifact for the governed workflow lifecycle.',
        contentHash,
        1,
        'draft',
        userIds.admin,
        'template-510k-summary',
      ]
    );
    const numericArtifactId = artIns.rows[0].id;
    console.log(`Created artifact: id=${numericArtifactId}, artifactId=${artifactId}`);

    // 6. Create version 1 record
    await client.query(
      `INSERT INTO concept2cure_artifact_versions
       (artifact_id, organization_id, version, content, content_hash, change_description, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        numericArtifactId,
        orgId,
        1,
        'Initial draft content for E2E testing.\n\nThis document serves as a test artifact for the governed workflow lifecycle.',
        contentHash,
        'Initial creation',
        userIds.admin,
      ]
    );
    console.log('Created version 1');

    // Output summary for E2E tests
    const summary = {
      organizationId: orgId,
      projectId: numericProjectId,
      artifactId,
      numericArtifactId,
      users: Object.fromEntries(
        USERS.map(u => [u.role, { id: userIds[u.role], email: u.email, password: u.password }])
      ),
    };

    console.log('\n=== E2E SEED DATA SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    // Write to file for E2E tests to consume
    const fs = require('fs');
    fs.writeFileSync(
      require('path').join(__dirname, 'seed-data.json'),
      JSON.stringify(summary, null, 2)
    );
    console.log('\nSeed data written to tests/e2e/seed-data.json');
  } finally {
    await client.end();
  }
}

seed().catch(e => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
