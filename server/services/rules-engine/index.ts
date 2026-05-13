/**
 * Rules Engine — Singleton Entry Point
 *
 * Provides a single shared instance of the ProjectRulesEngine
 * with all built-in action handlers pre-registered.
 *
 * Usage:
 *   import { getRulesEngine } from '../services/rules-engine';
 *   const engine = getRulesEngine();
 *   await engine.emit({ event: 'task_completed', ... });
 *
 * @module server/services/rules-engine/index.ts
 */

import { getPool } from '../../db';
import { ProjectRulesEngine } from './engine';
import { registerAllHandlers } from './actions';

import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('index');

export type {
  RuleEventPayload,
  RuleExecutionResult,
  RuleDefinition,
  RuleTriggerEvent,
} from './types';
export { ProjectRulesEngine } from './engine';

let instance: ProjectRulesEngine | null = null;

/**
 * Get the singleton rules engine instance with all handlers registered.
 */
export function getRulesEngine(): ProjectRulesEngine {
  if (!instance) {
    const pool = getPool();
    instance = new ProjectRulesEngine(pool);
    registerAllHandlers(instance, pool);
    logger.info('Singleton initialized with all action handlers');
  }
  return instance;
}

/**
 * Convenience: emit an event into the rules engine.
 */
export async function emitRuleEvent(
  event: import('./types').RuleTriggerEvent,
  organizationId: number,
  projectId: number,
  data: Record<string, unknown> = {},
  userId?: number
) {
  const engine = getRulesEngine();
  return engine.emit({
    event,
    organizationId,
    projectId,
    userId,
    timestamp: new Date(),
    data,
  });
}
