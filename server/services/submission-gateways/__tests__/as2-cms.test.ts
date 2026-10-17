import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { as2CmsAvailable, buildAs2CmsEnvelope, as2PayloadEntity, splitAs2MultipartSignature } from '../as2-cms';
import { verifyFileSignature } from '../../../utils/fileSignature';
import { classifyVerifiedAs2Delivery, buildAs2Headers } from '../as2-transport';
import { as2CmsFixture, receiptReport } from './support/as2-cms-fixture';
let fixture: ReturnType<typeof as2CmsFixture>;
beforeAll(() => { fixture = as2CmsFixture(); }, 30_000);
afterAll(() => { fixture?.cleanup(); });
const MESSAGE = '<offline-1@sponsor>', MIC = createHash('sha256').update('offline-payload').digest('base64');
async function classify(report: Buffer, role = 'agency', pin = 'agency') {
  const receipt = fixture.signedReceipt(report, role);
  return classifyVerifiedAs2Delivery({ ok: true, response: { httpStatus: 200, headers: { 'content-type': receipt.contentType, 'message-id': '<agency-receipt@agency>' }, body: receipt.body } }, MESSAGE, { agencyCertPem: fixture.pem(pin), expectedMic: MIC });
}
describe('actual offline CMS AS2 envelope and receipt verification', () => {
  it('encrypts for the agency and signs the exact binary MIME entity, verified by independent OpenSSL roundtrip', async () => {
    expect(as2CmsAvailable()).toBe(true);
    const body = Buffer.from([0, 1, 2, 255, 13, 10, 90]);
    const envelope = await buildAs2CmsEnvelope({ body, contentType: 'application/octet-stream', filename: 'ectd.zip', clientCertPem: fixture.pem('sponsor'), clientKeyPem: fixture.key('sponsor'), agencyCertPem: fixture.pem('agency') });
    const entity = as2PayloadEntity(body, 'application/octet-stream', 'ectd.zip');
    expect(envelope.contentType).toContain('enveloped-data'); expect(envelope.body.equals(body)).toBe(false);
    expect(fixture.roundtrip(envelope.body)).toEqual(entity);
    expect(envelope.mic).toBe(createHash('sha256').update(entity).digest('base64'));
    expect(() => fixture.roundtrip(envelope.body, 'rogue')).toThrow();
  });
  it('requests required signed synchronous receipts without an invalid async receipt URL', () => {
    const headers = buildAs2Headers({ messageId: MESSAGE, from: 'sponsor', to: 'agency', contentType: 'application/pkcs7-mime', body: Buffer.from('cms') });
    expect(headers['Disposition-Notification-Options']).toContain('required'); expect(headers['Receipt-Delivery-Option']).toBeUndefined();
  });
  it('accepts only a pinned agency-signed receipt naming the original message and exact MIC', async () => {
    const signed = fixture.signedReceipt(receiptReport(MESSAGE, MIC));
    expect(verifyFileSignature(splitAs2MultipartSignature(signed.body, signed.contentType).signature, 'application/pkcs7-mime').ok).toBe(true);
    expect((await classify(receiptReport(MESSAGE, MIC))).kind).toBe('RECEIVED');
  });
  it.each(['rogue', 'wrong-pin'])('retains delivery ambiguity for %s signatures without freeing a resend', async scenario => {
    const result = await classify(receiptReport(MESSAGE, MIC), scenario === 'rogue' ? 'rogue' : 'agency', scenario === 'wrong-pin' ? 'rogue' : 'agency');
    expect(result.kind).toBe('DELIVERED_UNCONFIRMED');
  });
  it('rejects an altered signed MDN', async () => {
    const receipt = fixture.signedReceipt(receiptReport(MESSAGE, MIC));
    receipt.body = Buffer.from(receipt.body.toString('utf8').replace('processed', 'failed'));
    const result = await classifyVerifiedAs2Delivery({ ok: true, response: { httpStatus: 200, headers: { 'content-type': receipt.contentType }, body: receipt.body } }, MESSAGE, { agencyCertPem: fixture.pem('agency'), expectedMic: MIC });
    expect(result.kind).toBe('DELIVERED_UNCONFIRMED');
  });
  it.each(['message', 'MIC'])('does not accept an authenticated receipt for another %s', async field => {
    const result = await classify(receiptReport(field === 'message' ? '<another@sponsor>' : MESSAGE, field === 'MIC' ? createHash('sha256').update('other').digest('base64') : MIC));
    expect(result.kind).toBe('DELIVERED_UNCONFIRMED');
  });
  it('keeps an unsigned success receipt unconfirmed', async () => {
    const result = await classifyVerifiedAs2Delivery({ ok: true, response: { httpStatus: 200, headers: { 'content-type': 'multipart/report; boundary="mdn-report"' }, body: receiptReport(MESSAGE, MIC) } }, MESSAGE, { agencyCertPem: fixture.pem('agency'), expectedMic: MIC });
    expect(result.kind).toBe('DELIVERED_UNCONFIRMED');
  });
  it('allows only the authenticated tied failure receipt to establish agency refusal', async () => {
    expect((await classify(receiptReport(MESSAGE, MIC, 'processed/error: rejected'))).kind).toBe('REFUSED_BY_AGENCY');
    expect((await classify(receiptReport('<other@sponsor>', MIC, 'failed'))).kind).toBe('DELIVERED_UNCONFIRMED');
  });
  it('refuses mismatched signing key and MIME header injection before sending', async () => {
    const args = { body: Buffer.from('body'), contentType: 'application/octet-stream', filename: 'ectd.zip', clientCertPem: fixture.pem('sponsor'), clientKeyPem: fixture.key('rogue'), agencyCertPem: fixture.pem('agency') };
    await expect(buildAs2CmsEnvelope(args)).rejects.toThrow('do not match');
    expect(() => as2PayloadEntity(args.body, 'application/octet-stream\r\nInjected: yes', 'ectd.zip')).toThrow('MIME metadata');
  });
});
