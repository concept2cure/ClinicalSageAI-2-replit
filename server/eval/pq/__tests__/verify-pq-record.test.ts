import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import protocolJson from '../pq-protocol.json';
import { computeVerdict, servedModelMatches, verifyPqClaim } from '../pq-verdict.js';
import { verifyCanonicalPqClaim, type CanonicalPqEvidence } from '../verify-pq-record.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const rules = { computeVerdict, servedModelMatches };
const entry = { id: 'generator', pinnedVersion: 'generator-pin', provider: 'anthropic',
  pq: { status: 'passed' as 'passed' | 'failed' | 'pending', reference: 'fixture.json' as string | null } };
function fixture() {
  const protocol = JSON.parse(JSON.stringify(protocolJson));
  Object.assign(protocol, { status: 'approved', approvedBy: 'fixture owner', approvedOn: '2026-10-06' });
  protocol.components.generation.criteria.minTasksPerDocType = 1;
  Object.assign(protocol.components.rag, { executable: true });
  Object.assign(protocol.components.rag.criteria, { minScoredItems: 1 });
  const bank = { version: 'fixture', tasks: [{ id: 'g1', docType: 'ind', taskType: 'generation', input: 'Fixture source' },
    { id: 'e1', docType: 'ind', taskType: 'extraction', input: 'Fixture source', expectedFields: { field: 'recorded' } }] };
  const gold = { keysProvisional: false, items: [{ id: 'q1', question: 'What is recorded?', openChecks: [], expectedSourceKeys: ['SOURCE@1'],
    evidence: { document_code: 'SOURCE', section: '1', quote: 'Recorded source text' } },
    { id: 'negative', question: 'Outside scope?', tags: ['negative-control'], expectedSourceKeys: [] }] };
  const manifest = { entries: [{ document_code: 'SOURCE', version: '1', versionScheme: 'revision', role: 'answer-source', verified: true,
    versionVerified: true, sourceUrl: 'https://example.test/source', date: '2026-10-06', sha256: 'a'.repeat(64), redistribution: { termsOf: 'issuer' } }],
    publishers: { issuer: { termsVerified: true, terms: 'fixture', termsUrl: 'https://example.test/terms' } } };
  const evidence: CanonicalPqEvidence = { protocolText: JSON.stringify(protocol), docBankText: JSON.stringify(bank),
    ragGoldText: JSON.stringify(gold), corpusManifestText: JSON.stringify(manifest) };
  const generator = { modelId: entry.id, pinnedVersion: entry.pinnedVersion, provider: entry.provider };
  const generationRequest = { organizationId: 1, messages: [{ role: 'user', content: 'Fixture question/source' }] };
  const judgeRequest = { organizationId: 1, messages: [{ role: 'user', content: 'Fixture faithfulness assessment' }] };
  const generationResponse = { content: 'Recorded source text', resolvedModel: entry.pinnedVersion, provider: entry.provider, finishReason: 'end_turn', cached: false, deterministic: false };
  const judgeResponse = { content: '1', resolvedModel: 'judge-pin', provider: 'openai', finishReason: 'stop', cached: false, deterministic: false };
  const record = { kind: 'pq-record', modelId: entry.id, pinnedVersion: entry.pinnedVersion, provider: entry.provider,
    protocolId: protocol.protocolId, protocolVersion: protocol.version, protocolStatus: 'approved', protocolSha256: hash(evidence.protocolText),
    goldBankVersion: bank.version, goldBankSha256: hash(evidence.docBankText), verdict: 'PASS',
    generation: [{ taskId: 'g1', docType: 'ind', servedModel: entry.pinnedVersion, servedProvider: entry.provider,
      finishReason: 'end_turn', cached: false, deterministic: false,
      servedModelVerified: true, sectionCoverage: 1, forbiddenHits: 0 }],
    extraction: [{ taskId: 'e1', docType: 'ind', servedModel: entry.pinnedVersion, servedProvider: entry.provider,
      finishReason: 'end_turn', cached: false, deterministic: false,
      servedModelVerified: true, f1: 1, precision: 1, recall: 1 }],
    rag: { ran: true, itemsScored: 1, plannedItemIds: ['q1', 'negative'], scopeVerified: true,
      scope: { organizationId: 1, organizationUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      goldBankSha256: hash(evidence.ragGoldText), corpusManifestSha256: hash(evidence.corpusManifestText),
      attribution: { generator, judge: { modelId: 'judge', pinnedVersion: 'judge-pin', provider: 'openai' } },
      items: [{ itemId: 'q1', negativeControl: false, generatorCalled: true, servedModel: entry.pinnedVersion, servedProvider: entry.provider,
        servedModelVerified: true, judgeServedModel: 'judge-pin', judgeServedProvider: 'openai', judgeVerified: true,
        generationRequest, judgeRequest, generationResponse, judgeResponse, answer: generationResponse.content,
        generationRequestSha256: hash(JSON.stringify(generationRequest)), generationResponseSha256: hash(JSON.stringify(generationResponse)),
        judgeRequestSha256: hash(JSON.stringify(judgeRequest)), judgeResponseSha256: hash(JSON.stringify(judgeResponse)),
        hit: 1, faithfulness: 1, expectedSourceKeys: ['SOURCE@1'], expectedSourceIds: ['document-1'], retrievedDocumentIds: ['document-1'], negativeControlPassed: null },
      { itemId: 'negative', negativeControl: true, generatorCalled: false, servedModel: null, servedProvider: null, servedModelVerified: false,
        judgeServedModel: null, judgeServedProvider: null, judgeVerified: false, hit: null, faithfulness: null,
        expectedSourceKeys: [], expectedSourceIds: [], retrievedDocumentIds: [], negativeControlPassed: true,
        answer: 'I could not find relevant information in the regulatory knowledge base to answer this question.' }] },
  };
  return { evidence, record };
}
const verify = ({ evidence, record }: ReturnType<typeof fixture>, claim = entry) => verifyCanonicalPqClaim(claim, () => record, rules, evidence);

describe('canonical PQ claim verification', () => {
  it('rejects a header-only PASS against an unapproved canonical protocol', () => {
    const entry = { id: 'claude-opus-4', pinnedVersion: 'claude-opus-5-5', provider: 'anthropic',
      pq: { status: 'passed' as const, reference: 'fixture.json' } };
    const record = { kind: 'pq-record', modelId: entry.id, pinnedVersion: entry.pinnedVersion,
      provider: entry.provider, protocolStatus: 'approved', verdict: 'PASS' };
    expect(verifyPqClaim(entry, () => record)).not.toEqual([]);
  });
  it('accepts a complete attributable PASS only under an approved canonical test fixture', () => {
    expect(verify(fixture())).toEqual([]);
  });
  it.each([NaN, Infinity, -0.1, 1.1, null, '1'])('rejects invalid coverage %s', value => {
    const f = fixture(); (f.record.generation[0] as Record<string, unknown>).sectionCoverage = value;
    expect(verify(f).join(' ')).toMatch(/invalid section coverage/);
  });
  it.each([-1, 0.5, NaN, Infinity, null, '0'])('rejects invalid forbidden count %s', value => {
    const f = fixture(); (f.record.generation[0] as Record<string, unknown>).forbiddenHits = value;
    expect(verify(f).join(' ')).toMatch(/invalid forbidden count/);
  });
  it.each(['f1', 'precision', 'recall'])('rejects malformed %s even with a claimed PASS', metric => {
    for (const value of [NaN, Infinity, -0.1, 1.1, null, '1']) {
      const f = fixture(); (f.record.extraction[0] as Record<string, unknown>)[metric] = value;
      expect(verify(f).join(' ')).toMatch(/invalid extraction metrics/);
    }
  });
  it.each(['generation', 'extraction'] as const)('rejects wrong actual provider/model and missing provider in %s', phase => {
    for (const patch of [{ servedModel: 'wrong', servedModelVerified: true }, { servedProvider: 'openai' }, { servedProvider: undefined }]) {
      const f = fixture(); Object.assign(f.record[phase][0], patch);
      expect(verify(f).join(' ')).toMatch(/exact registry model\/provider/);
    }
  });
  it.each(['generation', 'extraction'] as const)('rejects historic missing completion, cached, deterministic and partial %s records', phase => {
    for (const patch of [{ finishReason: undefined }, { finishReason: 'unknown' }, { finishReason: 'max_tokens' },
      { finishReason: 'tool_use' }, { cached: true }, { cached: undefined }, { deterministic: true }, { deterministic: undefined }]) {
      const f = fixture(); Object.assign(f.record[phase][0], patch);
      expect(verify(f).join(' ')).toMatch(/complete uncached provider output/);
    }
  });
  it.each(['generation', 'extraction'] as const)('rejects missing, repeated, invented IDs or changed document types in %s', phase => {
    for (const change of ['missing', 'repeated', 'invented', 'docType']) {
      const f = fixture(); const rows = f.record[phase] as Record<string, unknown>[];
      if (change === 'missing') rows.pop();
      if (change === 'repeated') rows.push({ ...rows[0] });
      if (change === 'invented') rows[0].taskId = 'invented';
      if (change === 'docType') rows[0].docType = 'other';
      expect(verify(f).join(' ')).toMatch(/canonical/);
    }
  });
  it('rejects changed protocol/gold bytes, unapproved protocol and invalid approval dates', () => {
    for (const kind of ['protocol-hash', 'gold-hash', 'draft', 'date']) {
      const f = fixture();
      if (kind === 'protocol-hash') f.record.protocolSha256 = 'b'.repeat(64);
      if (kind === 'gold-hash') f.record.goldBankSha256 = 'b'.repeat(64);
      if (kind === 'draft' || kind === 'date') { const p = JSON.parse(f.evidence.protocolText); p[kind === 'draft' ? 'status' : 'approvedOn'] = kind === 'draft' ? 'draft' : '2026-02-30'; f.evidence.protocolText = JSON.stringify(p); f.record.protocolSha256 = hash(f.evidence.protocolText); }
      expect(verify(f)).not.toEqual([]);
    }
  });
  it('recomputes FAIL/INCOMPLETE rather than trusting the record verdict', () => {
    for (const kind of ['low-score', 'omitted-RAG', 'wrong-judge', 'wrong-RAG-generator', 'unreviewed-corpus']) {
      const f = fixture();
      if (kind === 'low-score') f.record.generation[0].sectionCoverage = 0.1;
      if (kind === 'omitted-RAG') f.record.rag.items.pop();
      if (kind === 'wrong-judge') f.record.rag.items[0].judgeServedModel = 'wrong';
      if (kind === 'wrong-RAG-generator') f.record.rag.attribution.generator.modelId = 'other';
      if (kind === 'unreviewed-corpus') { const m = JSON.parse(f.evidence.corpusManifestText); m.entries[0].verified = false; f.evidence.corpusManifestText = JSON.stringify(m); f.record.rag.corpusManifestSha256 = hash(f.evidence.corpusManifestText); }
      expect(verify(f)).not.toEqual([]);
    }
  });
  it('preserves pending invariant and requires failed claims to cite FAIL, never PASS/INCOMPLETE', () => {
    const f = fixture();
    expect(verify(f, { ...entry, pq: { status: 'pending', reference: null } })).toEqual([]);
    expect(verify(f, { ...entry, pq: { status: 'pending', reference: 'fixture.json' } })).not.toEqual([]);
    expect(verify(f, { ...entry, pq: { status: 'failed', reference: 'fixture.json' } })).not.toEqual([]);
    f.record.verdict = 'FAIL';
    expect(verify(f, { ...entry, pq: { status: 'failed', reference: 'fixture.json' } })).toEqual([]);
    f.record.verdict = 'INCOMPLETE';
    expect(verify(f, { ...entry, pq: { status: 'failed', reference: 'fixture.json' } })).not.toEqual([]);
  });
  it('fails closed on unreadable/malformed canonical bytes and records', () => {
    const f = fixture(); f.evidence.docBankText = 'invalid JSON';
    expect(verify(f)).not.toEqual([]);
    expect(verifyCanonicalPqClaim(entry, () => { throw new Error('secret must not appear'); }, rules, f.evidence).join(' ')).not.toContain('secret');
  });
  it('rejects malformed or unmeasured canonical generation/extraction criteria', () => {
    for (const [phase, key, value] of [['generation', 'minSectionCoverage', null], ['generation', 'minTasksPerDocType', 0],
      ['generation', 'unmeasuredCriterion', 1], ['extraction', 'minF1', null], ['extraction', 'unmeasuredCriterion', 1]] as Array<[string, string, unknown]>) {
      const f = fixture(); const p = JSON.parse(f.evidence.protocolText); p.components[phase].criteria[key] = value;
      f.evidence.protocolText = JSON.stringify(p); f.record.protocolSha256 = hash(f.evidence.protocolText);
      expect(verify(f).join(' ')).toMatch(/criteria are malformed or unmeasured/);
    }
  });
  it('recomputes RAG capture digests, completion flags, identities, placement and judge score', () => {
    for (const kind of ['missing-capture', 'partial', 'cached', 'wrong-identity', 'wrong-score', 'wrong-digest', 'wrong-placement', 'changed-answer']) {
      const f = fixture(); const row = f.record.rag.items[0] as Record<string, unknown>;
      if (kind === 'missing-capture') row.generationResponse = undefined;
      if (kind === 'partial') (row.generationResponse as Record<string, unknown>).finishReason = 'max_tokens';
      if (kind === 'cached') (row.judgeResponse as Record<string, unknown>).cached = true;
      if (kind === 'wrong-identity') (row.judgeResponse as Record<string, unknown>).resolvedModel = 'other';
      if (kind === 'wrong-score') (row.judgeResponse as Record<string, unknown>).content = '0.1';
      if (kind === 'wrong-digest') row.generationResponseSha256 = 'a'.repeat(64);
      if (kind === 'wrong-placement') (row.generationRequest as Record<string, unknown>).organizationId = 2;
      if (kind === 'changed-answer') row.answer = 'Invented changed claim';
      // Re-sealing edited captures cannot make wrong identity/partial content/score valid.
      if (['partial', 'cached', 'wrong-identity', 'wrong-score'].includes(kind)) {
        row.generationResponseSha256 = hash(JSON.stringify(row.generationResponse)); row.judgeResponseSha256 = hash(JSON.stringify(row.judgeResponse));
      }
      expect(verify(f)).not.toEqual([]);
    }
  });
});
