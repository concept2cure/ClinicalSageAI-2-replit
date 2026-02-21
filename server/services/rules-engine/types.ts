/**
 * Rules Engine — Type Definitions
 *
 * Defines the event-driven rules architecture:
 *   Event → Conditions → Actions
 *
 * Events are emitted by platform operations (project created, task completed, etc.)
 * Conditions use AND/OR logic for flexible matching.
 * Actions are modular handlers that execute the rule's response.
 *
 * @module server/services/rules-engine/types.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Events
// ─────────────────────────────────────────────────────────────────────────────

export type RuleTriggerEvent =
  | 'project_created'
  | 'project_updated'
  | 'project_status_changed'
  | 'project_moved'
  | 'task_created'
  | 'task_completed'
  | 'task_overdue'
  | 'task_blocked'
  | 'stage_advanced'
  | 'stage_blocked'
  | 'module_linked'
  | 'module_completed'
  | 'budget_threshold'
  | 'risk_escalated'
  | 'deadline_approaching'
  | 'document_uploaded'
  | 'review_completed'
  | 'approval_granted'
  | 'approval_rejected'
  | 'sentinel_finding';

// ─────────────────────────────────────────────────────────────────────────────
// Conditions
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null'
  | 'regex_match';

export interface RuleCondition {
  field: string; // Dot-notation path (e.g. "project.status", "task.priority")
  operator: ConditionOperator;
  value: unknown; // Comparison value
}

export interface RuleConditionGroup {
  logic: 'AND' | 'OR';
  conditions: Array<RuleCondition | RuleConditionGroup>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

export type RuleActionType =
  | 'create_task'
  | 'send_notification'
  | 'block_transition'
  | 'escalate'
  | 'update_field'
  | 'trigger_ai_analysis'
  | 'advance_stage'
  | 'create_child_project';

export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
}

export interface CreateTaskAction extends RuleAction {
  type: 'create_task';
  params: {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignToRole?: string;
    dueInDays?: number;
    moduleType?: string;
  };
}

export interface SendNotificationAction extends RuleAction {
  type: 'send_notification';
  params: {
    channel: 'in_app' | 'email' | 'slack' | 'webhook';
    recipientRole?: string;
    recipientUserId?: number;
    template: string;
    urgency?: 'low' | 'normal' | 'high' | 'critical';
  };
}

export interface BlockTransitionAction extends RuleAction {
  type: 'block_transition';
  params: {
    reason: string;
    requiredAction?: string;
    autoUnblockConditions?: RuleConditionGroup;
  };
}

export interface EscalateAction extends RuleAction {
  type: 'escalate';
  params: {
    escalationLevel: 1 | 2 | 3;
    notifyRole: string;
    reason: string;
    slaHours?: number;
  };
}

export interface UpdateFieldAction extends RuleAction {
  type: 'update_field';
  params: {
    entity: 'project' | 'task' | 'stage';
    field: string;
    value: unknown;
  };
}

export interface TriggerAIAnalysisAction extends RuleAction {
  type: 'trigger_ai_analysis';
  params: {
    analysisType:
      | 'risk_assessment'
      | 'compliance_check'
      | 'timeline_forecast'
      | 'quality_review'
      | 'regulatory_gap';
    scope: 'project' | 'subtree' | 'task';
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface AdvanceStageAction extends RuleAction {
  type: 'advance_stage';
  params: {
    targetStage?: string; // Explicit target, or auto-advance to next
    skipValidation?: boolean;
  };
}

export interface CreateChildProjectAction extends RuleAction {
  type: 'create_child_project';
  params: {
    nameTemplate: string; // Supports {{parentName}}, {{date}} tokens
    type: string;
    priority?: string;
    templateId?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Definition (matches schema shape)
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleDefinition {
  id: number;
  ruleId: string; // UUID
  organizationId: number;
  name: string;
  description: string | null;
  scope: 'global' | 'template' | 'project';
  scopeProjectId: number | null;
  scopeTemplateId: number | null;
  triggerEvent: RuleTriggerEvent;
  conditions: RuleConditionGroup;
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  isBuiltIn: boolean;
  cooldownMinutes: number;
  maxExecutionsPerDay: number | null;
  executionCount: number;
  lastExecutedAt: Date | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleEventPayload {
  event: RuleTriggerEvent;
  organizationId: number;
  projectId: number;
  userId?: number;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Result
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  actionType: RuleActionType;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  conditionsMatched: boolean;
  actions: ActionResult[];
  totalDurationMs: number;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Handler Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionHandler {
  type: RuleActionType;
  execute(
    action: RuleAction,
    payload: RuleEventPayload,
    rule: RuleDefinition
  ): Promise<ActionResult>;
}
