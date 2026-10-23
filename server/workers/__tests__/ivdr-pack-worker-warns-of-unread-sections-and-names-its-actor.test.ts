/**
 * The IVDR pack worker stores a pack whose Annex II sections could not be read
 * WITH a warning per unread section, and its audit rows name the job's real
 * requester — or the build is refused.
 *
 * What it used to do (until 2026-10-15):
 *   - buildWarnings only ever received PDF_FALLBACK; packContent.readFailures
 *     was never added, so a pack with unread sections was stored SUCCEEDED with
 *     has_warnings=false;
 *   - emitAudit wrote user_id `Number(userId) || 0`, so a job whose requester
 *     was missing (requested_by_user_id NULL → 'system') was audited as user 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  readFailures: [] as Array<{ section: string; error: string }>,
}));
vi.mock('../../services/ivdrPackManifest', () => ({
  buildManifestV1: vi.fn(async () => ({ manifest: { hashes: {} }, manifestJson: '{}', manifestHash: 'mh' })),
}));
vi.mock('../../services/ivdrPackContent', () => ({
  readIvdrPackRecordIds: vi.fn(async () => ({
    classificationId: 1, analyticalValidationIds: [], clinicalEvidenceIds: [], cdxWorkflowId: undefined, readFailures: [],
  })),
  buildIvdrPackContent: vi.fn(async () => ({ readFailures: h.readFailures })),
}));
vi.mock('../../services/docxGenerator', () => ({ generateIvdrDocx: vi.fn(async () => Buffer.from('docx')) }));
vi.mock('../../services/ivdrPackHtml', () => ({ renderIvdrPackHtml: vi.fn(() => '<html></html>') }));
vi.mock('../../export/renderers', () => ({
  renderHtmlToPdfTracked: vi.fn(async () => ({ buffer: Buffer.from('%PDF'), usedFallback: false })),
}));
vi.mock('../../services/storage/index.js', () => ({
  getStorageProvider: () => ({
    isAvailable: async () => true,
    put: async () => ({ vaultFileId: 'f', vaultVersionId: 'v', sha256: 'abcdef0123456789', sizeBytes: 4 }),
  }),
}));
vi.mock('../../services/tenant/tenant-lifecycle.js', () => ({ shouldProcessTenantInBackground: async () => true }));

import { runPackBuild } from '../ivdr-pack-worker';

const calls: Array<{ sql: string; params: unknown[] }> = [];
const query = async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  if (/FROM ivdr_binder_claims c/.test(sql)) return { rows: [{ id: 'c1', claim_key: 'k', status: 'APPROVED', evidence_count: '1' }] };
  if (/FROM ivdr_binder_claims/.test(sql)) return { rows: [{ id: 'c1', claim_key: 'k', status: 'APPROVED', required_for_pack: true }] };
  if (/SELECT next_version/.test(sql)) return { rows: [{ next_version: 3 }] };
  if (/INSERT INTO ivdr_packs/.test(sql)) return { rows: [{ id: 'pack-1' }] };
  return { rows: [] };
};
const pool = { query, connect: async () => ({ query, release: () => {} }) } as unknown as import('pg').Pool;

const job = (requester: string | null) => ({
  id: 'job-1', organization_id: 7, project_id: 'prog', pack_type: 'IVDR_TECHDOC',
  requested_by_user_id: requester as string, outputs: ['MANIFEST'], use_latest_approved: true, sign_build: false,
});
const promoted = () => calls.find((c) => /status = 'SUCCEEDED'/.test(c.sql))!;
const audits = () => calls.filter((c) => /INSERT INTO audit_events/.test(c.sql));

beforeEach(() => { calls.length = 0; h.readFailures = []; });

describe('a pack with unread Annex II sections carries a warning for each', () => {
  it('one warning per readFailures entry; has_warnings true', async () => {
    h.readFailures = [{ section: 'classification', error: 'relation x does not exist' }, { section: 'cdx', error: 'timeout' }];
    await runPackBuild(pool, job('42'));
    const params = promoted().params;
    expect(params[18], 'a pack with unread sections was stored with has_warnings=false').toBe(true);
    const warnings = JSON.parse(String(params[19])) as Array<{ code: string; message: string }>;
    expect(warnings.map((w) => w.code)).toEqual(['SECTION_UNREAD', 'SECTION_UNREAD']);
    expect(warnings[0].message).toContain('classification');
    expect(warnings[1].message).toContain('cdx');
    expect(JSON.stringify(warnings)).not.toContain('relation x does not exist');
  });

  it('nothing unread: no warning', async () => {
    await runPackBuild(pool, job('42'));
    expect(promoted().params[18]).toBe(false);
  });
});

describe('the audit rows name the real requester, or the build is refused', () => {
  it('PACK_BUILD_COMPLETED names user 42', async () => {
    await runPackBuild(pool, job('42'));
    const done = audits().find((c) => c.params[1] === 'PACK_BUILD_COMPLETED')!;
    expect(done.params[2]).toBe(42);
  });

  it.each([null, 'system', '0', 'abc'])('a job whose requester is %j is refused before anything is built', async (requester) => {
    await expect(runPackBuild(pool, job(requester))).rejects.toThrow(/IVDR_NO_REQUESTER/);
    expect(calls.some((c) => /INSERT INTO ivdr_packs/.test(c.sql)), 'a pack was built for no recorded requester').toBe(false);
    expect(audits().some((c) => c.params[2] === 0)).toBe(false);
  });
});
