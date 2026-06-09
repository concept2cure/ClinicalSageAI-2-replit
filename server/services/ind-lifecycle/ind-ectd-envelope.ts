/**
 * FDA eCTD us-regional envelope generator.
 *
 * Emits the administrative envelope metadata (us-regional.xml application /
 * submission block) for a single eCTD sequence — application number, submission
 * type + serial number, and the sponsor/contact. This complements the full
 * leaf-assembling packager (submission-gateways/regional-packager): it produces
 * just the deterministic admin envelope, which is useful for previewing and
 * validating a sequence's metadata before assembly/dispatch.
 *
 * Pure / deterministic. XML is escaped; the sequence number is validated to the
 * 4-digit eCTD form.
 */

export type EctdApplicationType = 'ind' | 'nda' | 'bla' | 'anda' | 'dmf';

export interface EctdEnvelopeInput {
  /** FDA application number, digits only (e.g. '123456' for IND 123456). */
  applicationNumber: string;
  applicationType?: EctdApplicationType;
  /** 4-digit eCTD sequence number, e.g. '0001'. */
  sequenceNumber: string;
  /** Submission type, e.g. 'original' | 'amendment' | 'annual-report' | 'safety-report'. */
  submissionType: string;
  /** Optional submission sub-type qualifier. */
  submissionSubType?: string;
  sponsorName: string;
  contactName?: string;
  contactEmail?: string;
}

/** Escape the five XML special characters. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(tag: string, value: string | undefined, indent: string): string {
  if (value === undefined || value === null || value === '') return '';
  return `${indent}<${tag}>${escapeXml(value)}</${tag}>\n`;
}

/**
 * Build the us-regional administrative envelope XML for one sequence.
 * Throws on a malformed sequence number or missing application number.
 */
export function buildUsRegionalEnvelope(input: EctdEnvelopeInput): string {
  if (!input.applicationNumber || input.applicationNumber.trim().length === 0) {
    throw new Error('ENVELOPE_INVALID: applicationNumber is required.');
  }
  if (!/^\d{4}$/.test(input.sequenceNumber)) {
    throw new Error('ENVELOPE_INVALID: sequenceNumber must be 4 digits, e.g. "0000".');
  }

  const appType = (input.applicationType ?? 'ind').toUpperCase();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<fda-regional:fda-regional xmlns:fda-regional="http://www.fda.gov/eCTD/3.2">',
    '  <admin>',
    '    <application-set>',
    '      <application>',
    '        <application-information>',
    el('application-type', appType, '          '),
    el('number', `${appType}${input.applicationNumber.trim()}`, '          '),
    '        </application-information>',
    '        <submission-information>',
    '          <submission>',
    el('submission-type', input.submissionType, '            '),
    el('submission-sub-type', input.submissionSubType, '            '),
    el('submission-id', input.sequenceNumber, '            '),
    '          </submission>',
    '        </submission-information>',
    '        <sponsor>',
    el('name', input.sponsorName, '          '),
    el('contact-name', input.contactName, '          '),
    el('contact-email', input.contactEmail, '          '),
    '        </sponsor>',
    '      </application>',
    '    </application-set>',
    '  </admin>',
    '</fda-regional:fda-regional>',
  ];
  // Drop the empty strings produced by absent optional elements.
  return lines.filter((l) => l !== '').join('\n') + '\n';
}
