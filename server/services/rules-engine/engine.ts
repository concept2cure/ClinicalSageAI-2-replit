/**
 * Project Rules Engine
 *
 * Core engine that evaluates rules against incoming events and executes matched actions.
 * Supports AND/OR condition grouping, cooldown enforcement, execution limits,
 * and comprehensive audit logging.
 *
 * Architecture:
 *   Event Bus → Engine.emit() → findMatchingRules() → evaluateConditions() → executeActions()
 *
 * @module server/services/rules-engine/engine.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  RuleDefinition,
  RuleEventPayload,
  RuleCondition,
  RuleConditionGroup,
  RuleExecutionResult,
  ActionResult,
  ActionHandler,
  RuleActionType,
  RuleTriggerEvent,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Condition Evaluator
// ─────────────────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((curr: any, key) => {
    if (curr === null || curr === undefined) return undefined;
    return curr[key];
  }, obj);
}

function evaluateCondition(condition: RuleCondition, data: Record<string, unknown>): boolean {
  const actual = getNestedValue(data, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'equals':
      return actual === expected || String(actual) === String(expected);
    case 'not_equals':
      return actual !== expected && String(actual) !== String(expected);
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'greater_than_or_equal':
      return Number(actual) >= Number(expected);
    case 'less_than_or_equal':
      return Number(actual) <= Number(expected);
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(expected));
    case 'not_contains':
      return typeof actual === 'string' && !actual.includes(String(expected));
    case 'starts_with':
      return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'ends_with':
      return typeof actual === 'string' && actual.endsWith(String(expected));
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'is_null':
      return actual === null || actual === undefined;
    case 'is_not_null':
      return actual !== null && actual !== undefined;
    case 'regex_match':
      try {
        return new RegExp(String(expected)).test(String(actual));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evaluateConditionGroup(group: RuleConditionGroup, data: Record<string, unknown>): boolean {
  const results = group.conditions.map(c => {
    if ('logic' in c) {
      return evaluateConditionGroup(c as RuleConditionGroup, data);
    }
    return evaluateCondition(c as RuleCondition, data);
  });

  return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ProjectRulesEngine {
  private handlers = new Map<RuleActionType, ActionHandler>();
  private eventListeners = new Map<string, Array<(payload: RuleEventPayload) => void>>();
  private processing = false;
  private eventQueue: RuleEventPayload[] = [];

  constructor(private pool: Pool) {}

  // ── Handler Registration ─────────────────────────────────────────────────

  registerHandler(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
    console.log(`[RulesEngine] Registered action handler: ${handler.type}`);
  }

  // ── Event Listener (for external hooks) ──────────────────────────────────

  on(event: string, listener: (payload: RuleEventPayload) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  // ── Emit Event ───────────────────────────────────────────────────────────

  /**
   * Emit an event into the rules engine. This is the primary entry point.
   * Events are queued and processed sequentially to avoid race conditions.
   */
  async emit(payload: RuleEventPayload): Promise<RuleExecutionResult[]> {
    this.eventQueue.push(payload);

    // If already processing, the queue will be drained by the current processor
    if (this.processing) return [];

    this.processing = true;
    const allResults: RuleExecutionResult[] = [];

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        const results = await this.processEvent(event);
        allResults.push(...results);
      }
    } finally {
      this.processing = false;
    }

    return allResults;
  }

  // ── Core Processing ──────────────────────────────────────────────────────

  private async processEvent(payload: RuleEventPayload): Promise<RuleExecutionResult[]> {
    const startTime = Date.now();
    console.log(
      `[RulesEngine] Processing event: ${payload.event} for project ${payload.projectId}`
    );

    // Notify external listeners
    const listeners = this.eventListeners.get(payload.event) || [];
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('[RulesEngine] Event listener error:', e);
      }
    }

    // Find matching rules
    const rules = await this.findMatchingRules(payload);
    if (rules.length === 0) {
      console.log(`[RulesEngine] No matching rules for ${payload.event}`);
      return [];
    }

    console.log(`[RulesEngine] Found ${rules.length} candidate rules for ${payload.event}`);

    const results: RuleExecutionResult[] = [];

    // Evaluate and execute each rule (sorted by priority descending)
    for (const rule of rules) {
      const result = await this.evaluateAndExecuteRule(rule, payload);
      results.push(result);
    }

    const totalMs = Date.now() - startTime;
    const triggered = results.filter(r => r.triggered).length;
    console.log(
      `[RulesEngine] Processed ${payload.event}: ${triggered}/${rules.length} rules triggered in ${totalMs}ms`
    );

    return results;
  }

  /**
   * Find all active rules that match the event + organization scope.
   */
  private async findMatchingRules(payload: RuleEventPayload): Promise<RuleDefinition[]> {
    const result = await this.pool.query(
      `SELECT * FROM project_rules
       WHERE trigger_event = $1
         AND organization_id = $2
         AND is_active = true
         AND (scope = 'global'
              OR (scope = 'project' AND scope_project_id = $3)
              OR scope = 'template')
       ORDER BY priority DESC, created_at ASC`,
      [payload.event, payload.organizationId, payload.projectId]
    );

    return result.rows.map(row => this.mapRowToRule(row));
  }

  /**
   * Evaluate conditions and execute actions for a single rule.
   */
  private async evaluateAndExecuteRule(
    rule: RuleDefinition,
    payload: RuleEventPayload
  ): Promise<RuleExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    // Check cooldown
    if (rule.lastExecutedAt && rule.cooldownMinutes > 0) {
      const cooldownExpiry = new Date(rule.lastExecutedAt.getTime() + rule.cooldownMinutes * 60000);
      if (new Date() < cooldownExpiry) {
        console.log(`[RulesEngine] Rule "${rule.name}" still in cooldown`);
        return {
          ruleId: rule.ruleId,
          ruleName: rule.name,
          triggered: false,
          conditionsMatched: false,
          actions: [],
          totalDurationMs: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    }

    // Check daily execution limit
    if (rule.maxExecutionsPerDay) {
      const todayCount = await this.pool.query(
        `SELECT COUNT(*)::int as count FROM rule_execution_log
         WHERE rule_id = $1 AND created_at > CURRENT_DATE`,
        [rule.ruleId]
      );
      if (todayCount.rows[0].count >= rule.maxExecutionsPerDay) {
        console.log(`[RulesEngine] Rule "${rule.name}" hit daily execution limit`);
        return {
          ruleId: rule.ruleId,
          ruleName: rule.name,
          triggered: false,
          conditionsMatched: false,
          actions: [],
          totalDurationMs: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    }

    // Evaluate conditions — merge event data + project data into context
    const context: Record<string, unknown> = {
      event: payload.event,
      project: payload.data.project || {},
      task: payload.data.task || {},
      stage: payload.data.stage || {},
      module: payload.data.module || {},
      user: payload.data.user || {},
      ...payload.data,
    };

    let conditionsMatched = true;
    if (rule.conditions && rule.conditions.conditions && rule.conditions.conditions.length > 0) {
      conditionsMatched = evaluateConditionGroup(rule.conditions, context);
    }

    if (!conditionsMatched) {
      // Log non-match for debugging
      await this.logExecution(executionId, rule, payload, false, [], null, Date.now() - startTime);
      return {
        ruleId: rule.ruleId,
        ruleName: rule.name,
        triggered: false,
        conditionsMatched: false,
        actions: [],
        totalDurationMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    // Execute actions
    const actionResults: ActionResult[] = [];
    for (const action of rule.actions) {
      const handler = this.handlers.get(action.type);
      if (!handler) {
        console.warn(`[RulesEngine] No handler registered for action type: ${action.type}`);
        actionResults.push({
          actionType: action.type,
          success: false,
          error: `No handler registered for action type: ${action.type}`,
          durationMs: 0,
        });
        continue;
      }

      const actionStart = Date.now();
      try {
        const result = await handler.execute(action, payload, rule);
        actionResults.push(result);
      } catch (error: any) {
        console.error(`[RulesEngine] Action "${action.type}" failed:`, error.message);
        actionResults.push({
          actionType: action.type,
          success: false,
          error: error.message,
          durationMs: Date.now() - actionStart,
        });
      }
    }

    const allSucceeded = actionResults.every(r => r.success);
    const totalDurationMs = Date.now() - startTime;

    // Update rule execution stats
    await this.pool.query(
      `UPDATE project_rules SET
         execution_count = execution_count + 1,
         ${allSucceeded ? 'success_count = success_count + 1' : 'failure_count = failure_count + 1'},
         last_executed_at = NOW(),
         last_result = $1
       WHERE rule_id = $2`,
      [JSON.stringify({ success: allSucceeded, actions: actionResults.length }), rule.ruleId]
    );

    // Log execution
    await this.logExecution(
      executionId,
      rule,
      payload,
      allSucceeded,
      actionResults,
      null,
      totalDurationMs
    );

    return {
      ruleId: rule.ruleId,
      ruleName: rule.name,
      triggered: true,
      conditionsMatched: true,
      actions: actionResults,
      totalDurationMs,
      timestamp: new Date(),
    };
  }

  // ── Execution Logging ────────────────────────────────────────────────────

  private async logExecution(
    executionId: string,
    rule: RuleDefinition,
    payload: RuleEventPayload,
    success: boolean,
    actions: ActionResult[],
    errorMessage: string | null,
    durationMs: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO rule_execution_log (
           execution_id, rule_id, organization_id, project_id,
           trigger_event, trigger_context, conditions_matched,
           actions_executed, success, error_message, duration_ms
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          executionId,
          rule.ruleId,
          payload.organizationId,
          payload.projectId,
          payload.event,
          JSON.stringify({ data: payload.data, timestamp: payload.timestamp }),
          success || actions.length > 0,
          JSON.stringify(actions),
          success,
          errorMessage,
          durationMs,
        ]
      );
    } catch (error) {
      console.error('[RulesEngine] Failed to log execution:', error);
    }
  }

  // ── Dry Run (for testing rules without side effects) ─────────────────────

  /**
   * Test a rule definition against a simulated event without executing actions.
   */
  async dryRun(
    rule: Partial<RuleDefinition>,
    payload: RuleEventPayload
  ): Promise<{ conditionsMatched: boolean; matchedConditions: string[]; wouldExecute: string[] }> {
    const context: Record<string, unknown> = {
      event: payload.event,
      project: payload.data.project || {},
      task: payload.data.task || {},
      stage: payload.data.stage || {},
      ...payload.data,
    };

    const conditions = rule.conditions || { logic: 'AND' as const, conditions: [] };
    const conditionsMatched = evaluateConditionGroup(conditions, context);

    const matchedConditions: string[] = [];
    if (conditions.conditions) {
      for (const c of conditions.conditions) {
        if (!('logic' in c)) {
          const cond = c as RuleCondition;
          if (evaluateCondition(cond, context)) {
            matchedConditions.push(`${cond.field} ${cond.operator} ${cond.value}`);
          }
        }
      }
    }

    const wouldExecute = conditionsMatched ? (rule.actions || []).map(a => a.type) : [];

    return { conditionsMatched, matchedConditions, wouldExecute };
  }

  // ── Row Mapping ──────────────────────────────────────────────────────────

  private mapRowToRule(row: any): RuleDefinition {
    return {
      id: row.id,
      ruleId: row.rule_id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      scope: row.scope,
      scopeProjectId: row.scope_project_id,
      scopeTemplateId: row.scope_template_id,
      triggerEvent: row.trigger_event,
      conditions:
        typeof row.conditions === 'string'
          ? JSON.parse(row.conditions)
          : row.conditions || { logic: 'AND', conditions: [] },
      actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions || [],
      priority: row.priority,
      isActive: row.is_active,
      isBuiltIn: row.is_built_in,
      cooldownMinutes: row.cooldown_minutes || 0,
      maxExecutionsPerDay: row.max_executions_per_day,
      executionCount: row.execution_count || 0,
      lastExecutedAt: row.last_executed_at ? new Date(row.last_executed_at) : null,
      tags: row.tags || [],
      metadata: row.metadata || {},
    };
  }
}
