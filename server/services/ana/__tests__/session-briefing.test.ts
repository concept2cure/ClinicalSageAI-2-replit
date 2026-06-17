/**
 * Tests for the session briefing: the pure renderer (buildSessionBriefingBlock)
 * plus the get_session_briefing tool registration and fail-closed path.
 */

import { describe, it, expect } from 'vitest';
import { buildSessionBriefingBlock, type SessionBriefingData } from '../session-briefing.js';
import { bucketObligations, type ObligationLike } from '../deadline-radar.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const NOW = new Date('2026-06-17T00:00:00.000Z');

function radarWith(rows: Array<Partial<ObligationLike> & { id: number }>) {
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

const EMPTY_RADAR = radarWith([]);

describe('buildSessionBriefingBlock (pure)', () => {
  it('returns empty string when there is nothing material', () => {
    const data: SessionBriefingData = { deadlines: EMPTY_RADAR, decisions: [] };
    expect(buildSessionBriefingBlock(data)).toBe('');
  });

  it('renders deadlines and recent decisions', () => {
    const data: SessionBriefingData = {
      deadlines: radarWith([
        { id: 1, title: 'PMR stability', dueDate: '2026-06-05T00:00:00.000Z' }, // overdue
        { id: 2, title: 'Annual report', agency: 'EMA', dueDate: '2026-06-25T00:00:00.000Z' }, // due soon
      ]),
      decisions: [
        { id: 'd1', summary: 'Adopt single pivotal trial strategy', status: 'approved', kind: 'strategy', createdAt: '2026-06-10T12:00:00.000Z' },
      ],
    };
    const block = buildSessionBriefingBlock(data);
    expect(block).toContain('<session_briefing');
    expect(block).toContain('1 overdue, 1 due soon');
    expect(block).toContain('[EMA] Annual report');
    expect(block).toContain('Recent decisions (1):');
    expect(block).toContain('[approved] Adopt single pivotal trial strategy');
    expect(block).toContain('2026-06-10');
    expect(block.trim().endsWith('</session_briefing>')).toBe(true);
  });

  it('renders decisions-only when there are no pressing deadlines', () => {
    const data: SessionBriefingData = {
      deadlines: EMPTY_RADAR,
      decisions: [{ id: 'd1', summary: 'Switch CMO', status: 'pending', kind: 'cmc', createdAt: '2026-06-12T00:00:00.000Z' }],
    };
    const block = buildSessionBriefingBlock(data);
    expect(block).toContain('Recent decisions (1):');
    expect(block).not.toContain('Deadlines:');
  });
});

describe('get_session_briefing tool', () => {
  it('is registered in ALL_ANA_TOOLS', () => {
    expect(ALL_ANA_TOOLS.some(t => t.name === 'get_session_briefing')).toBe(true);
  });

  it('fails closed (structured error) when no organization is in context', async () => {
    const handler = getToolHandler('get_session_briefing')!;
    const out = JSON.parse(await handler({}, {}));
    expect(out.error).toMatch(/No organization is in context/);
  });
});
