/**
 * FDA eCTD us-regional envelope generator — deterministic XML, escaping, and
 * sequence-number validation. No DB.
 */

import { describe, it, expect } from 'vitest';
import { buildUsRegionalEnvelope, escapeXml } from '../ind-ectd-envelope';

const base = {
  applicationNumber: '123456',
  sequenceNumber: '0001',
  submissionType: 'amendment',
  sponsorName: 'Acme Therapeutics',
  contactName: 'Dr. Jane Roe',
  contactEmail: 'jane@acme.example',
};

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });
});

describe('buildUsRegionalEnvelope', () => {
  it('emits the application/submission/sponsor block with the IND-prefixed number', () => {
    const xml = buildUsRegionalEnvelope(base);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<number>IND123456</number>');
    expect(xml).toContain('<submission-type>amendment</submission-type>');
    expect(xml).toContain('<submission-id>0001</submission-id>');
    expect(xml).toContain('<name>Acme Therapeutics</name>');
    expect(xml).toContain('<contact-email>jane@acme.example</contact-email>');
  });

  it('omits absent optional elements', () => {
    const xml = buildUsRegionalEnvelope({ ...base, contactName: undefined, contactEmail: undefined, submissionSubType: undefined });
    expect(xml).not.toContain('<contact-name>');
    expect(xml).not.toContain('<submission-sub-type>');
  });

  it('escapes XML in values (e.g. an ampersand in the sponsor name)', () => {
    const xml = buildUsRegionalEnvelope({ ...base, sponsorName: 'A & B Pharma' });
    expect(xml).toContain('<name>A &amp; B Pharma</name>');
  });

  it('is deterministic for identical input', () => {
    expect(buildUsRegionalEnvelope(base)).toBe(buildUsRegionalEnvelope(base));
  });

  it('rejects a non-4-digit sequence number', () => {
    expect(() => buildUsRegionalEnvelope({ ...base, sequenceNumber: '1' })).toThrow(/ENVELOPE_INVALID/);
  });

  it('rejects a missing application number', () => {
    expect(() => buildUsRegionalEnvelope({ ...base, applicationNumber: '' })).toThrow(/ENVELOPE_INVALID/);
  });
});
