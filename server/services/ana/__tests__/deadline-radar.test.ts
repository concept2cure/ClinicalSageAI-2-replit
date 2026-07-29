/**
 * Tests for the regulatory deadline radar.
 *
 * Covers the pure bucketing logic (bucketObligations) offline, plus the tool
 * registration and the fail-closed (no-org-context) handler path.
 */

import { describe, it, expect } from 'vitest';
import { bucketObligations, type ObligationLike } from '../deadline-radar.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const NOW = new Date('2026-06-17T00:00:00.000Z');

function obligation(partial: Partial<ObligationLike> & { id: number }): ObligationLike {
  return {
    id: partial.id,
    title: partial.title ?? `Obligation ${partial.id}`,
    agency: partial.agency ?? 'FDA',
    obligationType: partial.obligationType ?? 'commitment',
    category: partial.category ?? 'safety',
    regulatoryPathway: partial.regulatoryPathway ?? 'NDA',
    priority: partial.priority ?? 'medium',
    status: partial.status ?? 'open',
    dueDate: partial.dueDate ?? null,
    legalBasis: partial.legalBasis ?? null,
    consequenceOfNonCompliance: partial.consequenceOfNonCompliance ?? null,
  };
}

describe('bucketObligations (pure)', () => {
  it('classifies overdue / due_soon / upcoming relative to now + window', () => {
    const rows: ObligationLike[] = [
      obligation({ id: 1, dueDate: '2026-06-10T00:00:00.000Z' }), // 7 days ago → overdue
      obligation({ id: 2, dueDate: '2026-06-20T00:00:00.000Z' }), // +3 days → due_soon
      obligation({ id: 3, dueDate: '2026-09-01T00:00:00.000Z' }), // +76 days → upcoming
    ];
    const res = bucketObligations(rows, { now: NOW, windowDays: 30 });
    expect(res.summary).toEqual({ overdue: 1, due_soon: 1, upcoming: 1, total: 3 });
    // sorted by urgency: most overdue first
    expect(res.items.map(i => i.id)).toEqual([1, 2, 3]);
    expect(res.items[0].bucket).toBe('overdue');
    expect(res.items[0].daysUntilDue).toBeLessThan(0);
    expect(res.items[1].bucket).toBe('due_soon');
    expect(res.items[2].bucket).toBe('upcoming');
  });

  it('omits obligations without a due date (not deadlines)', () => {
    const res = bucketObligations([obligation({ id: 1, dueDate: null })], { now: NOW });
    expect(res.summary.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it('excludes completed/cancelled by default, includes them when requested', () => {
    const rows = [
      obligation({ id: 1, status: 'completed', dueDate: '2026-06-10T00:00:00.000Z' }),
      obligation({ id: 2, status: 'cancelled', dueDate: '2026-06-10T00:00:00.000Z' }),
      obligation({ id: 3, status: 'open', dueDate: '2026-06-10T00:00:00.000Z' }),
    ];
    expect(bucketObligations(rows, { now: NOW }).summary.total).toBe(1);
    expect(bucketObligations(rows, { now: NOW, includeCompleted: true }).summary.total).toBe(3);
  });

  it('respects a custom window for due_soon', () => {
    const rows = [obligation({ id: 1, dueDate: '2026-08-01T00:00:00.000Z' })]; // +45 days
    expect(bucketObligations(rows, { now: NOW, windowDays: 30 }).items[0].bucket).toBe('upcoming');
    expect(bucketObligations(rows, { now: NOW, windowDays: 60 }).items[0].bucket).toBe('due_soon');
  });
});

describe('regulatory_deadline_radar tool', () => {
  it('is registered in ALL_ANA_TOOLS', () => {
    expect(ALL_ANA_TOOLS.some(t => t.name === 'regulatory_deadline_radar')).toBe(true);
  });

  it('fails closed (structured error) when no organization is in context', async () => {
    const handler = getToolHandler('regulatory_deadline_radar')!;
    const out = JSON.parse(await handler({}, {}));
    expect(out.error).toMatch(/No organization is in context/);
  });
});
