import express from 'express';
import pool from '../db/database.js';

const router = express.Router();

const PROD = 'DP-001';

function impactToPriority(impact) {
  if (!impact) return 'MEDIUM';
  const m = impact.toUpperCase();
  if (m === 'HIGH') return 'HIGH';
  if (m === 'LOW') return 'LOW';
  return 'MEDIUM';
}

// Initialize database with sample data if empty
const initializeSampleData = async () => {
  try {
    const productId = 'DP-001'; // Default product

    // Check if data already exists
    const checkQuery = 'SELECT COUNT(*) as count FROM cmc_tasks WHERE product_id = $1';
    const checkResult = await pool.query(checkQuery, ['DP-001']);

    if (parseInt(checkResult.rows[0].count) === 0) {
      // Insert sample tasks
      const sampleTasks = [
        [
          'Add microbial limits to 3.2.P.5',
          '3.2.P.5',
          'HIGH',
          'You',
          '2024-08-22',
          'Rule P5-007 (non-sterile).',
        ],
        [
          'Attach Q1E trend analysis',
          '3.2.P.8',
          'MEDIUM',
          'You',
          '2024-08-19',
          'Rule P8-008 requires stats model.',
        ],
        [
          'Update CCS description to match stability',
          '3.2.P.7',
          'CRITICAL',
          'You',
          '2024-08-17',
          'X-005 mismatch flagged.',
        ],
      ];

      for (const task of sampleTasks) {
        await pool.query(
          `
          INSERT INTO cmc_tasks 
          (product_id, title, section, priority, owner, due, why) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          ['DP-001', ...task]
        );
      }

      // Insert sample risks
      const sampleRisks = [
        [
          'Dissolution method re-validation may be required',
          'HIGH',
          'MEDIUM',
          'Parallel verification with compendial ref.',
          'Dr. Johnson',
          'OPEN',
        ],
        [
          'API lot #102 short expiry for stability extension',
          'MEDIUM',
          'HIGH',
          'Source additional API; extend retest if justified.',
          'Supply Chain',
          'MONITOR',
        ],
      ];

      for (const risk of sampleRisks) {
        await pool.query(
          `
          INSERT INTO cmc_risks 
          (product_id, title, impact, probability, mitigation, owner, status) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          ['DP-001', ...risk]
        );
      }

      console.log(
        '✅ Sample dashboard data initialized (risks and tasks only - validation tables may not exist)'
      );

      console.log('✅ Sample dashboard data initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing sample data:', error);
  }
};

// Initialize on startup
initializeSampleData();

// POST /api/cmc/risks/:id/convert-to-task - DATABASE INTEGRATED with VALIDATION
router.post('/risks/:id/convert-to-task', async (req, res) => {
  const { id } = req.params;
  const { dueDays, owner: ownerBody, priority } = req.body || {};
  const productId = req.headers['x-product-id'] || 'DP-001';
  const currentUser = req.headers['x-user-name'] || 'Current User';

  try {
    // Enhanced validation
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Risk ID is required' });
    }

    // Validate due days
    const validDueDays = dueDays ? parseInt(dueDays) : 7;
    if (validDueDays < 1 || validDueDays > 365) {
      return res.status(400).json({
        error: 'Due days must be between 1 and 365',
      });
    }

    // Validate priority
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        error: `Priority must be one of: ${validPriorities.join(', ')}`,
      });
    }

    // First, get the risk from database
    const riskQuery = `
      SELECT id, title, impact, probability, mitigation, owner, status 
      FROM cmc_risks 
      WHERE id = $1 AND product_id = $2
    `;

    const riskResult = await pool.query(riskQuery, [id, productId]);

    if (riskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const risk = riskResult.rows[0];

    if (risk.status === 'CLOSED') {
      return res.status(400).json({
        error: 'Cannot convert closed risk to task',
      });
    }

    const due = new Date(Date.now() + validDueDays * 24 * 60 * 60 * 1000);
    const owner = ownerBody || risk.owner || 'Unassigned';
    const pri = priority || impactToPriority(risk.impact) || 'MEDIUM';
    const why = risk.mitigation ? `Risk mitigation: ${risk.mitigation}` : 'Converted from risk';

    // Insert new task into database
    const insertTaskQuery = `
      INSERT INTO cmc_tasks (
        product_id, title, section, priority, owner, due, why
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, section, priority, owner, due, why
    `;

    const taskValues = [productId, risk.title, 'Risk Management', pri, owner, due, why];

    const taskResult = await pool.query(insertTaskQuery, taskValues);
    const newTask = taskResult.rows[0];

    // Update risk status to MONITOR in database
    const updateRiskQuery = `
      UPDATE cmc_risks 
      SET status = 'MONITOR'
      WHERE id = $1 AND product_id = $2
      RETURNING id, status
    `;

    await pool.query(updateRiskQuery, [id, productId]);

    const responseTask = {
      id: newTask.id,
      title: newTask.title,
      section: newTask.section,
      priority: newTask.priority,
      owner: newTask.owner,
      status: 'OPEN',
      due: newTask.due.toISOString().split('T')[0],
      dueDate: newTask.due.toISOString().split('T')[0],
      why: newTask.why,
      role: 'Risk Analyst',
      link: null,
    };

    console.log('✅ Risk converted to task in database:', newTask.id);
    res.json(responseTask);
  } catch (e) {
    console.error('❌ Error converting risk to task:', e);
    res.status(500).json({
      error: 'Failed to convert risk',
      details: e.message,
    });
  }
});

// POST /api/cmc/tasks/:id/assign - DATABASE INTEGRATED
router.post('/tasks/:id/assign', async (req, res) => {
  const { id } = req.params;
  const organizationId = req.headers['x-tenant-id'] || '7';
  const owner = req.body?.owner || req.headers['x-user-name'] || 'You';
  const currentUser = req.headers['x-user-name'] || 'Current User';

  try {
    // Enhanced validation
    if (!owner || owner.trim() === '') {
      return res.status(400).json({ error: 'Owner is required' });
    }

    const updateQuery = `
      UPDATE cmc_tasks 
      SET owner = $3, updated_at = NOW(), updated_by = $4
      WHERE id = $1 AND organization_id = $2
      RETURNING id, title, section, priority, owner, status, due_date, description
    `;

    const result = await pool.query(updateQuery, [
      id,
      parseInt(organizationId),
      owner,
      currentUser,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = result.rows[0];

    const responseTask = {
      id: task.id,
      title: task.title,
      section: task.section,
      priority: task.priority,
      owner: task.owner,
      status: task.status,
      due: task.due_date ? task.due_date.toISOString().split('T')[0] : null,
      dueDate: task.due_date ? task.due_date.toISOString().split('T')[0] : null,
      why: task.description,
      role: 'CMC Analyst',
    };

    console.log('✅ Task assigned in database:', task.id, 'to', owner);
    res.json(responseTask);
  } catch (e) {
    console.error('❌ Error assigning task:', e);
    res.status(500).json({
      error: 'Failed to assign task',
      details: e.message,
    });
  }
});

// POST /api/cmc/tasks/:id/toggle-assign - DATABASE INTEGRATED with VALIDATION
router.post('/tasks/:id/toggle-assign', async (req, res) => {
  const { id } = req.params;
  const productId = req.headers['x-product-id'] || 'DP-001';
  const currentUser = req.headers['x-user-name'] || 'You';

  try {
    // Enhanced validation
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    // Get current task from database
    const getTaskQuery = `
      SELECT id, title, section, priority, owner, due, why
      FROM cmc_tasks 
      WHERE id = $1 AND product_id = $2
    `;

    const taskResult = await pool.query(getTaskQuery, [id, productId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Tasks don't have status column in the current schema, so skip this check

    // Determine next owner using same logic as before
    const currentOwner = task.owner;
    const nextOwner =
      currentOwner && currentOwner !== 'Unassigned' && currentOwner !== currentUser
        ? currentUser
        : currentOwner === currentUser
          ? 'Unassigned'
          : currentUser;

    // Update task assignment in database
    const updateQuery = `
      UPDATE cmc_tasks 
      SET owner = $3
      WHERE id = $1 AND product_id = $2
      RETURNING id, title, section, priority, owner, due, why
    `;

    const updateResult = await pool.query(updateQuery, [id, productId, nextOwner]);

    const updatedTask = updateResult.rows[0];

    const responseTask = {
      id: updatedTask.id,
      title: updatedTask.title,
      section: updatedTask.section,
      priority: updatedTask.priority,
      owner: updatedTask.owner,
      status: 'OPEN',
      due: updatedTask.due ? updatedTask.due.toISOString().split('T')[0] : null,
      dueDate: updatedTask.due ? updatedTask.due.toISOString().split('T')[0] : null,
      why: updatedTask.why,
      role: 'CMC Analyst',
      link: null,
    };

    console.log('✅ Task assignment toggled in database:', updatedTask.id, 'to', nextOwner);
    res.json(responseTask);
  } catch (e) {
    console.error('❌ Error toggling task assignment:', e);
    res.status(500).json({
      error: 'Failed to toggle assignment',
      details: e.message,
    });
  }
});

// GET /api/cmc/tasks - DATABASE INTEGRATED with FILTERING
router.get('/tasks', async (req, res) => {
  try {
    const productId = req.headers['x-product-id'] || 'DP-001';
    const currentUser = req.headers['x-user-name'] || 'You';
    const { assignee, priority, limit } = req.query;

    // Build dynamic query with filtering
    let query = `
      SELECT id, title, section, priority, owner, 
             due, why, link, created_at
      FROM cmc_tasks 
      WHERE product_id = $1
    `;

    const params = [productId];
    let paramIndex = 2;

    // Add filters
    if (assignee === 'me') {
      query += ` AND owner = $${paramIndex}`;
      params.push(currentUser);
      paramIndex++;
    } else if (assignee && assignee !== 'all') {
      query += ` AND owner = $${paramIndex}`;
      params.push(assignee);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      query += ` AND priority = $${paramIndex}`;
      params.push(priority.toUpperCase());
      paramIndex++;
    }

    // Add ordering and optional limit
    query += ` ORDER BY 
      CASE priority 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        WHEN 'LOW' THEN 4 
      END, 
      due_date ASC NULLS LAST, 
      created_at DESC
    `;

    if (limit && parseInt(limit) > 0) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(query, params);

    // Transform database results to match expected format
    const tasks = result.rows.map(task => ({
      id: task.id,
      title: task.title,
      section: task.section || 'General',
      priority: task.priority,
      owner: task.owner,
      status: 'OPEN', // Default status since table may not have this column
      due: task.due ? task.due.toISOString().split('T')[0] : null,
      dueDate: task.due ? task.due.toISOString().split('T')[0] : null,
      why: task.why,
      role: 'CMC Analyst',
      link: task.link,
    }));

    console.log(`✅ Retrieved ${tasks.length} tasks from database for product ${productId}`);
    res.json(tasks);
  } catch (error) {
    console.error('❌ Error fetching tasks:', error);
    res.status(500).json({
      error: 'Failed to fetch tasks',
      details: error.message,
    });
  }
});

// GET /api/cmc/risks - DATABASE INTEGRATED with FILTERING
router.get('/risks', async (req, res) => {
  try {
    const productId = req.headers['x-product-id'] || 'DP-001';
    const { status, impact, limit } = req.query;

    // Build dynamic query with filtering
    let query = `
      SELECT id, title, impact, probability, mitigation, owner, 
             status, created_at
      FROM cmc_risks 
      WHERE product_id = $1
    `;

    const params = [productId];
    let paramIndex = 2;

    // Add filters
    if (status && status !== 'all') {
      query += ` AND status = $${paramIndex}`;
      params.push(status.toUpperCase());
      paramIndex++;
    }

    if (impact && impact !== 'all') {
      query += ` AND impact = $${paramIndex}`;
      params.push(impact.toUpperCase());
      paramIndex++;
    }

    // Add ordering and optional limit
    query += ` ORDER BY 
      CASE impact 
        WHEN 'HIGH' THEN 1 
        WHEN 'MEDIUM' THEN 2 
        WHEN 'LOW' THEN 3 
      END,
      CASE probability 
        WHEN 'HIGH' THEN 1 
        WHEN 'MEDIUM' THEN 2 
        WHEN 'LOW' THEN 3 
      END,
      created_at DESC
    `;

    if (limit && parseInt(limit) > 0) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(query, params);

    // Transform database results to match expected format
    const risks = result.rows.map(risk => ({
      id: risk.id,
      title: risk.title,
      owner: risk.owner,
      impact: risk.impact,
      probability: risk.probability,
      mitigation: risk.mitigation,
      status: risk.status,
    }));

    console.log(`✅ Retrieved ${risks.length} risks from database for product ${productId}`);
    res.json(risks);
  } catch (error) {
    console.error('❌ Error fetching risks:', error);
    res.status(500).json({
      error: 'Failed to fetch risks',
      details: error.message,
    });
  }
});

// GET /api/cmc/validation-issues - DATABASE INTEGRATED
router.get('/validation-issues', async (req, res) => {
  try {
    const organizationId = req.headers['x-tenant-id'] || '7';
    const { status, severity, limit } = req.query;

    let query = `
      SELECT id, title, section, rule_id, severity, owner, 
             status, description, created_at, updated_at
      FROM cmc_validation_issues 
      WHERE organization_id = $1
    `;

    const params = [parseInt(organizationId)];
    let paramIndex = 2;

    if (status && status !== 'all') {
      query += ` AND status = $${paramIndex}`;
      params.push(status.toUpperCase());
      paramIndex++;
    }

    if (severity && severity !== 'all') {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity.toUpperCase());
      paramIndex++;
    }

    query += ` ORDER BY 
      CASE severity 
        WHEN 'ERROR' THEN 1 
        WHEN 'WARNING' THEN 2 
        WHEN 'INFO' THEN 3 
      END, 
      created_at DESC
    `;

    if (limit && parseInt(limit) > 0) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(query, params);

    const issues = result.rows.map(issue => ({
      id: issue.id,
      title: issue.title,
      section: issue.section,
      rule_id: issue.rule_id,
      severity: issue.severity,
      owner: issue.owner,
      status: issue.status,
      description: issue.description,
      created_at: issue.created_at,
    }));

    console.log(`✅ Retrieved ${issues.length} validation issues from database`);
    res.json(issues);
  } catch (error) {
    console.error('❌ Error fetching validation issues:', error);
    res.status(500).json({
      error: 'Failed to fetch validation issues',
      details: error.message,
    });
  }
});

// GET /api/cmc/stage-gates - DATABASE INTEGRATED
router.get('/stage-gates', async (req, res) => {
  try {
    const organizationId = req.headers['x-tenant-id'] || '7';
    const { status } = req.query;

    let query = `
      SELECT id, name, owner, status, progress, due_date, 
             created_at, updated_at
      FROM cmc_stage_gates 
      WHERE organization_id = $1
    `;

    const params = [parseInt(organizationId)];
    let paramIndex = 2;

    if (status && status !== 'all') {
      query += ` AND status = $${paramIndex}`;
      params.push(status.toUpperCase());
      paramIndex++;
    }

    query += ` ORDER BY due_date ASC NULLS LAST, created_at ASC`;

    const result = await pool.query(query, params);

    const stageGates = result.rows.map(gate => ({
      id: gate.id,
      name: gate.name,
      owner: gate.owner,
      status: gate.status,
      progress: gate.progress || 0,
      due: gate.due_date ? gate.due_date.toISOString().split('T')[0] : null,
      created_at: gate.created_at,
    }));

    console.log(`✅ Retrieved ${stageGates.length} stage gates from database`);
    res.json(stageGates);
  } catch (error) {
    console.error('❌ Error fetching stage gates:', error);
    res.status(500).json({
      error: 'Failed to fetch stage gates',
      details: error.message,
    });
  }
});

// POST /api/cmc/dashboard/refresh-all - Refresh all dashboard data
router.post('/dashboard/refresh-all', async (req, res) => {
  try {
    const organizationId = req.headers['x-tenant-id'] || '7';

    // Get aggregated dashboard metrics from database
    const metricsQuery = `
      SELECT 
        COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status != 'COMPLETED' THEN 1 END) as open_tasks,
        COUNT(CASE WHEN r.status = 'OPEN' THEN 1 END) as open_risks,
        COUNT(CASE WHEN vi.severity = 'ERROR' THEN 1 END) as critical_issues,
        AVG(sg.progress) as avg_stage_progress
      FROM cmc_tasks t
      FULL OUTER JOIN cmc_risks r ON r.organization_id = t.organization_id
      FULL OUTER JOIN cmc_validation_issues vi ON vi.organization_id = t.organization_id
      FULL OUTER JOIN cmc_stage_gates sg ON sg.organization_id = t.organization_id
      WHERE COALESCE(t.organization_id, r.organization_id, vi.organization_id, sg.organization_id) = $1
    `;

    const metricsResult = await pool.query(metricsQuery, [parseInt(organizationId)]);
    const metrics = metricsResult.rows[0] || {};

    // Calculate submission readiness based on completed tasks and progress
    const totalTasks = parseInt(metrics.completed_tasks || 0) + parseInt(metrics.open_tasks || 0);
    const submissionReadiness =
      totalTasks > 0 ? Math.round((parseInt(metrics.completed_tasks || 0) / totalTasks) * 100) : 85; // Default value

    const dashboardData = {
      submissionReadiness,
      openValidationIssues: parseInt(metrics.critical_issues || 0),
      tasksDue7d: parseInt(metrics.open_tasks || 0),
      changeControlsOpen: 2, // Static for now
      qualityScore: 98.7, // Static for now
      methodsValidatedPct: Math.round(parseFloat(metrics.avg_stage_progress || 85)),
    };

    console.log('✅ Dashboard metrics refreshed from database');
    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error refreshing dashboard:', error);
    res.status(500).json({
      error: 'Failed to refresh dashboard',
      details: error.message,
    });
  }
});

export default router;
