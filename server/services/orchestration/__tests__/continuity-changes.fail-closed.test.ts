/**
 * "What changed" is read, or the briefing is refused.
 *
 * detectChanges caught a failed audit-log read, logged a warning and returned
 * no changes. The briefing then told the user nothing had changed since the
 * baseline — and was RECORDED, so a day later it became the baseline the next
 * verdict was measured against. A read that failed is not an answer
 * (cross-object-resolver.fail-closed.test.ts, the same rule for the payload).
 * The route already turns a throw into a 500 naming the cause, and AnA Command
 * renders "Couldn't load the continuity briefing".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auditReadFails: false,
  executed: [] as string[],
}));

vi.mock('../../../db', () => {
  function chain(): any {
    const builder: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            (h.auditReadFails
              ? Promise.reject(new Error('could not read regulatory_audit_logs'))
              : Promise.resolve([])
            ).then(resolve, reject);
        }
        return () => builder;
      },
    });
    return builder;
  }
  return {
    db: {
      select: () => chain(),
      execute: async (q: { queryChunks?: Array<{ value?: string[] }> }) => {
        const text = (q.queryChunks ?? []).map((c) => (c.value ?? []).join('')).join('?');
        h.executed.push(text.trim().split(/\s+/)[0] ?? '');
        return { rows: [] };
      },
    },
  };
});
vi.mock('../cross-object-resolver', () => ({
  assembleCrossObjectPayload: async ({ projectId }: { projectId: number }) => ({
    project: { id: projectId, name: 'p', totalTasks: 0, blockedTasks: 0 },
    documents: [],
    validations: [],
  }),
}));
vi.mock('../readiness-engine', () => ({
  computeReadinessAssessment: () => ({ overallScore: 60, status: 'partial', blockers: [] }),
}));
vi.mock('../recommendation-engine', () => ({
  generateRecommendations: () => ({ recommendations: [] }),
}));

import { generateContinuitySnapshot } from '../continuity-service';

beforeEach(() => {
  h.auditReadFails = false;
  h.executed = [];
});

describe('continuity briefing when the audit trail cannot be read', () => {
  it('is refused, naming the read that failed', async () => {
    h.auditReadFails = true;
    await expect(generateContinuitySnapshot(1, 7)).rejects.toThrow(/regulatory_audit_logs/);
  });

  it('records no snapshot, so it can never become a baseline', async () => {
    h.auditReadFails = true;
    await generateContinuitySnapshot(1, 7).catch(() => undefined);
    expect(h.executed).not.toContain('INSERT');
  });

  it('an audit trail with nothing in the window is still an answer: no changes, recorded', async () => {
    const briefing = await generateContinuitySnapshot(1, 7);
    expect(briefing.changes).toEqual([]);
    expect(h.executed).toContain('INSERT');
  });
});
