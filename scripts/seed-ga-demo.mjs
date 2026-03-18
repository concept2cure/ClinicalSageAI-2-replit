#!/usr/bin/env node
/**
 * seed-ga-demo.mjs — GA-Ready Demo Data Seeder
 *
 * Creates the full demo environment for Concept2Cure Therapeutics:
 *   - Organization with enterprise tier
 *   - Admin user (jm.smith@concept2cure.pro / pass-word)
 *   - Team members (faux)
 *   - Demo projects (IND program, 510k, clinical trial)
 *   - Demo documents (eCTD modules, regulatory submissions)
 *
 * Usage:
 *   node scripts/seed-ga-demo.mjs
 *
 * Requires DATABASE_URL or DATABASE_NEON_NEW_SECRET env var.
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// ── Database Connection ─────────────────────────────────────────────
function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(1);
  }
  let url = raw;
  if (url.startsWith('psql ')) url = url.substring(5);
  if ((url.startsWith("'") && url.endsWith("'")) || (url.startsWith('"') && url.endsWith('"'))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

const dbUrl = getDbUrl();
const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

// ── Helpers ─────────────────────────────────────────────────────────
async function upsertReturning(query, params) {
  const res = await pool.query(query, params);
  return res.rows[0];
}

// ── Main Seed Function ──────────────────────────────────────────────
async function seed() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ClinicalSageAI — GA Demo Data Seeder               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ════════════════════════════════════════════════════════════════
    // 1. ORGANIZATION — Concept2Cure Therapeutics
    // ════════════════════════════════════════════════════════════════
    console.log('[1/6] Creating organization...');

    const org = await upsertReturning(`
      INSERT INTO organizations (name, slug, domain, industry_mode, tier, status,
        max_users, max_projects, max_storage, billing_cycle, payment_status, seats_purchased)
      VALUES (
        'Concept2Cure Therapeutics', 'concept2cure', 'concept2cure.pro',
        'biotech', 'enterprise', 'active', 25, 50, 100, 'annual', 'active', 25
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        domain = EXCLUDED.domain,
        industry_mode = EXCLUDED.industry_mode,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        max_users = EXCLUDED.max_users,
        max_projects = EXCLUDED.max_projects,
        max_storage = EXCLUDED.max_storage
      RETURNING id, uuid, name
    `, []);
    console.log(`   ✓ Organization: ${org.name} (id=${org.id})`);

    // ════════════════════════════════════════════════════════════════
    // 2. ADMIN USER — jm.smith@concept2cure.pro
    // ════════════════════════════════════════════════════════════════
    console.log('[2/6] Creating admin user...');

    const adminPasswordHash = await bcrypt.hash('pass-word', 12);

    const admin = await upsertReturning(`
      INSERT INTO users (email, name, password_hash, title, department, status,
        default_organization_id, password_changed_at)
      VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $3,
        title = EXCLUDED.title,
        department = EXCLUDED.department,
        default_organization_id = $6,
        status = 'active',
        failed_login_attempts = 0,
        locked_until = NULL,
        must_change_password = FALSE
      RETURNING id, email, name
    `, [
      'jm.smith@concept2cure.pro',
      'JM Smith',
      adminPasswordHash,
      'Chief Science Officer',
      'Executive Leadership',
      org.id,
    ]);
    console.log(`   ✓ Admin: ${admin.email} (id=${admin.id})`);

    // Admin org membership
    await client.query(`
      INSERT INTO organization_users (organization_id, user_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'
    `, [org.id, admin.id]);

    // Sync to auth_users if table exists
    try {
      await client.query(`
        INSERT INTO auth_users (email, username, password_hash, is_active, email_verified)
        VALUES ($1, $2, $3, true, true)
        ON CONFLICT (email) DO UPDATE SET password_hash = $3, is_active = true
      `, ['jm.smith@concept2cure.pro', 'jmsmith', adminPasswordHash]);
      console.log('   ✓ auth_users synced');
    } catch {
      // auth_users table may not exist — that's fine
    }

    // ════════════════════════════════════════════════════════════════
    // 3. TEAM MEMBERS (faux)
    // ════════════════════════════════════════════════════════════════
    console.log('[3/6] Creating team members...');

    const teamMembers = [
      { email: 'sarah.chen@concept2cure.pro', name: 'Sarah Chen', title: 'VP Regulatory Affairs', dept: 'Regulatory', role: 'manager' },
      { email: 'raj.patel@concept2cure.pro', name: 'Raj Patel', title: 'Director, Clinical Operations', dept: 'Clinical', role: 'manager' },
      { email: 'emily.watson@concept2cure.pro', name: 'Emily Watson', title: 'Senior Medical Writer', dept: 'Medical Writing', role: 'member' },
      { email: 'david.kim@concept2cure.pro', name: 'David Kim', title: 'Quality Assurance Lead', dept: 'Quality', role: 'member' },
      { email: 'lisa.johnson@concept2cure.pro', name: 'Lisa Johnson', title: 'CMC Specialist', dept: 'CMC', role: 'member' },
      { email: 'michael.brown@concept2cure.pro', name: 'Michael Brown', title: 'Biostatistician', dept: 'Biostatistics', role: 'member' },
    ];

    // All team members get the same demo password
    const memberHash = await bcrypt.hash('demo-2026', 12);

    for (const member of teamMembers) {
      const u = await upsertReturning(`
        INSERT INTO users (email, name, password_hash, title, department, status,
          default_organization_id, password_changed_at)
        VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          title = EXCLUDED.title,
          department = EXCLUDED.department,
          default_organization_id = $6,
          status = 'active'
        RETURNING id
      `, [member.email, member.name, memberHash, member.title, member.dept, org.id]);

      await client.query(`
        INSERT INTO organization_users (organization_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3
      `, [org.id, u.id, member.role]);

      console.log(`   ✓ ${member.name} (${member.role})`);
    }

    // ════════════════════════════════════════════════════════════════
    // 4. DEMO PROJECTS
    // ════════════════════════════════════════════════════════════════
    console.log('[4/6] Creating demo projects...');

    // Check if projects table exists
    const projectsTableExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects')
    `);

    if (projectsTableExists.rows[0].exists) {
      const projects = [
        {
          name: 'C2C-001 IND Program',
          code: 'C2C-001',
          description: 'Investigational New Drug application for C2C-001 — novel small molecule targeting KRAS G12C mutation in NSCLC',
          status: 'active',
          type: 'ind',
          depth: 0,
          priority: 'high',
          progress: 42,
          riskLevel: 'medium',
        },
        {
          name: 'C2C-001 Phase I Clinical Trial',
          code: 'C2C-001-P1',
          description: 'First-in-human dose escalation study of C2C-001 in patients with KRAS G12C+ advanced solid tumors',
          status: 'active',
          type: 'clinical_trial',
          depth: 1,
          priority: 'high',
          progress: 28,
          riskLevel: 'medium',
        },
        {
          name: 'C2C-002 Pre-IND Program',
          code: 'C2C-002',
          description: 'Pre-IND development program for C2C-002 — bispecific antibody for immuno-oncology',
          status: 'draft',
          type: 'pre_ind',
          depth: 0,
          priority: 'medium',
          progress: 15,
          riskLevel: 'low',
        },
        {
          name: 'MDX-100 510(k) Submission',
          code: 'MDX-100',
          description: 'Class II 510(k) premarket notification for MDX-100 AI-assisted diagnostic imaging device',
          status: 'active',
          type: '510k',
          depth: 0,
          priority: 'high',
          progress: 65,
          riskLevel: 'high',
        },
      ];

      for (const proj of projects) {
        await client.query(`
          INSERT INTO projects (organization_id, name, code, description, status, type,
            depth, priority, progress, risk_level, created_by_id, owner_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
          ON CONFLICT DO NOTHING
        `, [org.id, proj.name, proj.code, proj.description, proj.status, proj.type,
            proj.depth, proj.priority, proj.progress, proj.riskLevel, admin.id]);
        console.log(`   ✓ Project: ${proj.name} (${proj.progress}%)`);
      }
    } else {
      console.log('   ⚠ projects table not found — skipping');
    }

    // ════════════════════════════════════════════════════════════════
    // 5. DEMO DOCUMENTS
    // ════════════════════════════════════════════════════════════════
    console.log('[5/6] Creating demo documents...');

    const docsTableExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents')
    `);

    if (docsTableExists.rows[0].exists) {
      const documents = [
        {
          title: 'C2C-001 Module 1 — Administrative & Prescribing Information',
          docType: 'ectd_module_1',
          category: 'regulatory',
          status: 'draft',
          code: 'C2C-001-M1',
          compliance: 'cfr_part_11',
        },
        {
          title: 'C2C-001 Module 2.5 — Clinical Overview',
          docType: 'ectd_module_2',
          category: 'clinical',
          status: 'in_review',
          code: 'C2C-001-M2.5',
          compliance: 'cfr_part_11',
        },
        {
          title: 'C2C-001 Module 2.7 — Clinical Summary',
          docType: 'ectd_module_2',
          category: 'clinical',
          status: 'draft',
          code: 'C2C-001-M2.7',
          compliance: 'cfr_part_11',
        },
        {
          title: 'C2C-001 Module 3 — Quality (CMC)',
          docType: 'ectd_module_3',
          category: 'cmc',
          status: 'approved',
          code: 'C2C-001-M3',
          compliance: 'gxp',
        },
        {
          title: 'C2C-001 Investigator Brochure v3.0',
          docType: 'investigator_brochure',
          category: 'clinical',
          status: 'effective',
          code: 'C2C-001-IB-v3',
          compliance: 'gxp',
        },
        {
          title: 'C2C-001 Phase I Protocol — First-in-Human',
          docType: 'clinical_protocol',
          category: 'clinical',
          status: 'approved',
          code: 'C2C-001-PROT-001',
          compliance: 'cfr_part_11',
        },
        {
          title: 'MDX-100 Predicate Device Comparison',
          docType: '510k_predicate',
          category: 'regulatory',
          status: 'in_review',
          code: 'MDX-100-PRED',
          compliance: 'standard',
        },
        {
          title: 'MDX-100 Performance Testing Report',
          docType: '510k_testing',
          category: 'quality',
          status: 'draft',
          code: 'MDX-100-PERF',
          compliance: 'gxp',
        },
        {
          title: 'Annual Product Quality Review — C2C-001 API',
          docType: 'quality_review',
          category: 'cmc',
          status: 'draft',
          code: 'C2C-001-APQR',
          compliance: 'gxp',
        },
        {
          title: 'Standard Operating Procedure — Document Control',
          docType: 'sop',
          category: 'quality',
          status: 'effective',
          code: 'SOP-DOC-001',
          compliance: 'cfr_part_11',
        },
      ];

      for (const doc of documents) {
        await client.query(`
          INSERT INTO documents (organization_id, title, document_type, category, status,
            document_code, compliance_level, owner_id, created_by_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          ON CONFLICT DO NOTHING
        `, [org.id, doc.title, doc.docType, doc.category, doc.status,
            doc.code, doc.compliance, admin.id]);
        console.log(`   ✓ Doc: ${doc.title}`);
      }
    } else {
      console.log('   ⚠ documents table not found — skipping');
    }

    // ════════════════════════════════════════════════════════════════
    // 6. AUDIT TRAIL ENTRIES
    // ════════════════════════════════════════════════════════════════
    console.log('[6/6] Creating audit trail entries...');

    const auditTableExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auth_audit_log')
    `);

    if (auditTableExists.rows[0].exists) {
      const auditEntries = [
        { event: 'login_success', email: 'jm.smith@concept2cure.pro', success: true },
        { event: 'user_created', email: 'sarah.chen@concept2cure.pro', success: true },
        { event: 'user_created', email: 'raj.patel@concept2cure.pro', success: true },
        { event: 'password_changed', email: 'jm.smith@concept2cure.pro', success: true },
      ];

      for (const entry of auditEntries) {
        await client.query(`
          INSERT INTO auth_audit_log (event_type, email, success, ip_address, user_agent, organization_id, created_at)
          VALUES ($1, $2, $3, '10.0.0.1', 'ClinicalSageAI/GA-Seed', $4, NOW() - interval '1 day' * (random() * 30)::int)
        `, [entry.event, entry.email, entry.success, org.id]);
      }
      console.log('   ✓ Audit trail seeded');
    } else {
      console.log('   ⚠ auth_audit_log table not found — skipping');
    }

    await client.query('COMMIT');

    // ── Summary ───────────────────────────────────────────────────
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  GA DEMO DATA SEEDED SUCCESSFULLY                   ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║                                                      ║');
    console.log('║  Organization: Concept2Cure Therapeutics              ║');
    console.log('║  Tier:         Enterprise                            ║');
    console.log('║  Industry:     Biotech                               ║');
    console.log('║                                                      ║');
    console.log('║  ── LOGIN CREDENTIALS ──                             ║');
    console.log('║  Email:    jm.smith@concept2cure.pro                 ║');
    console.log('║  Password: pass-word                                 ║');
    console.log('║  Role:     Admin (CSO)                               ║');
    console.log('║                                                      ║');
    console.log('║  ── TEAM (all use password: demo-2026) ──            ║');
    console.log('║  sarah.chen@concept2cure.pro    (VP Reg Affairs)     ║');
    console.log('║  raj.patel@concept2cure.pro     (Dir Clinical Ops)   ║');
    console.log('║  emily.watson@concept2cure.pro  (Sr Medical Writer)  ║');
    console.log('║  david.kim@concept2cure.pro     (QA Lead)            ║');
    console.log('║  lisa.johnson@concept2cure.pro  (CMC Specialist)     ║');
    console.log('║  michael.brown@concept2cure.pro (Biostatistician)    ║');
    console.log('║                                                      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
