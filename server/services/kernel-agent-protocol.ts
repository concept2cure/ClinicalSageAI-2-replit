import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('kernel-agent-protocol');

export type ProtocolActorType = 'agent' | 'human' | 'system';
export type ProtocolMessageType = 'proposal' | 'critique' | 'evidence_request' | 'decision';

export interface ProtocolEventInput {
  planRunId: string;
  organizationId?: number | null;
  actorType: ProtocolActorType;
  actorId?: string | null;
  messageType: ProtocolMessageType;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const MESSAGE_TYPE_SCHEMA_HINTS: Record<ProtocolMessageType, string[]> = {
  proposal: ['title', 'summary'],
  critique: ['target', 'issue'],
  evidence_request: ['question'],
  decision: ['decision', 'rationale'],
};

export function validateProtocolEvent(input: ProtocolEventInput): {
  ok: boolean;
  message?: string;
} {
  if (!input.planRunId) return { ok: false, message: 'planRunId is required' };
  if (!input.payload || typeof input.payload !== 'object') {
    return { ok: false, message: 'payload is required' };
  }
  const requiredKeys = MESSAGE_TYPE_SCHEMA_HINTS[input.messageType] || [];
  const missing = requiredKeys.filter(k => !(k in input.payload));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `payload missing required keys for ${input.messageType}: ${missing.join(', ')}`,
    };
  }
  return { ok: true };
}

export async function recordProtocolEvent(input: ProtocolEventInput): Promise<{ ok: boolean }> {
  const validation = validateProtocolEvent(input);
  if (!validation.ok) {
    return { ok: false };
  }

  try {
    await pool.query(
      `INSERT INTO ai_kernel_agent_protocol_events
         (plan_run_id, organization_id, actor_type, actor_id, message_type, payload, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.planRunId,
        input.organizationId || null,
        input.actorType,
        input.actorId || null,
        input.messageType,
        JSON.stringify(input.payload),
        JSON.stringify(input.metadata || {}),
      ]
    );
    return { ok: true };
  } catch (error: any) {
    logger.warn(`Failed to record protocol event: ${error?.message || 'unknown error'}`);
    return { ok: false };
  }
}

export async function listProtocolEvents(planRunId: string) {
  try {
    const result = await pool.query(
      `SELECT id, created_at, actor_type, actor_id, message_type, payload, metadata
       FROM ai_kernel_agent_protocol_events
       WHERE plan_run_id = $1
       ORDER BY created_at ASC`,
      [planRunId]
    );
    return result.rows;
  } catch (error: any) {
    logger.warn(`Failed to list protocol events: ${error?.message || 'unknown error'}`);
    return [];
  }
}

