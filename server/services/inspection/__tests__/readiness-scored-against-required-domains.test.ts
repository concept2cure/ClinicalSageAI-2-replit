/**
 * Inspection readiness is scored against the required readiness domains, not
 * only against whatever areas somebody happened to record.
 *
 * What the code used to do (until 2026-10-15): scoreReadiness averaged only the
 * recorded areas, and an area is free text with no required set, so one area
 * recorded 'ready' scored {"score":100,"total":1,"verdict":"ready","blockers":[]}.
 * GET /api/inspections/readiness/score also dropped a malformed inspectionId and
 * answered with the org-wide score in its place.
 *
 * Now the required set is the canonical readiness-domain checklist
 * (server/services/global-ri/inspection-readiness.ts) — narrowed by inspection
 * type — and a required domain with no recorded status counts as not_started.
 * The verdict is 'incomplete' while one is unrecorded, unless the recorded areas
 * already make it 'not_ready' or 'at_risk'.
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const dbCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../../db', () => ({
  pool: {
    query: async () => { dbCalls.n++; throw new Error('the database must not be read for a malformed request'); },
    connect: async () => { dbCalls.n++; throw new Error('no connection expected'); },
  },
}));

import { scoreReadiness, requiredReadinessDomains, type ReadinessArea } from '../inspection-logic';
import { getInspectionProfile } from '../../global-ri/inspection-readiness';

const CHECKLIST_IDS = getInspectionProfile('FDA').readinessDomains.map((d) => d.id);
const all = (ids: string[], status: ReadinessArea['status']): ReadinessArea[] => ids.map((area) => ({ area, status }));

describe('scoreReadiness — one recorded area is not a readiness verdict', () => {
  it('does not call a single recorded "ready" area ready: the unrecorded required domains count', () => {
    const r = scoreReadiness([{ area: 'data integrity', status: 'ready' }]);
    expect(r.verdict).toBe('incomplete');
    expect(r.score).toBeLessThan(100);
    expect(r.total).toBe(CHECKLIST_IDS.length);
    expect(r.notRecorded).toHaveLength(CHECKLIST_IDS.length - 1);
    expect(r.notRecorded).not.toContain('data_integrity');
    expect(r.blockers.filter((b) => /not recorded/i.test(b))).toHaveLength(CHECKLIST_IDS.length - 1);
  });

  it('matches a free-text area to its domain by id or by title', () => {
    const titles = getInspectionProfile('FDA').readinessDomains.map((d) => ({ area: d.title, status: 'ready' as const }));
    expect(scoreReadiness(titles).notRecorded).toEqual([]);
    expect(scoreReadiness([{ area: 'BIMO GCP', status: 'ready' }], { inspectionType: 'bimo' }).notRecorded).toEqual([]);
  });

  it('is ready only when every required domain is recorded ready', () => {
    const r = scoreReadiness(all(CHECKLIST_IDS, 'ready'));
    expect(r).toMatchObject({ score: 100, verdict: 'ready', notRecorded: [], blockers: [] });
  });

  it('holds an inspection to the domains its type covers', () => {
    expect(requiredReadinessDomains('bimo').map((d) => d.id)).toEqual(['bimo_gcp']);
    expect(requiredReadinessDomains('pai').map((d) => d.id)).toContain('application_conformance');
    expect(requiredReadinessDomains('gmp').map((d) => d.id)).not.toContain('application_conformance');
    expect(requiredReadinessDomains('routine').map((d) => d.id)).toEqual(CHECKLIST_IDS);
    expect(requiredReadinessDomains(null).map((d) => d.id)).toEqual(CHECKLIST_IDS);
    const pai = requiredReadinessDomains('pai').map((d) => d.id);
    expect(scoreReadiness(all(pai, 'ready'), { inspectionType: 'pai' }).verdict).toBe('ready');
    expect(scoreReadiness(all(pai.slice(1), 'ready'), { inspectionType: 'pai' }).verdict).toBe('incomplete');
  });

  it('every type-scoped domain exists in the checklist', () => {
    for (const t of ['bimo', 'pai', 'gcp', 'gmp', 'routine', 'for_cause', 'other'] as const) {
      expect(requiredReadinessDomains(t).length).toBeGreaterThan(0);
    }
  });

  it('gives the verdict the unrecorded domains cannot change', () => {
    const gmp = requiredReadinessDomains('gmp').map((d) => d.id);
    // Five of six recorded not started: even if the sixth were ready the score stays below 70.
    expect(scoreReadiness(all(gmp.slice(1), 'not_started'), { inspectionType: 'gmp' }).verdict).toBe('not_ready');
    // A recorded at-risk area is a blocker whatever is unrecorded.
    expect(scoreReadiness([{ area: 'data_integrity', status: 'at_risk' }], { inspectionType: 'gmp' }).verdict).toBe('at_risk');
  });

  it('reports an empty record as incomplete, naming every required domain', () => {
    const r = scoreReadiness([], { inspectionType: 'gmp' });
    expect(r.verdict).toBe('incomplete');
    expect(r.notRecorded).toEqual(requiredReadinessDomains('gmp').map((d) => d.id));
  });
});

describe('GET /api/inspections/readiness/score', () => {
  it('refuses a malformed inspectionId instead of answering with the org-wide score', async () => {
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { id: 3, organizationId: 7 }; next(); });
    app.use('/api/inspections', (await import('../../../routes/inspections')).default);
    await new Promise((r) => setTimeout(r, 50));
    dbCalls.n = 0; // importing the router initialises the audit service; count only the request
    const res = await request(app).get('/api/inspections/readiness/score?inspectionId=abc');
    expect(res.status).toBe(400);
    expect(dbCalls.n).toBe(0);
  });
});
