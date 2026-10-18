import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateSourceFactBatch, verifySourceFactCandidate, verifyKeyDataAgainstText } from '../document-catalog-core';
import type { CatalogFactAnchor, CatalogFactCandidate, CatalogFactSource } from '../../../../shared/ana/catalog-facts';
const id = '10000000-0000-4000-8000-000000000001';
const row = 'Product: X; Batch: L1; Material: tablet; Method: HPLC; Result role: measured result; Assay: 99.20 %';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const source = (text = row): CatalogFactSource => ({ documentId: id, contentHash: 'a'.repeat(64), extractedText: text, extractedTextSha256: sha(text) });
const anchor = (s: CatalogFactSource, quote = s.extractedText!, start = s.extractedText!.indexOf(quote)): CatalogFactAnchor => ({ documentId: id, contentHash: s.contentHash, extractedTextSha256: s.extractedTextSha256, range: { start, end: start + quote.length }, exactQuote: quote });
function fact(s = source()): CatalogFactCandidate {
  const a = anchor(s, row);
  return { schemaVersion: 1, meaning: { kind: 'cmc_result', property: 'assay', productRef: 'X', batchAsWritten: 'L1', materialAsWritten: 'tablet', methodAsWritten: 'HPLC', resultRole: 'measured_result' }, value: { kind: 'scalar', asWritten: '99.20', unitAsWritten: '%' }, origin: { kind: 'source_statement', valueAnchor: a, witnesses: ['productRef', 'batchAsWritten', 'materialAsWritten', 'methodAsWritten', 'resultRole'].map(path => ({ path: `meaning.${path}`, anchor: a })) } };
}
const codes = (r: ReturnType<typeof verifySourceFactCandidate>) => [...r.transcription.reasons, ...r.context.reasons].map(r => r.code);
describe('source binding preview, separate from unchanged legacy labels', () => {
  it('returns only preview scope for an exact explicit source row', () => expect(verifySourceFactCandidate(fact(), source())).toMatchObject({ ok: true, transcription: { state: 'passed' }, context: { state: 'passed' }, scientificQualification: 'unassessed', reviewState: 'not_recorded', persisted: false }));
  it('keeps legacy wrong-assay value-presence meaning explicit', () => expect(verifyKeyDataAgainstText({ assayA_sensitivity: '99.2%' }, 'Assay A sensitivity: 95.0%. Assay B sensitivity: 99.2%.').verified).toBe(true));
  it.each(['batchAsWritten', 'methodAsWritten', 'productRef'] as const)('refuses wrong %s even if stated remotely', field => {
    const s = source(`${row}\nProduct: Y; Batch: L2; Method: MS`), c = fact(s);
    (c.meaning as unknown as Record<string, unknown>)[field] = field === 'batchAsWritten' ? 'L2' : field === 'methodAsWritten' ? 'MS' : 'Y';
    const r = verifySourceFactCandidate(c, s); expect(r.ok).toBe(true); expect(r.context.state).toBe('failed'); expect(codes(r)).toContain('CONTEXT_VALUE_MISMATCH');
  });
  it('refuses a value stated only elsewhere', () => { const s = source(`${row}\nAssay: 98.40 %`), c = fact(s); c.value.asWritten = '98.40'; expect(verifySourceFactCandidate(c, s).ok).toBe(false); });
  it('missing mandatory context is not established', () => { const c = fact(); if (c.meaning.kind === 'cmc_result') c.meaning.batchAsWritten = null; expect(verifySourceFactCandidate(c, source()).context.state).toBe('not_established'); });
  it('missing witnesses are not established', () => { const c = fact(); c.origin.witnesses = []; expect(codes(verifySourceFactCandidate(c, source()))).toContain('CONTEXT_WITNESS_REQUIRED'); });
  it('refuses a remote repeated witness', () => { const s = source(`${row}\nProduct: X`), c = fact(s); c.origin.witnesses[0].anchor = anchor(s, 'Product: X', row.length + 1); expect(codes(verifySourceFactCandidate(c, s))).toContain('REMOTE_CONTEXT_WITNESS'); });
  it('independently recomputes supplied text identity', () => { const s = { ...source(), extractedTextSha256: 'b'.repeat(64) }; expect(codes(verifySourceFactCandidate(fact(s), s))).toContain('SOURCE_TEXT_IDENTITY_INVALID'); });
  it('same bytes with changed extraction do not inherit source binding', () => expect(codes(verifySourceFactCandidate(fact(), source(row.replace('99.20', '99.30'))))).toContain('SOURCE_IDENTITY_MISMATCH'));
  it.each(['quote', 'offset', 'end'])('refuses wrong %s', mode => { const c = fact(); if (mode === 'quote') c.origin.valueAnchor.exactQuote += '!'; else if (mode === 'offset') c.origin.valueAnchor.range.start = 1; else c.origin.valueAnchor.range.end += 10; expect(verifySourceFactCandidate(c, source()).ok).toBe(false); });
  it('keeps canonical digest independent of key order', () => { const c = fact(); expect(verifySourceFactCandidate(c, source()).candidateSha256).toBe(verifySourceFactCandidate(Object.fromEntries(Object.entries(c).reverse()), source()).candidateSha256); });
  it.each(['ocr', 'unsupported_language_or_layout'] as const)('does not establish %s context', extractionCaveat => expect(verifySourceFactCandidate(fact(), { ...source(), extractionCaveat }).context.state).toBe('not_established'));
  it('takes a private candidate snapshot', () => { const c = fact(), r = validateSourceFactBatch([c]); c.value.asWritten = 'mutated'; expect(r.ok && r.candidates[0].value.asWritten).toBe('99.20'); });
  it.each(['accepted', 'actorId', 'scientificQualification'])('rejects forged field %s', field => expect(validateSourceFactBatch([{ ...fact(), [field]: true }]).ok).toBe(false));
  it.each(['__proto__', 'constructor', 'toString'])('refuses inherited family name %s cleanly', kind => expect(validateSourceFactBatch([{ ...fact(), meaning: { kind } }])).toMatchObject({ ok: false, code: 'INVALID_FACT_SCHEMA' }));
  it('rejects computation and unsupported source locator', () => { expect(validateSourceFactBatch([{ ...fact(), origin: { kind: 'deterministic_computation' } }])).toMatchObject({ ok: false, code: 'COMPUTATION_METHOD_UNAVAILABLE' }); const c = fact(); expect(validateSourceFactBatch([{ ...c, origin: { ...c.origin, valueAnchor: { ...c.origin.valueAnchor, locator: { page: 1 } } } }]).ok).toBe(false); });
  it.each([NaN, Infinity, 1.5, -1, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe offset %s', start => { const c = fact(); c.origin.valueAnchor.range.start = start; expect(validateSourceFactBatch([c]).ok).toBe(false); });
  it('rejects all input limits, unknown paths and duplicate witnesses', () => {
    expect(validateSourceFactBatch([]).ok).toBe(false); expect(validateSourceFactBatch(Array.from({ length: 51 }, () => fact())).ok).toBe(false);
    const c = fact(); c.origin.valueAnchor.exactQuote = 'x'.repeat(2001); expect(validateSourceFactBatch([c]).ok).toBe(false);
    const d = fact(); d.origin.witnesses[0].path = 'meaning.approved'; expect(validateSourceFactBatch([d]).ok).toBe(false);
    const e = fact(); e.origin.witnesses.push(e.origin.witnesses[0]); expect(validateSourceFactBatch([e]).ok).toBe(false);
    e.origin.witnesses = Array.from({ length: 21 }, () => e.origin.witnesses[0]); expect(validateSourceFactBatch([e]).ok).toBe(false);
  });
});
describe('exact numeric form, no weakening or conversion', () => {
  it.each([
    ['99.2', '99.20', 'scalar', false], ['99.20', '99.20', 'scalar', true], ['0.5', '< 0.5', 'scalar', false], ['< 0.5', '< 0.5', 'bound', true],
    ['0.5', 'approximately 0.5', 'scalar', false], ['approximately 0.5', 'approximately 0.5', 'approximate', true], ['1-2', '1-2', 'range', true], ['1-2', '1-2', 'scalar', false],
    ['10', '10³', 'scalar', false], ['103', '10³', 'scalar', false], ['stable', 'stable', 'scalar', false], ['1.20e-3', '1.20e-3', 'scalar', true],
  ] as const)('%s against %s as %s binding=%s', (asWritten, stated, kind, valid) => {
    const s = source(row.replace('99.20 %', `${stated} %`)), c = fact(); c.origin.valueAnchor = anchor(s); c.origin.witnesses = [];
    c.value = kind === 'bound' ? { kind, asWritten, unitAsWritten: '%', relation: '<' } : { kind, asWritten, unitAsWritten: '%' };
    expect(verifySourceFactCandidate(c, s).ok).toBe(valid);
  });
  it('preserves bound direction', () => { const s = source(row.replace('99.20 %', '≤ 0.5 %')), c = fact(); c.origin.valueAnchor = anchor(s); c.origin.witnesses = []; c.value = { kind: 'bound', asWritten: '≤ 0.5', relation: '<', unitAsWritten: '%' }; expect(codes(verifySourceFactCandidate(c, s))).toContain('VALUE_KIND_MISMATCH'); });
  it('cannot ignore source negation or compound subjects', () => {
    for (const txt of [`${row}; Negation: this row is not a measured result`, row.replace('Product: X', 'Product: X and Y')]) {
      const s = source(txt), c = fact(); c.origin.valueAnchor = anchor(s); c.origin.witnesses = c.origin.witnesses.map(w => ({ ...w, anchor: anchor(s) }));
      if (txt.includes('X and Y') && c.meaning.kind === 'cmc_result') c.meaning.productRef = 'X and Y';
      expect(verifySourceFactCandidate(c, s).context.state).toBe('not_established');
    }
  });
});
describe('clinical slots use the canonical local claim engine', () => {
  const clinical = (s: CatalogFactSource): CatalogFactCandidate => ({ schemaVersion: 1,
    meaning: { kind: 'pharma_clinical', component: 'count', frameState: 'complete', frame: {
      study: { kind: 'study', aliases: ['DPL-301'] }, population: { set: 'randomized', stated: true, allRandomized: true }, arm: { kind: 'total' },
      measure: { family: 'n', key: { pop: 'randomized' } }, scope: { subgroups: [] }, analysis: {},
    } }, value: { kind: 'scalar', asWritten: '300', unitAsWritten: null }, origin: { kind: 'source_statement', valueAnchor: anchor(s),
      witnesses: ['study', 'population', 'arm', 'measure'].map(k => ({ path: `meaning.frame.${k}`, anchor: anchor(s) })) } });
  const local = 'In Study DPL-301, a total of 300 patients were randomized.';
  it('can establish one explicit local randomized-total context', () => { const s = source(local); expect(verifySourceFactCandidate(clinical(s), s).context.state).toBe('passed'); });
  it.each(['study', 'population', 'arm', 'measure'])('a figure-only %s witness cannot attest its frame slot', slot => {
    const s = source(local), c = clinical(s); c.origin.witnesses = c.origin.witnesses.map(w => w.path === `meaning.frame.${slot}` ? { ...w, anchor: anchor(s, '300') } : w);
    expect(codes(verifySourceFactCandidate(c, s))).toContain('CLINICAL_CONTEXT_WITNESS_INCOMPLETE');
  });
  it('a remote header remains unestablished even inside a large quote', () => {
    const s = source('Study DPL-301 Synopsis.\nUnrelated background.\nA total of 300 patients were randomized.');
    expect(verifySourceFactCandidate(clinical(s), s).context.state).toBe('not_established');
  });
  it('the same remote header cannot complete a clipped local anchor', () => {
    const text = 'A total of 300 patients were randomized.', s = source(`Study DPL-301 Synopsis.\nUnrelated background.\n${text}`), c = clinical(s);
    c.origin.valueAnchor = anchor(s, text); c.origin.witnesses = c.origin.witnesses.map(w => ({ ...w, anchor: anchor(s, text) }));
    expect(verifySourceFactCandidate(c, s).context.state).toBe('not_established');
  });
});
