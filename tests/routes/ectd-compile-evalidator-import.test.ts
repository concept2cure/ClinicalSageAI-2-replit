/**
 * eCTD compile — an agency-validator report, imported. 2026-09-23 (W5/D7,
 * WO-9 Click 6).
 *
 * LORENZ eValidator runs outside the product, on the operator's machine, over
 * the exported package. Its JSON report is imported against the compilation
 * whose package it was run over, through the compile surface's own validate
 * route, and kept with that compilation. The report and the §11.10(e) record
 * of its import commit together or not at all. A report the parser cannot
 * read is refused with the parser's own words — never stored as clean.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, poolConnect, auditWrite } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolConnect: vi.fn(),
  auditWrite: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery, connect: poolConnect } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/auditService', () => ({
  writeChainedAuditRow: auditWrite,
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
}));

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { ORG, handlerOf, mockSpineOn, makeReq } from './ectd-compile-spine.harness';

const getHandler = (routePath: string, method: 'get' | 'post') => handlerOf(ectdCompileRoutes, routePath, method);
const mockSpine = mockSpineOn(poolQuery);

const REPORT = JSON.stringify({
  findings: [
    { ruleId: '1306', severity: 'High', message: 'modified-file does not resolve', location: '0001/index.xml' },
    { ruleId: '1734', severity: 'Medium', message: 'Leaf title is long', location: 'm2/25-clin-over/clinical-overview.pdf' },
  ],
});

/** A transaction client. `found: false` = no such compilation of this submission;
 *  `existing` = the report already imported against it. */
function txClient(opts: { found?: boolean; existing?: Record<string, unknown> | null } = {}) {
  const found = opts.found ?? true;
  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (/SELECT external_validation/i.test(sql)) {
        return found ? { rowCount: 1, rows: [{ external_validation: opts.existing ?? null }] } : { rowCount: 0, rows: [] };
      }
      if (/UPDATE ectd_compilations/i.test(sql)) return { rowCount: 1, rows: [{ sequence_number: '0001' }] };
      return { rowCount: 0, rows: [] };
    }),
  };
  poolConnect.mockResolvedValue(client);
  return client;
}

const verbs = (client: ReturnType<typeof txClient>) =>
  client.query.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0].toUpperCase());

async function importReport(body: Record<string, unknown>) {
  const res = createMockResponse() as any;
  const req = makeReq({ evalidatorReport: body });
  req.user.email = 'ra.lead@example.com';
  await getHandler('/:projectIdent/validate', 'post')(req, res);
  return { res, payload: res.json.mock.calls[0]?.[0] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSpine();
  auditWrite.mockResolvedValue(undefined);
});

describe('POST /:projectIdent/validate — importing an eValidator report', () => {
  it('keeps the report with its compilation, and its import record commits with it', async () => {
    const client = txClient();
    const { res, payload } = await importReport({ compilationId: 31, fileName: 'evalidator-0001.json', text: REPORT });

    expect(res.status).not.toHaveBeenCalled();
    expect(payload.imported).toBe(true);
    expect(payload.sequenceNumber).toBe('0001');
    expect(payload.externalValidation).toMatchObject({
      validator: 'lorenz-evalidator',
      source: 'imported',
      fileName: 'evalidator-0001.json',
      reportSha256: createHash('sha256').update(REPORT).digest('hex'),
      importedBy: 3,
      importedByEmail: 'ra.lead@example.com',
      errorCount: 1,
      warningCount: 1,
      infoCount: 0,
      supersedes: [],
    });
    expect(payload.externalValidation.findings).toHaveLength(2);

    // One transaction: the compilation read under lock, the report, and the
    // audit row of its import, together.
    expect(verbs(client)).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    const [selectSql, selectParams] = client.query.mock.calls[1] as unknown as [string, unknown[]];
    expect(selectSql).toMatch(/organization_id = \$\d/);
    expect(selectSql).toMatch(/submission_id = \$\d/);
    expect(selectSql).toMatch(/FOR UPDATE/);
    expect(selectParams).toEqual(expect.arrayContaining([31, ORG, 55]));
    expect(auditWrite).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: 'EVALIDATOR_REPORT_IMPORTED', resourceType: 'ectd_compilation', resourceId: 31 }),
    );
    expect(auditWrite.mock.invocationCallOrder[0]).toBeLessThan(client.query.mock.invocationCallOrder[3]);
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses a report it cannot read, in the parser\'s words, and stores nothing', async () => {
    const { res, payload } = await importReport({
      compilationId: 31,
      text: JSON.stringify({ results: [{ ruleId: '1306', severity: 'High' }] }),
    });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(payload.error.code).toBe('REPORT_UNREADABLE');
    expect(payload.error.message).toMatch(/not an eValidator report this product reads.*results/);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('refuses a report that is not JSON', async () => {
    const { res, payload } = await importReport({ compilationId: 31, text: '<report><finding severity="High"/></report>' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(payload.error.code).toBe('REPORT_UNREADABLE');
    expect(payload.error.message).toMatch(/JSON/);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('refuses a compilation that is not a package of this program\'s submission', async () => {
    const client = txClient({ found: false });
    const { res, payload } = await importReport({ compilationId: 999, text: REPORT });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(payload.error.code).toBe('COMPILATION_NOT_FOUND');
    expect(verbs(client)).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it('a replaced report stays listed on the one that replaces it, and the import record names it', async () => {
    const earlier = {
      validator: 'lorenz-evalidator', source: 'imported', importedAt: '2026-09-22T15:00:00.000Z', importedBy: 4,
      importedByEmail: 'qa.reviewer@example.com', fileName: 'evalidator-first.json', reportSha256: 'a'.repeat(64),
      findings: [{ ruleId: '1306', severity: 'error', message: 'x' }], errorCount: 1, warningCount: 0, infoCount: 0,
      supersedes: [],
    };
    txClient({ existing: earlier });
    const { payload } = await importReport({ compilationId: 31, text: REPORT });

    expect(payload.externalValidation.supersedes).toEqual([{
      importedAt: '2026-09-22T15:00:00.000Z', importedBy: 4, importedByEmail: 'qa.reviewer@example.com',
      fileName: 'evalidator-first.json', reportSha256: 'a'.repeat(64), errorCount: 1, warningCount: 0, infoCount: 0,
    }]);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: expect.objectContaining({ replacesReportSha256: 'a'.repeat(64) }) }),
    );
  });

  it('stores nothing when the record of the import cannot be written', async () => {
    const client = txClient();
    auditWrite.mockRejectedValueOnce(new Error('audit_logs unavailable'));
    const { res, payload } = await importReport({ compilationId: 31, text: REPORT });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(payload.error.code).toBe('IMPORT_NOT_RECORDED');
    expect(verbs(client)).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'ROLLBACK']);
  });

  it('refuses a request that names no compilation or carries no report', async () => {
    for (const body of [{ text: REPORT }, { compilationId: 31 }, { compilationId: 'x', text: REPORT }, { compilationId: 31, text: '' }]) {
      const { res } = await importReport(body);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(poolConnect).not.toHaveBeenCalled();
  });
});

describe('GET /:projectIdent/history — an imported report is shown with its compilation', () => {
  it('reads the stored report back with each compilation', async () => {
    const stored = { validator: 'lorenz-evalidator', source: 'imported', errorCount: 0, warningCount: 1, infoCount: 0, findings: [] };
    mockSpine({ history: [{ id: 31, sequence_number: '0001', has_manifest: true, external_validation: stored }] });
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/history', 'get')(makeReq(), res);

    const historySql = poolQuery.mock.calls.map((c) => String(c[0])).find((s) => /FROM ectd_compilations/i.test(s));
    expect(historySql).toMatch(/external_validation/);
    expect(res.json.mock.calls[0][0].compilations[0].external_validation).toEqual(stored);
  });
});
