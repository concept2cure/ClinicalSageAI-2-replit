/**
 * An E2B(R2) acknowledgement is read for what it carries: the acknowledged ICSR
 * message's number from <icsrmessagenumb> in its acknowledgment block, and its
 * own number and creation date from its header (<messagenumb>, <messagedate>
 * in format 204). A transmission is closed only by an ACK whose acknowledged
 * number is its own, and acknowledgedAt is the ACK's date — or null.
 *
 * What the code used to do (until 2026-10-15): the parser took the FIRST of
 * <acknowledgedmessagenumb> | <messagenumb> | <localmessagenumb>. In an R2 ACK
 * the header's <messagenumb> comes first, and it is the ACK's own number (as in
 * this repo's own R2 header, grdhe/exportGenerators/emaAEE2BR3.ts) — so a real
 * agency ACK was refused as naming another message, and an ACK whose own
 * number happened to equal a transmission's closed it whatever it acknowledged.
 * The ACK's date was not read, so acknowledgedAt stayed null.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({
  store: { row: null as Record<string, unknown> | null, updates: [] as Record<string, unknown>[] },
}));

vi.mock('../../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(store.row ? [{ ...store.row }] : []),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            store.updates.push(patch);
            store.row = { ...store.row, ...patch };
            return [{ ...store.row }];
          },
        }),
      }),
    }),
  };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: vi.fn(async () => ({ persisted: true })) }));

import { parseIcsrAcknowledgment } from '../e2b-icsr-message';
import { recordIcsrAcknowledgment, IcsrTransmissionError } from '../ind-icsr-transmission-persistence';

/** An E2B(R2) ACK: the agency's header, then its acknowledgment of one ICSR message. */
function r2Ack(o: { ackNumber: string; ackDate?: string; acknowledged?: string; code?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ichicsrack lang="en">
  <ichicsrmessageheader>
    <messagetype>ichicsrack</messagetype>
    <messagenumb>${o.ackNumber}</messagenumb>
    <messagesenderidentifier>ZZFDA</messagesenderidentifier>
    <messagereceiveridentifier>SPONSORORG</messagereceiveridentifier>
    ${o.ackDate ? `<messagedateformat>204</messagedateformat><messagedate>${o.ackDate}</messagedate>` : ''}
  </ichicsrmessageheader>
  <acknowledgment>
    <messageacknowledgment>
      ${o.acknowledged ? `<icsrmessagenumb>${o.acknowledged}</icsrmessagenumb>` : ''}
      <localmessagenumb>FDA-LOCAL-551</localmessagenumb>
      <icsrmessagedateformat>204</icsrmessagedateformat>
      <icsrmessagedate>20261014090000</icsrmessagedate>
      <transmissionacknowledgmentcode>${o.code ?? 'AA'}</transmissionacknowledgmentcode>
    </messageacknowledgment>
  </acknowledgment>
</ichicsrack>`;
}

const ctx = { organizationId: 7, userId: 11 };

beforeEach(() => {
  store.row = {
    id: 'tx-1', organizationId: 7, submissionId: 3, gateway: 'FDA_FAERS', messageNumber: 'MSG-2026-0001',
    status: 'transmitted', acknowledgedAt: null, ackCode: null, acknowledgedMessageNumber: null,
  };
  store.updates = [];
});

describe('parseIcsrAcknowledgment — what an R2 ACK carries, where it carries it', () => {
  it('reads the acknowledged number from <icsrmessagenumb>, not the ACK header\'s own <messagenumb>', () => {
    const ack = parseIcsrAcknowledgment(r2Ack({ ackNumber: 'ACK-77', ackDate: '20261015120000', acknowledged: 'MSG-2026-0001' }));
    expect(ack.acknowledgedMessageNumber, 'the ACK\'s own header number was read as the acknowledged message').toBe('MSG-2026-0001');
    expect(ack.ackMessageNumber).toBe('ACK-77');
  });

  it('reads the ACK\'s own date from its header (format 204), not the acknowledged message\'s date', () => {
    const ack = parseIcsrAcknowledgment(r2Ack({ ackNumber: 'ACK-77', ackDate: '20261015120000', acknowledged: 'MSG-2026-0001' }));
    expect(ack.ackMessageDate?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('states no number and no date the ACK does not carry', () => {
    const ack = parseIcsrAcknowledgment(r2Ack({ ackNumber: 'ACK-78' }));
    expect(ack.acknowledgedMessageNumber).toBeNull();
    expect(ack.ackMessageDate).toBeNull();
    expect(parseIcsrAcknowledgment(r2Ack({ ackNumber: 'ACK-79', ackDate: '20261315120000', acknowledged: 'MSG-1' })).ackMessageDate).toBeNull();
  });
});

describe('recordIcsrAcknowledgment — matches the acknowledged number, records the ACK date', () => {
  it('records an agency ACK for this message, with the ACK\'s date as acknowledgedAt', async () => {
    const row = await recordIcsrAcknowledgment('tx-1', r2Ack({ ackNumber: 'ACK-77', ackDate: '20261015120000', acknowledged: 'MSG-2026-0001' }), ctx);
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledgedMessageNumber).toBe('MSG-2026-0001');
    expect((row.acknowledgedAt as Date | null)?.toISOString(), 'the ACK\'s date was not recorded').toBe('2026-10-15T12:00:00.000Z');
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('refuses an ACK whose own number equals this message but which acknowledges another', async () => {
    const err = await recordIcsrAcknowledgment('tx-1', r2Ack({ ackNumber: 'MSG-2026-0001', acknowledged: 'MSG-2026-0999' }), ctx).catch((e: unknown) => e);
    expect(err, 'an ACK for another message closed this transmission').toBeInstanceOf(IcsrTransmissionError);
    expect((err as IcsrTransmissionError).code).toBe('ACK_MISMATCH');
    expect(store.updates).toEqual([]);
  });

  it('leaves acknowledgedAt null — never the platform clock — when the ACK carries no date', async () => {
    const row = await recordIcsrAcknowledgment('tx-1', r2Ack({ ackNumber: 'ACK-80', acknowledged: 'MSG-2026-0001' }), ctx);
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledgedAt).toBeNull();
  });
});
