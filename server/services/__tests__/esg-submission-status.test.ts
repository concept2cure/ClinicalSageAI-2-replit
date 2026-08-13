/**
 * Post-transmit status persistence for ESGSubmissionService.
 *
 * transmitToESG can now only produce a simulated result in dev/test
 * ('simulated_not_transmitted', simulated: true) or throw in production.
 * The persistence gate used to key solely on response.status === 'accepted',
 * a value the code can no longer produce, which left every simulated run's
 * fda_510k_submission_packages row stuck at 'ready' — and, worse, would have
 * silently reused a real-transmission status had the shape ever drifted.
 *
 * These tests pin the mapping (packageUpdateForResponse — static and pure,
 * so no database is needed) to the governing invariant:
 *
 *   A package must NEVER show a status implying a real transmission
 *   ('submitted', 'accepted', 'transmitted') from a simulated run.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — records must accurately reflect events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The service imports `../db`; in the no-DB test env keep real exports but
// give db a harmless shape so module load doesn't throw.
vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return { ...actual, db: {}, pool: { connect: vi.fn(), query: vi.fn() } };
});

import type { ESGResponse } from '../ESGSubmissionService';

/** Statuses that assert an agency event happened. A simulated run may never mint one. */
const REAL_TRANSMISSION_STATUSES = ['submitted', 'accepted', 'transmitted'];

const ORIGINAL_ENV = process.env.NODE_ENV;

async function getServiceClass() {
  const mod = await import('../ESGSubmissionService');
  return mod.default;
}

describe('ESG package status after a simulated (non-transmitting) run', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('the response the simulated path actually produces maps to status "simulated"', async () => {
    const Service = await getServiceClass();
    const svc = new Service();
    // The real generator, not a hand-built literal — if its shape drifts,
    // this test drifts with it.
    const response = (
      svc as unknown as { simulateESGSubmission: (packageId: string) => ESGResponse }
    ).simulateESGSubmission('PKG-1755000000000-ABCD1234');

    const update = Service.packageUpdateForResponse(response, 42);

    expect(update.status).toBe('simulated');
    expect(REAL_TRANSMISSION_STATUSES).not.toContain(update.status);
    expect(update.submittedAt).toBeNull();
    expect(update.submittedBy).toBeNull();
    expect(update.fdaAcknowledgmentNumber).toBeNull();
    // The local identifier is kept for traceability and self-describes as unsent.
    expect(update.esgTransactionId).toMatch(/^SIMULATED-NOT-SENT-/);
  });

  it('the simulated status-poll response maps to "simulated" too', async () => {
    const Service = await getServiceClass();
    const svc = new Service();
    const response = await svc.checkSubmissionStatus('SIMULATED-NOT-SENT-PKG123');

    const update = Service.packageUpdateForResponse(response, 42);

    expect(update.status).toBe('simulated');
    expect(REAL_TRANSMISSION_STATUSES).not.toContain(update.status);
    expect(update.submittedAt).toBeNull();
    expect(update.submittedBy).toBeNull();
  });

  it('fails closed on the simulated flag even if the status field lies', async () => {
    const Service = await getServiceClass();
    // A malformed response claiming both `simulated: true` and an accepted
    // status with a minted ACK number must still persist as a simulation.
    const malformed: ESGResponse = {
      transactionId: 'SIMULATED-NOT-SENT-XYZ',
      acknowledgmentNumber: 'ACK-FORGED-001',
      status: 'accepted',
      message: 'malformed',
      timestamp: new Date(),
      simulated: true,
    };

    const update = Service.packageUpdateForResponse(malformed, 42);

    expect(update.status).toBe('simulated');
    expect(update.fdaAcknowledgmentNumber).toBeNull();
    expect(update.submittedAt).toBeNull();
    expect(update.submittedBy).toBeNull();
  });

  it('recognises the simulated status even without the flag', async () => {
    const Service = await getServiceClass();
    const flagless: ESGResponse = {
      transactionId: 'SIMULATED-NOT-SENT-XYZ',
      status: 'simulated_not_transmitted',
      message: 'flag dropped by a lossy serialiser',
      timestamp: new Date(),
    };

    const update = Service.packageUpdateForResponse(flagless, 42);

    expect(update.status).toBe('simulated');
    expect(REAL_TRANSMISSION_STATUSES).not.toContain(update.status);
    expect(update.submittedAt).toBeNull();
    expect(update.submittedBy).toBeNull();
  });
});

describe('ESG package status for real transport outcomes (future production path)', () => {
  // transmitToESG throws in production today, so these statuses are currently
  // unreachable — the mapping is pinned so the row reflects the agency outcome
  // faithfully once the production transport client exists.

  it('a genuine accepted response records the submission', async () => {
    const Service = await getServiceClass();
    const accepted: ESGResponse = {
      transactionId: 'ESG-TXN-REAL-001',
      acknowledgmentNumber: 'ACK-REAL-001',
      status: 'accepted',
      message: 'accepted by FDA ESG',
      timestamp: new Date(),
    };

    const update = Service.packageUpdateForResponse(accepted, 42);

    expect(update.status).toBe('submitted');
    expect(update.submittedAt).toBeInstanceOf(Date);
    expect(update.submittedBy).toBe(42);
    expect(update.fdaAcknowledgmentNumber).toBe('ACK-REAL-001');
  });

  it('non-accepted real statuses do not record a submission', async () => {
    const Service = await getServiceClass();
    for (const status of ['submitted', 'processing', 'rejected'] as const) {
      const update = Service.packageUpdateForResponse(
        {
          transactionId: 'ESG-TXN-REAL-002',
          status,
          message: 'in flight',
          timestamp: new Date(),
        },
        42
      );
      expect(update.status).toBe('ready');
      expect(update.submittedAt).toBeNull();
      expect(update.submittedBy).toBeNull();
    }
  });
});
