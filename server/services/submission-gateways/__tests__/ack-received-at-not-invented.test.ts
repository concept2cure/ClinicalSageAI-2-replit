/**
 * An acknowledgement time nobody recorded is not the time of download.
 *
 * GatewayAcknowledgment.receivedAt was `Date`, so platformTransmittalRecord and
 * the FDA ESG MDN path both fell back to `new Date()`: a pending, rejected or
 * untied transmission read as acknowledged at the moment someone downloaded
 * it, and AnA's get_submission_ack reported that time.
 *
 * 2026-11-01 (F1, DP-81 of docs/evidence/reviews/2026-10-19/security.md): and
 * bytes nobody verified are not the agency's. Any answer on the pinned AS2 URL
 * (a proxy's 502 page, an unsigned MDN) was served as provenance 'agency' and
 * named agency-acknowledgement-<id>.txt. Only a receipt verified against the
 * agency's pinned certificate and MIC is; everything else is this platform's
 * record, which names the response it kept without serving it as FDA's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'ack-received-at-test-secret-padded-to-32-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const H = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: H.row ? [H.row] : [], rowCount: H.row ? 1 : 0 })) },
}));

import { createHash } from 'node:crypto';
import { acknowledgementFilename, platformTransmittalRecord } from '../acknowledgement';
import { FdaEsgGateway } from '../fda-esg';

const MDN = 'Content-Type: message/disposition-notification\r\n\r\nDisposition: automatic-action/MDN-sent-automatically; failed/Failure: unsupported format';

beforeEach(() => {
  H.row = null;
});

describe('the platform transmittal record', () => {
  it('has no receipt time when the transmittal recorded none', () => {
    const ack = platformTransmittalRecord({
      transmittalId: 15, transmissionId: '', gatewayLabel: 'MHRA (mhra_gateway)', status: 'in_transit', ackReceivedAt: null,
    });
    expect(ack.receivedAt).toBeNull();
  });

  it('carries the recorded time when there is one', () => {
    const at = new Date('2026-07-27T10:00:00Z');
    const ack = platformTransmittalRecord({
      transmittalId: 14, transmissionId: 'pmda-1', gatewayLabel: 'PMDA (pmda_gateway)', status: 'received', ackReceivedAt: at,
    });
    expect(ack.receivedAt).toEqual(at);
  });
});

describe('the FDA ESG acknowledgement', () => {
  // 2026-11-01 (F1, DP-81): this case pinned the defect. The row holds an
  // unsigned MDN kept by the syntax-only judge of before 2026-10-17; nothing
  // verified it, so it is not served as the agency's bytes.
  it('serves a stored MDN nothing verified as the platform record, without inventing a time', async () => {
    H.row = { transmission_id: '<mdn-1@FDA-CESUB>', status: 'rejected', ack_received_at: null, http_status: 200, mdn_raw: MDN, metadata: null };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4242);
    expect(ack.provenance).toBe('platform-record');
    expect(ack.buffer.toString('utf8')).not.toBe(MDN);
    expect(ack.buffer.toString('utf8')).toContain('THIS IS NOT AN AGENCY ACKNOWLEDGEMENT');
    expect(ack.buffer.toString('utf8')).toContain(createHash('sha256').update(MDN, 'utf8').digest('hex'));
    expect(ack.receivedAt).toBeNull();
  });

  it('serves the platform record of an unacknowledged row without inventing one', async () => {
    H.row = { transmission_id: 'esg-2', status: 'in_transit', ack_received_at: null, mdn_raw: null, metadata: null };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4243);
    expect(ack.provenance).toBe('platform-record');
    expect(ack.receivedAt).toBeNull();
  });

  it('keeps the recorded time of an acknowledged row', async () => {
    const at = new Date('2026-06-29T12:00:00Z');
    H.row = { transmission_id: '<mdn-2@FDA-CESUB>', status: 'received', ack_received_at: at, mdn_raw: MDN, metadata: null };
    expect((await new FdaEsgGateway().downloadAcknowledgment(4244)).receivedAt).toEqual(at);
  });
});

describe('the FDA ESG acknowledgement is the agency\'s only when it was verified (DP-81)', () => {
  const PAGE = '<html><head><title>502 Bad Gateway</title></head><body><center>nginx</center></body></html>';
  const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

  it('serves a proxy\'s 502 page kept on an in-transit row as the platform record, never as the agency\'s', async () => {
    H.row = { transmission_id: '<ours@SPONSOR>', status: 'in_transit', ack_received_at: null, http_status: 502, mdn_raw: PAGE,
      metadata: { as2Receipt: { bodyBase64: b64(PAGE), contentType: 'text/html', verified: false, receivedAt: '2026-11-01T10:00:00.000Z' } } };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4250);
    const text = ack.buffer.toString('utf8');
    expect(ack.provenance).toBe('platform-record');
    expect(acknowledgementFilename(ack)).toMatch(/NOT-AN-AGENCY-ACK/);
    expect(text).toContain('THIS IS NOT AN AGENCY ACKNOWLEDGEMENT');
    expect(text).not.toContain('502 Bad Gateway');
    expect(text).toContain('HTTP 502');
    expect(text).toContain(sha(PAGE));
    expect(ack.receivedAt).toBeNull();
  });

  it('serves an unsigned 200 MDN as the platform record', async () => {
    H.row = { transmission_id: '<ours@SPONSOR>', status: 'in_transit', ack_received_at: null, http_status: 200, mdn_raw: MDN,
      metadata: { as2Receipt: { bodyBase64: b64(MDN), contentType: 'multipart/report', verified: false } } };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4251);
    expect(ack.provenance).toBe('platform-record');
    expect(ack.buffer.toString('utf8')).toContain(sha(MDN));
  });

  it('serves a receipt with no verification flag as the platform record', async () => {
    H.row = { transmission_id: '<ours@SPONSOR>', status: 'received', ack_received_at: new Date('2026-10-01T09:00:00Z'), http_status: 200, mdn_raw: MDN,
      metadata: { as2Receipt: { bodyBase64: b64(MDN), contentType: 'multipart/report' } } };
    expect((await new FdaEsgGateway().downloadAcknowledgment(4252)).provenance).toBe('platform-record');
  });

  it('still serves a verified receipt as the agency\'s, byte for byte', async () => {
    const at = new Date('2026-11-01T11:00:00Z');
    H.row = { transmission_id: '<mdn-9@FDA-CESUB>', status: 'received', ack_received_at: at, http_status: 200, mdn_raw: MDN,
      metadata: { as2Receipt: { bodyBase64: b64(MDN), contentType: 'multipart/signed; boundary="x"', verified: true, receivedAt: at.toISOString() } } };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4253);
    expect(ack.provenance).toBe('agency');
    expect(ack.buffer.toString('utf8')).toBe(MDN);
    expect(ack.contentType).toBe('multipart/signed; boundary="x"');
    expect(ack.receivedAt).toEqual(at);
  });
});
