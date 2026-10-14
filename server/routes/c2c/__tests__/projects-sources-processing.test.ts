import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), search: vi.fn(), unscoped: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: (...args: unknown[]) => mocks.query(...args) } }));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({ listClientDocuments: mocks.unscoped }));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-search.js', async original => ({
  ...(await original<typeof import('../../../services/clinical-regulatory-evidence/data-room-search.js')>()), searchDataRoom: mocks.search,
}));
vi.mock('../../../services/clinical-regulatory-evidence/source-usage.service.js', () => ({ summarizeSourceUsage: async () => new Map() }));
import router from '../projects';
const P = '11111111-1111-4111-8111-111111111111';
const stage = (state = 'failed') => ({ version: 1, stage: 'derived_capture', processorRevision: 'data-room-processing:v1', state,
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', attempts: 1, claimedAt: '2026-10-14T04:00:00.000Z', leaseExpiresAt: null,
  nextRetryAt: '2026-10-14T04:01:00.000Z', completedAt: null, retryable: true, reasonCode: 'PERSISTENCE_FAILED', identity: {
    organizationId: 7, sourceId: 9, sha256: 'a'.repeat(64), uploadSha256: 'a'.repeat(64), fileUploadId: 'recorded-upload',
    storageRef: '/private/capture.bin', uploadStoragePath: '/private/capture.bin', programId: P, workspaceId: null,
    sizeBytes: 24, fileName: 'Assay report', uploadFileName: 'Assay report', sourceTitle: 'Assay report',
    mimeType: 'text/plain', sourceMimeType: 'text/plain', lineage: {},
  } });
const source = (over: Record<string, unknown> = {}) => ({ id: 9, title: 'Assay report', checksum: 'a'.repeat(64), isCurrent: true,
  dataEligible: true, originalFileAvailable: true, ingestionStatus: 'ingested', extractionStatus: 'extracted', textAvailable: false,
  createdAt: '2026-10-14T04:00:00.000Z', metadata: { dataRoomProcessing: stage() }, provenance: { extractionError: '/private/stale-error.bin' }, ...over });
function app() {
  const a = express(); a.use(express.json());
  a.use((req: express.Request, _res, next) => { (req as express.Request & { organizationId: number }).organizationId = 7; next(); });
  a.use('/api/c2c/projects', router); return a;
}
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [{ '?column?': 1 }] }); mocks.unscoped.mockResolvedValue([]); });
describe('source processing projection on the existing project read', () => {
  it('reports persisted availability and a safe processing summary without private identity/error fields', async () => {
    mocks.search.mockResolvedValue({ total: 1, currentTotal: 1, sources: [source()] });
    const r = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(r.status).toBe(200);
    expect(r.body.sources[0]).toMatchObject({ id: 9, textAvailable: false, processing: { state: 'failed', retryable: true, reasonCode: 'PERSISTENCE_FAILED' } });
    expect(JSON.stringify(r.body)).not.toMatch(/private|storageRef|identity|extractionError/);
  });

  it('reports recovered text under the same identity and drops obsolete failure presentation', async () => {
    mocks.search.mockResolvedValue({ total: 1, currentTotal: 1, sources: [source({ textAvailable: true,
      metadata: { dataRoomProcessing: { ...stage('completed'), retryable: false, reasonCode: null, nextRetryAt: null, completedAt: '2026-10-14T04:01:00.000Z' } } })] });
    const r = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(r.body.sources[0]).toMatchObject({ id: 9, checksum: 'a'.repeat(64), textAvailable: true, processing: { state: 'completed', reasonCode: null } });
    expect(JSON.stringify(r.body)).not.toMatch(/PERSISTENCE_FAILED|private/);
  });
});
