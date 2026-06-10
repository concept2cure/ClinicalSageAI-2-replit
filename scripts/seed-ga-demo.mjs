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

// ── Safety + modes ──────────────────────────────────────────────────
// Refuse to mutate a production database; support a non-mutating verify pass.
const VERIFY_ONLY = process.argv.includes('--verify');
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run seed-ga-demo in production (NODE_ENV=production).');
  process.exit(1);
}

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
  console.log('║  Concept2Cure.RI — GA Demo Data Seeder               ║');
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
          VALUES ($1, $2, $3, '10.0.0.1', 'Concept2Cure.RI/GA-Seed', $4, NOW() - interval '1 day' * (random() * 30)::int)
        `, [entry.event, entry.email, entry.success, org.id]);
      }
      console.log('   ✓ Audit trail seeded');
    } else {
      console.log('   ⚠ auth_audit_log table not found — skipping');
    }

    // ════════════════════════════════════════════════════════════════
    // 7. SUBMISSION CORE + EVIDENCE GRAPH (Phase 1)
    // ════════════════════════════════════════════════════════════════
    // RECONCILE: the work order referenced 3 demo orgs (PharmaCorp/Biotech/CRO)
    // and a `documents` table; this script seeds a single org (Concept2Cure) and
    // the canonical eCTD doc table is `coauthor_documents`. We seed submission
    // core + evidence demo data against THIS org and table. Idempotent via
    // existence checks (these tables have no natural unique key for ON CONFLICT).
    console.log('[7/7] Creating submission core + evidence demo data...');

    const subCoreExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'submissions')
        AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coauthor_documents') AS ok
    `);

    if (subCoreExists.rows[0].ok) {
      // Insert-if-absent helper keyed on a stable selector; returns the row id.
      const ensureRow = async (selectSql, selectParams, insertSql, insertParams) => {
        const found = await client.query(selectSql, selectParams);
        if (found.rows[0]) return found.rows[0].id;
        const ins = await client.query(insertSql, insertParams);
        return ins.rows[0].id;
      };

      // ── Canonical documents (coauthor_documents) ──
      const ensureDoc = (title, moduleNumber) =>
        ensureRow(
          `SELECT id FROM coauthor_documents WHERE organization_id = $1 AND title = $2 LIMIT 1`,
          [org.id, title],
          `INSERT INTO coauthor_documents (organization_id, title, content, status, created_by, module_number)
             VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
          [org.id, title, `<p>${title}</p>`, String(admin.id), moduleNumber]
        );

      const docOverview = await ensureDoc('C2C-001 Clinical Overview (source)', '2.5');
      const docSummary = await ensureDoc('C2C-001 Clinical Summary (source)', '2.7');
      const docQuality = await ensureDoc('C2C-001 Quality Overall Summary (source)', '2.3');

      // ── Submissions ──
      const ensureSubmission = (title, applicationType, clientType, primaryRegion, lifecycleStage) =>
        ensureRow(
          `SELECT id FROM submissions WHERE organization_id = $1 AND title = $2 AND deleted_at IS NULL LIMIT 1`,
          [org.id, title],
          `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region,
              status, lifecycle_stage, organization_id, created_by)
             VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8) RETURNING id`,
          [title, 'C2C-001', applicationType, clientType, primaryRegion, lifecycleStage, org.id, admin.id]
        );

      const sub1 = await ensureSubmission('C2C-001 IND (FDA)', 'ind', 'biotech', 'fda', 'original');
      const sub2 = await ensureSubmission('MDX-100 510(k) (FDA)', '510k', 'mdx', 'fda', 'planning');

      // ── Submission regions ──
      const ensureRegion = (submissionId, region, pathway) =>
        ensureRow(
          `SELECT id FROM submission_regions WHERE submission_id = $1 AND region = $2 LIMIT 1`,
          [submissionId, region],
          `INSERT INTO submission_regions (submission_id, region, pathway, organization_id, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [submissionId, region, pathway, org.id, admin.id]
        );
      await ensureRegion(sub1, 'fda', 'ectd_v322');
      await ensureRegion(sub2, 'fda', 'estar');

      // ── eCTD sequences (original 0000 each) ──
      const ensureSequence = (submissionId, region) =>
        ensureRow(
          `SELECT id FROM ectd_sequences WHERE submission_id = $1 AND region = $2 AND sequence_number = '0000' LIMIT 1`,
          [submissionId, region],
          `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
             VALUES ($1, $2, '0000', 'original', 'draft', $3, $4) RETURNING id`,
          [submissionId, region, org.id, admin.id]
        );
      const seq1 = await ensureSequence(sub1, 'fda');
      const seq2 = await ensureSequence(sub2, 'fda');

      // ── Submission leaves (doc -> CTD leaf, polymorphic ref to coauthor_documents) ──
      const ensureLeaf = (sequenceId, sectionCode, title, documentId) =>
        ensureRow(
          `SELECT id FROM submission_leaves WHERE sequence_id = $1 AND section_code = $2 AND deleted_at IS NULL LIMIT 1`,
          [sequenceId, sectionCode],
          `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op,
              document_table, document_id, organization_id, created_by)
             VALUES ($1, $2, $3, 'new', 'coauthor_documents', $4, $5, $6) RETURNING id`,
          [sequenceId, sectionCode, title, documentId, org.id, admin.id]
        );
      await ensureLeaf(seq1, '2.3', 'Quality Overall Summary', docQuality);
      await ensureLeaf(seq1, '2.5', 'Clinical Overview', docOverview);
      await ensureLeaf(seq1, '2.7', 'Clinical Summary', docSummary);
      await ensureLeaf(seq2, 'm1.us.cover', 'eSTAR Cover', null);

      // ── Evidence links (provenance: section derives_from source doc) ──
      const ensureLink = (submissionId, sectionCode, documentId, confidence) =>
        ensureRow(
          `SELECT id FROM submission_evidence_links WHERE submission_id = $1 AND target_section_code = $2
             AND source_document_id = $3 AND deleted_at IS NULL LIMIT 1`,
          [submissionId, sectionCode, documentId],
          `INSERT INTO submission_evidence_links (submission_id, target_section_code, source_document_table,
              source_document_id, source_locator, direction, confidence, organization_id, created_by)
             VALUES ($1, $2, 'coauthor_documents', $3, $4, 'derives_from', $5, $6, $7) RETURNING id`,
          [submissionId, sectionCode, documentId, 'seeded provenance', confidence, org.id, admin.id]
        );
      await ensureLink(sub1, '2.5', docOverview, 0.9);
      await ensureLink(sub1, '2.7', docSummary, 0.85);
      await ensureLink(sub1, '2.3', docQuality, 0.8);

      console.log('   ✓ Submission core + evidence graph seeded');

      // ── Shadow Review demo (the moat) ──
      const shadowExists = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shadow_review_runs') AS ok`
      );
      if (shadowExists.rows[0].ok) {
        const runId = await ensureRow(
          `SELECT id FROM shadow_review_runs WHERE sequence_id = $1 AND lens = 'fda_filing' AND deleted_at IS NULL LIMIT 1`,
          [seq1],
          `INSERT INTO shadow_review_runs (sequence_id, region, lens, model, prompt_version, status,
              rtf_risk_score, crl_risk_score, summary, organization_id, created_by)
             VALUES ($1, 'fda', 'fda_filing', 'claude', 'shadow-review@v1.0', 'complete', $2, $3, $4, $5, $6) RETURNING id`,
          [seq1, 0.18, 0.31, 'Two filing-readiness gaps and one benefit-risk weakness to resolve before submission.', org.id, admin.id]
        );
        const ensureFinding = (dimension, severity, title, basis, recommendation, leafRef) =>
          ensureRow(
            `SELECT id FROM shadow_review_findings WHERE run_id = $1 AND title = $2 AND deleted_at IS NULL LIMIT 1`,
            [runId, title],
            `INSERT INTO shadow_review_findings (run_id, dimension, severity, title, detail, basis, recommendation, leaf_ref, status, organization_id, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10) RETURNING id`,
            [runId, dimension, severity, title, title, basis, recommendation, leafRef, org.id, admin.id]
          );
        await ensureFinding('rtf', 'major', 'Form 1571 is not signed', '21 CFR 312.23(a)(1)', 'Attach the signed Form 1571 under Module 1 (US).', 'm1.us');
        await ensureFinding('crl', 'major', 'Benefit-risk integration is thin in 2.5', 'ICH M4E(R2)', 'Strengthen the integrated benefit-risk in the Clinical Overview.', '2.5');
        await ensureFinding('format', 'minor', 'One leaf is missing an MD5 checksum', 'eCTD validation criteria', 'Recompute the MD5 for the affected leaf before packaging.', '3.2.S');
        console.log('   ✓ Shadow review demo seeded');
      }

      // ── Consistency findings demo (Truth Engine) ──
      const consExists = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consistency_findings') AS ok`
      );
      if (consExists.rows[0].ok) {
        const ensureCons = (dimension, leftRef, rightRef, status, detail) =>
          ensureRow(
            `SELECT id FROM consistency_findings WHERE submission_id = $1 AND dimension = $2 AND left_ref = $3 AND right_ref = $4 AND deleted_at IS NULL LIMIT 1`,
            [sub1, dimension, leftRef, rightRef],
            `INSERT INTO consistency_findings (submission_id, dimension, left_ref, right_ref, status, detail, organization_id, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [sub1, dimension, leftRef, rightRef, status, detail, org.id, admin.id]
          );
        await ensureCons('subject-counts', '2.7.3', '5.3.5.1', 'match', null);
        await ensureCons('spec-vs-qos', '2.3', '3.2.S.4.1', 'conflict', 'Assay limit in the 2.3 QOS (98.0%) does not match the Module 3 specification (98.5%).');
        console.log('   ✓ Consistency findings demo seeded');
      }
    } else {
      console.log('   ⚠ submissions/coauthor_documents not found — run drizzle-kit push first, skipping');
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

// ── Verify (non-mutating) ───────────────────────────────────────────
// Asserts the Phase-1 submission core + evidence demo data is present for the
// seeded org. Exits non-zero if any threshold is unmet.
async function verify() {
  console.log('Verifying submission core + evidence demo data...');
  const client = await pool.connect();
  try {
    const orgRes = await client.query(`SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`);
    const orgId = orgRes.rows[0]?.id;
    if (!orgId) {
      console.error('✗ Org "concept2cure" not found — run the seed first.');
      process.exit(1);
    }
    const counts = {};
    for (const table of ['submissions', 'ectd_sequences', 'submission_leaves', 'submission_evidence_links']) {
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = $1`,
        [orgId]
      );
      counts[table] = r.rows[0].n;
    }
    const thresholds = { submissions: 2, ectd_sequences: 2, submission_leaves: 3, evidence_links: 3 };
    let ok = true;
    for (const [table, min] of Object.entries(thresholds)) {
      const pass = counts[table] >= min;
      ok = ok && pass;
      console.log(`   ${pass ? '✓' : '✗'} ${table}: ${counts[table]} (need >= ${min})`);
    }
    if (!ok) {
      console.error('✗ Verification failed.');
      process.exit(1);
    }
    console.log('✓ Verification passed.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (VERIFY_ONLY) {
  verify().catch(() => process.exit(1));
} else {
  seed().catch(() => process.exit(1));
}
