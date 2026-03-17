/**
 * Project Rules API Routes
 *
 * CRUD + testing + execution log endpoints for the client-configurable rules engine.
 *
 * Endpoints:
 *   GET    /api/project-rules              — List rules for organization
 *   POST   /api/project-rules              — Create a new rule
 *   GET    /api/project-rules/:ruleId      — Get rule by ruleId (UUID)
 *   PATCH  /api/project-rules/:ruleId      — Update a rule
 *   DELETE /api/project-rules/:ruleId      — Delete (or deactivate) a rule
 *   POST   /api/project-rules/:ruleId/test — Dry-run a rule against sample event
 *   GET    /api/project-rules/executions   — Execution log (audit trail)
 *   GET    /api/project-rules/templates    — Built-in rule templates
 *
 * @module server/routes/project-rules.ts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db';
import { getTenantContext, getRequestActor } from '../utils/tenantContext';
import { getRulesEngine } from '../services/rules-engine';
import type { RuleTriggerEvent } from '../services/rules-engine/types';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const pool = getPool();

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const triggerEvents = [
  'project_created',
  'project_updated',
  'project_status_changed',
  'project_moved',
  'task_created',
  'task_completed',
  'task_overdue',
  'task_blocked',
  'stage_advanced',
  'stage_blocked',
  'module_linked',
  'module_completed',
  'budget_threshold',
  'risk_escalated',
  'deadline_approaching',
  'document_uploaded',
  'review_completed',
  'approval_granted',
  'approval_rejected',
  'sentinel_finding',
] as const;

const actionTypes = [
  'create_task',
  'send_notification',
  'block_transition',
  'escalate',
  'update_field',
  'trigger_ai_analysis',
  'advance_stage',
  'create_child_project',
] as const;

const createRuleSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(['global', 'template', 'project']).default('global'),
  scopeProjectId: z.number().optional(),
  scopeTemplateId: z.number().optional(),
  triggerEvent: z.enum(triggerEvents),
  conditions: z
    .object({
      logic: z.enum(['AND', 'OR']),
      conditions: z.array(z.any()),
    })
    .default({ logic: 'AND', conditions: [] }),
  actions: z
    .array(
      z.object({
        type: z.enum(actionTypes),
        params: z.record(z.unknown()),
      })
    )
    .min(1, 'At least one action is required'),
  priority: z.number().min(0).max(100).default(50),
  isActive: z.boolean().default(true),
  cooldownMinutes: z.number().min(0).default(0),
  maxExecutionsPerDay: z.number().min(1).nullable().default(null),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const updateRuleSchema = createRuleSchema.partial();

const dryRunSchema = z.object({
  event: z.enum(triggerEvents),
  projectId: z.number(),
  data: z.record(z.unknown()).default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-rules — List rules
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const scope = req.query.scope as string | undefined;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const activeOnly = req.query.activeOnly !== 'false';

    let query = `SELECT id, rule_id, organization_id, name, description, scope, scope_project_id, scope_template_id, trigger_event, conditions, actions, priority, is_active, cooldown_minutes, max_executions, execution_count, success_count, failure_count, last_executed_at, last_result, is_built_in, tags, metadata, created_by_id, created_at, updated_at FROM project_rules WHERE organization_id = $1`;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (activeOnly) {
      query += ` AND is_active = true`;
    }
    if (scope) {
      query += ` AND scope = $${paramIndex++}`;
      params.push(scope);
    }
    if (projectId) {
      query += ` AND (scope = 'global' OR scope_project_id = $${paramIndex++})`;
      params.push(projectId);
    }

    query += ' ORDER BY priority DESC, name ASC';

    const result = await pool.query(query, params);

    res.json({
      rules: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('[ProjectRules] Error listing rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/project-rules — Create rule
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const data = createRuleSchema.parse(req.body);
    const ruleId = uuidv4();

    const result = await pool.query(
      `INSERT INTO project_rules (
         rule_id, organization_id, name, description,
         scope, scope_project_id, scope_template_id,
         trigger_event, conditions, actions,
         priority, is_active, cooldown_minutes, max_executions_per_day,
         tags, metadata, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, NOW(), NOW()
       ) RETURNING *`,
      [
        ruleId,
        organizationId,
        data.name,
        data.description || null,
        data.scope,
        data.scopeProjectId || null,
        data.scopeTemplateId || null,
        data.triggerEvent,
        JSON.stringify(data.conditions),
        JSON.stringify(data.actions),
        data.priority,
        data.isActive,
        data.cooldownMinutes,
        data.maxExecutionsPerDay,
        JSON.stringify(data.tags),
        JSON.stringify(data.metadata),
      ]
    );

    console.log(`[ProjectRules] Created rule "${data.name}" (${ruleId}) for org ${organizationId}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[ProjectRules] Error creating rule:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid rule data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-rules/:ruleId — Get single rule
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:ruleId', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const result = await pool.query(
      `SELECT id, rule_id, organization_id, name, description, scope, scope_project_id, scope_template_id, trigger_event, conditions, actions, priority, is_active, cooldown_minutes, max_executions, execution_count, success_count, failure_count, last_executed_at, last_result, is_built_in, tags, metadata, created_by_id, created_at, updated_at FROM project_rules WHERE rule_id = $1 AND organization_id = $2`,
      [req.params.ruleId, organizationId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[ProjectRules] Error fetching rule:', error);
    res.status(500).json({ error: 'Failed to fetch rule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/project-rules/:ruleId — Update rule
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:ruleId', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const data = updateRuleSchema.parse(req.body);

    // Check rule exists and is not built-in
    const existing = await pool.query(
      `SELECT id, rule_id, is_built_in FROM project_rules WHERE rule_id = $1 AND organization_id = $2`,
      [req.params.ruleId, organizationId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });

    if (existing.rows[0].is_built_in) {
      // Built-in rules can only toggle active/inactive
      const allowedUpdates = ['isActive'];
      const keys = Object.keys(data);
      if (keys.some(k => !allowedUpdates.includes(k))) {
        return res.status(400).json({ error: 'Built-in rules can only be enabled/disabled' });
      }
    }

    // Build dynamic update
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      scope: 'scope',
      scopeProjectId: 'scope_project_id',
      scopeTemplateId: 'scope_template_id',
      triggerEvent: 'trigger_event',
      priority: 'priority',
      isActive: 'is_active',
      cooldownMinutes: 'cooldown_minutes',
      maxExecutionsPerDay: 'max_executions_per_day',
    };

    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex++}`);
        values.push((data as any)[key]);
      }
    }

    if (data.conditions !== undefined) {
      setClauses.push(`conditions = $${paramIndex++}`);
      values.push(JSON.stringify(data.conditions));
    }
    if (data.actions !== undefined) {
      setClauses.push(`actions = $${paramIndex++}`);
      values.push(JSON.stringify(data.actions));
    }
    if (data.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(data.tags));
    }
    if (data.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(data.metadata));
    }

    values.push(req.params.ruleId, organizationId);

    const result = await pool.query(
      `UPDATE project_rules SET ${setClauses.join(', ')} WHERE rule_id = $${paramIndex++} AND organization_id = $${paramIndex} RETURNING *`,
      values
    );

    console.log(`[ProjectRules] Updated rule ${req.params.ruleId}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[ProjectRules] Error updating rule:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid rule data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/project-rules/:ruleId — Delete (or soft-deactivate built-in)
// ─────────────────────────────────────────────────────────────────────────────

router.delete('/:ruleId', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const existing = await pool.query(
      `SELECT id, rule_id, is_built_in FROM project_rules WHERE rule_id = $1 AND organization_id = $2`,
      [req.params.ruleId, organizationId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });

    if (existing.rows[0].is_built_in) {
      // Soft deactivate built-in rules
      await pool.query(
        `UPDATE project_rules SET is_active = false, updated_at = NOW() WHERE rule_id = $1`,
        [req.params.ruleId]
      );
      return res.json({ message: 'Built-in rule deactivated', ruleId: req.params.ruleId });
    }

    await pool.query(`DELETE FROM project_rules WHERE rule_id = $1 AND organization_id = $2`, [
      req.params.ruleId,
      organizationId,
    ]);

    console.log(`[ProjectRules] Deleted rule ${req.params.ruleId}`);
    res.json({ message: 'Rule deleted', ruleId: req.params.ruleId });
  } catch (error) {
    console.error('[ProjectRules] Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/project-rules/:ruleId/test — Dry-run a rule
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:ruleId/test', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const testData = dryRunSchema.parse(req.body);

    // Get the rule
    const ruleResult = await pool.query(
      `SELECT rule_id, name, conditions, actions FROM project_rules WHERE rule_id = $1 AND organization_id = $2`,
      [req.params.ruleId, organizationId]
    );
    if (ruleResult.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });

    const row = ruleResult.rows[0];
    const engine = getRulesEngine();

    const result = await engine.dryRun(
      {
        conditions:
          typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
        actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions,
      },
      {
        event: testData.event as RuleTriggerEvent,
        organizationId,
        projectId: testData.projectId,
        timestamp: new Date(),
        data: testData.data,
      }
    );

    res.json({
      ruleId: req.params.ruleId,
      ruleName: row.name,
      testResult: result,
    });
  } catch (error) {
    console.error('[ProjectRules] Error testing rule:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid test data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to test rule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-rules/executions — Execution log
// ─────────────────────────────────────────────────────────────────────────────

// Alias: frontend calls /logs (shorthand)
router.get('/logs', (req: Request, res: Response, next: Function) => {
  req.url =
    '/executions/log' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  router.handle(req, res, next);
});

router.get('/executions/log', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 500);
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const ruleId = req.query.ruleId as string | undefined;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;

    let query = `SELECT rel.*, pr.name as rule_name
                 FROM rule_execution_log rel
                 LEFT JOIN project_rules pr ON rel.rule_id = pr.rule_id
                 WHERE rel.organization_id = $1`;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (ruleId) {
      query += ` AND rel.rule_id = $${paramIndex++}`;
      params.push(ruleId);
    }
    if (projectId) {
      query += ` AND rel.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    query += ` ORDER BY rel.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Total count for pagination (parameterized to prevent SQL injection)
    let countQuery = `SELECT COUNT(*)::int as total FROM rule_execution_log WHERE organization_id = $1`;
    const countParams: any[] = [organizationId];
    let countIdx = 2;
    if (ruleId) {
      countQuery += ` AND rule_id = $${countIdx++}`;
      countParams.push(ruleId);
    }
    if (projectId) {
      countQuery += ` AND project_id = $${countIdx++}`;
      countParams.push(projectId);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      executions: result.rows,
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[ProjectRules] Error fetching execution log:', error);
    res.status(500).json({ error: 'Failed to fetch execution log' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-rules/templates — Built-in rule templates
// ─────────────────────────────────────────────────────────────────────────────

// Alias: frontend calls /templates (shorthand)
router.get('/templates', (req: Request, res: Response, next: Function) => {
  req.url = '/templates/catalog';
  router.handle(req, res, next);
});

router.get('/templates/catalog', async (_req: Request, res: Response) => {
  const templates = [
    {
      name: 'Auto-escalate Overdue Tasks',
      description: 'When a task becomes overdue, escalate to project manager',
      triggerEvent: 'task_overdue',
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'task.priority', operator: 'in', value: ['high', 'critical'] }],
      },
      actions: [
        {
          type: 'escalate',
          params: {
            escalationLevel: 1,
            notifyRole: 'project_manager',
            reason: 'High-priority task overdue',
          },
        },
      ],
      tags: ['compliance', 'auto'],
    },
    {
      name: 'Block Stage Without Review',
      description: 'Prevent advancing to next stage unless review is completed',
      triggerEvent: 'stage_advanced',
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'stage.requiresReview', operator: 'equals', value: true }],
      },
      actions: [
        {
          type: 'block_transition',
          params: { reason: 'Stage requires completed review before advancing' },
        },
      ],
      tags: ['regulatory', 'quality'],
    },
    {
      name: 'AI Risk Assessment on Status Change',
      description: 'Trigger AI analysis when project status changes to at-risk',
      triggerEvent: 'project_status_changed',
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'project.riskLevel', operator: 'in', value: ['high', 'critical'] }],
      },
      actions: [
        {
          type: 'trigger_ai_analysis',
          params: { analysisType: 'risk_assessment', scope: 'subtree', priority: 'high' },
        },
      ],
      tags: ['ai', 'risk'],
    },
    {
      name: 'Auto-create QA Task on Document Upload',
      description: 'Create a QA review task whenever a document is uploaded',
      triggerEvent: 'document_uploaded',
      conditions: { logic: 'AND', conditions: [] },
      actions: [
        {
          type: 'create_task',
          params: {
            title: 'QA Review: {{projectName}} document',
            priority: 'high',
            assignToRole: 'qa_reviewer',
            dueInDays: 3,
          },
        },
      ],
      tags: ['quality', 'auto'],
    },
    {
      name: 'Budget Burn Rate Alert',
      description: 'Notify finance when project budget crosses 80% threshold',
      triggerEvent: 'budget_threshold',
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'project.budgetStatus', operator: 'equals', value: 'at-risk' }],
      },
      actions: [
        {
          type: 'send_notification',
          params: {
            channel: 'in_app',
            recipientRole: 'finance_manager',
            template: 'Budget alert: {{projectName}} is at {{budgetPercent}}%',
            urgency: 'high',
          },
        },
        { type: 'update_field', params: { entity: 'project', field: 'risk_level', value: 'high' } },
      ],
      tags: ['budget', 'finance'],
    },
    {
      name: 'Sentinel Finding Auto-task',
      description:
        'When AI Sentinel detects a risk finding, create a remediation task and notify the project owner',
      triggerEvent: 'sentinel_finding',
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'severity', operator: 'in', value: ['high', 'critical'] }],
      },
      actions: [
        {
          type: 'create_task',
          params: { title: 'Remediate: {{findingTitle}}', priority: 'critical', dueInDays: 2 },
        },
        {
          type: 'escalate',
          params: {
            escalationLevel: 2,
            notifyRole: 'project_owner',
            reason: 'AI Sentinel detected critical risk',
          },
        },
      ],
      tags: ['ai', 'sentinel', 'risk'],
    },
  ];

  res.json({ templates, total: templates.length });
});

export default router;
