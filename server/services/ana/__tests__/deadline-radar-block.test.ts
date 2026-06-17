/**
 * Tests for buildDeadlineRadarBlock — the pure renderer that turns a radar
 * result into the proactive system-prompt block injected at session start.
 */

import { describe, it, expect } from 'vitest';
import { bucketObligations, buildDeadlineRadarBlock, type ObligationLike } from '../deadline-radar.js';

const NOW = new Date('2026-06-17T00:00:00.000Z');

function ob(partial: Partial<ObligationLike> & { id: number }): ObligationLike {
  return {
    id: partial.id,
    title: partial.title ?? `Obligation ${partial.id}`,
    agency: partial.agency ?? 'FDA',
    obligationType: partial.obligationType ?? 'commitment',
    category: partial.category ?? 'safety',
    regulatoryPathway: partial.regulatoryPathway ?? 'NDA',
    priority: partial.priority ?? 'high',
    status: partial.status ?? 'open',
    dueDate: partial.dueDate ?? null,
    legalBasis: partial.legalBasis ?? null,
    consequenceOfNonCompliance: partial.consequenceOfNonCompliance ?? null,
  };
}

describe('buildDeadlineRadarBlock', () => {
  it('returns empty string when nothing is overdue or due soon', () => {
    const radar = bucketObligations([ob({ id: 1, dueDate: '2026-12-01T00:00:00.000Z' })], { now: NOW });
    expect(buildDeadlineRadarBlock(radar)).toBe('');
  });

  it('renders overdue and due-soon sections with agency, timing, and consequence', () => {
    const radar = bucketObligations(
      [
        ob({
          id: 1,
          title: 'PMR stability commitment',
          dueDate: '2026-06-05T00:00:00.000Z', // 12d overdue
          consequenceOfNonCompliance: 'Possible regulatory action',
        }),
        ob({ id: 2, title: 'Annual reassessment', agency: 'EMA', dueDate: '2026-06-25T00:00:00.000Z' }), // due in 8d
      ],
      { now: NOW, windowDays: 30 }
    );
    const block = buildDeadlineRadarBlock(radar);
    expect(block).toContain('<regulatory_deadlines');
    expect(block).toContain('OVERDUE (1):');
    expect(block).toContain('[FDA] PMR stability commitment');
    expect(block).toMatch(/12d overdue/);
    expect(block).toContain('consequence: Possible regulatory action');
    expect(block).toContain('DUE SOON within 30d (1):');
    expect(block).toContain('[EMA] Annual reassessment');
    expect(block).toMatch(/due in 8d/);
    expect(block.trim().endsWith('</regulatory_deadlines>')).toBe(true);
  });

  it('caps each section at maxItems', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      ob({ id: i + 1, dueDate: '2026-06-01T00:00:00.000Z' })
    );
    const radar = bucketObligations(rows, { now: NOW });
    const block = buildDeadlineRadarBlock(radar, { maxItems: 5 });
    const overdueLines = block.split('\n').filter(l => l.startsWith('- '));
    expect(overdueLines.length).toBe(5);
  });
});
