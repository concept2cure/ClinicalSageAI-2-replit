/**
 * ECTDScaffoldingService (no production importer; server/services/index.ts, which
 * nothing imports, re-exports it) — a failed read is an error, a status the table
 * cannot hold is refused, and an audited seeding is audited every time.
 *
 * Until 2026-10-15:
 *  - validateModuleCode answered false ("not a valid module code") when the read
 *    of ectd.module_structure failed;
 *  - updateFolderStatus ran `UPDATE ectd.project_folders SET status = …` by folder
 *    id alone, with no organization predicate, and wrote its audit row only when
 *    the optional user and organization were passed — against a table whose only
 *    creator (db/migrations/038) defines no status column;
 *  - seedProjectHierarchy passed the PROJECT NAME as the DB function's agency
 *    code, reported the `agency` it never applied, and audited only when both
 *    optional ids were passed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>>(),
  auditLog: vi.fn(async (_input: Record<string, unknown>) => ({ persisted: true, chained: true, tamperProof: true })),
}));
vi.mock('../../../db', () => ({ getPool: () => ({ query: h.query }) }));
vi.mock('../../audit/auditLogger', () => ({
  AuditLogger: class {
    log(input: Record<string, unknown>) {
      return h.auditLog(input);
    }
  },
}));

import { ECTDScaffoldingService } from '../ECTDScaffoldingService';

const PROJECT = '0e000000-0000-4000-8000-0000000000e1';
const USER = '0e000000-0000-4000-8000-0000000000a1';
const ORG = '0e000000-0000-4000-8000-0000000000b1';

beforeEach(() => {
  h.query.mockReset();
  h.auditLog.mockClear();
});

describe('validateModuleCode', () => {
  it('lets a failed read of the module structure surface, instead of answering "not valid"', async () => {
    h.query.mockRejectedValue(new Error('relation "ectd.module_structure" does not exist'));
    await expect(new ECTDScaffoldingService().validateModuleCode('m1.2', 'FDA')).rejects.toThrow(/module_structure/);
  });
});

describe('updateFolderStatus', () => {
  it('refuses, and runs no unscoped UPDATE', async () => {
    h.query.mockResolvedValue({ rows: [] });
    await expect(new ECTDScaffoldingService().updateFolderStatus('folder-1', 'complete')).rejects.toThrow(/no status column/);
    expect(h.query.mock.calls.some(([sql]) => /UPDATE\s+ectd\.project_folders/i.test(String(sql)))).toBe(false);
  });
});

describe('seedProjectHierarchy', () => {
  it('seeds for the agency it reports, and audits it', async () => {
    h.query.mockResolvedValue({ rows: [{ folders_created: 312, execution_ms: 41 }] });
    const result = await new ECTDScaffoldingService().seedProjectHierarchy(PROJECT, 'Acme Program', 'EMA', USER, ORG);
    const [, params] = h.query.mock.calls[0];
    expect(params).toEqual([PROJECT, 'EMA', USER]);
    expect(result.agency).toBe('EMA');
    expect(h.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'ectd_hierarchy_seeded', userId: USER, organizationId: ORG }));
  });

  it('refuses to seed without the acting user and organization, and touches nothing', async () => {
    h.query.mockResolvedValue({ rows: [{ folders_created: 312, execution_ms: 41 }] });
    const seed = new ECTDScaffoldingService().seedProjectHierarchy as unknown as (...a: unknown[]) => Promise<unknown>;
    await expect(seed.call(new ECTDScaffoldingService(), PROJECT, 'Acme Program', 'EMA')).rejects.toThrow(/user and organization/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not report success when its audit row was not persisted', async () => {
    h.query.mockResolvedValue({ rows: [{ folders_created: 312, execution_ms: 41 }] });
    h.auditLog.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false });
    await expect(
      new ECTDScaffoldingService().seedProjectHierarchy(PROJECT, 'Acme Program', 'EMA', USER, ORG),
    ).rejects.toThrow(/audit row was not persisted/);
  });
});
