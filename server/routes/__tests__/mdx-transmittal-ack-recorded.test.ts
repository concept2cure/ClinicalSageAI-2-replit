/**
 * A transmittal acknowledgement is recorded before it is delivered (D5).
 *
 * GET /api/mdx/gateways/transmittals/:id/ack hands a file to the sponsor: for
 * FDA ESG with a stored MDN the agency's own bytes, and for every other
 * gateway a record the platform composes from the transmittal row at request
 * time. It was sent with nothing recorded (2026-10-15 launch-boundary
 * re-proof). Held to the rule every generated download is held to: an
 * EXPORT_GENERATED row with the SHA-256 of the exact bytes, and nothing sent
 * when it does not persist.
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ query: vi.fn(), logAction: vi.fn(), download: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../services/auditService', () => ({ default: { logAction: h.logAction }, writeChainedAuditRow: vi.fn() }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/submission-gateways', async (orig) => ({
  ...(await orig<object>()),
  getGateway: () => ({ downloadAcknowledgment: h.download }),
}));

import gateways from '../mdx-submission-gateway';

const app = () => {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 12, organizationId: 3 };
    next();
  });
  a.use('/api/mdx', gateways);
  return a;
};
const raw = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const RECORD = Buffer.from('CONCEPT2CURE TRANSMITTAL RECORD\nTransmission: T-1\n', 'utf8');

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue({ rows: [{ region: 'ema', gateway: 'cesp' }] });
  h.download.mockResolvedValue({
    transmittalId: 41,
    transmissionId: 'T-1',
    contentType: 'text/plain',
    buffer: RECORD,
    receivedAt: null,
    generatedAt: new Date('2026-10-22T00:00:00Z'),
    provenance: 'platform-record',
  });
});

describe('GET /api/mdx/gateways/transmittals/:id/ack', () => {
  it('records EXPORT_GENERATED with the SHA-256 of the bytes it delivers, and keeps the provenance headers', async () => {
    h.logAction.mockResolvedValue({ persisted: true });
    const res = await request(app()).get('/api/mdx/gateways/transmittals/41/ack').buffer(true).parse(raw);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, RECORD)).toBe(0);
    const row = h.logAction.mock.calls.map(([e]) => e).find((e: any) => e.action === 'EXPORT_GENERATED');
    expect(row, 'no EXPORT_GENERATED row').toBeTruthy();
    expect(row.organizationId).toBe(3);
    expect(row.userId).toBe(12);
    expect(JSON.stringify(row)).toContain(sha(RECORD));
    expect(JSON.stringify(row)).toContain('platform-record');
    expect(res.headers['x-export-sha256']).toBe(sha(RECORD));
    expect(res.headers['x-ack-provenance']).toBe('platform-record');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
  });

  it('delivers nothing when the record does not persist, and says so', async () => {
    h.logAction.mockResolvedValue({ persisted: false });
    const res = await request(app()).get('/api/mdx/gateways/transmittals/41/ack');
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body.detail).toMatch(/record could not be written/);
  });
});
