/**
 * Phase-3 MDX command handler tests — predicate proxy tools.
 *
 * Mocks `fetch` to simulate the BFF proxy. Verifies the gate, input
 * validation, audit emission, and error mapping for HTTP failure modes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});


// vi.hoisted so `audit` is initialized before the vi.mock factory runs.
const { audit } = vi.hoisted(() => ({
  audit: { logAction: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../auditService', () => ({ default: audit }));

import {
  predicateCandidateSetStatus,
  seMatrixPatch,
} from '../mdx-command-handlers-phase3';

const CTX = { userId: 7, organizationId: 11 };
const PROGRAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const yes = { confirm: 'yes', reason: 'a sufficient reason describing the change' };

let origToken: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  origToken = process.env.ANA_SERVICE_TOKEN;
  process.env.ANA_SERVICE_TOKEN = 'test-svc-token';
});

afterEach(() => {
  if (origToken !== undefined) process.env.ANA_SERVICE_TOKEN = origToken;
  else delete process.env.ANA_SERVICE_TOKEN;
});

describe('predicate.candidate.set_status', () => {
  it('refuses without confirm', async () => {
    const r = await predicateCandidateSetStatus(CTX, {
      candidateId: 'c-1',
      programId: PROGRAM,
      status: 'primary',
    });
    expect(r.action).toBe('confirmation_required');
  });

  it('rejects unknown status', async () => {
    const r = await predicateCandidateSetStatus(CTX, {
      ...yes,
      candidateId: 'c-1',
      programId: PROGRAM,
      status: 'gibberish',
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects non-uuid programId', async () => {
    const r = await predicateCandidateSetStatus(CTX, {
      ...yes,
      candidateId: 'c-1',
      programId: 'p-1',
      status: 'primary',
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits on success and forwards correct headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'c-1', status: 'primary' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await predicateCandidateSetStatus(CTX, {
      ...yes,
      candidateId: 'c-1',
      programId: PROGRAM,
      status: 'primary',
    });
    expect(r.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/predicate-intelligence/candidates/c-1/status');
    expect(String(url)).toContain('program_id=' + PROGRAM);
    expect(init.method).toBe('PATCH');
    expect(init.headers['X-Service-Token']).toBe('test-svc-token');
    expect(init.headers['X-Tenant-Id']).toBe('11');
    expect(init.headers['X-User-Id']).toBe('7');
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.predicate.candidate.status' }),
    );
  });

  it('returns 503 when ANA_SERVICE_TOKEN missing', async () => {
    delete process.env.ANA_SERVICE_TOKEN;
    const r = await predicateCandidateSetStatus(CTX, {
      ...yes,
      candidateId: 'c-1',
      programId: PROGRAM,
      status: 'primary',
    });
    expect(r.success).toBe(false);
  });

  it('maps 403 from the BFF to TENANT_ACCESS_DENIED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
    }));
    const r = await predicateCandidateSetStatus(CTX, {
      ...yes,
      candidateId: 'c-1',
      programId: PROGRAM,
      status: 'primary',
    });
    expect(r.error).toBe('TENANT_ACCESS_DENIED');
  });
});

describe('se_matrix.patch', () => {
  it('rejects missing patch object', async () => {
    const r = await seMatrixPatch(CTX, {
      ...yes,
      matrixRowId: 'm-1',
      programId: PROGRAM,
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits agent.ana.se_matrix.patch on 2xx with fieldsChanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm-1', updated: true }),
    }));
    await seMatrixPatch(CTX, {
      ...yes,
      matrixRowId: 'm-1',
      programId: PROGRAM,
      patch: { resolution: 'resolved', resolvedBy: 'team-A' },
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.se_matrix.patch',
        details: expect.objectContaining({
          fieldsChanged: ['resolution', 'resolvedBy'],
        }),
      }),
    );
  });
});
