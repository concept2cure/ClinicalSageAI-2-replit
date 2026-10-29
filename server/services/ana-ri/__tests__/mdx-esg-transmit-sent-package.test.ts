/**
 * AnA's transmit keeps the exact bytes it sends, and says nothing was sent when
 * it cannot keep them (2026-10-29, W5/D7; CSR path review, "Archive").
 *
 * The transmittal recorded the package's digest and a staged path, and nothing
 * kept the bytes. The guarded transmit now stores them before the wire
 * (submission-gateways/sent-package-archive.ts). This runs the real handler,
 * governed transmit, guard and archive. Only the FDA gateway's own send is
 * replaced, by one that reads the package through readVerifiedBundle as the
 * real AS2 send does. The full AS2 stack, wire included, is
 * mdx-esg-transmit-gateway.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { fingerprintPackageContent, sha256Hex, type PackageContentRow } from '../../ectd/package-content-fingerprint';

const h = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; args: unknown[] }>,
  descriptor: null as unknown,
  sections: [] as Array<Record<string, unknown>>,
  store: { fail: false, puts: [] as Array<{ orgId: number; projectId: string; bytes: Buffer }> },
  recordGovernedAction: vi.fn(async (_client: unknown, _params: Record<string, unknown>) => ({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'deadbeef' })),
}));

vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../../db', () => {
  const query = async (sql: string, args: unknown[] = []) => {
    h.queries.push({ sql, args });
    // The package records its creator (user 8); user 7 transmits as a colleague.
    if (sql.includes('FROM c2c_submission_packages')) return { rows: [{ created_by_id: 8, metadata: { bundle: h.descriptor } }], rowCount: 1 };
    if (sql.includes('FROM c2c_package_sections')) return { rows: h.sections, rowCount: h.sections.length };
    return { rows: [], rowCount: 0 };
  };
  const client = { query, release: () => undefined };
  return { pool: { query, connect: async () => client }, getPool: () => ({ query, connect: async () => client }), db: {} };
});
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: h.recordGovernedAction }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) } }));
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    put: async (o: { orgId: number; projectId: string; bytes: Buffer }) => {
      if (h.store.fail) throw new Error('bucket unavailable');
      h.store.puts.push(o);
      const { createHash: hash } = await import('crypto');
      return { vaultFileId: 'vault://kept', vaultVersionId: 'kept-1', sizeBytes: o.bytes.length,
        sha256: hash('sha256').update(o.bytes).digest('hex'), provider: 's3' };
    },
  }),
}));

import { esgTransmit } from '../mdx-command-handlers';
import { _resetMdxToolRateLimitersForTests } from '../mdx-tool-rate-limit';
import { FdaEsgGateway } from '../../submission-gateways/fda-esg';
import { readVerifiedBundle } from '../../submission-gateways/bundle-integrity';

const CONTENT: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: 'estar-summary', sectionLabel: '510(k) Summary', sortOrder: 0, artifactDbId: 1, title: '510(k) summary', version: 1, ctdSection: null, contentSha256: sha256Hex('510(k) summary'), filable: true },
];
h.sections = CONTENT.map((r) => ({
  section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel, sort_order: r.sortOrder, artifact_db_id: r.artifactDbId,
  title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256, status: 'approved', approved_version_id: r.version, published_version_id: null,
}));

const CTX = { userId: 7, organizationId: 11,
  signoff: { reasonForChange: 'RA + QA sign-off complete; transmitting the cleared 510(k) package', signatureVerified: true, signaturePurpose: 'approval', verifiedAt: new Date('2026-10-29T10:00:00Z') } };
const PARAMS = { packageId: 42, environment: 'production', confirm: 'yes-transmit', reason: 'pre-flight green; RA + QA sign-off complete; all blockers cleared' };

let bundleRoot: string;
let bytes: Buffer;
let sha: string;
const wire: Buffer[] = [];
const ENV = ['NODE_ENV', 'SUBMISSION_BUNDLE_DIR', 'CONNECTOR_ENCRYPTION_KEY'] as const;
let saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  bundleRoot = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'k510-kept-')), 'bundles');
  await fs.mkdir(bundleRoot, { recursive: true });
  const zip = new JSZip();
  zip.file('summary.txt', 'assembled eSTAR package bytes');
  bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const bundlePath = path.join(bundleRoot, 'pkg-42-estar.zip');
  await fs.writeFile(bundlePath, bytes);
  sha = createHash('sha256').update(bytes).digest('hex');
  h.descriptor = { path: bundlePath, sha256: sha, sizeBytes: bytes.length, format: 'estar', displayName: '510k-pkg-42.zip',
    validation: { errorCount: 0, warningCount: 0 }, contentFingerprint: fingerprintPackageContent(CONTENT) };
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetMdxToolRateLimitersForTests();
  h.queries.length = 0;
  h.store.fail = false;
  h.store.puts.length = 0;
  wire.length = 0;
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  // The enforced state: descriptor trust and namespace confinement are live.
  process.env.NODE_ENV = 'production';
  process.env.SUBMISSION_BUNDLE_DIR = bundleRoot;
  process.env.CONNECTOR_ENCRYPTION_KEY = 'test-only-connector-encryption-key';
  // FDA's side of the send: the package as the AS2 send reads it.
  vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockImplementation(async (req) => {
    wire.push(await readVerifiedBundle(req.bundle));
    expect((req.metadata as Record<string, unknown>).sentPackage).toBeDefined();
    return { transmittalId: 4242, transmissionId: '<mdn-from-fda@esg.fda.gov>', status: 'received', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('the bytes AnA sends are kept before they are sent', () => {
  it('stores exactly what the gateway sends, and the transmittal request and sign ledger say where', async () => {
    const r = await esgTransmit(CTX as never, PARAMS);
    expect(r.success, `handler refused: ${r.message}`).toBe(true);
    expect(h.store.puts).toHaveLength(1);
    expect(h.store.puts[0]).toMatchObject({ orgId: 11, projectId: 'sent-packages' });
    expect(wire).toHaveLength(1);
    expect(wire[0].equals(h.store.puts[0].bytes)).toBe(true);
    const record = { storageVersionId: 'kept-1', provider: 's3', sha256: sha, sizeBytes: bytes.length, filename: `fda-esg-${sha}.zip` };
    const sent = vi.mocked(FdaEsgGateway.prototype.transmit).mock.calls[0][0];
    expect((sent.metadata as Record<string, unknown>).sentPackage).toEqual(record);
    expect((h.recordGovernedAction.mock.calls[0][1] as { payload: Record<string, unknown> }).payload.sentPackage).toEqual(record);
  });

  it('sends nothing, and says so, when the copy cannot be kept', async () => {
    h.store.fail = true;
    const r = await esgTransmit(CTX as never, PARAMS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('SENT_PACKAGE_NOT_ARCHIVED');
    expect(r.message).toMatch(/^Nothing was sent/);
    expect(FdaEsgGateway.prototype.transmit).not.toHaveBeenCalled();
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
  });
});
