/**
 * Transmission is gated on a human, and acknowledgements say who wrote them.
 *
 * Three defects, all on the one irreversible action in the platform:
 *
 *  1. Three callers reached the gateways. Two enforced re-authentication, a
 *     reason, a structural gate and a governed-action ledger write. The third —
 *     the AnA `transmit_submission` tool — enforced only that a tenant context
 *     existed, and defaulted `environment` to 'production' when the model
 *     omitted it. A conversation could file to the real FDA ESG endpoint.
 *
 *  2. Twelve of thirteen gateways answered `downloadAcknowledgment` by composing
 *     a text file headed "<Agency> Acknowledgement" out of their own database
 *     row, having discarded the agency's real response body at transmit time.
 *     The route served it unmarked and the surface called it "the agency's
 *     actual bytes", so a sponsor could archive a document this platform wrote
 *     as proof an agency received a submission.
 *
 *  3. Rollback records a status change in this platform's audit trail and makes
 *     no network call, while the surface said the transmittal was "rolled back
 *     at the gateway".
 *
 * These tests pin the fixes at the layer that cannot be bypassed: the guard in
 * index.ts (which every caller passes through), and the shape of the documents
 * the gateways return.
 */

import { describe, it, expect } from 'vitest';
import { getGateway, TransmitAuthorizationError } from '../index';
import { platformTransmittalRecord, acknowledgementFilename } from '../acknowledgement';
import type { GatewayTransmitRequest, TransmitAuthorization } from '../types';

/** A transmit request that is valid in every respect except authorization. */
function requestWithout(auth: unknown): GatewayTransmitRequest {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: 99,
    bundle: {
      path: '/tmp/bundle.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      format: 'ectd',
    },
    environment: 'production',
    submissionType: 'original',
    metadata: {},
    authorization: auth as TransmitAuthorization,
  };
}

const GOVERNED_HTTP: TransmitAuthorization = {
  kind: 'governed-http',
  actorUserId: 11,
  reason: 'operator confirmed the sequence is correct',
  reauthVerifiedAt: new Date(),
};

describe('the transmit authorization guard', () => {
  it('refuses a transmit with no authorization at all', async () => {
    // The exact shape the AnA tool used to send.
    const gw = getGateway('fda', 'esg');
    await expect(gw.transmit(requestWithout(undefined))).rejects.toBeInstanceOf(
      TransmitAuthorizationError
    );
  });

  it('explains why, and points at the governed route', async () => {
    const gw = getGateway('fda', 'esg');
    await expect(gw.transmit(requestWithout(undefined))).rejects.toThrow(
      /irreversible[\s\S]*governed HTTP route/i
    );
  });

  it('refuses every region, not only FDA', async () => {
    // The guard lives in getGateway, so it covers all thirteen without each
    // gateway having to remember to check.
    for (const [region, gateway] of [
      ['ema', 'cesp'],
      ['pmda', 'pmda_gateway'],
      ['br', 'anvisa_gateway'],
      ['kr', 'mfds_dbio'],
    ] as const) {
      const gw = getGateway(region, gateway);
      await expect(gw.transmit(requestWithout(undefined))).rejects.toBeInstanceOf(
        TransmitAuthorizationError
      );
    }
  });

  it('refuses an authorization of an unrecognised kind', async () => {
    // A caller cannot invent a variant — e.g. one asserting an agent approved
    // its own transmission.
    const gw = getGateway('fda', 'esg');
    await expect(
      gw.transmit(requestWithout({ kind: 'agent', actorUserId: 11 }))
    ).rejects.toBeInstanceOf(TransmitAuthorizationError);
  });

  it('refuses governed-http without a reason, an actor, or a verified re-auth time', async () => {
    const gw = getGateway('fda', 'esg');
    for (const bad of [
      { ...GOVERNED_HTTP, reason: 'short' },
      { ...GOVERNED_HTTP, actorUserId: 0 },
      { ...GOVERNED_HTTP, reauthVerifiedAt: undefined },
    ]) {
      await expect(gw.transmit(requestWithout(bad))).rejects.toBeInstanceOf(
        TransmitAuthorizationError
      );
    }
  });

  it('refuses governed-signature without a signature id', async () => {
    const gw = getGateway('fda', 'esg');
    await expect(
      gw.transmit(requestWithout({ kind: 'governed-signature', signatureActionId: '', actorUserId: 11 }))
    ).rejects.toBeInstanceOf(TransmitAuthorizationError);
  });

  it('lets a properly authorized request through the guard to the gateway', async () => {
    // It will fail on credentials — this environment has none — which is proof
    // the guard passed it on rather than short-circuiting it.
    const gw = getGateway('fda', 'esg');
    await expect(gw.transmit(requestWithout(GOVERNED_HTTP))).rejects.not.toBeInstanceOf(
      TransmitAuthorizationError
    );
  });

  it('does not gate the read-only operations', async () => {
    // checkStatus and downloadAcknowledgment carry no risk and must keep working.
    const gw = getGateway('fda', 'esg');
    await expect(gw.checkStatus(999_999)).rejects.not.toBeInstanceOf(TransmitAuthorizationError);
  });
});

describe('the platform transmittal record', () => {
  const record = platformTransmittalRecord({
    transmittalId: 14,
    transmissionId: 'pmda-1769000000',
    gatewayLabel: 'PMDA (pmda_gateway)',
    status: 'received',
    ackReceivedAt: new Date('2026-07-27T10:00:00Z'),
    bundleSha256: 'b'.repeat(64),
    extra: { Receipt: 'pmda-1769000000' },
  });
  const text = record.buffer.toString('utf8');

  it('is labelled as a platform record, not an agency acknowledgement', () => {
    expect(record.provenance).toBe('platform-record');
    expect(text).toMatch(/CONCEPT2CURE TRANSMITTAL RECORD/);
    expect(text).toMatch(/THIS IS NOT AN AGENCY ACKNOWLEDGEMENT/);
  });

  it('names who generated it and says it is not proof of receipt', () => {
    expect(text).toMatch(/generated by Concept2Cure/i);
    expect(text).toMatch(/not received from PMDA \(pmda_gateway\)/);
    expect(text).toMatch(/not evidence that the agency received or accepted/i);
  });

  it('never heads itself "<Agency> Acknowledgement" — the old shape', () => {
    expect(text).not.toMatch(/^PMDA Gateway Acknowledgement/m);
    expect(text.split('\n')[0]).not.toMatch(/Acknowledgement$/);
  });

  it('still carries the agency-issued identifiers it legitimately holds', () => {
    // The values were never fabricated — the receipt id really did come from
    // the gateway's 2xx response. Only the document's identity was wrong.
    expect(text).toMatch(/Receipt: pmda-1769000000/);
    expect(text).toMatch(/Bundle SHA-256: b{64}/);
  });

  it('is honest about a transmission the gateway never acknowledged', () => {
    const pending = platformTransmittalRecord({
      transmittalId: 15,
      transmissionId: '',
      gatewayLabel: 'MHRA (mhra_gateway)',
      status: 'in_transit',
      ackReceivedAt: null,
    });
    const body = pending.buffer.toString('utf8');
    expect(body).toMatch(/Gateway accepted at: not recorded/);
    expect(body).toMatch(/Transmission id \(as reported by the gateway\): none/);
  });
});

describe('acknowledgement filenames', () => {
  it('marks a platform record in the filename, which outlives the page', () => {
    const name = acknowledgementFilename({
      transmittalId: 14,
      transmissionId: 'pmda-1',
      contentType: 'text/plain',
      buffer: Buffer.alloc(0),
      receivedAt: new Date(),
      provenance: 'platform-record',
    });
    expect(name).toBe('concept2cure-transmittal-record-pmda-1-NOT-AN-AGENCY-ACK.txt');
    expect(name).not.toMatch(/^ack-/);
  });

  it('names a genuine agency artefact as one', () => {
    const name = acknowledgementFilename({
      transmittalId: 14,
      transmissionId: 'esg-1',
      contentType: 'message/disposition-notification',
      buffer: Buffer.alloc(0),
      receivedAt: new Date(),
      provenance: 'agency',
    });
    expect(name).toBe('agency-acknowledgement-esg-1.txt');
  });
});
