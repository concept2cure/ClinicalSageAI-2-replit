/**
 * GET /api/protocol-dev — protocol-development authoring read contract.
 *
 * The v2 ProtocolDev surface adopts this document only when it carries the full
 * PdevDoc display shape. Locks: 403 without org, the { data } envelope with the
 * display keys (header scalars with short_title → shortTitle / open_section →
 * openSection / completeness_findings → completenessFindings, and the nested
 * structures from JSONB), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import protocolDevRouter from '../protocol-dev.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/protocol-dev', protocolDevRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/protocol-dev', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/protocol-dev');
    expect(res.status).toBe(403);
  });

  it('returns the protocol shaped to the display contract (column → camelCase, nested from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'PROT-2041', title: 'A Phase II Study of Selvotinib in Relapsed/Refractory DLBCL',
          short_title: 'SELVO-DLBCL-201', kind: 'clinical', version: '0.7', status: 'draft',
          sponsor: 'Northfield Cancer Institute (IIT)', pi: 'Dr. Elena Vasquez',
          updated: '2 min ago', completeness: 68, open_section: 's2',
          sections: [{ id: 's1', num: '1', title: 'Protocol summary / synopsis', status: 'complete', required: true }],
          content: { s2: [{ h: '2.1 Disease background', p: 'DLBCL background…' }] },
          objectives: [{ id: 'o1', type: 'primary', text: 'ORR', endpoint: 'ORR at C4' }],
          eligibility: { inclusion: [{ id: 'i1', text: 'DLBCL' }], exclusion: [{ id: 'e1', text: 'Prior BTKi' }] },
          soa: { visits: [{ id: 'scr', label: 'Screening', day: 'D-28→-1', window: '' }], assessments: [{ id: 'a1', label: 'Informed consent', cat: 'Administrative' }], cells: { a1: ['scr'] }, issues: [] },
          risks: [{ id: 'r1', hazard: 'Neutropenia', cat: 'Safety', l: 4, i: 4, mitigation: 'G-CSF', rl: 3, ri: 3, status: 'open' }],
          milestones: [{ id: 'm1', label: 'IRB approval', date: '2026-05-12', status: 'done', urgency: 'done' }],
          budget: { params: { enrollment: 40, sponsorPerSubject: 28500, faRate: 0.3 }, items: [{ id: 'b1', cat: 'Personnel', label: 'Coordinator', perSubject: 4200 }] },
          amendments: [{ id: 'am1', num: 'Amendment 1', summary: 'Add sites', status: 'irb_review', reconsent: false, path: 'Expedited', changes: [{ sec: '§5', from: '60', to: '45' }] }],
          deviations: [{ id: 'd1', title: 'Out-of-window visit', sev: 'minor', cat: 'Visit schedule', reportable: false, status: 'open', capa: [{ id: 'cap1', action: 'Re-train', status: 'in_progress' }] }],
          reviews: [{ id: 'rv1', reviewer: 'M. Chen', role: 'Regulatory', status: 'commented', comments: [{ id: 'rc1', sec: '§3', sev: 'major', text: 'Timing', resolved: false }] }],
          consent: [{ id: 'ce1', el: 'Research statement', present: true }],
          completeness_findings: [{ sev: 'critical', text: 'Section 9 not started' }],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const doc = res.body.data[0];
    for (const k of [
      'id', 'title', 'shortTitle', 'kind', 'version', 'status', 'sponsor', 'pi', 'updated',
      'completeness', 'openSection', 'sections', 'content', 'objectives', 'eligibility', 'soa',
      'risks', 'milestones', 'budget', 'amendments', 'deviations', 'reviews', 'consent',
      'completenessFindings',
    ]) {
      expect(doc).toHaveProperty(k);
    }
    expect(doc.shortTitle).toBe('SELVO-DLBCL-201');
    expect(doc.openSection).toBe('s2');
    expect(Array.isArray(doc.sections)).toBe(true);
    expect(Array.isArray(doc.risks)).toBe(true);
    expect(doc.risks[0]).toHaveProperty('l');
    expect(doc.risks[0]).toHaveProperty('i');
    expect(Array.isArray(doc.soa.visits)).toBe(true);
    expect(Array.isArray(doc.soa.assessments)).toBe(true);
    expect(doc.eligibility).toHaveProperty('inclusion');
    expect(Array.isArray(doc.completenessFindings)).toBe(true);
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
