/**
 * `linkToModule3` — the ONE path from a saved register row to the Module 3
 * canonical layer, and the one place a propagation failure is observed.
 *
 * It used to live in server/api/cmc/routes.ts and serve only the five newer
 * registers; the older registers, the batch record and the specification
 * routes each fired their write-through and forgot it, with a `.catch` that
 * could never run. Every register now goes through this function, so what it
 * reports — and what it meters — is pinned here once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const { inc, logError } = vi.hoisted(() => ({ inc: vi.fn(), logError: vi.fn() }));

vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc } } }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import {
  linkToModule3,
  observeWriteThroughFailure,
  writeThroughProjectId,
  type Module3Linkage,
} from '../link-to-module3';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const OTHER = '00000000-0000-4000-8000-000000000000';

const reqWith = (body: Record<string, unknown>) => ({ body }) as unknown as Request;

const ok = vi.fn(async () => ({ ok: true as const, sourceObjectId: '1', sourceHash: 'h', staleSections: ['3.2.S.4'], isNew: true }));
const failed = vi.fn(async () => ({ ok: false as const, code: 'write_failed' as const, reason: 'connection terminated unexpectedly' }));
const refused = vi.fn(async () => ({ ok: false as const, code: 'no_project' as const, reason: 'No projectId was provided' }));
const throws = vi.fn(async () => { throw new Error('mapper exploded on the row'); });

beforeEach(() => {
  inc.mockReset();
  logError.mockReset();
  ok.mockClear();
  failed.mockClear();
  refused.mockClear();
  throws.mockClear();
});

describe('writeThroughProjectId — which program the canonical write is keyed on', () => {
  it('the row wins: camelCase, then the raw snake_case column', () => {
    expect(writeThroughProjectId({ projectId: PROJECT }, reqWith({ projectId: OTHER }))).toBe(PROJECT);
    expect(writeThroughProjectId({ project_id: PROJECT }, reqWith({ projectId: OTHER }))).toBe(PROJECT);
  });

  it('falls back to the request body only when a request is given', () => {
    expect(writeThroughProjectId({ projectId: null }, reqWith({ projectId: ` ${OTHER} ` }))).toBe(OTHER);
    /* The batch, specification and comparability routes read the program from
       the stored row and never from the body — a caller must not be able to
       link an unfiled record under a program it is not filed in. */
    expect(writeThroughProjectId({ projectId: null })).toBeNull();
    expect(writeThroughProjectId({ project_id: '' }, reqWith({}))).toBeNull();
  });
});

describe('linkToModule3 — what the response says, and what is metered', () => {
  it('no project: saved to the register only, said so, and NOT metered — it is a refusal, not a failure', async () => {
    const linkage = await linkToModule3('write_through_analytical_method', 42, { id: 7 }, ok, reqWith({}));
    expect(linkage).toEqual({
      module3Linked: false,
      module3Warning: expect.stringMatching(/No project is set/),
    });
    expect(ok).not.toHaveBeenCalled();
    expect(inc).not.toHaveBeenCalled();
  });

  it('a successful write is reported as linked, with no warning', async () => {
    const linkage: Module3Linkage = await linkToModule3('write_through_analytical_method', 42, { id: 7, projectId: PROJECT }, ok);
    expect(linkage).toEqual({ module3Linked: true });
    expect(ok).toHaveBeenCalledWith(42, PROJECT, '7', { id: 7, projectId: PROJECT });
    expect(inc).not.toHaveBeenCalled();
  });

  it('a failed write is reported as not linked, with the warning, and metered under cmc_<propagation>', async () => {
    const linkage = await linkToModule3('write_through_batch', 42, { id: 5, project_id: PROJECT }, failed);
    expect(linkage).toEqual({
      module3Linked: false,
      module3Warning: expect.stringMatching(/did not complete/),
    });
    expect(inc).toHaveBeenCalledWith({ operation: 'cmc_write_through_batch', error_type: 'propagation_failed' });
    expect(logError).toHaveBeenCalledWith(
      'Module 3 canonical write-through failed',
      expect.objectContaining({ propagation: 'write_through_batch', recordId: '5', error: 'connection terminated unexpectedly' }),
    );
  });

  it('a write-through that throws (a mapper on a bad row) is caught, reported and metered the same way', async () => {
    const linkage = await linkToModule3('write_through_specification', 42, { id: 9, projectId: PROJECT }, throws);
    expect(linkage.module3Linked).toBe(false);
    expect(linkage.module3Warning).toMatch(/did not complete/);
    expect(inc).toHaveBeenCalledWith({ operation: 'cmc_write_through_specification', error_type: 'propagation_failed' });
    expect(logError).toHaveBeenCalledWith(
      'Module 3 canonical write-through failed',
      expect.objectContaining({ error: 'mapper exploded on the row' }),
    );
  });

  it('a no_project refusal coming back from the write-through itself is the no-project warning, unmetered', async () => {
    const linkage = await linkToModule3('write_through_change_control', 42, { id: 3, projectId: PROJECT }, refused);
    expect(linkage).toEqual({
      module3Linked: false,
      module3Warning: expect.stringMatching(/No project is set/),
    });
    expect(inc).not.toHaveBeenCalled();
  });

  it('a metric sink that throws never reaches the request', () => {
    inc.mockImplementationOnce(() => { throw new Error('registry gone'); });
    expect(() => observeWriteThroughFailure('write_through_batch', 1, new Error('x'))).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe('writeThroughProjectId — an in-process caller names the project directly', () => {
  it('reads a plain { projectId } source the way it reads a request body', () => {
    expect(writeThroughProjectId({ projectId: null }, { projectId: 'prog-9' })).toBe('prog-9');
    expect(writeThroughProjectId({ projectId: null }, { projectId: '  ' })).toBeNull();
    expect(writeThroughProjectId({ projectId: null }, { projectId: null })).toBeNull();
    // The stored row still wins over any source.
    expect(writeThroughProjectId({ projectId: 'stored' }, { projectId: 'prog-9' })).toBe('stored');
  });
});
