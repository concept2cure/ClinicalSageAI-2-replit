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

  // CR-1 hardened the TRANSPORT and stopped one method short. signPackage took
  // a certificate and a private key, used neither, and returned
  // sha256(JSON.stringify(...)) labelled `algorithm: 'SHA256withRSA'` under a
  // canned `certificateSerial: 'FDA-CERT-001'` — with no environment fence at
  // all. A digest is not a signature: it says nothing about who produced the
  // package, which is the whole content of a Part 11 signature.
  it('signPackage refuses outright rather than returning a hash labelled as an RSA signature', async () => {
    const svc = await getService();
    expect(() =>
      svc.signPackage({ ectd: {}, fhir: {}, certificate: 'cert', privateKey: 'key' }),
    ).toThrow(/not implemented|NOT signed|Refusing/i);
  });

  it('refuses in development too — a fake signature is not safer outside production', async () => {
    // Unlike a transport receipt, which is labelled `simulated` and discarded,
    // a signature exists to be relied on later. There is no environment in
    // which returning a fabricated one is the right answer.
    process.env.NODE_ENV = 'development';
    const svc = await getService();
    expect(() => svc.signPackage({ ectd: {}, fhir: {} })).toThrow(/not implemented|NOT signed|Refusing/i);
  });

  it('carries the simulated flag out of submitToFDA instead of reporting a clean success', async () => {
    // sendToESG sets `simulated: true` precisely so no caller mistakes the
    // result for an FDA acknowledgement. submitToFDA dropped it: the returned
    // payload said "Submission sent to FDA successfully" and the
    // fda_integration_logs row said `success`, with the only surviving tell
    // being the SIMULATED- prefix inside the receipt string.
    process.env.NODE_ENV = 'test';
    const svc = await getService();
    vi.spyOn(svc as never as { logIntegration: () => Promise<void> }, 'logIntegration').mockResolvedValue(undefined);
    vi.spyOn(svc as never as { validatePackage: () => boolean }, 'validatePackage').mockReturnValue(true);
    vi.spyOn(svc as never as { startStatusPolling: () => void }, 'startStatusPolling').mockImplementation(() => {});

    const res: any = await svc.submitToFDA({}, 1);
    expect(res.simulated).toBe(true);
    expect(String(res.message)).toMatch(/SIMULATED|NOT transmitted/i);
    expect(String(res.message)).not.toMatch(/sent to FDA successfully/i);
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
