/**
 * Rules Engine — Action Handlers
 *
 * Modular action handlers for each RuleActionType.
 * Each handler implements the ActionHandler interface and is registered with the engine.
 *
 * @module server/services/rules-engine/actions/index.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  ActionHandler,
  ActionResult,
  RuleAction,
  RuleEventPayload,
  RuleDefinition,
} from '../types';
import type { ProjectRulesEngine } from '../engine';

// ─────────────────────────────────────────────────────────────────────────────
// Create Task Handler
// ─────────────────────────────────────────────────────────────────────────────

export class CreateTaskHandler implements ActionHandler {
  readonly type = 'create_task' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;
      const dueDate = params.dueInDays ? new Date(Date.now() + params.dueInDays * 86400000) : null;

      // Resolve assignee by role if specified
      let assigneeId: number | null = null;
      if (params.assignToRole) {
        const assignee = await this.pool.query(
          `SELECT u.id FROM users u
           JOIN user_roles ur ON u.id = ur.user_id
           WHERE ur.role = $1 AND u.organization_id = $2
           ORDER BY (SELECT COUNT(*) FROM unified_tasks WHERE assignee_id = u.id AND status != 'done') ASC
           LIMIT 1`,
          [params.assignToRole, payload.organizationId]
        );
        assigneeId = assignee.rows[0]?.id || null;
      }

      const result = await this.pool.query(
        `INSERT INTO unified_tasks (
           title, description, priority, status, project_id,
           assignee_id, due_date, created_by, module_type,
           metadata, created_at, updated_at
         ) VALUES ($1, $2, $3, 'todo', $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id, title`,
        [
          this.interpolateTemplate(params.title || 'Auto-generated task', payload),
          this.interpolateTemplate(params.description || `Created by rule: ${rule.name}`, payload),
          params.priority || 'medium',
          payload.projectId,
          assigneeId,
          dueDate,
          payload.userId || null,
          params.moduleType || null,
          JSON.stringify({ createdByRule: rule.ruleId, triggerEvent: payload.event }),
        ]
      );

      return {
        actionType: 'create_task',
        success: true,
        data: { taskId: result.rows[0]?.id, title: result.rows[0]?.title },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'create_task',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }

  private interpolateTemplate(template: string, payload: RuleEventPayload): string {
    return template
      .replace('{{projectId}}', String(payload.projectId))
      .replace('{{event}}', payload.event)
      .replace('{{date}}', new Date().toISOString().split('T')[0])
      .replace('{{projectName}}', String((payload.data as any).project?.name || payload.projectId));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send Notification Handler
// ─────────────────────────────────────────────────────────────────────────────

export class SendNotificationHandler implements ActionHandler {
  readonly type = 'send_notification' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // Insert into notifications table (in-app)
      await this.pool.query(
        `INSERT INTO notifications (
           user_id, organization_id, type, title, message,
           severity, metadata, read, created_at
         ) VALUES (
           $1, $2, 'rule_notification', $3, $4, $5, $6, false, NOW()
         )`,
        [
          params.recipientUserId || null,
          payload.organizationId,
          `Rule: ${rule.name}`,
          this.buildMessage(params.template, payload),
          params.urgency || 'normal',
          JSON.stringify({
            ruleId: rule.ruleId,
            projectId: payload.projectId,
            event: payload.event,
            channel: params.channel,
          }),
        ]
      );

      return {
        actionType: 'send_notification',
        success: true,
        data: { channel: params.channel || 'in_app', template: params.template },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'send_notification',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }

  private buildMessage(template: string, payload: RuleEventPayload): string {
    return (template || 'Rule triggered: {{event}}')
      .replace('{{event}}', payload.event)
      .replace('{{projectId}}', String(payload.projectId))
      .replace('{{date}}', new Date().toLocaleDateString());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Transition Handler
// ─────────────────────────────────────────────────────────────────────────────

export class BlockTransitionHandler implements ActionHandler {
  readonly type = 'block_transition' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    _rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // If there's a stage in the payload, set it back / block it
      const stageId = (payload.data as any).stage?.id || (payload.data as any).stageId;
      if (stageId) {
        await this.pool.query(
          `UPDATE project_workflow_stages SET status = 'blocked', metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
          [
            JSON.stringify({ blockReason: params.reason, blockedAt: new Date().toISOString() }),
            stageId,
          ]
        );
      }

      return {
        actionType: 'block_transition',
        success: true,
        data: { reason: params.reason, stageId },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'block_transition',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalate Handler
// ─────────────────────────────────────────────────────────────────────────────

export class EscalateHandler implements ActionHandler {
  readonly type = 'escalate' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // Create escalation notification for the target role
      await this.pool.query(
        `INSERT INTO notifications (
           user_id, organization_id, type, title, message,
           severity, metadata, read, created_at
         ) SELECT u.id, $1, 'escalation', $2, $3, 'critical',
                  $4::json, false, NOW()
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         WHERE ur.role = $5 AND u.organization_id = $1
         LIMIT 5`,
        [
          payload.organizationId,
          `Escalation Level ${params.escalationLevel}: ${params.reason}`,
          `Project ${payload.projectId} requires attention. Rule "${rule.name}" triggered an escalation. Reason: ${params.reason}`,
          JSON.stringify({
            ruleId: rule.ruleId,
            escalationLevel: params.escalationLevel,
            projectId: payload.projectId,
            slaHours: params.slaHours,
          }),
          params.notifyRole || 'admin',
        ]
      );

      // Update project risk level
      await this.pool.query(
        `UPDATE projects SET risk_level = 'critical', updated_at = NOW() WHERE id = $1`,
        [payload.projectId]
      );

      return {
        actionType: 'escalate',
        success: true,
        data: { level: params.escalationLevel, notifyRole: params.notifyRole },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'escalate',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update Field Handler
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateFieldHandler implements ActionHandler {
  readonly type = 'update_field' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    _rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;
      const entity = params.entity || 'project';
      const field = params.field;
      const value = params.value;

      // Whitelist allowed fields to prevent SQL injection
      const allowedFields: Record<string, string[]> = {
        project: ['status', 'priority', 'risk_level', 'budget_status', 'progress'],
        task: ['status', 'priority', 'assignee_id'],
        stage: ['status'],
      };

      if (!allowedFields[entity]?.includes(field)) {
        throw new Error(`Field "${field}" is not allowed for entity "${entity}"`);
      }

      const tableMap: Record<string, string> = {
        project: 'projects',
        task: 'unified_tasks',
        stage: 'project_workflow_stages',
      };

      const entityId =
        entity === 'project'
          ? payload.projectId
          : entity === 'task'
            ? (payload.data as any).task?.id
            : (payload.data as any).stage?.id;

      if (!entityId) throw new Error(`No ${entity} ID found in event payload`);

      await this.pool.query(
        `UPDATE ${tableMap[entity]} SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
        [value, entityId]
      );

      return {
        actionType: 'update_field',
        success: true,
        data: { entity, field, value, entityId },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'update_field',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger AI Analysis Handler
// ─────────────────────────────────────────────────────────────────────────────

export class TriggerAIAnalysisHandler implements ActionHandler {
  readonly type = 'trigger_ai_analysis' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // Queue AI analysis request through sentinel_findings for async processing
      const findingId = uuidv4();
      await this.pool.query(
        `INSERT INTO sentinel_findings (
           finding_id, organization_id, project_id,
           analyzer_type, severity, title, summary,
           details, recommendations, affected_items,
           status, metadata, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, 'medium',
           $5, $6, $7, '[]'::json, $8, 'open', $9, NOW(), NOW()
         )`,
        [
          findingId,
          payload.organizationId,
          payload.projectId,
          'quality_drift', // Default analyzer type
          `AI Analysis Requested: ${params.analysisType}`,
          `Rule "${rule.name}" triggered AI analysis of type "${params.analysisType}" for project ${payload.projectId}`,
          JSON.stringify({
            analysisType: params.analysisType,
            scope: params.scope,
            triggerEvent: payload.event,
          }),
          JSON.stringify([{ type: params.scope, id: payload.projectId }]),
          JSON.stringify({
            ruleId: rule.ruleId,
            priority: params.priority || 'normal',
            queued: true,
          }),
        ]
      );

      return {
        actionType: 'trigger_ai_analysis',
        success: true,
        data: { findingId, analysisType: params.analysisType },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'trigger_ai_analysis',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advance Stage Handler
// ─────────────────────────────────────────────────────────────────────────────

export class AdvanceStageHandler implements ActionHandler {
  readonly type = 'advance_stage' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    _rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // Get current active stage for the project
      const stageResult = await this.pool.query(
        `SELECT * FROM project_workflow_stages
         WHERE project_id = $1 AND status = 'active'
         ORDER BY order_index ASC LIMIT 1`,
        [payload.projectId]
      );

      if (stageResult.rows.length === 0) {
        return {
          actionType: 'advance_stage',
          success: false,
          error: 'No active stage found for project',
          durationMs: Date.now() - start,
        };
      }

      const currentStage = stageResult.rows[0];

      // Find next stage
      const nextStageResult = await this.pool.query(
        `SELECT * FROM project_workflow_stages
         WHERE project_id = $1 AND order_index > $2
         ORDER BY order_index ASC LIMIT 1`,
        [payload.projectId, currentStage.order_index]
      );

      if (nextStageResult.rows.length === 0) {
        return {
          actionType: 'advance_stage',
          success: false,
          error: 'No next stage available — project may be at final stage',
          durationMs: Date.now() - start,
        };
      }

      const nextStage = nextStageResult.rows[0];

      // Mark current stage as completed
      await this.pool.query(
        `UPDATE project_workflow_stages SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [currentStage.id]
      );

      // Activate next stage
      await this.pool.query(
        `UPDATE project_workflow_stages SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [nextStage.id]
      );

      return {
        actionType: 'advance_stage',
        success: true,
        data: { fromStage: currentStage.name, toStage: nextStage.name, stageId: nextStage.id },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'advance_stage',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Child Project Handler
// ─────────────────────────────────────────────────────────────────────────────

export class CreateChildProjectHandler implements ActionHandler {
  readonly type = 'create_child_project' as const;

  constructor(private pool: Pool) {}

  async execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult> {
    const start = Date.now();
    try {
      const params = action.params as any;

      // Get parent project info
      const parentResult = await this.pool.query(`SELECT * FROM projects WHERE id = $1`, [
        payload.projectId,
      ]);
      if (parentResult.rows.length === 0) throw new Error('Parent project not found');

      const parent = parentResult.rows[0];
      if (parent.depth >= 3) throw new Error('Maximum hierarchy depth reached');

      const childName = (params.nameTemplate || '{{parentName}} - Sub-project')
        .replace('{{parentName}}', parent.name)
        .replace('{{date}}', new Date().toISOString().split('T')[0]);

      const childDepth = parent.depth + 1;
      const childPath = parent.path ? `${parent.path}/${parent.id}` : String(parent.id);

      const result = await this.pool.query(
        `INSERT INTO projects (
           name, type, priority, status,
           organization_id, client_workspace_id,
           parent_project_id, depth, path,
           metadata, created_at, updated_at
         ) VALUES ($1, $2, $3, 'planning', $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id, name`,
        [
          childName,
          params.type || parent.type,
          params.priority || parent.priority,
          parent.organization_id,
          parent.client_workspace_id,
          parent.id,
          childDepth,
          childPath,
          JSON.stringify({ createdByRule: rule.ruleId }),
        ]
      );

      const child = result.rows[0];
      // Update path to include new ID
      const finalPath = `${childPath}/${child.id}`;
      await this.pool.query(`UPDATE projects SET path = $1 WHERE id = $2`, [finalPath, child.id]);

      return {
        actionType: 'create_child_project',
        success: true,
        data: { childProjectId: child.id, childName: child.name, depth: childDepth },
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        actionType: 'create_child_project',
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all built-in action handlers with the engine.
 */
export function registerAllHandlers(engine: ProjectRulesEngine, pool: Pool): void {
  engine.registerHandler(new CreateTaskHandler(pool));
  engine.registerHandler(new SendNotificationHandler(pool));
  engine.registerHandler(new BlockTransitionHandler(pool));
  engine.registerHandler(new EscalateHandler(pool));
  engine.registerHandler(new UpdateFieldHandler(pool));
  engine.registerHandler(new TriggerAIAnalysisHandler(pool));
  engine.registerHandler(new AdvanceStageHandler(pool));
  engine.registerHandler(new CreateChildProjectHandler(pool));
}
