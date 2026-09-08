/**
 * RIM registration dates — refused by name, not by Postgres.
 *
 * `approval_date` and `renewal_due_date` are Postgres DATE columns, and the
 * route's schema had them as bare `z.string()`. The store therefore never held
 * a bad date — Postgres rejected it — but the refusal reached the caller as a
 * 500 carrying `invalid input syntax for type date: "next spring"`. A renewal
 * deadline is a field a regulatory lead types by hand, and a lapsed
 * registration takes a product off the market, so the refusal has to name the
 * field and the format.
 *
 * The route's `fail()` also passed any unmapped error's `.message` straight
 * through, which is how the Postgres text got out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const governedMock = vi.fn();
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => governedMock(...a),
}));

import rimRouter from '../rim';

function app(org = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 5, organizationId: org };
    (req as any).tenantContext = { organizationId: org };
    next();
  });
  a.use('/api/rim', rimRouter);
  return a;
}

const validReason = 'Recording the EU renewal date from the approval letter.';

beforeEach(() => governedMock.mockReset());

describe('PUT /api/rim/products/:id/registrations — date validation', () => {
  it('refuses a free-text renewal date with a 400 that names the format', async () => {
    const res = await request(app())
      .put('/api/rim/products/12/registrations')
      .send({ country: 'DE', renewalDueDate: 'next spring', reason: validReason });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(JSON.stringify(res.body)).toMatch(/yyyy-mm-dd/);
    // And it never reached the database, so no Postgres wording can escape.
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input syntax/i);
  });

  it('refuses a malformed approval date the same way', async () => {
    const res = await request(app())
      .put('/api/rim/products/12/registrations')
      .send({ country: 'DE', approvalDate: '2026-13-45x', reason: validReason });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/yyyy-mm-dd/);
  });

  it('accepts a yyyy-mm-dd date — the guard must not block a real one', async () => {
    const res = await request(app())
      .put('/api/rim/products/12/registrations')
      .send({ country: 'DE', renewalDueDate: '2027-03-31', reason: validReason });

    // Past validation: whatever the governed write does next, it is not a 400
    // about the date shape.
    expect(res.status).not.toBe(400);
  });

  it('still refuses a missing reason — governed writes keep their reason', async () => {
    const res = await request(app())
      .put('/api/rim/products/12/registrations')
      .send({ country: 'DE', renewalDueDate: '2027-03-31', reason: 'short' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/at least 8 characters/);
  });
});
