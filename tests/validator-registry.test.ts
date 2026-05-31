/**
 * Unit tests for the submission validator registry.
 *
 * Exercises listValidators()'s configuration gating and runHttpValidator()'s
 * GENERIC adapter contract: the generic JSON `{ findings: [...] }` response is
 * mapped to EctdFinding[], and a non-2xx response throws (so the caller records
 * the validator as errored, never as a pass). `fetch` is stubbed — no network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listValidators,
  runHttpValidator,
} from '../server/services/submission-gateways/validator-registry';

beforeEach(() => {
  delete process.env.FDA_VALIDATOR_URL;
  delete process.env.FDA_VALIDATOR_TOKEN;
  delete process.env.EMA_VALIDATOR_URL;
  delete process.env.PMDA_VALIDATOR_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FDA_VALIDATOR_URL;
  delete process.env.FDA_VALIDATOR_TOKEN;
});

describe('listValidators', () => {
  it('reports internal as always configured and agency validators as unconfigured by default', () => {
    const list = listValidators();
    const byId = Object.fromEntries(list.map((v) => [v.id, v]));
    expect(byId.internal.configured).toBe(true);
    expect(byId.fda_evalidator.configured).toBe(false);
    expect(byId.ema_validator.configured).toBe(false);
    expect(byId.pmda_precheck.configured).toBe(false);
  });

  it('reports an agency validator as configured once its URL env is set', () => {
    process.env.FDA_VALIDATOR_URL = 'https://example.invalid/validate';
    const byId = Object.fromEntries(listValidators().map((v) => [v.id, v]));
    expect(byId.fda_evalidator.configured).toBe(true);
  });
});

describe('runHttpValidator', () => {
  it('maps a generic findings JSON response to EctdFinding[]', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://example.invalid/validate';
    process.env.FDA_VALIDATOR_TOKEN = 'secret-token';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        findings: [
          { severity: 'error', ruleId: 'R1', ruleTitle: 'Bad thing', message: 'detail', filePath: 'm1/x.pdf' },
          { severity: 'warning', message: 'a warning' },
          { severity: 'bogus', message: 'unknown severity defaults to info' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const findings = await runHttpValidator('fda_evalidator', Buffer.from('PK-ZIP'), {
      sha256: 'abc',
      format: 'ectd',
    });

    expect(findings).toHaveLength(3);
    expect(findings[0]).toEqual({
      severity: 'error',
      ruleId: 'R1',
      message: 'Bad thing: detail',
      filePath: 'm1/x.pdf',
    });
    expect(findings[1]).toMatchObject({ severity: 'warning', ruleId: 'FDA_EVALIDATOR-FINDING', message: 'a warning' });
    expect(findings[2].severity).toBe('info');

    // The request used the configured URL and bearer token.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.invalid/validate');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer secret-token');
    expect(init.headers['X-Bundle-Sha256']).toBe('abc');
  });

  it('throws on a non-2xx response (errored, not a pass)', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://example.invalid/validate';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      runHttpValidator('fda_evalidator', Buffer.from('x'), { sha256: 's', format: 'ectd' }),
    ).rejects.toThrow(/HTTP 502/);
  });

  it('throws when the validator is not configured', async () => {
    await expect(
      runHttpValidator('fda_evalidator', Buffer.from('x'), { sha256: 's', format: 'ectd' }),
    ).rejects.toThrow(/not configured/);
  });

  it('throws when the response is missing a findings array', async () => {
    process.env.FDA_VALIDATOR_URL = 'https://example.invalid/validate';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ notFindings: [] }) });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      runHttpValidator('fda_evalidator', Buffer.from('x'), { sha256: 's', format: 'ectd' }),
    ).rejects.toThrow(/findings/);
  });
});
