import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent } from 'undici';

// Controllable dns.lookup mock. Hoisted so the vi.mock factory can reference it.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return { ...actual, lookup: lookupMock };
});

import { safeFetch } from '../safeFetch';

/** Make the mocked dns.lookup resolve to the given addresses (all: true form). */
function resolveTo(addresses: Array<{ address: string; family: number }>): void {
  lookupMock.mockImplementation((_host: string, _opts: unknown, cb: Function) => {
    cb(null, addresses);
  });
}

/** Make the mocked dns.lookup fail. */
function resolveError(message: string): void {
  lookupMock.mockImplementation((_host: string, _opts: unknown, cb: Function) => {
    cb(new Error(message), []);
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  lookupMock.mockReset();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 } as unknown as Response));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetch — scheme / literal guard (before DNS)', () => {
  it('rejects non-https URLs without resolving DNS or fetching', async () => {
    await expect(safeFetch('http://example.com')).rejects.toThrow(/not a public https endpoint/);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a literal private/loopback host up front', async () => {
    await expect(safeFetch('https://127.0.0.1')).rejects.toThrow(/not a public https endpoint/);
    await expect(safeFetch('https://10.0.0.5')).rejects.toThrow(/not a public https endpoint/);
    await expect(safeFetch('https://169.254.169.254')).rejects.toThrow(/not a public https endpoint/);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects the IPv4-mapped IPv6 literal bypass up front', async () => {
    await expect(safeFetch('https://[::ffff:169.254.169.254]/')).rejects.toThrow(
      /not a public https endpoint/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('safeFetch — IP literals skip DNS and pinning', () => {
  it('fetches a public IPv4 literal directly (no DNS lookup, no dispatcher)', async () => {
    const res = await safeFetch('https://8.8.8.8/path', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://8.8.8.8/path');
    expect((init as Record<string, unknown>)?.dispatcher).toBeUndefined();
    expect((init as RequestInit)?.method).toBe('GET');
  });

  it('fetches a public IPv6 literal directly', async () => {
    await safeFetch('https://[2606:4700:4700::1111]/');
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('safeFetch — DNS rebinding defense (resolve + assert every IP is public)', () => {
  it('allows a hostname that resolves to a public IPv4 and pins the dispatcher', async () => {
    resolveTo([{ address: '93.184.216.34', family: 4 }]);
    await safeFetch('https://example.com/api', { headers: { Authorization: 'Bearer x' } });

    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/api');
    // Step 3: the connection is pinned via an undici Agent dispatcher.
    expect((init as Record<string, unknown>).dispatcher).toBeInstanceOf(Agent);
    // Caller init is preserved.
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer x' });
  });

  it('allows a hostname that resolves to a public IPv6', async () => {
    resolveTo([{ address: '2606:4700:4700::1111', family: 6 }]);
    await safeFetch('https://public.example.org/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when the hostname resolves to a private IPv4 (10/8)', async () => {
    resolveTo([{ address: '10.0.0.5', family: 4 }]);
    await expect(safeFetch('https://rebind.evil.test/')).rejects.toThrow(
      /resolved to non-public address 10\.0\.0\.5/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the hostname resolves to the cloud metadata IP', async () => {
    resolveTo([{ address: '169.254.169.254', family: 4 }]);
    await expect(safeFetch('https://rebind.evil.test/')).rejects.toThrow(
      /possible DNS rebinding/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the hostname resolves to loopback IPv6 (::1)', async () => {
    resolveTo([{ address: '::1', family: 6 }]);
    await expect(safeFetch('https://rebind.evil.test/')).rejects.toThrow(/non-public address ::1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the hostname resolves to a unique-local IPv6 (fd00::/8)', async () => {
    resolveTo([{ address: 'fd00::1', family: 6 }]);
    await expect(safeFetch('https://rebind.evil.test/')).rejects.toThrow(/non-public address fd00::1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when ANY resolved address is private (mixed public + private)', async () => {
    resolveTo([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]);
    await expect(safeFetch('https://rebind.evil.test/')).rejects.toThrow(
      /non-public address 192\.168\.1\.10/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when resolution yields no addresses (fail closed)', async () => {
    resolveTo([]);
    await expect(safeFetch('https://empty.example.test/')).rejects.toThrow(/resolved to no addresses/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when DNS resolution fails (fail closed)', async () => {
    resolveError('ENOTFOUND');
    await expect(safeFetch('https://nxdomain.example.test/')).rejects.toThrow(
      /DNS resolution for "nxdomain\.example\.test" failed/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when DNS resolution exceeds the timeout budget', async () => {
    // Never invoke the callback → force the timeout path.
    lookupMock.mockImplementation(() => {
      /* hang */
    });
    await expect(
      safeFetch('https://slow.example.test/', undefined, 'test request', { dnsTimeoutMs: 20 }),
    ).rejects.toThrow(/DNS resolution for "slow\.example\.test" timed out/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the provided context string in rebinding rejection messages', async () => {
    resolveTo([{ address: '10.1.2.3', family: 4 }]);
    await expect(
      safeFetch('https://rebind.evil.test/', undefined, 'Veeva Vault request'),
    ).rejects.toThrow(/Refused Veeva Vault request/);
  });
});
