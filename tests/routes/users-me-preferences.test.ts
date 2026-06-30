/**
 * PUT /api/users/me/preferences — Phase 10.2 route contract
 * (docs/legacy/PHASE_10_2_INSTALL.md §4 + issue #619 §4 Step 4).
 *
 * Covers: auth (401 without/with bad token), validation (unknown keys
 * rejected, per-key shape checks), merge-patch semantics (top-level merge,
 * null deletes), and self-only semantics (target row comes from the JWT,
 * never from the body — a body-supplied user id is an unknown key → 400).
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectRows, updateCalls, updateReturning } = vi.hoisted(() => ({
  selectRows: { value: [] as Array<Record<string, unknown>> },
  updateCalls: { value: [] as Array<Record<string, unknown>> },
  updateReturning: { value: [] as Array<Record<string, unknown>> },
}));

vi.mock('../../server/db', () => {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectRows.value),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        updateCalls.value.push(vals);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => updateReturning.value),
          })),
        };
      }),
    })),
  };
  return { db, pool: { query: vi.fn() } };
});

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-unit-tests-min-32-chars-long';

function tokenFor(userId: number): string {
  return jwt.sign({ userId: String(userId), email: 'user@example.com', organizationId: '3' }, SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function makeApp() {
  const router = (await import('../../server/routes/users')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);
  return app;
}

describe('PUT /api/users/me/preferences', () => {
  beforeEach(() => {
    selectRows.value = [];
    updateCalls.value = [];
    updateReturning.value = [];
  });

  it('rejects requests without a token', async () => {
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .send({ density: 'compact' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_006');
    expect(updateCalls.value).toHaveLength(0);
  });

  it('rejects requests with an invalid token', async () => {
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', 'Bearer not.a.valid.token')
      .send({ density: 'compact' });
    expect(res.status).toBe(401);
    expect(updateCalls.value).toHaveLength(0);
  });

  it('rejects unknown preference keys (self-only: body cannot name a target user)', async () => {
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ userId: 99, density: 'compact' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Unknown preference key');
    expect(updateCalls.value).toHaveLength(0);
  });

  it('rejects an invalid density value', async () => {
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ density: 'cozy' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-boolean railGroups values and non-object railGroups', async () => {
    const app = await makeApp();
    const bad1 = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ railGroups: { lifecycle: 'yes' } });
    expect(bad1.status).toBe(400);

    const bad2 = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ railGroups: ['lifecycle'] });
    expect(bad2.status).toBe(400);
    expect(updateCalls.value).toHaveLength(0);
  });

  it('rejects an empty patch', async () => {
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('merge-patches into existing preferences (top-level merge, other keys kept)', async () => {
    selectRows.value = [
      { preferences: { density: 'compact', railGroups: { lifecycle: true } } },
    ];
    updateReturning.value = [
      { preferences: { density: 'compact', railGroups: { lifecycle: true }, dockOpen: true } },
    ];

    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ dockOpen: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateCalls.value).toHaveLength(1);
    expect(updateCalls.value[0].preferences).toEqual({
      density: 'compact',
      railGroups: { lifecycle: true },
      dockOpen: true,
    });
    expect(res.body.preferences).toEqual({
      density: 'compact',
      railGroups: { lifecycle: true },
      dockOpen: true,
    });
  });

  it('a null value deletes the key (RFC 7396 top-level semantics)', async () => {
    selectRows.value = [{ preferences: { density: 'spacious', dockOpen: true } }];
    updateReturning.value = [{ preferences: { density: 'spacious' } }];

    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ dockOpen: null });

    expect(res.status).toBe(200);
    expect(updateCalls.value[0].preferences).toEqual({ density: 'spacious' });
  });

  it('replaces railGroups wholesale and accepts all valid densities', async () => {
    selectRows.value = [{ preferences: { railGroups: { lifecycle: true, system: true } } }];
    updateReturning.value = [{ preferences: {} }];

    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ railGroups: { workstream: true }, density: 'spacious' });

    expect(res.status).toBe(200);
    expect(updateCalls.value[0].preferences).toEqual({
      railGroups: { workstream: true },
      density: 'spacious',
    });
  });

  it('404s when the session user row does not exist', async () => {
    selectRows.value = [];
    const app = await makeApp();
    const res = await request(app)
      .put('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ density: 'compact' });
    expect(res.status).toBe(404);
    expect(updateCalls.value).toHaveLength(0);
  });
});

describe('GET /api/users/me/preferences', () => {
  beforeEach(() => {
    selectRows.value = [];
  });

  it('requires a token', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/users/me/preferences');
    expect(res.status).toBe(401);
  });

  it('returns the session user preferences', async () => {
    selectRows.value = [{ preferences: { density: 'compact' } }];
    const app = await makeApp();
    const res = await request(app)
      .get('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({ density: 'compact' });
  });

  it('returns {} when the column is empty', async () => {
    selectRows.value = [{ preferences: null }];
    const app = await makeApp();
    const res = await request(app)
      .get('/api/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({});
  });
});
