/** RBM's optional project choice uses the existing creation-route fixture. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ANCHOR, shapedRow, validBody, executeProjectFixtureQuery, projectFixtureApp } from './projects-create-fixture';

const { query, release, membershipQuery } = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), membershipQuery: vi.fn() }));
function executeFixtureQuery(...args: unknown[]) { return executeProjectFixtureQuery(query, membershipQuery, ...args); }
vi.mock('../../../db.js', () => ({ pool: { query: executeFixtureQuery, connect: async () => ({ query: executeFixtureQuery, release }) } }));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: async () => ({ documentId: 'doc_test', sectionCount: 24 }),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
vi.mock('../../../services/submission-service/submission-service.js', () => ({ createSubmissionTx: async () => ({ id: 3101 }) }));

import projectsRouter, { serializeProgramDetail } from '../projects';
const appWith = (org: number | null, userId?: number) => projectFixtureApp(projectsRouter, org, userId);
const callWith = (fragment: string) => query.mock.calls.find(call => String(call[0]).includes(fragment)) as [string, unknown[]] | undefined;
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] }); release.mockReset();
  membershipQuery.mockReset().mockResolvedValue({ rows: [{ role: 'member' }] });
  delete process.env.PROGRAM_QUOTA_MODE;
});

describe('POST /api/c2c/projects — risk-based monitoring choice', () => {
  it.each(['true', 1, null, {}, []])('refuses a malformed monitoring selection %j before business SQL', async choice => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, riskBasedMonitoring: choice });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('boolean');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([true, false])('records monitoring choice %s in the program and same-transaction audit', async choice => {
    query.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ANCHOR[0]).mockResolvedValueOnce(ANCHOR[1]).mockResolvedValueOnce(ANCHOR[2]).mockResolvedValueOnce(ANCHOR[3])
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [shapedRow()] }).mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] });
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, riskBasedMonitoring: choice });
    expect(res.status).toBe(201);
    const metadata = callWith('INSERT INTO regulatory_programs')![1].filter(value => typeof value === 'string').map(value => {
      try { return JSON.parse(value as string); } catch { return null; }
    }).find(value => value?.createdVia === 'v2-new-project-wizard');
    expect(metadata).toMatchObject({ riskBasedMonitoring: choice });
    const audit = callWith('INSERT INTO audit_logs')![1].filter(value => typeof value === 'string').map(value => {
      try { return JSON.parse(value as string); } catch { return null; }
    }).find(value => value?.created_via === 'v2-new-project-wizard');
    expect(audit).toMatchObject({ riskBasedMonitoring: choice });
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.findIndex(sql => sql.includes('INSERT INTO audit_logs'))).toBeLessThan(statements.findIndex(sql => sql === 'COMMIT'));
    expect(statements.some(sql => /INSERT INTO rbm_|organization_modules|module_subscriptions/.test(sql))).toBe(false);
  });

  it.each([true, false, 'true', 1, undefined])('projects only the exact stored monitoring boolean %j', choice => {
    const result = serializeProgramDetail({ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05', metadata: { riskBasedMonitoring: choice, createdVia: 'private-provenance' } });
    expect(result.riskBasedMonitoring).toBe(choice === true);
    expect(result).not.toHaveProperty('metadata');
  });

});
