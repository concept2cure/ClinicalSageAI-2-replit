/**
 * Regression contract: the legacy fabricated-FDA-submission endpoint is gone.
 *
 * POST /api/medical-devices/510k/:submissionId/submit (the SECOND registration
 * of that path in server/routes/medical-device-routes.js) used to fabricate an
 * FDA agency response with no environment gate: a minted `ACK<timestamp>`
 * identifier, a synthetic K-number, a fabricated "received" status with a
 * 90-day review estimate, a "submitted to FDA successfully" message — and it
 * wrote submissionStatus 'submitted' to the database for a transmission that
 * never happened. That handler is now a fail-closed 410 Gone with NO
 * simulation branch (doctrine reference: ESGSubmissionService.transmitToESG).
 *
 * NOTE on dispatch: the same path is registered TWICE in this router. The
 * earlier registration (validate + e-sign only, `transmitted: false` via
 * medicalDeviceService.submit510kToFDA) is the one Express dispatches to; the
 * legacy fabricating registration was shadowed dead code — but dead code that
 * would reactivate as fabrication if the earlier registration were ever
 * removed. These tests therefore pin BOTH layers: the legacy layer must be a
 * 410 that fabricates nothing, and no layer on the path may mint agency
 * identifiers or record submissionStatus 'submitted'.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockResponse } from '../setup';

const { mockMedicalDeviceService } = vi.hoisted(() => ({
  mockMedicalDeviceService: {
    submit510kToFDA: vi.fn(async () => ({})),
    update510kSubmission: vi.fn(async () => ({})),
    get510kSubmission: vi.fn(async () => null),
    get510kSubmissions: vi.fn(async () => []),
  },
}));

vi.mock('../../server/services/medicalDeviceService', () => ({
  default: mockMedicalDeviceService,
}));

vi.mock('../../server/services/quotaEnforcementService.js', () => ({
  default: { getUsageStatistics: vi.fn(async () => null) },
}));

vi.mock('../../server/middleware/auth.js', () => ({
  authenticateJWT: (req: any, _res: any, next: any) => {
    req.user = { id: 7, organizationId: 42 };
    next();
  },
}));

vi.mock('../../server/middleware/uploadSafety', () => ({
  assertUploadSafe: vi.fn(async () => undefined),
  UploadSafetyError: class UploadSafetyError extends Error {},
}));

import medicalDeviceRoutes from '../../server/routes/medical-device-routes.js';

const SUBMIT_PATH = '/510k/:submissionId/submit';

/** All router layers registered for POST /510k/:submissionId/submit. */
function submitLayers() {
  return (medicalDeviceRoutes as any).stack.filter(
    (l: any) => l.route?.path === SUBMIT_PATH && l.route?.methods?.post
  );
}

/** Final handler (past the auth/org middleware) of a route layer. */
function finalHandler(layer: any) {
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq() {
  return {
    params: { submissionId: '123' },
    body: {},
    user: { id: 7, organizationId: 42 },
    organizationId: 42,
    userId: 7,
  } as any;
}

/** Assertions shared by every response the path can produce: no fabricated agency evidence. */
function expectNoFabricatedAgencyResponse(payload: unknown) {
  const serialized = JSON.stringify(payload ?? {});
  expect(serialized).not.toContain('acknowledgmentNumber');
  expect(serialized).not.toContain('submissionTrackingNumber');
  expect(serialized).not.toContain('estimatedReviewTime');
  expect(serialized).not.toMatch(/ACK\d/);
  // A K-number is 'K' + year + sequence digits (e.g. K2025000123).
  expect(serialized).not.toMatch(/K\d{4,}/);
  expect(serialized).not.toMatch(/Submission Received/i);
  expect(serialized).not.toMatch(/submitted to FDA successfully/i);
}

function expectNoSubmittedStatusWrite() {
  for (const call of mockMedicalDeviceService.update510kSubmission.mock.calls) {
    // update510kSubmission(orgId, submissionId, updates, userId)
    expect(call[2]).not.toEqual(expect.objectContaining({ submissionStatus: 'submitted' }));
    expect(call[2]).not.toEqual(expect.objectContaining({ submissionStatus: 'test_submitted' }));
  }
}

describe('legacy fabricated 510(k) FDA submit endpoint is removed', () => {
  it('the legacy registration returns 410 Gone and fabricates nothing', async () => {
    const layers = submitLayers();
    expect(layers.length).toBeGreaterThanOrEqual(1);

    // The fabricating handler was the LAST registration of this path.
    const handler = finalHandler(layers[layers.length - 1]);
    const req = makeReq();
    const res = createMockResponse() as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        error: 'FDA_TRANSMISSION_NOT_AVAILABLE',
        transmitted: false,
        trackFilingsAt: 'POST /api/510k/estar/submissions',
      })
    );
    expect(payload.fdaResponse).toBeUndefined();
    expectNoFabricatedAgencyResponse(payload);

    // The DB is never told a submission happened.
    expect(mockMedicalDeviceService.update510kSubmission).not.toHaveBeenCalled();
  });

  it('no registration of the path mints agency identifiers or records status submitted', async () => {
    for (const layer of submitLayers()) {
      const res = createMockResponse() as any;
      await finalHandler(layer)(makeReq(), res);

      for (const [payload] of res.json.mock.calls) {
        expectNoFabricatedAgencyResponse(payload);
      }
    }
    expectNoSubmittedStatusWrite();
  });

  it('the live mounted endpoint returns no fabricated FDA response and never writes submitted', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/medical-devices', medicalDeviceRoutes);

    const res = await request(app).post('/api/medical-devices/510k/123/submit').send({});

    // Express dispatches to the FIRST registration (validate + e-sign, mocked
    // here to a benign empty result), so any fabricated field in the response
    // would have to come from route code — there must be none. Once the
    // duplicate registration is consolidated this request must return 410.
    expect([200, 410]).toContain(res.status);
    expect(res.body.fdaResponse).toBeUndefined();
    expectNoFabricatedAgencyResponse(res.body);
    expectNoSubmittedStatusWrite();
  });

  it('the fabrication cannot be reinstated in source (comment-stripped)', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    // Strip comments first: the fix deliberately documents the removed strings
    // in comments, and this contract is about what the CODE does (same idiom
    // as tests/regulatory-honesty.contract.test.ts).
    const stripped = fs
      .readFileSync(path.join(repoRoot, 'server/routes/medical-device-routes.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(stripped).not.toContain('acknowledgmentNumber');
    expect(stripped).not.toContain('submissionTrackingNumber');
    expect(stripped).not.toContain('estimatedReviewTime');
    expect(stripped).not.toContain('Submission Received');
    expect(stripped).not.toMatch(/submitted to FDA successfully/i);
    // No write of a submitted status (reads like the analytics filters use
    // `=== 'submitted'` and are allowed; object-literal writes are not).
    expect(stripped).not.toMatch(/submissionStatus:\s*'submitted'/);
    expect(stripped).not.toMatch(/submissionStatus:\s*testSubmission/);
    // The fail-closed replacement is present.
    expect(stripped).toContain("res.status(410)");
    expect(stripped).toContain('FDA_TRANSMISSION_NOT_AVAILABLE');
  });
});
