/**
 * The two §524B routes apply §524B only to a cyber device and report presence as
 * presence (2026-10-15).
 *
 * POST /api/cybersecurity-524b/readiness took eight per-artifact booleans and POST
 * /api/ivd-lifecycle/software/cybersecurity a list of the same eight camelCase ids;
 * both answered `readinessScore` (the share of artifacts present) and `ready` for
 * any device, never asking whether it is a cyber device, and their ids differed from
 * the cybersecurity documentation in market-specs/software-lifecycle.ts (CYBER_ITEMS).
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The auth gates are not what these cases are about; they install a user and pass. */
vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: 1, organizationId: 1 };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import cyberRouter from '../cybersecurity-524b';
import ivdLifecycleRouter from '../ivd-lifecycle';
import { fdaCybersecurityDocumentation } from '../../services/market-specs/software-lifecycle';

const app = express();
app.use(express.json());
app.use('/api/cybersecurity-524b', cyberRouter);
app.use('/api/ivd-lifecycle', ivdLifecycleRouter);

const CYBER_ITEM_IDS = fdaCybersecurityDocumentation({ cyberDevice: true }).items.map((i) => i.id);

describe('POST /api/cybersecurity-524b/readiness', () => {
  const post = (body: object) => request(app).post('/api/cybersecurity-524b/readiness').send(body);

  it('states no §524B figure when cyber-device status is not stated', async () => {
    const res = await post({ present: ['sbom'] });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ status: 'undetermined', present: ['sbom'], gaps: null, completeness: null, allPresent: null });
    expect(res.body.result).not.toHaveProperty('readinessScore');
    expect(res.body.result).not.toHaveProperty('ready');
  });

  it('for a cyber device, reports the CYBER_ITEMS artifacts present and missing', async () => {
    const res = await post({ cyberDevice: true, present: ['sbom', 'threat_model'] });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      status: 'required',
      present: ['sbom', 'threat_model'],
      gaps: CYBER_ITEM_IDS.filter((id) => id !== 'sbom' && id !== 'threat_model'),
      allPresent: false,
    });
    expect(res.body.result.completeness).toBeCloseTo(2 / CYBER_ITEM_IDS.length, 10);
  });

  it('refuses the retired per-artifact booleans instead of scoring them', async () => {
    const res = await post({ sbom: true, threatModel: true });
    expect(res.status).toBe(400);
  });

  it('refuses an artifact id that is not a §524B artifact, naming it', async () => {
    const res = await post({ cyberDevice: true, present: ['threatModel'] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/threatModel/);
  });
});

describe('POST /api/ivd-lifecycle/software/cybersecurity', () => {
  const post = (body: object) => request(app).post('/api/ivd-lifecycle/software/cybersecurity').send(body);

  it('states no §524B figure when cyber-device status is not stated', async () => {
    const res = await post({ present: ['sbom', 'threat_model'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'undetermined', gaps: null, completeness: null, allPresent: null });
    expect(res.body).not.toHaveProperty('readinessScore');
    expect(res.body).not.toHaveProperty('ready');
  });

  it('for a cyber device, reports the CYBER_ITEMS artifacts present and missing', async () => {
    const res = await post({ cyberDevice: true, present: ['sbom', 'threat_model'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'required', present: ['sbom', 'threat_model'], allPresent: false });
    expect(res.body.gaps).toHaveLength(CYBER_ITEM_IDS.length - 2);
    expect(Array.isArray(res.body.knowledge)).toBe(true);
  });

  it('refuses a cyber-device answer that is not true or false', async () => {
    const res = await post({ cyberDevice: 'yes', present: [] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/cyberDevice/);
  });
});
