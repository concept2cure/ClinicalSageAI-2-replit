/**
 * Tests for risk-watch: pure sort/summarize/render plus the scan_project_risks
 * tool registration and fail-closed path.
 */

import { describe, it, expect } from 'vitest';
import {
  sortBlockersBySeverity,
  summarizeBlockers,
  buildRiskWatchBlock,
  type OpenBlocker,
} from '../risk-watch.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

function blocker(p: Partial<OpenBlocker> & { blockerId: string; severity: string }): OpenBlocker {
  return {
    blockerId: p.blockerId,
    blockerType: p.blockerType ?? 'contradiction',
    severity: p.severity,
    title: p.title ?? `Blocker ${p.blockerId}`,
    description: p.description ?? null,
    nextAction: p.nextAction ?? null,
    ownerFunction: p.ownerFunction ?? null,
    createdAt: p.createdAt ?? '2026-06-01T00:00:00.000Z',
  };
}

describe('risk-watch pure helpers', () => {
  it('sorts critical → low, newest first within a severity', () => {
    const sorted = sortBlockersBySeverity([
      blocker({ blockerId: 'a', severity: 'low' }),
      blocker({ blockerId: 'b', severity: 'critical', createdAt: '2026-06-02T00:00:00.000Z' }),
      blocker({ blockerId: 'c', severity: 'critical', createdAt: '2026-06-05T00:00:00.000Z' }),
      blocker({ blockerId: 'd', severity: 'high' }),
    ]);
    expect(sorted.map(b => b.blockerId)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('summarizes counts by severity', () => {
    const s = summarizeBlockers([
      blocker({ blockerId: 'a', severity: 'critical' }),
      blocker({ blockerId: 'b', severity: 'high' }),
      blocker({ blockerId: 'c', severity: 'high' }),
    ]);
    expect(s).toEqual({ critical: 1, high: 2, medium: 0, low: 0, total: 3 });
  });

  it('renders empty string when there are no open blockers', () => {
    expect(buildRiskWatchBlock([])).toBe('');
  });

  it('renders severity-first with counts, owner, and next action', () => {
    const block = buildRiskWatchBlock([
      blocker({ blockerId: 'a', severity: 'high', title: 'Stability gap', ownerFunction: 'CMC', nextAction: 'Add 6-month data' }),
      blocker({ blockerId: 'b', severity: 'critical', title: 'Contradiction in M2.5' }),
    ]);
    expect(block).toContain('<open_risks');
    expect(block).toContain('1 critical, 1 high');
    // critical listed before high
    expect(block.indexOf('Contradiction in M2.5')).toBeLessThan(block.indexOf('Stability gap'));
    expect(block).toContain('(owner: CMC)');
    expect(block).toContain('next: Add 6-month data');
    expect(block.trim().endsWith('</open_risks>')).toBe(true);
  });
});

describe('scan_project_risks tool', () => {
  it('is registered in ALL_ANA_TOOLS', () => {
    expect(ALL_ANA_TOOLS.some(t => t.name === 'scan_project_risks')).toBe(true);
  });

  it('fails closed without org + project context', async () => {
    const handler = getToolHandler('scan_project_risks')!;
    const out = JSON.parse(await handler({}, { organizationId: 1 }));
    expect(out.error).toMatch(/organization and project must be in context/);
  });
});
