/**
 * E2B(R3) ICSR transmission — wraps the composed ICSR data-element projection in
 * the ICH batch/message header, gates on transmit-readiness (no mandatory gaps),
 * and parses the agency acknowledgment (AA/AE/AR).
 */

import { describe, it, expect } from 'vitest';
import { buildIcsrTransmission, parseIcsrAcknowledgment } from '../e2b-icsr-message';
import { composeE2bR3Icsr } from '../e2b-icsr-composer';
import type { AdverseEvent, ICSR } from '../../compliance/pharmacovigilanceService';

const baseEvent: AdverseEvent = {
  id: 'ae-123',
  organizationId: 'org-1',
  projectId: 'C2C-001',
  eventType: 'SAE',
  patientId: 'subj-007',
  eventDescription: 'Acute hepatic failure',
  onsetDate: new Date('2026-01-05T00:00:00.000Z'),
  reportDate: new Date('2026-01-06T00:00:00.000Z'),
  seriousnessCriteria: 'life_threatening',
  causality: 'probable',
  outcome: 'not_recovered',
  reporterType: 'investigator',
  countryOfOccurrence: 'US',
  regulatoryReportingDeadline: new Date('2026-01-13T00:00:00.000Z'),
  reportedToAuthorities: false,
  expeditedReportRequired: true,
  reactionPt: 'Hepatic failure',
  reactionPtCode: '10019663',
  suspectProduct: 'C2C-001',
  suspectProductDose: '50 mg',
  suspectProductRoute: 'Oral',
  reporterName: 'Dr. Pat Smith',
  narrative: 'Subject developed jaundice on day 5.',
  createdAt: new Date('2026-01-06T00:00:00.000Z'),
};

const icsrMeta: ICSR & { studyRegistrationNumber?: string } = {
  id: 'icsr-1',
  adverseEventId: 'ae-123',
  icsrType: 'initial',
  senderType: 'sponsor',
  receiverType: 'regulatory_authority',
  transmissionDate: new Date('2026-01-07T00:00:00.000Z'),
  e2bVersion: 'R3',
  worldwideUniqueId: 'US-C2C-2026-000123',
  reportType: 'study',
  // A study report names its study (C.5.1.r.1) — mandatory for transmit readiness.
  studyRegistrationNumber: 'IND 123456',
  seriousness: 'life_threatening',
  organizationId: 'org-1',
};

describe('buildIcsrTransmission', () => {
  it('wraps a complete ICSR in the batch + message header and is transmit-ready', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    expect(result.gaps).toEqual([]); // precondition: fully-populated case

    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      messageNumber: 'MSG-2026-0001',
      gateway: 'FDA_FAERS',
      messageDate: new Date('2026-01-07T12:00:00.000Z'),
    });

    expect(tx.transmitReady).toBe(true);
    expect(tx.gaps).toEqual([]);

    // XML declaration + ICH ICSR message envelope.
    expect(tx.message.startsWith('<?xml')).toBe(true);
    expect(tx.message).toContain('<ichicsrMessage');

    // Batch header N.1.2 carries the sender id.
    expect(tx.message).toContain('<N.1.2>SPONSORORG</N.1.2>');
    // Batch number is derived from the message number.
    expect(tx.message).toContain('<N.1.1>batch-MSG-2026-0001</N.1.1>');
    // Message header M.1.1 carries the message number.
    expect(tx.message).toContain('<M.1.1>MSG-2026-0001</M.1.1>');

    // The inner composed safetyreport block is lifted in, with the C.1.1 element.
    expect(tx.message).toContain('<safetyreport>');
    expect(tx.message).toContain('id="C.1.1"');
  });

  it('produces the message but is NOT transmit-ready when the ICSR has mandatory gaps', () => {
    // Missing suspect product AND no ICSR envelope (no worldwide unique id).
    const incomplete = { ...baseEvent, suspectProduct: null };
    const result = composeE2bR3Icsr(incomplete, { icsr: null });
    expect(result.gaps.length).toBeGreaterThan(0); // precondition

    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      messageNumber: 'MSG-2026-0002',
      gateway: 'FDA_FAERS',
    });

    expect(tx.transmitReady).toBe(false);
    expect(tx.gaps.length).toBeGreaterThan(0);
    expect(tx.gaps).toEqual(result.gaps);
    // The message is still produced for inspection.
    expect(tx.message.startsWith('<?xml')).toBe(true);
    expect(tx.message).toContain('<ichicsrMessage');
  });

  it('defaults the receiver id to ZZFDA for the FDA FAERS gateway', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      messageNumber: 'MSG-A',
      gateway: 'FDA_FAERS',
    });
    expect(tx.receiverId).toBe('ZZFDA');
    expect(tx.message).toContain('<N.1.3>ZZFDA</N.1.3>');
    expect(tx.message).toContain('<M.1.3>ZZFDA</M.1.3>');
    expect(tx.gateway).toBe('FDA_FAERS');
  });

  it('defaults the receiver id to EVHUMAN for the EMA EudraVigilance gateway', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      messageNumber: 'MSG-B',
      gateway: 'EMA_EUDRAVIGILANCE',
    });
    expect(tx.receiverId).toBe('EVHUMAN');
    expect(tx.message).toContain('<N.1.3>EVHUMAN</N.1.3>');
    expect(tx.gateway).toBe('EMA_EUDRAVIGILANCE');
  });

  it('lets an explicit receiver id override the gateway default', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      receiverId: 'CUSTOMRCV',
      messageNumber: 'MSG-C',
      gateway: 'FDA_FAERS',
    });
    expect(tx.receiverId).toBe('CUSTOMRCV');
    expect(tx.message).toContain('<N.1.3>CUSTOMRCV</N.1.3>');
    expect(tx.message).toContain('<M.1.3>CUSTOMRCV</M.1.3>');
  });

  it('escapes XML special characters in envelope values', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const tx = buildIcsrTransmission(result, {
      senderId: 'Acme & Co',
      messageNumber: 'MSG-D',
      gateway: 'FDA_FAERS',
    });
    expect(tx.message).toContain('<N.1.2>Acme &amp; Co</N.1.2>');
    expect(tx.message).not.toContain('<N.1.2>Acme & Co</N.1.2>');
  });
});

describe('parseIcsrAcknowledgment', () => {
  it('treats AA as accepted, requiring no further action', () => {
    const ack = `<?xml version="1.0"?>
      <ichicsrAck>
        <messagenumb>MSG-2026-0001</messagenumb>
        <transmissionacknowledgmentcode>AA</transmissionacknowledgmentcode>
      </ichicsrAck>`;
    const parsed = parseIcsrAcknowledgment(ack);
    expect(parsed.ackCode).toBe('AA');
    expect(parsed.accepted).toBe(true);
    expect(parsed.requiresAction).toBe(false);
    expect(parsed.acknowledgedMessageNumber).toBe('MSG-2026-0001');
    expect(parsed.errors).toEqual([]);
  });

  it('treats AE (accepted with error) as not accepted but requiring action', () => {
    const ack = `<ichicsrAck>
        <messagenumb>MSG-2026-0002</messagenumb>
        <transmissionacknowledgmentcode>AE</transmissionacknowledgmentcode>
        <error>MedDRA version mismatch on E.i.2.1b</error>
      </ichicsrAck>`;
    const parsed = parseIcsrAcknowledgment(ack);
    expect(parsed.ackCode).toBe('AE');
    expect(parsed.accepted).toBe(false);
    expect(parsed.requiresAction).toBe(true);
    expect(parsed.errors).toContain('MedDRA version mismatch on E.i.2.1b');
  });

  it('treats AR as rejected, requiring action, with the errors extracted', () => {
    const ack = `<ichicsrAck>
        <messagenumb>MSG-2026-0003</messagenumb>
        <transmissionacknowledgmentcode>AR</transmissionacknowledgmentcode>
        <error>Missing mandatory element C.1.8.1</error>
        <error>Missing mandatory element G.k.2.2</error>
      </ichicsrAck>`;
    const parsed = parseIcsrAcknowledgment(ack);
    expect(parsed.ackCode).toBe('AR');
    expect(parsed.accepted).toBe(false);
    expect(parsed.requiresAction).toBe(true);
    expect(parsed.acknowledgedMessageNumber).toBe('MSG-2026-0003');
    expect(parsed.errors).toEqual([
      'Missing mandatory element C.1.8.1',
      'Missing mandatory element G.k.2.2',
    ]);
  });

  it('returns ackCode "unknown" (not accepted) for an unparseable/empty string', () => {
    const parsed = parseIcsrAcknowledgment('');
    expect(parsed.ackCode).toBe('unknown');
    expect(parsed.accepted).toBe(false);
    expect(parsed.requiresAction).toBe(false);
    expect(parsed.acknowledgedMessageNumber).toBeNull();
    expect(parsed.errors).toEqual([]);

    const garbage = parseIcsrAcknowledgment('not xml at all <<>>');
    expect(garbage.ackCode).toBe('unknown');
    expect(garbage.accepted).toBe(false);
  });

  it('round-trips: a built transmission acknowledged with AA is accepted', () => {
    const result = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const tx = buildIcsrTransmission(result, {
      senderId: 'SPONSORORG',
      messageNumber: 'MSG-RT-1',
      gateway: 'FDA_FAERS',
    });
    expect(tx.transmitReady).toBe(true);

    const ack = `<ichicsrAck>
        <messagenumb>MSG-RT-1</messagenumb>
        <transmissionacknowledgmentcode>AA</transmissionacknowledgmentcode>
      </ichicsrAck>`;
    const parsed = parseIcsrAcknowledgment(ack);
    expect(parsed.acknowledgedMessageNumber).toBe('MSG-RT-1');
    expect(parsed.accepted).toBe(true);
  });
});
