/**
 * The rules engine's "trigger AI analysis" action reports that nothing
 * performs it, and records nothing.
 *
 * It wrote an open, medium-severity 'quality_drift' sentinel finding titled
 * "AI Analysis Requested" (metadata queued: true) and reported success.
 * Nothing reads that queue, so no analysis ever ran and a non-finding sat in
 * the sentinel findings and their counts.
 */
import { describe, it, expect, vi } from 'vitest';
import { TriggerAIAnalysisHandler } from '../actions';
import type { RuleAction, RuleDefinition, RuleEventPayload } from '../types';

describe('trigger_ai_analysis', () => {
  it('fails, saying no analysis runner is connected, and writes no finding', async () => {
    // Handed a database, as the engine used to hand it one: it must not use it.
    const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) };
    const handler = new (TriggerAIAnalysisHandler as unknown as new (p: unknown) => TriggerAIAnalysisHandler)(pool);
    const r = await handler.execute(
      { type: 'trigger_ai_analysis', params: { analysisType: 'risk_assessment', scope: 'subtree' } } as unknown as RuleAction,
      { organizationId: 3, projectId: 12, event: 'project_status_changed' } as unknown as RuleEventPayload,
      { ruleId: 'r-1', name: 'AI Risk Assessment on Status Change' } as unknown as RuleDefinition,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No analysis runner is connected.*risk_assessment analysis was not requested and nothing was recorded/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
