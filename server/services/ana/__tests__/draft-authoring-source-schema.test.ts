/** The advertised save schema accepts the actual metadata-only batch receipt.
 * Existing AJV dependencies validate the real tool definition, without a provider. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { DRAFT_AUTHORING_DOCUMENT } from '../document-surface-tool-defs';
import { batchDraftReceipt } from '../batch-draft-result';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(DRAFT_AUTHORING_DOCUMENT.input_schema);
const fullText = 'x'.repeat(80_017) + 'Observed result: 12 of 30 💊 participants.' + 'z'.repeat(23);
const span = { start: 80_017, end: fullText.length - 23, totalChars: fullText.length };
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const reference = () => ({
  documentId: '10000000-0000-4000-8000-000000000001',
  contentHash: 'a'.repeat(64),
  version: 2 as const,
  extractedTextSha256: digest(fullText),
  spanSha256: digest(fullText.slice(span.start, span.end)),
  span: { ...span },
});
// Opening-span controls isolate identity fields from the baseline's unrelated
// absolute-offset restriction; a missing digest must fail for its own reason.
const openingReference = () => ({ ...reference(), span: { start: 0, end: 1, totalChars: 1 } });
const input = (source: unknown) => ({ title: 'Draft', sections: [{
  code: '2.5', title: 'Clinical overview', content: '<p>Evidence needs review.</p>', sourceReferences: [source],
}] });

describe('draft_authoring_document extraction-bound schema', () => {
  it('accepts a JSON-round-tripped V2 receipt whose absolute window starts beyond 80,000', () => {
    const source = { ...reference(), programId: '20000000-0000-4000-8000-000000000001', title: 'CSR',
      text: fullText.slice(span.start, span.end), extractionMethod: 'pdf-text', extractionConfidence: null,
      originalFileAvailable: true, disposition: null, sourceAvailability: 'Original file available.', completeText: false };
    const result = batchDraftReceipt([{ section_type: '2.5' }], [{ requestIndex: 0, sectionType: '2.5',
      sourceContext: { status: 'loaded', sources: [source] } }], [{
      content: 'Draft prose awaiting review.', model: 'test-model', latencyMs: 1,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }, truncated: false,
    }]);
    const receipt = JSON.parse(JSON.stringify(result)).sections[0].sources[0];
    expect(receipt).toMatchObject(reference());
    expect(receipt).not.toHaveProperty('text');
    expect(JSON.stringify(receipt)).not.toContain(source.text);
    expect(validate(input(receipt)), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(['version', 'extractedTextSha256', 'spanSha256'])('requires %s instead of silently accepting a downgraded receipt', key => {
    const source: Record<string, unknown> = openingReference();
    delete source[key];
    expect(validate(input(source))).toBe(false);
  });

  it.each([1, 3, '2', null])('rejects unsupported or mistyped reference version %s', version => {
    expect(validate(input({ ...openingReference(), version }))).toBe(false);
  });

  it.each(['contentHash', 'extractedTextSha256', 'spanSha256'])('requires a full SHA-256 %s', key => {
    expect(validate(input({ ...openingReference(), [key]: 'not-a-sha256' }))).toBe(false);
  });

  it('requires a UUID document identity', () => {
    expect(validate(input({ ...openingReference(), documentId: 'saved-csr' }))).toBe(false);
  });

  it.each([-1, 0.5, '0'])('rejects noninteger or negative absolute start %s', start => {
    expect(validate(input({ ...openingReference(), span: { start, end: 1, totalChars: 1 } }))).toBe(false);
  });
});
