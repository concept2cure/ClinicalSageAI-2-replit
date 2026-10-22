/**
 * An acknowledgement time nobody recorded is not the time of download.
 *
 * GatewayAcknowledgment.receivedAt was `Date`, so platformTransmittalRecord and
 * the FDA ESG MDN path both fell back to `new Date()`: a pending, rejected or
 * untied transmission read as acknowledged at the moment someone downloaded
 * it, and AnA's get_submission_ack reported that time.
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

import { platformTransmittalRecord } from '../acknowledgement';
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
  it('serves a stored MDN on a row with no acknowledgement time without inventing one', async () => {
    H.row = { transmission_id: '<mdn-1@FDA-CESUB>', status: 'rejected', ack_received_at: null, mdn_raw: MDN, metadata: null };
    const ack = await new FdaEsgGateway().downloadAcknowledgment(4242);
    expect(ack.provenance).toBe('agency');
    expect(ack.buffer.toString('utf8')).toBe(MDN);
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
