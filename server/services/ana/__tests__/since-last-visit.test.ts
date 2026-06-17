/**
 * Tests for since-last-visit — the pure "what changed while you were away"
 * delta (newly-overdue deadlines, new blockers, new contradictions). No DB/IO.
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeSinceLastVisit,
  buildSinceLastVisitBlock,
  type SinceLastVisitInput,
} from '../since-last-visit.js';
import { bucketObligations, type ObligationLike } from '../deadline-radar.js';
import type { OpenBlocker } from '../risk-watch.js';
import type { OpenContradiction } from '../contradiction-watch.js';

const NOW = new Date('2026-06-17T00:00:00.000Z');
const SINCE = '2026-06-10T00:00:00.000Z';

function radar(rows: Array<{ id: number; dueDate: string; title?: string }>) {
  const full: ObligationLike[] = rows.map(r => ({
    id: r.id,
    title: r.title ?? `Obligation ${r.id}`,
    agency: 'FDA',
    obligationType: 'commitment',
    category: 'safety',
    regulatoryPathway: 'NDA',
    priority: 'high',
    status: 'open',
    dueDate: r.dueDate,
    legalBasis: null,
    consequenceOfNonCompliance: null,
  }));
  return bucketObligations(full, { now: NOW, windowDays: 30 });
}

function blocker(severity: string, createdAt: string, title = `Blocker ${severity}`): OpenBlocker {
  return {
    blockerId: `b-${title}`,
    blockerType: 'contradiction',
    severity,
    title,
    description: null,
    nextAction: null,
    ownerFunction: null,
    createdAt,
  };
}

function contradiction(createdAt: string, over: Partial<OpenContradiction> = {}): OpenContradiction {
  return {
    id: over.id ?? `f-${createdAt}`,
    title: over.title ?? 'Contradiction',
    severity: over.severity ?? 'high',
    contradictionType: over.contradictionType ?? 'assumption_drift',
    authorityState: over.authorityState ?? 'requires_review',
    projectId: over.projectId ?? 1,
    createdAt,
    blocksPromotion: over.blocksPromotion ?? false,
  };
}

function input(over: Partial<SinceLastVisitInput> = {}): SinceLastVisitInput {
  return {
    since: over.since ?? SINCE,
    radar: over.radar ?? radar([]),
    blockers: over.blockers ?? [],
    contradictions: over.contradictions ?? [],
  };
}

describe('summarizeSinceLastVisit', () => {
  it('counts only deadlines that crossed into overdue DURING the away window', () => {
    const s = summarizeSinceLastVisit(
      input({
        radar: radar([
          { id: 1, dueDate: '2026-06-05T00:00:00.000Z', title: 'Already overdue before visit' },
          { id: 2, dueDate: '2026-06-14T00:00:00.000Z', title: 'Crossed while away' },
          { id: 3, dueDate: '2026-07-01T00:00:00.000Z', title: 'Still upcoming' },
        ]),
      }),
      NOW
    );
    expect(s.counts.newlyOverdue).toBe(1);
    expect(s.newlyOverdue[0].title).toBe('Crossed while away');
  });

  it('counts only blockers / contradictions created after `since`', () => {
    const s = summarizeSinceLastVisit(
      input({
        blockers: [
          blocker('critical', '2026-06-15T00:00:00.000Z', 'New blocker'),
          blocker('high', '2026-06-01T00:00:00.000Z', 'Old blocker'),
        ],
        contradictions: [
          contradiction('2026-06-16T00:00:00.000Z', { title: 'New contradiction', blocksPromotion: true }),
          contradiction('2026-05-01T00:00:00.000Z', { title: 'Old contradiction' }),
        ],
      }),
      NOW
    );
    expect(s.counts.newBlockers).toBe(1);
    expect(s.newBlockers[0].title).toBe('New blocker');
    expect(s.counts.newContradictions).toBe(1);
    expect(s.newContradictions[0].blocksPromotion).toBe(true);
    expect(s.counts.total).toBe(2);
  });

  it('fails closed (empty delta) on an unparseable since — never floods', () => {
    const s = summarizeSinceLastVisit(
      input({
        since: 'not-a-date',
        blockers: [blocker('high', '2026-06-15T00:00:00.000Z')],
      } as Partial<SinceLastVisitInput>),
      NOW
    );
    expect(s.since).toBe('');
    expect(s.counts.total).toBe(0);
  });
});

describe('buildSinceLastVisitBlock', () => {
  it('returns empty string when nothing changed', () => {
    expect(buildSinceLastVisitBlock(input(), { now: NOW })).toBe('');
  });

  it('renders sections and flags blocks-promotion', () => {
    const block = buildSinceLastVisitBlock(
      input({
        radar: radar([{ id: 2, dueDate: '2026-06-14T00:00:00.000Z', title: 'Crossed' }]),
        contradictions: [contradiction('2026-06-16T00:00:00.000Z', { title: 'Drift', blocksPromotion: true })],
      }),
      { now: NOW }
    );
    expect(block).toContain('<since_last_visit');
    expect(block).toContain('Newly overdue (1)');
    expect(block).toContain('New contradictions (1)');
    expect(block).toContain('blocks promotion');
  });
});
