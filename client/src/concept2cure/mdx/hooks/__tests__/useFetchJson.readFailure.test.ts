// @vitest-environment jsdom
/**
 * A refusal is not a failed read (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * The device screens reached inside the project (Pre-Sub, UDI, labeling, human
 * factors) call routes that refuse with distinct answers, and worded every one
 * of them as "couldn't load…":
 *   404 "Project not found"          server/lib/admit-project.ts (notFoundInTenant)
 *   503 VERIFICATION_UNAVAILABLE      server/lib/verification-outcome.ts
 *   403 MODULE_NOT_LICENSED           server/middleware/moduleEntitlementGate.ts
 *   403 LAUNCH_SCOPE                  the same gate, launch scope
 *   403 ORG_REQUIRED / IVD_NO_TENANT  the route could not confirm the organization
 *   403 "Insufficient permissions"    requireEditorAccess (server/middleware/orgMembership.ts)
 *   428                               a signature the act requires
 *
 * One classifier tells them apart (readFailureFor, beside saveFailureFor), and
 * useFetchJson exposes what it classified while keeping its `error` line for
 * the callers that read it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  describeReadFailure,
  readFailureFor,
  readRefusalOf,
  useFetchJson,
  type ReadFailureKind,
} from '../useFetchJson';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

/* The envelopes exactly as the server writes them. */
const NOT_FOUND = { error: 'Project not found' };
const UNCHECKED = {
  success: false,
  error: 'VERIFICATION_UNAVAILABLE',
  message: 'The project ownership check could not be run. This is not a verdict: nothing was verified and nothing failed verification.',
};
const NOT_LICENSED = {
  error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'device-presub', modules: ['device-presub'],
  reason: "device-presub: Module 'device-presub' requires standard tier or higher (current: free)",
};
const LAUNCH_SCOPE = { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } };
const ORG_REQUIRED = { error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } };
const ROLE = { error: 'Insufficient permissions' };
const SIGNATURE = {
  error: 'Approving a translation is an electronic signature: add it, then approve it with your password, what the signature means and a reason. Nothing was saved.',
  details: { code: 'TRANSLATION_APPROVAL_REQUIRES_SIGNATURE' },
};

describe('readFailureFor — one classifier for a read the server did not answer with data', () => {
  const CASES: ReadonlyArray<[label: string, status: number | undefined, code: string | undefined, kind: ReadFailureKind]> = [
    ['a project the organization does not own (404)', 404, undefined, 'not-found'],
    ['an ownership check that could not run (503 VERIFICATION_UNAVAILABLE)', 503, 'VERIFICATION_UNAVAILABLE', 'unchecked'],
    ['the module gate (403 MODULE_NOT_LICENSED)', 403, 'MODULE_NOT_LICENSED', 'not-enabled'],
    ['launch scope (403 LAUNCH_SCOPE)', 403, 'LAUNCH_SCOPE', 'out-of-release'],
    ['an organization the route could not confirm (403 ORG_REQUIRED)', 403, 'ORG_REQUIRED', 'no-organization'],
    ['an organization the IVD route could not confirm (403 IVD_NO_TENANT)', 403, 'IVD_NO_TENANT', 'no-organization'],
    ['a role refusal (403, no code)', 403, undefined, 'role'],
    ['a signature the act requires (428)', 428, undefined, 'signature'],
    ['a server error (500)', 500, undefined, 'failed'],
    ['a store that is not there (503 PENDING_STORE)', 503, 'PENDING_STORE', 'failed'],
    ['a 503 with no code', 503, undefined, 'failed'],
    ['a rejected request (400)', 400, undefined, 'failed'],
    ['no response at all (0)', 0, undefined, 'failed'],
    ['no status', undefined, undefined, 'failed'],
  ];
  for (const [label, status, code, kind] of CASES) {
    it(`${label} is ${kind}`, () => {
      expect(readFailureFor(status, code)).toBe(kind);
    });
  }

  it('a genuine failure is no refusal', () => {
    expect(readRefusalOf({ status: 500 })).toBeNull();
    expect(readRefusalOf({ status: 503, code: 'PENDING_STORE' })).toBeNull();
    expect(readRefusalOf({ status: 403, code: 'MODULE_NOT_LICENSED' })).toBe('not-enabled');
  });
});

describe('describeReadFailure — each class in its own words', () => {
  const what = 'the HFE/UE file';
  it('names each refusal by what it is, and none of them as a failed read', () => {
    const words = (kind: ReadFailureKind) => describeReadFailure(kind, what).message;
    expect(words('not-found')).toBe('This project was not found in your organization, so the HFE/UE file was not read.');
    expect(words('unchecked')).toMatch(/^The check that this project belongs to your organization was unavailable, so the HFE\/UE file was not read\./);
    expect(words('unchecked')).toMatch(/Try again/);
    expect(words('not-enabled')).toBe('This feature is not enabled for your organization, so the HFE/UE file was not read.');
    expect(words('out-of-release')).toBe('This part of the product is not in this release, so the HFE/UE file was not read.');
    expect(words('no-organization')).toBe('Your organization could not be confirmed, so the HFE/UE file was not read.');
    expect(words('role')).toBe('Your role cannot do this, so the HFE/UE file was not read.');
    expect(words('signature')).toBe('This step needs your electronic signature, so the HFE/UE file was not read.');
    for (const kind of ['not-found', 'unchecked', 'not-enabled', 'out-of-release', 'no-organization', 'role', 'signature'] as const) {
      const w = describeReadFailure(kind, what);
      expect(`${w.title} ${w.message}`).not.toMatch(/could not be read|couldn.t load|could not load|failed/i);
      expect(`${w.title} ${w.message}`).not.toMatch(/plan/i);
    }
  });

  it('only a genuine failure is "could not be read", and it can be tried again', () => {
    const w = describeReadFailure('failed', what);
    expect(w.title).toBe('The HFE/UE file could not be read');
    expect(w.retryable).toBe(true);
  });

  it('offers a retry only where trying again can change the answer', () => {
    const retryable = (kind: ReadFailureKind) => describeReadFailure(kind, what).retryable;
    expect(retryable('unchecked')).toBe(true);
    expect(retryable('failed')).toBe(true);
    for (const kind of ['not-found', 'not-enabled', 'out-of-release', 'no-organization', 'role', 'signature'] as const) {
      expect(retryable(kind)).toBe(false);
    }
  });

  it('names the record that was not found when it is not the project', () => {
    expect(describeReadFailure('not-found', "the Q-Sub's detail", { subject: 'this Q-Sub' }).message)
      .toBe("This Q-Sub was not found in your organization, so the Q-Sub's detail was not read.");
  });
});

describe('useFetchJson — exposes the classified failure and keeps its error line', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const answer = (body: unknown, status: number) =>
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    });

  const CASES: ReadonlyArray<[status: number, body: unknown, kind: ReadFailureKind, code: string | undefined]> = [
    [404, NOT_FOUND, 'not-found', undefined],
    [503, UNCHECKED, 'unchecked', 'VERIFICATION_UNAVAILABLE'],
    [403, NOT_LICENSED, 'not-enabled', 'MODULE_NOT_LICENSED'],
    [403, LAUNCH_SCOPE, 'out-of-release', 'LAUNCH_SCOPE'],
    [403, ORG_REQUIRED, 'no-organization', 'ORG_REQUIRED'],
    [403, ROLE, 'role', undefined],
    [428, SIGNATURE, 'signature', undefined],
    [500, { error: 'Internal error' }, 'failed', undefined],
  ];
  for (const [status, body, kind, code] of CASES) {
    it(`a ${status}${code ? ` ${code}` : ''} is ${kind}, with its status and code`, async () => {
      answer(body, status);
      const { result } = renderHook(() => useFetchJson<unknown>('/api/x'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.failure).toEqual({ kind, status, ...(code ? { code } : {}) });
      /* The line existing callers read is unchanged. */
      expect(result.current.error).toBe(`HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      expect(result.current.data).toBeNull();
    });
  }

  it('a body that is not JSON is classified by its status alone', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'upstream unavailable', json: async () => ({}) });
    const { result } = renderHook(() => useFetchJson<unknown>('/api/x'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failure).toEqual({ kind: 'failed', status: 503 });
    expect(result.current.error).toBe('HTTP 503: upstream unavailable');
  });

  it('no response at all is a failure with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useFetchJson<unknown>('/api/x'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failure).toEqual({ kind: 'failed', status: 0 });
    expect(result.current.error).toBe('Failed to fetch');
  });

  it('an answer with data has no failure, and neither does an idle read', async () => {
    answer({ data: [] }, 200);
    const { result } = renderHook(() => useFetchJson<unknown>('/api/x'));
    await waitFor(() => expect(result.current.data).toEqual({ data: [] }));
    expect(result.current.failure).toBeNull();
    const idle = renderHook(() => useFetchJson<unknown>(null));
    expect(idle.result.current.failure).toBeNull();
  });

  it('a refetch clears the previous failure while it is in flight', async () => {
    answer(NOT_LICENSED, 403);
    const { result } = renderHook(() => useFetchJson<unknown>('/api/x'));
    await waitFor(() => expect(result.current.failure?.kind).toBe('not-enabled'));
    let release: () => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ ok: true, status: 200, text: async () => '', json: async () => ({ data: 1 }) });
    }));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.failure).toBeNull();
    release();
    await waitFor(() => expect(result.current.data).toEqual({ data: 1 }));
    expect(result.current.failure).toBeNull();
  });
});

describe('one read classifier — no screen keeps its own copy', () => {
  /* The IVD readiness board's local 403 map (a86ed04ed) and the project refusal
     readers (projectScopedRead, useEngineering) each told statuses apart on
     their own. They read through readFailureFor now; a screen that branches on
     a refusal's status or code again is a second copy free to drift. */
  const src = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');
  const READERS = [
    'v2/surfaces/IvdReadinessBoard.tsx',
    'v2/surfaces/Labeling.tsx',
    'v2/surfaces/HumanFactors.tsx',
    'mdx/presub/PreSubManager.tsx',
    'mdx/surfaces/UdiSurface.tsx',
    'mdx/hooks/usePresub.ts',
    'mdx/hooks/useUdi.ts',
    'v2/projectScopedRead.tsx',
    'mdx/hooks/useEngineering.ts',
  ];
  const LOCAL_STATUS = /\bstatus\s*===\s*'?(403|404|428|503)\b/;
  const LOCAL_CODE = /['"](MODULE_NOT_LICENSED|LAUNCH_SCOPE|VERIFICATION_UNAVAILABLE|IVD_NO_TENANT|ORG_REQUIRED)['"]/;
  for (const rel of READERS) {
    it(`${rel} classifies no refusal itself`, () => {
      const text = src(rel);
      expect(text).not.toMatch(LOCAL_STATUS);
      expect(text).not.toMatch(LOCAL_CODE);
      expect(text).toMatch(/from '(\.\/|\.\.\/|\.\.\/\.\.\/mdx\/hooks\/|\.\.\/mdx\/hooks\/|\.\.\/\.\.\/v2\/)(useFetchJson|projectScopedRead)'/);
    });
  }
});
