/**
 * The TOTP codes the OQ harness presents to a server that requires MFA
 * (tests/validation/lib/totp.mjs), checked against RFC 6238 Appendix B and
 * against the one-use rule of RFC 6238 §5.2.
 */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { base32Decode, freshTotp, hotp, totp, timeStep } from './validation/lib/totp.mjs';

// RFC 6238 Appendix B, SHA-1 seed "12345678901234567890" (ASCII), base32 below.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP arithmetic', () => {
  it('decodes base32 the way RFC 4648 does', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq====').toString('ascii')).toBe('12345678901234567890');
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it.each(RFC_VECTORS)('matches RFC 6238 Appendix B at T=%i', (seconds, eightDigits) => {
    expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(eightDigits);
    expect(totp(RFC_SECRET, seconds * 1000)).toBe(eightDigits.slice(-6));
  });

  it('is HOTP over the 30-second time step', () => {
    const key = base32Decode(RFC_SECRET);
    expect(hotp(key, timeStep(59_000), 8)).toBe('94287082');
    expect(timeStep(59_000)).toBe(1);
  });
});

describe('a code is never presented twice for the same identity', () => {
  const email = `totp-reuse-${crypto.randomUUID()}@validation.local`;
  const file = path.join(
    tmpdir(),
    `oq-totp-last-step-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}.json`,
  );
  afterEach(() => {
    vi.useRealTimers();
    rmSync(file, { force: true });
  });

  it('waits for the next time step instead of reusing the current one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000 * 30 * 100 + 5_000)); // 5 s into step 100

    const first = await freshTotp(email, RFC_SECRET);
    expect(first).toBe(totp(RFC_SECRET, Date.now()));

    const second = freshTotp(email, RFC_SECRET);
    await vi.advanceTimersByTimeAsync(26_000); // crosses into step 101
    const code = await second;

    expect(timeStep(Date.now())).toBe(101);
    expect(code).toBe(totp(RFC_SECRET, Date.now()));
    expect(code).not.toBe(first);
  });
});
