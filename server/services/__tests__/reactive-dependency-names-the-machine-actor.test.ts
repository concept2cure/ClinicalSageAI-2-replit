/**
 * A propagation no user started is logged as the reactive-dependency service,
 * by name — not as 'system'.
 *
 * What the code used to do (until 2026-10-15): propagateChange wrote every
 * impact_propagation_log row with `triggered_by = input.triggeredBy ?? 'system'`,
 * on both the no-downstream path and the per-dependency path. Four of its five
 * callers (decision records, assumptions, contradictions, the resolution
 * bridge) never pass triggeredBy, so their cascades were all logged as
 * triggered by 'system' — an actor no reader can identify. A stated actor is
 * still recorded as given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  downstream: [] as Array<Record<string, unknown>>,
  logged: [] as unknown[][],
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM governed_dependencies/.test(sql) && /source_type = \$2/.test(sql)) return { rows: h.downstream };
      if (/INSERT INTO impact_propagation_log/.test(sql)) h.logged.push(params);
      return { rows: [] };
    },
  },
}));

import { reactiveDependencyService } from '../reactive-dependency-service';

const MACHINE = 'system+reactive-dependency@concept2cure.local';
/** triggered_by is the 14th bound value of the impact_propagation_log INSERT. */
const triggeredBy = (row: unknown[]) => row[13];

const INPUT = {
  organizationId: 3,
  projectId: 9,
  triggerType: 'assumption_updated' as const,
  sourceType: 'assumption',
  sourceId: 'asm-1',
  reason: 'Assumption updated',
};

const DEP = {
  id: 'dep-1', organization_id: 3, project_id: 9, source_type: 'assumption', source_id: 'asm-1',
  source_label: null, target_type: 'artifact', target_id: 'art-1', target_label: 'Section 2.5',
  link_type: 'informs', impact_level: 'high', is_stale: false, stale_since: null, stale_reason: null,
  stale_source_event: null, target_impact_state: 'unaffected', resolved_at: null, resolved_by: null,
  // pg returns timestamptz as a Date, which the row mapper reads.
  detection_method: 'manual', created_at: new Date('2026-10-01'), updated_at: new Date('2026-10-01'),
};

beforeEach(() => {
  h.downstream = [];
  h.logged = [];
});

describe('propagateChange — who the propagation log names', () => {
  it('names the service on the no-downstream row when no actor was stated', async () => {
    await reactiveDependencyService.propagateChange({ ...INPUT });
    expect(h.logged).toHaveLength(1);
    expect(triggeredBy(h.logged[0])).toBe(MACHINE);
  });

  it('names the service on each impacted-dependency row when no actor was stated', async () => {
    h.downstream = [DEP];
    const out = await reactiveDependencyService.propagateChange({ ...INPUT });
    expect(out.downstreamImpacted).toBe(1);
    expect(h.logged).toHaveLength(1);
    expect(triggeredBy(h.logged[0])).toBe(MACHINE);
  });

  it('records the actor a caller stated, as given', async () => {
    h.downstream = [DEP];
    await reactiveDependencyService.propagateChange({ ...INPUT, triggeredBy: '17' });
    expect(triggeredBy(h.logged[0])).toBe('17');
  });
});
