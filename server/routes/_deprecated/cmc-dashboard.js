import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Utility function for database queries
async function query(text, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
}

// Readiness score calculation
function calculateReadinessScore(params) {
  const W_ERROR = 2.5;
  const W_WARN = 1.0;
  const W_OVERDUE = 3.0;
  const W_RISK = 2.0;

  const penalty =
    params.errors * W_ERROR +
    params.warnings * W_WARN +
    params.overdueCriticalPath * W_OVERDUE +
    params.highRisks * W_RISK;

  const raw = 100 - Math.min(100, penalty);
  return Math.max(0, Math.round(raw));
}

// AI Insights generation
function deriveInsights(issues, stages, dosageForm) {
  const insights = [];

  const hasShelfLifeError = issues.some(i => i.rule_id === 'P8-003' && i.severity === 'ERROR');
  if (hasShelfLifeError) {
    insights.push({
      id: 'i1',
      text: 'Shelf-life claim likely fails review due to insufficient long-term data.',
      why: 'Rule P8-003',
      action: 'Lower claim or add Q1E projection + commitment.',
      ownerSuggestion: 'Reg CMC',
    });
  }

  const needsMicro = issues.some(i => i.rule_id === 'P5-007');
  if (needsMicro && dosageForm && !/sterile/i.test(dosageForm)) {
    insights.push({
      id: 'i2',
      text: 'Spec table lacks microbial quality row for non-sterile dosage form.',
      why: 'Rule P5-007',
      action: 'Insert TAMC/TYMC + specified organisms with USP <61>/<62>.',
      ownerSuggestion: 'QA Micro',
    });
  }

  const mv = stages.find(s => /Method Validation/i.test(s.name));
  if (mv && mv.progress < 90) {
    insights.push({
      id: 'i3',
      text: 'Method validation sign-off is lagging and may block spec approval.',
      why: 'Stage gate under 90% progress.',
      action: 'Prioritize validation summary approvals and link methods to spec rows.',
      ownerSuggestion: 'Analytical Lead',
    });
  }

  return insights;
}

// Routes
const PROD = 'DP-001'; // Product ID

// Dashboard summary endpoint
router.get('/dashboard/summary', async (req, res) => {
  try {
    // Initialize tables if they don't exist
    await initializeTables();

    const [errQ, warnQ, overdueQ, riskQ, tasks7Q] = await Promise.all([
      query(
        "SELECT COUNT(*)::int AS c FROM cmc_validation_issues WHERE product_id=$1 AND status='OPEN' AND severity='ERROR'",
        [PROD]
      ),
      query(
        "SELECT COUNT(*)::int AS c FROM cmc_validation_issues WHERE product_id=$1 AND status='OPEN' AND severity='WARNING'",
        [PROD]
      ),
      query(
        "SELECT COUNT(*)::int AS c FROM cmc_stage_gates WHERE product_id=$1 AND status!='APPROVED' AND due_date < NOW()",
        [PROD]
      ),
      query(
        "SELECT COUNT(*)::int AS c FROM cmc_risks WHERE product_id=$1 AND status='OPEN' AND impact='HIGH'",
        [PROD]
      ),
      query(
        "SELECT COUNT(*)::int AS c FROM cmc_tasks WHERE product_id=$1 AND status!='DONE' AND due_date <= (NOW() + INTERVAL '7 day')",
        [PROD]
      ),
    ]);

    // Methods validated percentage
    let methodsValidatedPct = 85;
    try {
      const { rows: mv } = await query(
        "SELECT COUNT(*)::int AS total, SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END)::int AS approved FROM cmc_methods WHERE product_id=$1",
        [PROD]
      );
      if (mv[0]?.total > 0) {
        methodsValidatedPct = Math.round((mv[0].approved / mv[0].total) * 100);
      }
    } catch (e) {
      console.log('Methods table not initialized yet');
    }

    const errors = errQ.rows[0]?.c || 0;
    const warnings = warnQ.rows[0]?.c || 0;
    const overdueCriticalPath = overdueQ.rows[0]?.c || 0;
    const highRisks = riskQ.rows[0]?.c || 0;

    const submissionReadiness = calculateReadinessScore({
      errors,
      warnings,
      overdueCriticalPath,
      highRisks,
    });

    // Change controls count
    const { rows: ccRows } = await query(
      "SELECT COUNT(*)::int AS c FROM cmc_tasks WHERE product_id=$1 AND status!='DONE' AND LOWER(title) LIKE '%change%'",
      [PROD]
    );

    const payload = {
      submissionReadiness,
      openValidationIssues: errors + warnings,
      tasksDue7d: tasks7Q.rows[0]?.c || 0,
      changeControlsOpen: ccRows[0]?.c || 0,
      qualityScore: Math.max(60, +(100 - errors * 0.6 - warnings * 0.2).toFixed(1)),
      methodsValidatedPct,
    };

    res.json(payload);
  } catch (e) {
    console.error('Dashboard summary error:', e);
    // Fallback data
    res.json({
      submissionReadiness: 86,
      openValidationIssues: 18,
      tasksDue7d: 7,
      changeControlsOpen: 3,
      qualityScore: 98.7,
      methodsValidatedPct: 85,
    });
  }
});

// Stage gates endpoint
router.get('/stage-gates', async (req, res) => {
  try {
    await initializeTables();
    const { rows } = await query(
      'SELECT id, name, owner, status, start_date AS start, due_date AS due, progress FROM cmc_stage_gates WHERE product_id=$1 ORDER BY start_date ASC',
      [PROD]
    );
    res.json(rows);
  } catch (e) {
    console.error('Stage gates error:', e);
    res.json([]);
  }
});

// Tasks endpoint
router.get('/tasks', async (req, res) => {
  const assignee = req.query.assignee;
  try {
    await initializeTables();
    let sql =
      'SELECT id, title, section, owner, role, priority, status, due_date AS due, why, link FROM cmc_tasks WHERE product_id=$1';
    const params = [PROD];

    if (assignee === 'me') {
      sql += ' AND owner ILIKE $2';
      params.push('%You%');
    }

    sql += " ORDER BY COALESCE(due_date, NOW() + INTERVAL '5 year') ASC";
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('Tasks error:', e);
    res.json([]);
  }
});

// Validation issues endpoint
router.get('/validation/issues', async (req, res) => {
  try {
    await initializeTables();
    const { rows } = await query(
      "SELECT id, section, rule_id, severity, title, owner, created_at FROM cmc_validation_issues WHERE product_id=$1 AND status='OPEN' ORDER BY created_at DESC",
      [PROD]
    );
    res.json(rows);
  } catch (e) {
    console.error('Validation issues error:', e);
    res.json([]);
  }
});

// Risks endpoint
router.get('/risks', async (req, res) => {
  try {
    await initializeTables();
    const { rows } = await query(
      'SELECT id, title, owner, impact, probability, mitigation, status FROM cmc_risks WHERE product_id=$1 ORDER BY created_at DESC',
      [PROD]
    );
    res.json(rows);
  } catch (e) {
    console.error('Risks error:', e);
    res.json([]);
  }
});

// AI insights endpoint
router.get('/ai/insights', async (req, res) => {
  try {
    await initializeTables();
    const [{ rows: issues }, { rows: stages }] = await Promise.all([
      query(
        "SELECT section, rule_id, severity FROM cmc_validation_issues WHERE product_id=$1 AND status='OPEN'",
        [PROD]
      ),
      query('SELECT name, status, progress FROM cmc_stage_gates WHERE product_id=$1', [PROD]),
    ]);

    const dosageForm = 'Film-coated tablet';
    const insights = deriveInsights(issues, stages, dosageForm);
    res.json(insights);
  } catch (e) {
    console.error('AI insights error:', e);
    res.json([]);
  }
});

// Initialize database tables
async function initializeTables() {
  try {
    // Create extension if not exists
    await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // Create tables
    await query(`
      CREATE TABLE IF NOT EXISTS cmc_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        section TEXT,
        title TEXT NOT NULL,
        why TEXT,
        owner TEXT NOT NULL,
        role TEXT,
        priority TEXT CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')) NOT NULL,
        status TEXT CHECK (status IN ('OPEN','IN_REVIEW','BLOCKED','DONE')) NOT NULL DEFAULT 'OPEN',
        due_date TIMESTAMPTZ,
        link TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cmc_stage_gates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        status TEXT CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','READY_FOR_QA','APPROVED')) NOT NULL,
        start_date DATE,
        due_date DATE,
        progress INT CHECK (progress BETWEEN 0 AND 100) DEFAULT 0
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cmc_validation_issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        section TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        severity TEXT CHECK (severity IN ('INFO','WARNING','ERROR')) NOT NULL,
        title TEXT NOT NULL,
        owner TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT CHECK (status IN ('OPEN','WAIVED','CLOSED')) NOT NULL DEFAULT 'OPEN'
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cmc_risks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        title TEXT NOT NULL,
        owner TEXT NOT NULL,
        impact TEXT CHECK (impact IN ('LOW','MEDIUM','HIGH')) NOT NULL,
        probability TEXT CHECK (probability IN ('LOW','MEDIUM','HIGH')) NOT NULL,
        mitigation TEXT,
        status TEXT CHECK (status IN ('OPEN','MONITOR','CLOSED')) NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cmc_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT CHECK (status IN ('DRAFT','IN_VALIDATION','APPROVED')) NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes
    await query(
      'CREATE INDEX IF NOT EXISTS idx_cmc_tasks_prod_due ON cmc_tasks(product_id, due_date)'
    );
    await query(
      'CREATE INDEX IF NOT EXISTS idx_cmc_issues_prod_sev ON cmc_validation_issues(product_id, severity)'
    );
    await query(
      'CREATE INDEX IF NOT EXISTS idx_cmc_stage_prod_due ON cmc_stage_gates(product_id, due_date)'
    );

    // Seed data if tables are empty
    const { rows: stageCount } = await query(
      'SELECT COUNT(*) FROM cmc_stage_gates WHERE product_id = $1',
      [PROD]
    );
    if (stageCount[0].count == 0) {
      await seedData();
    }
  } catch (e) {
    console.error('Error initializing tables:', e);
  }
}

// Seed initial data
async function seedData() {
  try {
    // Insert stage gates
    await query(`
      INSERT INTO cmc_stage_gates (product_id, name, owner, status, start_date, due_date, progress) VALUES
      ('DP-001','Formulation Development','Dr. Patel','APPROVED','2025-06-01','2025-06-20',100),
      ('DP-001','Method Validation','Dr. Johnson','READY_FOR_QA','2025-06-15','2025-07-10',92),
      ('DP-001','Stability Studies','A. Rivera','IN_PROGRESS','2025-06-10','2025-09-10',60),
      ('DP-001','Specs Finalization (3.2.P.5)','K. Lee','IN_PROGRESS','2025-07-05','2025-08-22',45),
      ('DP-001','Module 3 Authoring','M. Nguyen','IN_PROGRESS','2025-07-20','2025-09-01',50),
      ('DP-001','QA Review & Sign-off','QA Team','NOT_STARTED','2025-08-25','2025-09-05',0),
      ('DP-001','Regulatory Approval','Reg CMC','NOT_STARTED','2025-09-06','2025-09-15',0)
    `);

    // Insert tasks
    await query(`
      INSERT INTO cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link) VALUES
      ('DP-001','3.2.P.5','Add microbial limits to 3.2.P.5','Rule P5-007 (non-sterile).','You','Reg Writer','HIGH','OPEN','2025-08-22','/authoring/documents/DP-001/sections/3.2.P.5'),
      ('DP-001','3.2.P.8','Attach Q1E trend analysis','Rule P8-008 requires stats model.','You','CMC Analyst','MEDIUM','IN_REVIEW','2025-08-19','/authoring/documents/DP-001/sections/3.2.P.8'),
      ('DP-001','3.2.P.7','Update CCS description to match stability','X-005 mismatch flagged.','You','Reg Writer','CRITICAL','OPEN','2025-08-17','/authoring/documents/DP-001/sections/3.2.P.7')
    `);

    // Insert validation issues
    await query(`
      INSERT INTO cmc_validation_issues (product_id, section, rule_id, severity, title, owner) VALUES
      ('DP-001','3.2.P.5','P5-001','ERROR','Missing justification on Assay limit','K. Lee'),
      ('DP-001','3.2.P.8','P8-003','ERROR','Shelf-life exceeds supported data','A. Rivera'),
      ('DP-001','3.2.P.5','P5-007','WARNING','Microbiological quality not specified','You'),
      ('DP-001','3.2.P.8','P8-008','WARNING','Trend analysis methodology not attached','You')
    `);

    // Insert risks
    await query(`
      INSERT INTO cmc_risks (product_id, title, owner, impact, probability, mitigation, status) VALUES
      ('DP-001','Dissolution method re-validation may be required','Dr. Johnson','HIGH','MEDIUM','Parallel verification with compendial ref.','OPEN'),
      ('DP-001','API lot #102 short expiry for stability extension','Supply Chain','MEDIUM','HIGH','Source additional API; extend retest if justified.','MONITOR')
    `);

    // Insert methods
    await query(`
      INSERT INTO cmc_methods (product_id, name, status) VALUES
      ('DP-001','Assay (HPLC)','APPROVED'),
      ('DP-001','Related Substances (UPLC)','APPROVED'),
      ('DP-001','Dissolution (USP Apparatus 2)','IN_VALIDATION'),
      ('DP-001','Water Content (KF)','APPROVED'),
      ('DP-001','Identification (IR)','APPROVED'),
      ('DP-001','Microbial Quality (USP <61>/<62>)','IN_VALIDATION')
    `);

    console.log('CMC Dashboard data seeded successfully');
  } catch (e) {
    console.error('Error seeding data:', e);
  }
}

export default router;
