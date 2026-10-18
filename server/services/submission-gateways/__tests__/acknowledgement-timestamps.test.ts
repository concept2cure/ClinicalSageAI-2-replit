import { describe, expect, it } from 'vitest';
import { platformTransmittalRecord } from '../acknowledgement';

describe('receipt timestamps preserve what is actually known', () => {
  it('never invents agency receipt time when downloading a platform-generated record', () => {
    const ack = platformTransmittalRecord({ transmittalId: 7, transmissionId: 'id', gatewayLabel: 'FDA ESG', status: 'in_transit', ackReceivedAt: null });
    expect(ack.receivedAt).toBeNull();
    expect(ack.generatedAt).toBeInstanceOf(Date);
    expect(ack.provenance).toBe('platform-record');
    expect(ack.buffer.toString()).toContain('Gateway accepted at: not recorded');
  });

  it('preserves the recorded receipt timestamp while identifying the separately generated summary', () => {
    const recorded = new Date('2026-10-13T10:00:00Z');
    const ack = platformTransmittalRecord({ transmittalId: 7, transmissionId: 'id', gatewayLabel: 'FDA ESG', status: 'received', ackReceivedAt: recorded });
    expect(ack.receivedAt).toEqual(recorded);
    expect(ack.generatedAt).toBeInstanceOf(Date);
    expect(ack.buffer.toString()).toContain('Gateway accepted at: 2026-10-13T10:00:00.000Z');
  });
});
