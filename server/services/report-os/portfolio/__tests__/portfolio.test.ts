import { describe, expect, it } from 'vitest';
import { aggregatePortfolio, renderPortfolioReport, worstRisk } from '../aggregate';
import type { ProgramMemberInsight, RiskLevel } from '../types';

const FIXED_AT = '2026-06-15T00:00:00.000Z';

function member(overrides: Partial<ProgramMemberInsight> = {}): ProgramMemberInsight {
  return {
    projectId: 1,
    name: 'Program A',
    readinessScore: 50,
    confidence: 60,
    status: 'partial',
    criticalBlockerCount: 0,
    riskLevel: 'medium',
    ...overrides,
  };
}

describe('worstRisk', () => {
  it('orders low < medium < high < critical', () => {
    expect(worstRisk(['low', 'medium', 'high'])).toBe('high');
    expect(worstRisk(['low', 'critical', 'medium'])).toBe('critical');
    expect(worstRisk(['low', 'low'])).toBe('low');
    expect(worstRisk(['medium', 'high', 'medium'])).toBe('high');
  });

  it('returns low for an empty list', () => {
    expect(worstRisk([])).toBe('low');
  });
});

describe('aggregatePortfolio', () => {
  const members: ProgramMemberInsight[] = [
    member({
      projectId: 1,
      name: 'Alpha',
      readinessScore: 80,
      confidence: 70,
      status: 'ready',
      criticalBlockerCount: 0,
      riskLevel: 'low',
      topBlockers: ['Missing CMC data', 'Late protocol'],
    }),
    member({
      projectId: 2,
      name: 'Bravo',
      readinessScore: 30,
      confidence: 40,
      status: 'partial',
      criticalBlockerCount: 3,
      riskLevel: 'high',
      topBlockers: ['Missing CMC data'],
    }),
    member({
      projectId: 3,
      name: 'Charlie',
      readinessScore: 30,
      confidence: 50,
      status: 'missing',
      criticalBlockerCount: 1,
      riskLevel: 'critical',
      topBlockers: ['Missing CMC data', 'Late protocol'],
    }),
  ];

  it('counts members by status', () => {
    const summary = aggregatePortfolio(7, members);
    expect(summary.programGroupId).toBe(7);
    expect(summary.memberCount).toBe(3);
    expect(summary.readyCount).toBe(1);
    expect(summary.partialCount).toBe(1);
    expect(summary.missingCount).toBe(1);
  });

  it('computes rounded means and sums', () => {
    const summary = aggregatePortfolio(7, members);
    // (80 + 30 + 30) / 3 = 46.67 -> 47
    expect(summary.avgReadiness).toBe(47);
    // (70 + 40 + 50) / 3 = 53.33 -> 53
    expect(summary.avgConfidence).toBe(53);
    expect(summary.totalCriticalBlockers).toBe(4);
    expect(summary.worstRisk).toBe('critical');
  });

  it('ranks attention ascending by readiness then descending by critical blockers', () => {
    const summary = aggregatePortfolio(7, members);
    expect(summary.attentionRanked.map(m => m.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('counts blocker themes sorted descending, top 5', () => {
    const summary = aggregatePortfolio(7, members);
    expect(summary.topBlockerThemes).toEqual([
      { theme: 'Missing CMC data', count: 3 },
      { theme: 'Late protocol', count: 2 },
    ]);
  });

  it('does not mutate the input members order', () => {
    const order = members.map(m => m.name);
    aggregatePortfolio(7, members);
    expect(members.map(m => m.name)).toEqual(order);
  });

  it('returns zeros and low risk for empty members', () => {
    const summary = aggregatePortfolio(9, []);
    expect(summary.memberCount).toBe(0);
    expect(summary.avgReadiness).toBe(0);
    expect(summary.avgConfidence).toBe(0);
    expect(summary.worstRisk).toBe('low');
    expect(summary.readyCount).toBe(0);
    expect(summary.partialCount).toBe(0);
    expect(summary.missingCount).toBe(0);
    expect(summary.totalCriticalBlockers).toBe(0);
    expect(summary.attentionRanked).toEqual([]);
    expect(summary.topBlockerThemes).toEqual([]);
  });
});

describe('renderPortfolioReport', () => {
  const meta = {
    reportTypeId: 'portfolio-board-pack',
    reportTypeLabel: 'Portfolio board pack',
    scopeId: 'program-7',
    generatedAt: FIXED_AT,
  };

  it('produces the three board-pack sections', () => {
    const summary = aggregatePortfolio(7, [
      member({ name: 'Alpha', readinessScore: 60, status: 'partial' }),
    ]);
    const report = renderPortfolioReport(summary, meta);
    expect(report.scopeType).toBe('program');
    expect(report.scopeId).toBe('program-7');
    expect(report.generatedAt).toBe(FIXED_AT);
    expect(report.sections.map(s => s.id)).toEqual([
      'portfolio-summary',
      'attention-worklist',
      'top-blocker-themes',
    ]);
  });

  it('orders the attention worklist ascending by readiness', () => {
    const summary = aggregatePortfolio(7, [
      member({ name: 'Alpha', readinessScore: 80, status: 'ready' }),
      member({ name: 'Bravo', readinessScore: 20, status: 'missing' }),
      member({ name: 'Charlie', readinessScore: 50, status: 'partial' }),
    ]);
    const report = renderPortfolioReport(summary, meta);
    const worklist = report.sections.find(s => s.id === 'attention-worklist')!;
    const table = worklist.blocks[0];
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      expect(table.columns).toEqual(['Program', 'Readiness', 'Risk', 'Critical blockers', 'Status']);
      expect(table.rows.map(r => r[0])).toEqual(['Bravo', 'Charlie', 'Alpha']);
    }
  });

  it("uses 'final' status only when all ready and no critical blockers", () => {
    const allReady = aggregatePortfolio(7, [
      member({ name: 'Alpha', status: 'ready', criticalBlockerCount: 0 }),
      member({ name: 'Bravo', status: 'ready', criticalBlockerCount: 0 }),
    ]);
    expect(renderPortfolioReport(allReady, meta).status).toBe('final');

    const withBlocker = aggregatePortfolio(7, [
      member({ name: 'Alpha', status: 'ready', criticalBlockerCount: 1 }),
    ]);
    expect(renderPortfolioReport(withBlocker, meta).status).toBe('partial');

    const notAllReady = aggregatePortfolio(7, [
      member({ name: 'Alpha', status: 'ready', criticalBlockerCount: 0 }),
      member({ name: 'Bravo', status: 'partial', criticalBlockerCount: 0 }),
    ]);
    expect(renderPortfolioReport(notAllReady, meta).status).toBe('partial');

    const empty = aggregatePortfolio(7, []);
    expect(renderPortfolioReport(empty, meta).status).toBe('partial');
  });

  it('renders a summary block when there are no blocker themes', () => {
    const summary = aggregatePortfolio(7, [member({ name: 'Alpha' })]);
    const report = renderPortfolioReport(summary, meta);
    const themes = report.sections.find(s => s.id === 'top-blocker-themes')!;
    expect(themes.blocks[0]).toEqual({ kind: 'summary', text: 'No recurring blocker themes.' });
  });

  it('renders a themes table when themes exist', () => {
    const summary = aggregatePortfolio(7, [
      member({ name: 'Alpha', topBlockers: ['Missing CMC data'] }),
      member({ name: 'Bravo', topBlockers: ['Missing CMC data'] }),
    ]);
    const report = renderPortfolioReport(summary, meta);
    const themes = report.sections.find(s => s.id === 'top-blocker-themes')!;
    const block = themes.blocks[0];
    expect(block.kind).toBe('table');
    if (block.kind === 'table') {
      expect(block.columns).toEqual(['Theme', 'Count']);
      expect(block.rows).toEqual([['Missing CMC data', 2]]);
    }
  });

  it('is deterministic when generatedAt is provided', () => {
    const summary = aggregatePortfolio(7, [member({ name: 'Alpha' })]);
    const a = renderPortfolioReport(summary, meta);
    const b = renderPortfolioReport(summary, meta);
    expect(a).toEqual(b);
  });

  const riskLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  it('surfaces worst risk in the summary metrics', () => {
    const summary = aggregatePortfolio(
      7,
      riskLevels.map((riskLevel, i) => member({ projectId: i, name: `P${i}`, riskLevel }))
    );
    const section = renderPortfolioReport(summary, meta).sections[0];
    const worst = section.blocks.find(b => b.kind === 'metric' && b.label === 'Worst risk');
    expect(worst).toEqual({ kind: 'metric', label: 'Worst risk', value: 'critical' });
  });
});
