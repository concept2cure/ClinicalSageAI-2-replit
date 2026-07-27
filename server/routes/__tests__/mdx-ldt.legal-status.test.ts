/**
 * /api/mdx/ldt — the phase schedule is void and must say so.
 *
 * This module's `current_phase` column and milestone machinery encode
 * the FDA 2024 LDT final rule's staged phase-out of enforcement
 * discretion. That rule was vacated in its entirety by the E.D. Tex. on
 * 2025-03-31 and rescinded by FDA on 2025-09-19.
 *
 * The platform's regulatory-currency registry recorded this correctly
 * while the workflow layer went on presenting phases and milestone due
 * dates as live obligations — the kind of drift that pushes a lab toward
 * a 510(k) no federal rule currently requires.
 *
 * These tests lock the correction: every LDT response carries the
 * registry-sourced legal status, and it reports the schedule as void.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import ldtRouter from '../mdx-ldt';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', ldtRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('LDT legal status', () => {
  it('reports the phase schedule as void on the inventory list', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(1)).get('/api/mdx/ldt');

    expect(res.status).toBe(200);
    expect(res.body.meta.legalStatus.phaseScheduleVoid).toBe(true);
  });

  it('cites the official source and a verification date', async () => {
    /* An assertion this consequential has to show its work — the
       registry entry carries the Federal Register notice and the date
       it was last checked against it. */
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(1)).get('/api/mdx/ldt');

    const s = res.body.meta.legalStatus;
    expect(s.sourceUrl).toMatch(/federalregister\.gov/);
    expect(s.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.status).toBe('void');
  });

  it('explains that the phase-out was vacated and rescinded', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(1)).get('/api/mdx/ldt');

    const summary: string = res.body.meta.legalStatus.summary;
    expect(summary).toMatch(/VACATED/i);
    expect(summary).toMatch(/2025-03-31/);
    expect(summary).toMatch(/RESCINDED/i);
  });

  it('carries the status on the phase summary — the most misleading view', async () => {
    /* A bar chart of "tests per phase" is the single screen most likely
       to be read as a live compliance obligation. */
    query.mockResolvedValue({ rows: [{ current_phase: 2, n: 3 }] });
    const res = await request(appWith(1)).get('/api/mdx/ldt-phase-summary');

    expect(res.status).toBe(200);
    expect(res.body.data.phases).toHaveLength(5);
    expect(res.body.meta.legalStatus.phaseScheduleVoid).toBe(true);
  });

  it('carries the status on a single LDT record with its milestones', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5, lab_name: 'Lab', test_name: 'T' }] });
    query.mockResolvedValueOnce({ rows: [{ id: 9, phase: 2, requirement: 'Register' }] });

    const res = await request(appWith(1)).get('/api/mdx/ldt/5');

    expect(res.status).toBe(200);
    expect(res.body.data.milestones).toHaveLength(1);
    expect(res.body.meta.legalStatus.phaseScheduleVoid).toBe(true);
  });

  it('still returns the historical records rather than deleting them', async () => {
    /* The rule is void, but the records are a real history of work the
       customer did, and the litigation posture could change again. */
    query.mockResolvedValue({
      rows: [{ id: 1, lab_name: 'Ref Lab', test_name: 'NGS panel', current_phase: 3 }],
    });
    const res = await request(appWith(1)).get('/api/mdx/ldt');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].current_phase).toBe(3);
  });
});
