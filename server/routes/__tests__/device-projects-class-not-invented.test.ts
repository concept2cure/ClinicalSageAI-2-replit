/**
 * POST /api/device-projects does not invent a risk class, and the two class
 * vocabularies come from the module that governs them (2026-10-12 review).
 *
 * ── What it did ─────────────────────────────────────────────────────────────
 * The handler destructured `deviceClass = 'II'`. A create that did not state a
 * class produced a device project whose record ASSERTED Class II — the class
 * that decides the premarket route, the evidence a submission owes and, in
 * Europe, whether a notified body is involved at all. Nothing downstream could
 * tell that assertion from a sponsor's own: the surfaces that read it render
 * `Class II` either way, and the post-market and standards services key their
 * applicability off it.
 *
 * A risk class is a VERDICT. This repository's second rule is that verdicts
 * come from deterministic engines and the model narrates; a verdict invented in
 * a request default is the same defect one layer down.
 *
 * ── And what it refused ─────────────────────────────────────────────────────
 * The accepted list was `['I', 'II', 'IIa', 'IIb', 'III']` — three US classes
 * and two of the four MDR rule classes, mixed, with nothing saying which
 * regulator each belonged to. So `Is`, `Im` and `Ir` were refused, though they
 * are exactly what a sterile, measuring or reusable-surgical Class I device
 * declares under the MDR: a European sponsor could not state its own class
 * through this route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'device-projects-class-not-invented-32ch';
});

const H = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  existing: undefined as Record<string, unknown> | undefined,
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        H.inserted.push(v);
        return { returning: async () => [{ id: 51, ...v }] };
      },
    }),
    select: () => ({ from: () => ({ where: async () => (H.existing ? [H.existing] : []) }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        H.updated.push(v);
        return { where: () => ({ returning: async () => [{ id: 51, ...v }] }) };
      },
    }),
  },
}));
vi.mock('../../db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({}) }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
  setAuditRowHeaders: () => undefined,
}));

import request from 'supertest';
import express from 'express';
import deviceProjectsRouter from '../device-projects';
import { MDR_DECLARED_CLASSES } from '@shared/regulatory/device-class';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 7, role: 'member', organizationId: 9 };
  req.tenantId = 9;
  next();
});
app.use('/api/device-projects', deviceProjectsRouter);

const create = (body: Record<string, unknown>) =>
  request(app).post('/api/device-projects').send({ deviceName: 'Catheter', clientWorkspaceId: 4, ...body });

const storedClass = () => (H.inserted.at(-1)!.metadata as Record<string, unknown>).deviceClass;

beforeEach(() => {
  H.inserted = [];
  H.updated = [];
  H.existing = undefined;
});

describe('a create that states no class', () => {
  it('stores no class, rather than Class II', async () => {
    const res = await create({});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(storedClass(), 'the class nobody determined').toBeNull();
  });

  it('is not refused, because a device project precedes its classification', async () => {
    expect((await create({})).status).toBe(201);
    expect((await create({ deviceClass: '' })).status, 'nor is an empty one').toBe(201);
    expect(storedClass()).toBeNull();
  });
});

describe('a create that states one', () => {
  it('stores exactly what was stated', async () => {
    expect((await create({ deviceClass: 'III' })).status).toBe(201);
    expect(storedClass()).toBe('III');
  });

  it('accepts the MDR classes a Class I device actually declares', async () => {
    /* Is, Im and Ir: sterile, measuring, reusable surgical. Each is a Class I
       device whose notified body is involved for that one aspect (Art 52(7)),
       and each was refused by the hand-written list. */
    for (const cls of ['Is', 'Im', 'Ir']) {
      const res = await create({ deviceClass: cls });
      expect(res.status, `${cls}: ${JSON.stringify(res.body)}`).toBe(201);
      expect(storedClass()).toBe(cls);
    }
  });

  it('accepts every class the governed vocabulary holds, so the route and the platform agree', async () => {
    for (const cls of MDR_DECLARED_CLASSES) {
      expect((await create({ deviceClass: cls })).status, cls).toBe(201);
    }
    for (const cls of ['I', 'II', 'III']) {
      expect((await create({ deviceClass: cls })).status, cls).toBe(201);
    }
  });

  it('refuses a class neither regulator has', async () => {
    const res = await create({ deviceClass: 'IV' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deviceClass must be one of/);
  });
});

describe('withdrawing a class that was stated in error', () => {
  beforeEach(() => {
    H.existing = { id: 51, organizationId: 9, metadata: { deviceClass: 'II', manufacturer: 'Acme' } };
  });

  it('is possible, by patching it to null', async () => {
    const res = await request(app).put('/api/device-projects/51').send({ deviceClass: null });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const meta = H.updated.at(-1)!.metadata as Record<string, unknown>;
    expect(meta.deviceClass, 'withdrawn, not exchanged for another guess').toBeNull();
    expect(meta.manufacturer, 'and the rest of the record is untouched').toBe('Acme');
  });

  it('leaves the class alone where the patch does not mention it', async () => {
    const res = await request(app).put('/api/device-projects/51').send({ manufacturer: 'Beta' });
    expect(res.status).toBe(200);
    expect((H.updated.at(-1)!.metadata as Record<string, unknown>).deviceClass).toBe('II');
  });

  it('still refuses a class that is not one', async () => {
    const res = await request(app).put('/api/device-projects/51').send({ deviceClass: 'Class 2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/or null to withdraw it/);
  });
});
