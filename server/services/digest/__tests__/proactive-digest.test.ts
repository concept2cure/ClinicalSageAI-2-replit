/**
 * Tests for buildProactiveDigest — the pure aggregator behind the daily
 * in-app regulatory digest. No DB/IO; exercises severity, title/body, and the
 * "nothing material → null" skip.
 */

import { describe, it, expect } from 'vitest';
import { alignmentDigestCounts, alignmentDigestWindow, buildProactiveDigest } from '../proactive-digest.js';
import { bucketObligations, type ObligationLike } from '../../ana/deadline-radar.js';
import type { OpenBlocker } from '../../ana/risk-watch.js';
import type { OpenContradiction } from '../../ana/contradiction-watch.js';

const NOW = new Date('2026-06-17T00:00:00.000Z');

describe('deterministic alignment reporting', () => {
  it('uses the same complete UTC days across offsets and excludes the current partial day', () => {
    expect(alignmentDigestWindow(new Date('2026-06-17T23:45:00Z'))).toEqual({ start: '2026-06-10T00:00:00.000Z',end: '2026-06-17T00:00:00.000Z' });
    expect(alignmentDigestWindow(new Date('2026-06-18T01:45:00+02:00'))).toEqual(alignmentDigestWindow(new Date('2026-06-17T09:00:00Z')));
    expect(() => alignmentDigestWindow(new Date('invalid'))).toThrow(/invalid/);
  });

  it('distinguishes an actual promotion event from a hard rule merely edited', () => {
    const version = { bundleId: 'rule1',version: 2,level: 'hard_gate' as const,state: 'active' as const,sourceAuditEventId: 'server-issued-ref' };
    const counts = alignmentDigestCounts({ rules: [
      { ...version,action: 'ana_rule.promoted',occurredAt: '2026-06-16T09:00:00.000Z' },
      { ...version,action: 'ana_skill.updated',occurredAt: '2026-06-16T10:00:00.000Z' },
      { ...version,action: 'ana_rule.created',occurredAt: '2026-06-17T01:00:00.000Z' },
    ],issues: [] },alignmentDigestWindow(NOW),2);
    expect(counts).toEqual({ learned: 0,changed: 1,promoted: 1,revoked: 0,issues: 0,openReviews: 2 });
  });
});

function radar(rows: Array<Partial<ObligationLike> & { id: number }>) {
  const full: ObligationLike[] = rows.map(r => ({
    id: r.id,
    title: r.title ?? `Obligation ${r.id}`,
    agency: r.agency ?? 'FDA',
    obligationType: 'commitment',
    category: 'safety',
    regulatoryPathway: 'NDA',
    priority: 'high',
    status: r.status ?? 'open',
    dueDate: r.dueDate ?? null,
    legalBasis: null,
    consequenceOfNonCompliance: null,
  }));
  return bucketObligations(full, { now: NOW, windowDays: 30 });
}

function blocker(severity: string, title = `Blocker ${severity}`): OpenBlocker {
  return {
    blockerId: `b-${severity}`,
    blockerType: 'contradiction',
    severity,
    title,
    description: null,
    nextAction: null,
    ownerFunction: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

function contradiction(
  severity: OpenContradiction['severity'],
  over: Partial<OpenContradiction> = {}
): OpenContradiction {
  return {
    id: over.id ?? `f-${severity}`,
    title: over.title ?? `Contradiction ${severity}`,
    severity,
    contradictionType: over.contradictionType ?? 'assumption_drift',
    authorityState: over.authorityState ?? 'requires_review',
    projectId: over.projectId ?? 1,
    createdAt: over.createdAt ?? '2026-06-01T00:00:00.000Z',
    blocksPromotion: over.blocksPromotion ?? false,
  };
}

describe('buildProactiveDigest', () => {
  it('returns null when there is nothing material', () => {
    expect(buildProactiveDigest(radar([]), [])).toBeNull();
    // upcoming-only (not overdue/due-soon), no risks, no contradictions is non-material
    expect(buildProactiveDigest(radar([{ id: 1, dueDate: '2026-12-01T00:00:00.000Z' }]), [], [])).toBeNull();
  });

  it('surfaces an open contradiction and escalates to critical when it blocks promotion', () => {
    const d = buildProactiveDigest(radar([]), [], [
      contradiction('high', {
        title: 'M2.5 ORR vs M5 ORR',
        authorityState: 'blocks_promotion',
        blocksPromotion: true,
      }),
    ])!;
    expect(d.severity).toBe('critical');
    expect(d.title).toMatch(/1 contradiction/);
    expect(d.body).toContain('Open contradictions:');
    expect(d.body).toContain('blocks promotion');
    expect(d.metadata.contradictions.blocksPromotion).toBe(1);
  });

  it('is warning when only a high (non-blocking) contradiction is open', () => {
    const d = buildProactiveDigest(radar([]), [], [contradiction('high')])!;
    expect(d.severity).toBe('warning');
    expect(d.metadata.contradictions.high).toBe(1);
  });

  it('is critical when something is overdue', () => {
    const d = buildProactiveDigest(radar([{ id: 1, dueDate: '2026-06-01T00:00:00.000Z' }]), [])!;
    expect(d.severity).toBe('critical');
    expect(d.title).toMatch(/1 overdue/);
    expect(d.metadata.overdue).toBe(1);
  });

  it('is critical when a critical risk is open (even with no overdue)', () => {
    const d = buildProactiveDigest(radar([]), [blocker('critical', 'M2.5 contradiction')])!;
    expect(d.severity).toBe('critical');
    expect(d.title).toMatch(/1 open risk/);
    expect(d.body).toContain('[critical] M2.5 contradiction');
  });

  it('is warning when only due-soon / high risks', () => {
    const d = buildProactiveDigest(
      radar([{ id: 1, dueDate: '2026-06-25T00:00:00.000Z' }]),
      [blocker('high')]
    )!;
    expect(d.severity).toBe('warning');
    expect(d.title).toMatch(/1 due soon/);
    expect(d.metadata.risks.high).toBe(1);
  });

  it('renders deadlines + risks in the body and caps top items', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, dueDate: '2026-06-10T00:00:00.000Z' }));
    const d = buildProactiveDigest(radar(rows), [blocker('medium')])!;
    expect(d.body).toContain('Deadlines:');
    expect(d.body).toContain('Open risks:');
    expect(d.metadata.topDeadlines.length).toBe(5); // capped
  });
});
