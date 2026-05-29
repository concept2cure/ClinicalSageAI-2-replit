/**
 * Fail-closed tests for FDA ESG transport (CR-1).
 *
 * sendToESG / queryESGStatus must NOT fabricate a submission receipt or a
 * random "ACCEPTED" status. In production (NODE_ENV=production) they throw,
 * because no real ESG AS2/SFTP transport is configured. Outside production
 * they return an explicitly `simulated` result that no caller can mistake
 * for a real FDA acknowledgment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The service imports `../db`; in the no-DB test env keep real exports but
// give db a harmless shape so module load doesn't throw.
vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return { ...actual, db: {}, pool: { connect: vi.fn(), query: vi.fn() } };
});

const ORIGINAL_ENV = process.env.NODE_ENV;

async function getService() {
  const mod = await import('../fdaIntegrationService');
  return mod.default;
}

describe('FDA ESG fail-closed (CR-1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('sendToESG throws in production rather than faking a receipt', async () => {
    process.env.NODE_ENV = 'production';
    const svc = await getService();
    await expect(svc.sendToESG({}, 'track1234')).rejects.toThrow(/not configured|NOT transmitted/i);
  });

  it('queryESGStatus throws in production rather than returning a random status', async () => {
    process.env.NODE_ENV = 'production';
    const svc = await getService();
    await expect(svc.queryESGStatus('rcpt')).rejects.toThrow(/not configured/i);
  });

  it('sendToESG returns an explicitly simulated result outside production', async () => {
    process.env.NODE_ENV = 'test';
    const svc = await getService();
    const res: any = await svc.sendToESG({}, 'track1234');
    expect(res.simulated).toBe(true);
    expect(String(res.receiptNumber)).toMatch(/^SIMULATED-/);
    expect(String(res.message)).toMatch(/SIMULATED/i);
  });

  it('queryESGStatus returns UNKNOWN/simulated (never a random ACCEPTED) outside production', async () => {
    process.env.NODE_ENV = 'test';
    const svc = await getService();
    const res: any = await svc.queryESGStatus('rcpt');
    expect(res.simulated).toBe(true);
    expect(res.status).toBe('UNKNOWN');
  });
});
