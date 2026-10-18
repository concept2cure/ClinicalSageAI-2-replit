/**
 * Three misc-inline routes that answered with content nobody computed.
 *
 * POST /api/workflow/progression/create answers that it cannot plan a
 * progression — it no longer hands back a plan nobody computed.
 *
 * Until 2026-10-14 every request received the same fixed plan whatever
 * submission it named: content "reuse" of 85/65/70% and an overall 73%, a cost
 * of "$2.5M - $4.2M", phase durations, critical gaps and risk ratings, with the
 * caller's submission id echoed back beside them as if they described it. The
 * path is reachable in production.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMiscInlineRoutes } from '../misc-inline-routes';

const inserted: unknown[][] = [];
const pool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    if (/from\s+"?regulatory_programs"?/i.test(String(sql))) return { rows: [{ id: 'p1' }], rowCount: 1 };
    if (/insert\s+into\s+drafting_tasks/i.test(String(sql))) inserted.push(params ?? []);
    return { rows: [], rowCount: 0 };
  }),
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: 9 };
    next();
  });
  a.use('/api', createMiscInlineRoutes(pool as never, (_req: unknown, _res: unknown, next: () => void) => next()));
  return a;
}

describe('POST /api/workflow/progression/create', () => {
  it('refuses with 501 and returns no plan, figure or rating', async () => {
    const res = await request(app()).post('/api/workflow/progression/create').send({
      sourceSubmissionId: 'IND-123456',
      sourceType: 'IND',
      targetType: 'NDA',
      therapeuticArea: 'Oncology',
      indication: 'NSCLC',
      includeRiskAssessment: true,
      includeCostAnalysis: true,
      includeTimeline: true,
    });

    expect(res.status).toBe(501);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('not_implemented');
    for (const key of ['workflow', 'contentMapping', 'gapAnalysis', 'timeline', 'costAnalysis', 'riskAssessment']) {
      expect(res.body[key]).toBeUndefined();
    }
    expect(JSON.stringify(res.body)).not.toMatch(/\$2\.5M|reusePercentage|overallReuseRate|IND-123456/);
    // Nothing was read or written on its behalf.
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/advisor/check-readiness', () => {
  it('refuses rather than naming sections it never looked for as missing', async () => {
    const res = await request(app()).get('/api/advisor/check-readiness');
    expect(res.status).toBe(501);
    expect(res.body.missingSections).toBeUndefined();
    expect(res.body.recommendations).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/CMC Stability Study|Prioritize/);
  });
});

describe('POST /api/v1/drafting/start_task', () => {
  const start = (body: Record<string, unknown>) =>
    request(app()).post('/api/v1/drafting/start_task').send({ project_id: '99999999-9999-4999-8999-999999999999', ...body });

  it('drafts a three-level section from that section’s template, not its module’s first', async () => {
    inserted.length = 0;
    const res = await start({ ectd_section: '3.2.P.1', document_title: 'Description and composition' });
    expect(res.status).toBe(202);
    const content = String(inserted[0]?.[5] ?? '');
    expect(content.length).toBeGreaterThan(0);
    // The module's first template is 3.2.A.1 Facilities and Equipment.
    expect(content).not.toMatch(/FACILITIES AND EQUIPMENT/i);
  });

  it('leaves a drug name and indication the request did not give as visible placeholders', async () => {
    inserted.length = 0;
    await start({ ectd_section: '1.1', document_title: 'Form 1571' });
    const content = String(inserted[0]?.[5] ?? '');
    expect(content).toContain('[DRUG_NAME]');
    expect(content).toContain('[INDICATION]');
    expect(content).not.toMatch(/Investigational Drug\b(?! Application)|Primary Indication/);
  });

  it('refuses a section with no template instead of storing a compliance claim as a draft', async () => {
    inserted.length = 0;
    const res = await start({ ectd_section: '2.7.3', document_title: 'Summary of Clinical Efficacy' });
    expect(res.status).toBe(422);
    expect(inserted).toHaveLength(0);
  });
});
