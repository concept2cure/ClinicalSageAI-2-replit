/**
 * Unit tests for the pure Risk Review + Attention builders.
 */

import { describe, it, expect } from 'vitest';
import {
  buildRiskReview, renderRiskReviewMarkdown, buildAttentionFeed, type RiskReviewInput,
} from '../risk-report';

const base: RiskReviewInput = {
  programId: 'p-1',
  asOf: '2026-07-01T00:00:00.000Z',
  assessment: { title: 'RACT', framework: 'ich_e6r3', overallRisk: 'high', status: 'active', approvedAt: null },
  riskItems: { total: 8, critical: 3, open: 2, high: 1, openCritical: ['SAE reporting timeliness'] },
  kris: { total: 8, red: ['Query rate'], amber: ['CRF entry lag'] },
  qtls: { total: 4, breached: ['Dropout rate'], approaching: [] },
  signals: { open: 2, high: ['Site 5 is a composite-risk outlier'] },
  sites: { total: 10, enhanced: 2 },
  patients: { total: 50, flagged: 1, review: 3 },
  actions: { open: 4, overdue: [{ description: 'Visit site 5', dueDate: '2026-06-20', priority: 'high' }] },
};

describe('buildRiskReview', () => {
  it('summarizes status and counts attention items', () => {
    const r = buildRiskReview(base);
    expect(r.framework).toBe('ich_e6r3');
    expect(r.overallRisk).toBe('high');
    expect(r.approved).toBe(false);
    expect(r.attentionCount).toBe(1 + 1 + 1 + 1 + 1 + 1); // high item, red kri, breached qtl, high signal, flagged patient, overdue action
    expect(r.headline).toMatch(/Action required/);
    expect(r.sections.length).toBe(7);
    const kriSec = r.sections.find(s => s.title.includes('Key Risk'))!;
    expect(kriSec.status).toBe('critical');
  });
  it('reports within-tolerance when clean', () => {
    const clean: RiskReviewInput = {
      ...base,
      assessment: { ...base.assessment!, overallRisk: 'low', approvedAt: '2026-06-01' },
      riskItems: { total: 5, critical: 2, open: 0, high: 0, openCritical: [] },
      kris: { total: 8, red: [], amber: [] },
      qtls: { total: 4, breached: [], approaching: [] },
      signals: { open: 0, high: [] },
      sites: { total: 10, enhanced: 0 },
      patients: { total: 50, flagged: 0, review: 0 },
      actions: { open: 1, overdue: [] },
    };
    const r = buildRiskReview(clean);
    expect(r.attentionCount).toBe(0);
    expect(r.approved).toBe(true);
    expect(r.headline).toMatch(/Within tolerance/);
  });
});

describe('renderRiskReviewMarkdown', () => {
  it('renders an inspection-ready document', () => {
    const md = renderRiskReviewMarkdown(buildRiskReview(base));
    expect(md).toContain('# Risk Review — ICH_E6R3');
    expect(md).toContain('Overall study risk:** HIGH');
    expect(md).toContain('Key Risk Indicators');
    expect(md).toContain('21 CFR Part 11');
  });
});

describe('buildAttentionFeed', () => {
  it('prioritizes by severity with critical first', () => {
    const feed = buildAttentionFeed(base);
    expect(feed[0].severity).toBe('critical'); // breached QTL
    expect(feed.some(i => i.kind === 'signal')).toBe(true);
    expect(feed.some(i => i.kind === 'action' && i.severity === 'high')).toBe(true);
    expect(feed.some(i => i.kind === 'assessment')).toBe(true); // active + unapproved
  });
});
