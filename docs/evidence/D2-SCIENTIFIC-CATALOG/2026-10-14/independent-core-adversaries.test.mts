import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateSourceFactBatch, verifySourceFactCandidate } from '../../../../server/services/vault/catalog-fact-verification.ts';
import { extractClaims } from '../../../../server/services/truth-engine/clinical-claims.ts';

const ID = 'dededede-1111-4111-8111-111111111111';
const BYTE_HASH = 'd'.repeat(64);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const TEXT = 'Product: XR; Batch: B17; Material: API; Method: HPLC; Result role: measured result; Assay: 99.20 %';
const meaning = () => ({ kind: 'cmc_result', property: 'assay', productRef: 'XR', batchAsWritten: 'B17', materialAsWritten: 'API', methodAsWritten: 'HPLC', resultRole: 'measured_result' });
const source = (text = TEXT) => ({ documentId: ID, contentHash: BYTE_HASH, extractedText: text, extractedTextSha256: sha(text) });
const candidate = (text = TEXT, spec: any = meaning(), value: any = { kind: 'scalar', asWritten: '99.20', unitAsWritten: '%' }) => {
  const anchor = { documentId: ID, contentHash: BYTE_HASH, extractedTextSha256: sha(text), range: { start: 0, end: text.length }, exactQuote: text };
  return { schemaVersion: 1, meaning: spec, value, origin: { kind: 'source_statement', valueAnchor: anchor, witnesses: Object.keys(spec).filter(k => !['kind', 'property'].includes(k)).map(k => ({ path: `meaning.${k}`, anchor: structuredClone(anchor) })) } };
};
const result = (c: any, s: any = source()) => verifySourceFactCandidate(c, s);
const unsafePass = (r: any) => r.ok && r.context.state === 'passed';

describe('independent source and shape adversaries', () => {
  it('supported single row control remains a read-only source preview', () => {
    expect(result(candidate())).toMatchObject({ ok: true, transcription: { state: 'passed' }, context: { state: 'passed' }, persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed' });
  });
  it.each(['documentId', 'contentHash', 'extractedTextSha256'])('another %s cannot bind this source', field => {
    const c: any = candidate(); c.origin.valueAnchor[field] = field === 'documentId' ? 'eeeeeeee-1111-4111-8111-111111111111' : 'e'.repeat(64);
    expect(result(c).ok).toBe(false);
  });
  it('a changed server extraction cannot be vouched for by candidate digests', () => expect(result(candidate(), { ...source(), extractedText: TEXT + ' changed' }).ok).toBe(false));
  it('a same document quote at another offset is not this exact anchor', () => { const c = candidate(); c.origin.valueAnchor.range.start++; expect(result(c).ok).toBe(false); });
  it('a quote is not clipped at end of source', () => { const c = candidate(); c.origin.valueAnchor.range.end++; expect(result(c).ok).toBe(false); });
  it.each(['persisted', 'scientificQualification', 'actor', 'authoritativeText', 'page'])('candidate-controlled %s is rejected', field => { const c: any = candidate(); c[field] = field === 'persisted' ? true : 'approved'; expect(validateSourceFactBatch([c]).ok).toBe(false); });
  it('computation remains unsupported', () => { const c: any = candidate(); c.origin.kind = 'deterministic_computation'; expect(validateSourceFactBatch([c])).toMatchObject({ ok: false, code: 'COMPUTATION_METHOD_UNAVAILABLE' }); });
  it.each(['__proto__', 'constructor'])('prototype-name family %s refuses cleanly', kind => { const c: any = candidate(); c.meaning = { kind }; expect(validateSourceFactBatch([c])).toMatchObject({ ok: false, code: 'INVALID_FACT_SCHEMA' }); });
  it('more than 50 candidates refuses the whole batch', () => expect(validateSourceFactBatch(Array.from({ length: 51 }, () => candidate())).ok).toBe(false));
  it('an anchor longer than 2000 characters refuses instead of clipping', () => { const text = 'x'.repeat(2001); expect(validateSourceFactBatch([candidate(text)]).ok).toBe(false); });
  it('private batch snapshot does not retain caller-owned objects', () => { const c = candidate(); const v: any = validateSourceFactBatch([c]); c.meaning.batchAsWritten = 'B99'; expect(v.ok).toBe(true); expect(v.candidates[0].meaning.batchAsWritten).toBe('B17'); });
});

describe('independent contextual and written-value adversaries', () => {
  it.each(['batchAsWritten', 'methodAsWritten', 'productRef', 'materialAsWritten'])('a swapped %s cannot borrow another relation', field => { const c: any = candidate(); c.meaning[field] = 'OTHER'; expect(unsafePass(result(c))).toBe(false); });
  it('missing mandatory context remains not established', () => { const c = candidate(); c.meaning.methodAsWritten = null as any; expect(result(c).context.state).toBe('not_established'); });
  it('a source specification is not a measured result', () => { const text = TEXT.replace('measured result', 'specification limit'); expect(unsafePass(result(candidate(text), source(text)))).toBe(false); });
  it('a repeated value elsewhere cannot rescue the claimed row', () => { const text = TEXT.replace('99.20', '99.10') + '\n99.20 %'; const c = candidate(text); c.origin.valueAnchor.range.end = TEXT.length; c.origin.valueAnchor.exactQuote = text.slice(0, TEXT.length); expect(result(c, source(text)).ok).toBe(false); });
  it('rounded written precision cannot be substituted', () => { const c = candidate(); c.value.asWritten = '99.2'; expect(result(c).ok).toBe(false); });
  it('a bound is not scalar', () => { const text = TEXT.replace('99.20', '< 99.20'); expect(result(candidate(text), source(text)).ok).toBe(false); });
  it('a range is not scalar', () => { const text = TEXT.replace('99.20', '99.20 to 99.40'); expect(result(candidate(text, meaning(), { kind: 'scalar', asWritten: '99.20 to 99.40', unitAsWritten: '%' }), source(text)).ok).toBe(false); });
  it('a malformed scalar text cannot gain numeric meaning', () => { const text = TEXT.replace('99.20 %', 'stable'); expect(result(candidate(text, meaning(), { kind: 'scalar', asWritten: 'stable', unitAsWritten: null }), source(text)).ok).toBe(false); });
  it('a signed exponent is one numeric scalar, not a range', () => { const text = TEXT.replace('99.20', '1.20e-3'); expect(result(candidate(text, meaning(), { kind: 'scalar', asWritten: '1.20e-3', unitAsWritten: '%' }), source(text))).toMatchObject({ ok: true, transcription: { state: 'passed' }, context: { state: 'passed' } }); });
  it('a double-subject relation remains unestablished', () => { const text = TEXT.replace('Product: XR', 'Product: XR and YZ'); const m = meaning(); m.productRef = 'XR and YZ'; expect(unsafePass(result(candidate(text, m), source(text)))).toBe(false); });
  it('a contradictory negation qualifier is not ignored', () => { const text = TEXT + '; Negation: this row is not a measured result'; expect(unsafePass(result(candidate(text), source(text)))).toBe(false); });
  it('OCR does not acquire original attestation', () => expect(result(candidate(), { ...source(), extractionCaveat: 'ocr' }).context.state).toBe('not_established'));
});

describe('independent clinical witness adversaries', () => {
  // Canonical extraction supplies the transport frame. The adverse expectation
  // was fixed separately: a figure token cannot witness study/population/arm.
  const clinical = (body: string) => {
    const claim = extractClaims({ id: ID, role: 'other', text: body }).claims.find(c => c.measureLabel === 'n:randomized' && c.frame.arm?.kind === 'total');
    if (!claim) throw new Error('Clinical control failed to provide its canonical complete claim');
    const anchor = { documentId: ID, contentHash: BYTE_HASH, extractedTextSha256: sha(body), range: { start: claim.loc.start, end: claim.loc.end }, exactQuote: body.slice(claim.loc.start, claim.loc.end) };
    const at = body.indexOf('612', claim.loc.start);
    const dummy = { ...anchor, range: { start: at, end: at + 3 }, exactQuote: '612' };
    return { schemaVersion: 1, meaning: { kind: 'pharma_clinical', component: 'count', frameState: 'complete', frame: claim.frame }, value: { kind: 'scalar', asWritten: '612', unitAsWritten: null }, origin: { kind: 'source_statement', valueAnchor: anchor, witnesses: Object.keys(claim.frame).map(k => ({ path: `meaning.frame.${k}`, anchor: structuredClone(dummy) })) } };
  };
  it('a complete local canonical clinical relation remains preview-only', () => {
    const body = 'In Study NRX-301, a total of 612 patients were randomized.';
    const c: any = clinical(body);
    c.origin.witnesses = c.origin.witnesses.map((w: any) => ({ ...w, anchor: structuredClone(c.origin.valueAnchor) }));
    expect(result(c, source(body))).toMatchObject({ ok: true, context: { state: 'passed' }, persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed' });
  });
  it('dummy figure witnesses cannot vouch for mandatory clinical slots', () => {
    const body = 'In Study NRX-301, a total of 612 patients were randomized.';
    expect(unsafePass(result(clinical(body), source(body)))).toBe(false);
  });
  it('remote study headers cannot be laundered through dummy local witnesses', () => {
    const body = 'Study NRX-301 Synopsis.\nA total of 612 patients were randomized.';
    expect(unsafePass(result(clinical(body), source(body)))).toBe(false);
  });
  it('a large quote cannot turn an inherited remote study header into a local relation', () => {
    const body = 'Study NRX-301 Synopsis.\nBackground material is unrelated.\nA total of 612 patients were randomized.';
    const c: any = clinical(body);
    const full = { ...c.origin.valueAnchor, range: { start: 0, end: body.length }, exactQuote: body };
    c.origin.valueAnchor = full;
    c.origin.witnesses = c.origin.witnesses.map((w: any) => ({ ...w, anchor: structuredClone(full) }));
    expect(unsafePass(result(c, source(body)))).toBe(false);
  });
});
