/** Extra V2 controls share the existing real tool/PGlite fixture, without
 * copying its schema or replacing any handler, authority or persistence path. */
import { describe, expect, it, type Mock } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { runRefusingModelCalls } from '../../../ai-gateway/model-call-scope';
import { plainTextToHtml } from '../../../../../shared/authoring/plain-text-html';
import type { JourneyDb } from '../../../../../tests/golden-journeys/harness';
import type { DraftSourceReferenceV2, DraftSourceSpan } from '../../../../../shared/authoring/draft-source-reference';
import { draftSourceIdentityForText } from '../../draft-source-identity';

interface Controls {
  database(): JourneyDb;
  call(body: Record<string, unknown>, programId?: string): Promise<string>;
  counts(): Promise<unknown>;
  sourceId: string;
  sourceText: string;
  sourcedInput(reference: unknown): Record<string, unknown>;
  reference(span: DraftSourceSpan): DraftSourceReferenceV2;
  programId: string;
  organizationId: number;
}

export function registerDraftSourceToolIdentityControls(c: Controls) {
  describe('draft_authoring_document exact extraction identity', () => {
    it.each(['inside', 'outside'])('refuses a same-length extraction change %s the selected span without authoring writes', async location => {
      const start = c.sourceText.indexOf('endpoint');
      const reference = c.reference({ start, end: c.sourceText.length, totalChars: c.sourceText.length });
      const index = location === 'inside' ? start : 0;
      const changed = c.sourceText.slice(0, index) + 'X' + c.sourceText.slice(index + 1);
      expect(changed.length).toBe(c.sourceText.length);
      const before = await c.counts();
      // Tamper with this organization's seeded source to prove an exact
      // extraction-identity mismatch refuses all authoring writes.
      await c.database().pool.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2 AND organization_id=$3', [changed, c.sourceId, c.organizationId]);
      try {
        const out = JSON.parse(await c.call(c.sourcedInput(reference)));
        expect(out.error, JSON.stringify(out)).toMatch(/source references.*could not be verified/i);
        expect(out.saved).toBeUndefined();
        expect(await c.counts()).toEqual(before);
      } finally {
        // Restore the same document and organization in the disposable fixture.
        await c.database().pool.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2 AND organization_id=$3', [c.sourceText, c.sourceId, c.organizationId]);
      }
    });

    it.each(['version', 'extractedTextSha256', 'spanSha256'])('refuses a new selected reference stripped of %s rather than using historical compatibility', async key => {
      const reference: Record<string, unknown> = { ...c.reference({ start: 0, end: c.sourceText.length, totalChars: c.sourceText.length }) };
      delete reference[key];
      const before = await c.counts();
      const out = JSON.parse(await c.call(c.sourcedInput(reference)));
      expect(out.error, JSON.stringify(out)).toMatch(/source|identity|version/i);
      expect(out.saved).toBeUndefined();
      expect(await c.counts()).toEqual(before);
    });

    it('saves an exact Unicode V2 window beyond 80,000 with unchanged receipt identities', async () => {
      const documentId = randomUUID();
      const prefix = 'Study appendix. '.repeat(6_001);
      const excerpt = 'Observed response 💊 needs investigator review.';
      const text = prefix + excerpt + ' Unselected conclusion.';
      const span = { start: prefix.length, end: prefix.length + excerpt.length, totalChars: text.length };
      const reference = { documentId, contentHash: 'e'.repeat(64), span, ...draftSourceIdentityForText(text, span) };
      expect(span.start).toBeGreaterThan(80_000);
      await c.database().pool.query(`INSERT INTO vault.documents
        (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text)
        VALUES ($1::uuid,$2,$3,$1::text,'Large Unicode CSR','csr','large.pdf',$4,$5)`,
      [documentId, c.programId, c.organizationId, reference.contentHash, text]);
      await c.database().pool.query(`INSERT INTO vault.document_catalog
        (document_id,content_hash,catalog_status,extraction_method,char_count)
        VALUES ($1,$2,'extracted','pdf-text',$3)`, [documentId, reference.contentHash, text.length]);
      const out = JSON.parse(await c.call({ title: 'Large-window clinical review', sections: [{ code: '2.5', title: 'Review',
        content: '<p>The investigator should review the response.</p>', sourceReferences: [reference] }] }, c.programId));
      expect(out.saved, JSON.stringify(out)).toBe(true);
      expect(out.projectSourceReferences[0]).toMatchObject({ sourceReferenceVersion: 2,
        sources: [{ ...reference, identityVerification: 'exact_extraction_and_span', completeText: false }] });
      expect(out.projectSourceReferences[0].sources[0]).not.toHaveProperty('text');
      expect(JSON.stringify(out.projectSourceReferences[0].sources)).not.toContain(excerpt);
    });
  });
}

interface DerivativeControls {
  database(): JourneyDb; call(body: Record<string, unknown>, context: Record<string, unknown>): Promise<string>; counts(): Promise<unknown>;
  state: { derivativeDraft: Mock; custodyDenied: boolean; custodyChecks: unknown[] };
  organizationId: number; userId: number; programId: string; sections: unknown[];
  sourceBinding: { documentId: string; programId: string; contentHash: string; extractedTextSha256: string; projectId: number };
}
// Synthetic successful provider output/ledger, not actual model qualification.
const DERIVATIVE_ID = '50000000-0000-4000-8000-000000000005';
const PRIVATE_DERIVATIVE_TEXT = 'PRIVATE_DERIVATIVE_TOOL_CANARY <img src="client-secret"> & 3.14159 mg.';
const derivativeContext = (c: DerivativeControls) => ({ organizationId: c.organizationId, userId: c.userId, projectRef: c.programId,
  threadId: 'parent-conversation', turnId: 'different-parent-turn', servingModel: { provider: 'anthropic', model: 'claude-opus-5' }, humanConfirmed: true });
async function syntheticDerivativeOutput(c: DerivativeControls, ledger = true) {
  const requestId = randomUUID(), contentSha256 = createHash('sha256').update(PRIVATE_DERIVATIVE_TEXT).digest('hex');
  const receipt = { requestId, provider: 'anthropic', model: 'claude-opus-5', resolvedModel: 'claude-opus-5', contentSha256 };
  if (ledger) await c.database().pool.query(`INSERT INTO ai.gateway_audit_log(request_id,provider,model,resolved_model,task_type,strategy,
    organization_id,user_id,project_id,caller_module,input_tokens,output_tokens,total_tokens,estimated_cost_usd,latency_ms,success,cached,deterministic,metadata)
    VALUES($1,'anthropic','claude-opus-5','claude-opus-5','document_drafting','explicit',$2,$3,'42','approved-derivative',0,0,0,0,0,true,false,false,$4)`,
    [requestId,String(c.organizationId),String(c.userId),JSON.stringify({ verifiedDerivativeGeneration: { requestId, organizationId: c.organizationId, userId: c.userId, projectId: 42,
      derivativeId: DERIVATIVE_ID, payloadSha256: 'e'.repeat(64), outputSha256: contentSha256, provider: receipt.provider, model: receipt.model, resolvedModel: receipt.resolvedModel, resultingContentTier: 2, semanticVerified: false, sourceBinding: c.sourceBinding } })]);
  return { content: PRIVATE_DERIVATIVE_TEXT, derivativeGeneration: receipt,
    derivativeVerification: { kind: 'deterministic_token_roundtrip', derivativeId: DERIVATIVE_ID, payloadSha256: 'e'.repeat(64) },
    model: receipt.model, truncated: false, finishReason: 'end_turn', usage: {}, latencyMs: 1 };
}
export function registerReviewedDerivativeToolControls(c: DerivativeControls) {
describe('reviewed derivative mode reaches the same canonical authoring draft', () => {
  const derivativeInput = { derivativeId: DERIVATIVE_ID, title: 'Reviewed derivative draft', module: 'M2', documentType: 'clinical_overview' };
  it('stores actual nested receipt and escaped local body, returning only an editor pointer to the planning model', async () => {
    const { verifyIndependentVaultSource } = await import('../../saved-document-critique');
    await verifyIndependentVaultSource(c.database().pool, { organizationId: c.organizationId, userId: c.userId, binding: c.sourceBinding });
    c.state.custodyDenied = false; c.state.custodyChecks = []; c.state.derivativeDraft.mockResolvedValue(await syntheticDerivativeOutput(c));
    const out = JSON.parse(await c.call(derivativeInput, derivativeContext(c)));
    expect(out.error, JSON.stringify(out)).toBeUndefined(); expect(out).toMatchObject({ saved: true, title: 'Reviewed derivative draft', sectionCount: 1, documentStatus: 'draft' });
    expect(JSON.stringify(out)).not.toMatch(/PRIVATE_DERIVATIVE|client-secret|3\.14159|different-parent-turn/);
    const saved = await c.database().pool.query('SELECT provenance FROM authoring_documents WHERE id=$1', [out.authoringDocId]);
    expect(saved.rows[0].provenance).toMatchObject({ source: 'ana', conversationId: 'parent-conversation', model: 'claude-opus-5',
      generatedDerivative: { derivativeId: DERIVATIVE_ID, outputSha256: createHash('sha256').update(PRIVATE_DERIVATIVE_TEXT).digest('hex') } });
    const section = await c.database().pool.query('SELECT content FROM authoring_sections WHERE doc_id=$1', [out.authoringDocId]);
    expect(section.rows[0].content).toBe(plainTextToHtml(PRIVATE_DERIVATIVE_TEXT));
    expect(section.rows[0].content).toContain('&lt;img');
    expect(c.state.derivativeDraft.mock.lastCall?.[0]).toMatchObject({ organizationId: c.organizationId, userId: c.userId, projectId: 42, derivativeId: DERIVATIVE_ID, instructions: '' });
    expect(c.state.derivativeDraft.mock.lastCall?.[0]).not.toHaveProperty('sections');
    expect(c.state.derivativeDraft.mock.lastCall?.[0]).not.toHaveProperty('documentType');
    expect(c.state.custodyChecks).toContainEqual({ organizationId: c.organizationId, userId: c.userId, projectId: 42, derivativeId: DERIVATIVE_ID });
  });
  it('refuses mixed prose, a custom title and child tools before any model or document write', async () => {
    c.state.derivativeDraft.mockClear(); const before = await c.counts();
    for (const extra of [{ sections: c.sections }, { instructions: 'RAW_PROSE_TOOL_CANARY' }, { title: 'PRIVATE_SOURCE_TITLE' }]) {
      const out = JSON.parse(await c.call({ ...derivativeInput, ...extra }, derivativeContext(c)));
      expect(out.error).toBeTruthy(); expect(out.saved).toBeUndefined();
    }
    const child = await runRefusingModelCalls({ runId: 'child', parentRunId: 'parent', tool: 'draft_authoring_document' },
      () => c.call(derivativeInput, derivativeContext(c)));
    expect(JSON.parse(child).error).toMatch(/parent AnA/); expect(c.state.derivativeDraft).not.toHaveBeenCalled(); expect(await c.counts()).toEqual(before);
  });
  it('refuses a missing immutable ledger row, changed source custody and truncated output without partial writes', async () => {
    for (const fault of ['ledger', 'custody', 'truncated']) {
      const response = await syntheticDerivativeOutput(c, fault !== 'ledger');
      c.state.custodyDenied = fault === 'custody'; response.truncated = fault === 'truncated'; c.state.derivativeDraft.mockResolvedValue(response);
      const before = await c.counts(), out = JSON.parse(await c.call(derivativeInput, derivativeContext(c)));
      expect(out.error).toBeTruthy(); expect(out.saved).toBeUndefined(); expect(await c.counts()).toEqual(before);
    }
    c.state.custodyDenied = false;
  });
});
}
