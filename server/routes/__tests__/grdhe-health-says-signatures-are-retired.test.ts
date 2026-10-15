/**
 * GET /api/grdhe/health reports the signature routes as they are (audit
 * 2026-10-15, GRDHE follow-up 3).
 *
 * What it used to do: list `electronicSignatures: true` among the engine's
 * features, while POST /signatures and GET /signatures/:id/verify both answer
 * 410 (retired 2026-09-10; signatures are made through /api/esignature/sign).
 * The flag is read here against the routes themselves, not a constant.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/grdhe/grdheService', () => {
  class AuditScopeError extends Error {}
  class ExportJobNotFoundError extends Error {}
  class AdverseEventNotFoundError extends Error {}
  class ExportJobRefusedError extends Error {}
  return { grdheService: {}, AuditScopeError, ExportJobNotFoundError, AdverseEventNotFoundError, ExportJobRefusedError };
});

import router from '../grdheRoutes';

const app = () => express().use(express.json()).use('/api/grdhe', router);

describe('GET /api/grdhe/health', () => {
  it('does not offer electronic signatures the engine answers 410 for', async () => {
    const sign = await request(app()).post('/api/grdhe/signatures').send({});
    const verify = await request(app()).get('/api/grdhe/signatures/any/verify');
    expect([sign.status, verify.status]).toEqual([410, 410]);

    const health = await request(app()).get('/api/grdhe/health');
    expect(health.status).toBe(200);
    expect(health.body.data.features.electronicSignatures, 'both signature routes answer 410').toBe(false);
  });
});
